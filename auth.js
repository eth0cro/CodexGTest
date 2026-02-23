function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin === true) {
    return next();
  }

  return res.status(401).json({
    ok: false,
    code: 'UNAUTHORIZED',
    message: 'Admin authentication required.',
  });
}

module.exports = { requireAdmin };
