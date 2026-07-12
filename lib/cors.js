function isSameOrigin(origin, req) {
  if (!origin || !req.headers.host) return false;
  const host = req.headers.host;
  return origin === 'http://' + host || origin === 'https://' + host;
}

function isAllowedOrigin(origin, req) {
  if (!origin) return true;
  if (isSameOrigin(origin, req)) return true;

  const allowed = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (allowed.length === 0) return false;
  if (allowed.includes('*')) return true;
  if (allowed.includes(origin)) return true;

  for (const a of allowed) {
    if (a.startsWith('*.') && origin.endsWith(a.slice(1))) {
      return true;
    }
  }

  return false;
}

function setCors(req, res, methods = 'POST, OPTIONS') {
  const origin = req.headers.origin;
  const allowed = isAllowedOrigin(origin, req);

  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  return allowed;
}

module.exports = { setCors };
