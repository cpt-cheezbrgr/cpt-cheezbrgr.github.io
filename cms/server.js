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
      blogTitle: process.env.BLOG_TITLE || 'My Blog',
      blogDesc: process.env.BLOG_DESCRIPTION || '',
    });
  } catch (err) {
    console.error('Blog index error:', err);
    res.render('blog/index', { posts: [], total: 0, totalPages: 0, currentPage: 1, currentTag: null,
      blogTitle: process.env.BLOG_TITLE || 'My Blog', blogDesc: '' });
  }
});

app.get('/post/:slug', async (req, res) => {
  try {
    const post = await getPostBySlug(req.params.slug);
    if (!post) return res.status(404).render('blog/404', { blogTitle: process.env.BLOG_TITLE || 'My Blog' });
    post.htmlContent = marked(post.content || '');
    res.render('blog/post', { post, blogTitle: process.env.BLOG_TITLE || 'My Blog' });
  } catch (err) {
    console.error('Post view error:', err);
    res.status(500).render('blog/404', { blogTitle: process.env.BLOG_TITLE || 'My Blog' });
  }
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
