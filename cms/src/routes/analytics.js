const express = require('express');
const { getAnalyticsSummary } = require('../services/analytics');

const router = express.Router();

router.get('/summary', async (req, res) => {
  try {
    const days = Math.min(90, Math.max(7, parseInt(req.query.days) || 30));
    const data = await getAnalyticsSummary(days);
    res.json(data);
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;
