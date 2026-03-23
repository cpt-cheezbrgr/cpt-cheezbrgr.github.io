require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const jwt = require('jsonwebtoken');
const { marked } = require('marked');

const authRoutes = require('./src/routes/auth');
const postsRoutes = require('./src/routes/posts');
const mediaRoutes = require('./src/routes/media');
const schedulerRoutes = require('./src/routes/scheduler');
const { requireAuth } = require('./src/middleware/auth');
const { getPublishedPosts, getPostBySlug, initAdmin } = require('./src/services/firestore');

const app = express();
const PORT = process.env.PORT || 8080;

// Configure marked for safe rendering
marked.setOptions({ breaks: true });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'src/views'));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/posts', requireAuth, postsRoutes);
app.use('/api/media', requireAuth, mediaRoutes);
app.use('/api/scheduler', schedulerRoutes);

// ── Temporary debug endpoint ──────────────────────────────────────────────────
app.get('/debug-posts', async (req, res) => {
  const { Firestore } = require('@google-cloud/firestore');
  const db2 = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
  const snap = await db2.collection('posts').get();
  const posts = snap.docs.map(d => ({ id: d.id, status: d.data().status, slug: d.data().slug, publishedAt: d.data().publishedAt?.toDate?.()?.toISOString() }));
  res.json({ count: posts.length, posts });
});

// ── Public blog (server-side rendered) ───────────────────────────────────────
app.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const tag = req.query.tag || null;
    const { posts, total, totalPages } = await getPublishedPosts({ page, limit: 8, tag });
    res.render('blog/index', {
      posts,
      total,
      totalPages,
      currentPage: page,
      currentTag: tag,
      blogTitle: process.env.BLOG_TITLE || 'Magic Pixel Monkey',
      blogDesc: process.env.BLOG_DESCRIPTION || '',
    });
  } catch (err) {
    console.error('Blog index error:', err);
    res.render('blog/index', { posts: [], total: 0, totalPages: 0, currentPage: 1, currentTag: null,
      blogTitle: process.env.BLOG_TITLE || 'Magic Pixel Monkey', blogDesc: '' });
  }
});

app.get('/post/:slug', async (req, res) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) return res.status(404).render('blog/404', { blogTitle: process.env.BLOG_TITLE || 'Magic Pixel Monkey' });
    post.htmlContent = marked(post.content || '');
    res.render('blog/post', { post, blogTitle: process.env.BLOG_TITLE || 'Magic Pixel Monkey' });
  } catch (err) {
    console.error('Post view error:', err);
    res.status(500).render('blog/404', { blogTitle: process.env.BLOG_TITLE || 'Magic Pixel Monkey' });
  }
});

// ── RSS feed ──────────────────────────────────────────────────────────────────
app.get('/feed.xml', async (req, res) => {
  try {
    const { posts } = await getPublishedPosts({ page: 1, limit: 20 });
    const blogTitle = process.env.BLOG_TITLE || 'Magic Pixel Monkey';
    const blogDesc = process.env.BLOG_DESCRIPTION || '';
    const baseUrl = process.env.BLOG_URL || `${req.protocol}://${req.get('host')}`;

    const escape = s => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const items = posts.map(post => {
      const url = `${baseUrl}/post/${post.slug}`;
      const pubDate = post.publishedAt?.toDate ? post.publishedAt.toDate().toUTCString() : '';
      return `
    <item>
      <title>${escape(post.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <description>${escape(post.excerpt || '')}</description>
      ${pubDate ? `<pubDate>${pubDate}</pubDate>` : ''}
      ${(post.tags || []).map(t => `<category>${escape(t)}</category>`).join('\n      ')}
    </item>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(blogTitle)}</title>
    <link>${baseUrl}</link>
    <description>${escape(blogDesc)}</description>
    <language>en-us</language>
    <atom:link href="${baseUrl}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>`;

    res.set('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('RSS feed error:', err);
    res.status(500).send('Feed unavailable');
  }
});

// ── Sitemap ───────────────────────────────────────────────────────────────────
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseUrl = process.env.BLOG_URL || `${req.protocol}://${req.get('host')}`;
    const { posts } = await getPublishedPosts({ page: 1, limit: 1000 });

    const postUrls = posts.map(post => {
      const lastmod = post.publishedAt?.toDate ? post.publishedAt.toDate().toISOString().split('T')[0] : '';
      return `  <url>
    <loc>${baseUrl}/post/${post.slug}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
${postUrls}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('Sitemap error:', err);
    res.status(500).send('Sitemap unavailable');
  }
});

// ── Robots.txt ────────────────────────────────────────────────────────────────
app.get('/robots.txt', (req, res) => {
  const baseUrl = process.env.BLOG_URL || `${req.protocol}://${req.get('host')}`;
  res.set('Content-Type', 'text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
Disallow: /login
Disallow: /forgot-password
Disallow: /reset-password

Sitemap: ${baseUrl}/sitemap.xml
`);
});

// ── Auth pages ────────────────────────────────────────────────────────────────
app.get('/login', (req, res) => {
  try {
    if (req.cookies.token) {
      jwt.verify(req.cookies.token, process.env.JWT_SECRET);
      return res.redirect('/admin');
    }
  } catch {}
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/forgot-password', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'forgot-password.html')));

app.get('/reset-password', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html')));

// ── Admin (protected) ─────────────────────────────────────────────────────────
app.use('/admin', requireAuth);

app.get('/admin', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));

app.get('/admin/editor', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'editor.html')));

app.get('/admin/editor/:id', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'editor.html')));

app.get('/admin/media', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin', 'media.html')));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`Blog CMS running on port ${PORT}`);
  if (process.env.INIT_ADMIN_USERNAME) {
    await initAdmin().catch(err => console.error('Admin init error:', err));
  }
});
