const router = require('express').Router();
const {
  createPost, updatePost, deletePost, getPost, listPosts,
} = require('../services/firestore');

// List posts (admin)
router.get('/', async (req, res) => {
  try {
    const { status, tag, search, page = 1, limit = 20 } = req.query;
    const result = await listPosts({
      status: status || undefined,
      tag: tag || undefined,
      search: search || undefined,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json(result);
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get single post
router.get('/:id', async (req, res) => {
  try {
    const post = await getPost(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(post);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create post
router.post('/', async (req, res) => {
  try {
    const { title, slug, content, excerpt, status, tags, coverImage, publishAt } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const post = await createPost({
      title, slug, content, excerpt,
      status: status || 'draft',
      tags: Array.isArray(tags) ? tags : [],
      coverImage, publishAt,
      authorId: req.user.id,
    });
    res.status(201).json(post);
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post
router.put('/:id', async (req, res) => {
  try {
    const post = await updatePost(req.params.id, req.body);
    res.json(post);
  } catch (err) {
    if (err.message === 'Post not found') return res.status(404).json({ error: err.message });
    console.error('Update post error:', err);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Delete post
router.delete('/:id', async (req, res) => {
  try {
    await deletePost(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

module.exports = router;
