const express = require('express');
const { getAnalyticsSummary, getReferrerPages } = require('../services/analytics');

const router = express.Router();

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  };
}

router.get('/summary', async (req, res) => {
  try {
    let { from, to } = req.query;
    if (!from || !to) {
      const d = defaultRange();
      from = from || d.from;
      to = to || d.to;
    }
    const data = await getAnalyticsSummary(from, to);
    res.json(data);
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/referrer', async (req, res) => {
  try {
    const { domain, from, to } = req.query;
    if (!domain) return res.status(400).json({ error: 'domain is required' });
    const { from: df, to: dt } = defaultRange();
    const pages = await getReferrerPages(domain, from || df, to || dt);
    res.json({ domain, pages });
  } catch (err) {
    console.error('Referrer drilldown error:', err);
    res.status(500).json({ error: 'Failed to load referrer data' });
  }
});

module.exports = router;
