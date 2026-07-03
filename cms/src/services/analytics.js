const { Firestore } = require('@google-cloud/firestore');

const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
const ANALYTICS = 'analytics';

function getDeviceType(userAgent) {
  if (!userAgent) return 'desktop';
  const ua = userAgent.toLowerCase();
  if (/tablet|ipad/.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android|blackberry|windows phone/.test(ua)) return 'mobile';
  return 'desktop';
}

function getReferrerDomain(referrerHeader, blogUrl) {
  if (!referrerHeader) return null;
  try {
    const { hostname } = new URL(referrerHeader);
    const domain = hostname.replace(/^www\./, '');
    if (blogUrl) {
      const selfHost = new URL(blogUrl).hostname.replace(/^www\./, '');
      if (domain === selfHost) return null;
    }
    return domain;
  } catch {
    return null;
  }
}

async function trackPageView(req) {
  try {
    const now = new Date();
    await db.collection(ANALYTICS).add({
      path: req.path,
      referrer: getReferrerDomain(req.get('referer'), process.env.BLOG_URL),
      device: getDeviceType(req.get('user-agent')),
      date: now.toISOString().split('T')[0],
      timestamp: now,
    });
  } catch (err) {
    console.error('Analytics write error:', err.message);
  }
}

async function getAnalyticsSummary(from, to) {
  const snap = await db.collection(ANALYTICS)
    .where('date', '>=', from)
    .where('date', '<=', to)
    .orderBy('date', 'asc')
    .get();

  const docs = snap.docs.map(d => d.data());

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekDate = weekAgo.toISOString().split('T')[0];

  const todayCount = docs.filter(d => d.date === today).length;
  const weekCount = docs.filter(d => d.date >= weekDate).length;

  // Top pages
  const pageCounts = {};
  docs.forEach(d => { pageCounts[d.path] = (pageCounts[d.path] || 0) + 1; });
  const topPages = Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // Top referrers
  const refCounts = {};
  docs.filter(d => d.referrer).forEach(d => {
    refCounts[d.referrer] = (refCounts[d.referrer] || 0) + 1;
  });
  const topReferrers = Object.entries(refCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([referrer, count]) => ({ referrer, count }));

  // Device breakdown
  const devices = { desktop: 0, mobile: 0, tablet: 0 };
  docs.forEach(d => { if (d.device in devices) devices[d.device]++; });

  // Daily counts (fill every day in range with 0 if no data)
  const dailyMap = {};
  docs.forEach(d => { dailyMap[d.date] = (dailyMap[d.date] || 0) + 1; });
  const daily = [];
  for (let d = new Date(from); d <= new Date(to); d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    daily.push({ date: dateStr, count: dailyMap[dateStr] || 0 });
  }

  // Hourly breakdown (UTC hours 0–23)
  const hourly = new Array(24).fill(0);
  docs.forEach(d => {
    if (d.timestamp) {
      const ts = d.timestamp._seconds
        ? new Date(d.timestamp._seconds * 1000)
        : new Date(d.timestamp);
      hourly[ts.getUTCHours()]++;
    }
  });

  return { total: docs.length, today: todayCount, week: weekCount, topPages, topReferrers, devices, daily, hourly };
}

async function getReferrerPages(domain, from, to) {
  const snap = await db.collection(ANALYTICS)
    .where('referrer', '==', domain)
    .get();

  const pageCounts = {};
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.date >= from && data.date <= to) {
      pageCounts[data.path] = (pageCounts[data.path] || 0) + 1;
    }
  });

  return Object.entries(pageCounts)
    .sort((a, b) => b[1] - a[1]).slice(0, 20)
    .map(([path, count]) => ({ path, count }));
}

module.exports = { trackPageView, getAnalyticsSummary, getReferrerPages };
