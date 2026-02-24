const router = require('express').Router();
const { publishDuePosts } = require('../services/firestore');

// Called by Cloud Scheduler — authenticated with a shared secret
router.post('/publish-due', async (req, res) => {
  const secret = req.headers['x-scheduler-secret'] || req.query.secret;
  if (!process.env.SCHEDULER_SECRET || secret !== process.env.SCHEDULER_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  try {
    const count = await publishDuePosts();
    res.json({ ok: true, published: count });
  } catch (err) {
    console.error('Scheduler error:', err);
    res.status(500).json({ error: 'Scheduler failed' });
  }
});

module.exports = router;
