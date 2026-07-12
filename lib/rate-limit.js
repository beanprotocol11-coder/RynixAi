const windowMs = 60 * 1000;
const maxRequests = 30;

const store = new Map();

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return (
    (req.headers && req.headers['x-real-ip']) ||
    (req.socket && req.socket.remoteAddress) ||
    req.ip ||
    'unknown'
  );
}

function rateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();

  const record = store.get(ip) || { resetAt: now + windowMs, count: 0 };
  if (now > record.resetAt) {
    record.resetAt = now + windowMs;
    record.count = 0;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count += 1;
  store.set(ip, record);

  if (store.size > 10000) {
    for (const [key, value] of store) {
      if (now > value.resetAt) {
        store.delete(key);
      }
    }
  }

  return true;
}

module.exports = { rateLimit };
