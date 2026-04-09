const jwt = require('jsonwebtoken');

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function createAccessToken(userId, username, role) {
  return jwt.sign(
    { sub: userId, username, role, type: 'access' },
    getJwtSecret(),
    { expiresIn: '8h' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

// Middleware: authenticate
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = verifyToken(token);
    if (payload.type !== 'access') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Middleware: authorize by roles
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { createAccessToken, verifyToken, authenticate, authorize };
