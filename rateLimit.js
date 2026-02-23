function createIpRateLimiter({ limit = 20, windowMs = 60_000 } = {}) {
  const buckets = new Map();

  function prune(now) {
    for (const [ip, bucket] of buckets.entries()) {
      if (bucket.expiresAt <= now) {
        buckets.delete(ip);
      }
    }
  }

  return function rateLimit(req, res, next) {
    const now = Date.now();
    prune(now);

    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const current = buckets.get(ip);

    if (!current || current.expiresAt <= now) {
      buckets.set(ip, { count: 1, expiresAt: now + windowMs });
      return next();
    }

    if (current.count >= limit) {
      return res.status(429).json({
        ok: false,
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait and try again.',
      });
    }

    current.count += 1;
    return next();
  };
}

module.exports = { createIpRateLimiter };
