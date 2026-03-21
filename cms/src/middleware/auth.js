const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const token = req.cookies.token;
  if (!token) {
    if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    return res.redirect('/login');
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.clearCookie('token');
    if (req.path.startsWith('/api') || req.originalUrl.startsWith('/api')) {
      return res.status(401).json({ error: 'Token expired or invalid' });
    }
    return res.redirect('/login');
  }
}

module.exports = { requireAuth };
