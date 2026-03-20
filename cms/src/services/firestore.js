const { Firestore, Timestamp } = require('@google-cloud/firestore');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });

const USERS = 'users';
const POSTS = 'posts';
const MEDIA = 'media';

// ── Users ─────────────────────────────────────────────────────────────────────

async function initAdmin() {
  const snap = await db.collection(USERS).limit(1).get();
  if (!snap.empty) return; // admin already exists

  const hash = await bcrypt.hash(process.env.INIT_ADMIN_PASSWORD, 12);
  await db.collection(USERS).doc(uuidv4()).set({
    username: process.env.INIT_ADMIN_USERNAME,
    email: process.env.INIT_ADMIN_EMAIL,
    passwordHash: hash,
    createdAt: Timestamp.now(),
  });
  console.log('Admin user created.');
}

async function getUserByUsername(username) {
  const snap = await db.collection(USERS).where('username', '==', username).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function getUserByEmail(email) {
  const snap = await db.collection(USERS).where('email', '==', email).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function updateUser(id, data) {
  await db.collection(USERS).doc(id).update({ ...data, updatedAt: Timestamp.now() });
}

// ── Posts ─────────────────────────────────────────────────────────────────────

function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

async function createPost(data) {
  const id = uuidv4();
  const slug = data.slug || slugify(data.title);
  const now = Timestamp.now();
  const post = {
    title: data.title,
    slug,
    content: data.content || '',
    excerpt: data.excerpt || '',
    status: data.status || 'draft',
    tags: data.tags || [],
    coverImage: data.coverImage || null,
    authorId: data.authorId,
    createdAt: now,
    updatedAt: now,
    publishedAt: null,
    publishAt: data.publishAt ? Timestamp.fromDate(new Date(data.publishAt)) : null,
  };

  if (post.status === 'published') {
    post.publishedAt = now;
  }

  await db.collection(POSTS).doc(id).set(post);
  return { id, ...post };
}

async function updatePost(id, data) {
  const ref = db.collection(POSTS).doc(id);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('Post not found');

  const existing = doc.data();
  const updates = {
    title: data.title ?? existing.title,
    slug: data.slug ?? existing.slug,
    content: data.content ?? existing.content,
    excerpt: data.excerpt ?? existing.excerpt,
    status: data.status ?? existing.status,
    tags: data.tags ?? existing.tags,
    coverImage: data.coverImage !== undefined ? data.coverImage : existing.coverImage,
    publishAt: data.publishAt
      ? Timestamp.fromDate(new Date(data.publishAt))
      : (data.publishAt === null ? null : existing.publishAt),
    updatedAt: Timestamp.now(),
  };

  if (data.status === 'published' && existing.status !== 'published') {
    updates.publishedAt = Timestamp.now();
  }

  await ref.update(updates);
  return { id, ...existing, ...updates };
}

async function deletePost(id) {
  await db.collection(POSTS).doc(id).delete();
}

async function getPost(id) {
  const doc = await db.collection(POSTS).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function getPostBySlug(slug) {
  const snap = await db.collection(POSTS)
    .where('slug', '==', slug)
    .where('status', '==', 'published')
    .limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

async function listPosts({ status, tag, search, page = 1, limit = 20 } = {}) {
  let query = db.collection(POSTS).orderBy('createdAt', 'desc');

  if (status) query = query.where('status', '==', status);
  if (tag) query = query.where('tags', 'array-contains', tag);

  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const offset = (page - 1) * limit;
  const snap = await query.offset(offset).limit(limit).get();

  let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (search) {
    const q = search.toLowerCase();
    posts = posts.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.excerpt?.toLowerCase().includes(q)
    );
  }

  return { posts, total, totalPages: Math.ceil(total / limit) };
}

async function getPublishedPosts({ page = 1, limit = 8, tag } = {}) {
  let query = db.collection(POSTS).where('status', '==', 'published');

  if (tag) query = query.where('tags', 'array-contains', tag);

  const snap = await query.get();
  let posts = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  posts.sort((a, b) => {
    const aTime = a.publishedAt?.toMillis?.() ?? 0;
    const bTime = b.publishedAt?.toMillis?.() ?? 0;
    return bTime - aTime;
  });

  const total = posts.length;
  const offset = (page - 1) * limit;
  const paginated = posts.slice(offset, offset + limit);

  return { posts: paginated, total, totalPages: Math.ceil(total / limit) };
}

async function publishDuePosts() {
  const now = Timestamp.now();
  const snap = await db.collection(POSTS)
    .where('status', '==', 'scheduled')
    .where('publishAt', '<=', now)
    .get();

  const batch = db.batch();
  snap.docs.forEach(doc => {
    batch.update(doc.ref, {
      status: 'published',
      publishedAt: now,
      updatedAt: now,
    });
  });

  if (!snap.empty) {
    await batch.commit();
    console.log(`Published ${snap.size} scheduled post(s).`);
  }
  return snap.size;
}

// ── Media ─────────────────────────────────────────────────────────────────────

async function saveMedia(data) {
  const id = uuidv4();
  const record = {
    filename: data.filename,
    originalName: data.originalName,
    url: data.url,
    size: data.size,
    mimeType: data.mimeType,
    uploadedAt: Timestamp.now(),
    uploadedBy: data.uploadedBy,
  };
  await db.collection(MEDIA).doc(id).set(record);
  return { id, ...record };
}

async function listMedia({ page = 1, limit = 24 } = {}) {
  const query = db.collection(MEDIA).orderBy('uploadedAt', 'desc');
  const countSnap = await query.count().get();
  const total = countSnap.data().count;

  const snap = await query.offset((page - 1) * limit).limit(limit).get();
  const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return { items, total, totalPages: Math.ceil(total / limit) };
}

async function deleteMedia(id) {
  await db.collection(MEDIA).doc(id).delete();
}

async function getMedia(id) {
  const doc = await db.collection(MEDIA).doc(id).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

module.exports = {
  initAdmin,
  getUserByUsername, getUserByEmail, updateUser,
  createPost, updatePost, deletePost, getPost, getPostBySlug,
  listPosts, getPublishedPosts, publishDuePosts,
  saveMedia, listMedia, deleteMedia, getMedia,
};
