const { getPrices } = require('../lib/prices');
const { setCors } = require('../lib/cors');
const { rateLimit } = require('../lib/rate-limit');

module.exports = async (req, res) => {
  const allowed = setCors(req, res, 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(allowed ? 200 : 403).end();
    return;
  }

  if (!allowed) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  if (!rateLimit(req)) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  try {
    const data = await getPrices();
    res.status(200).json(data);
  } catch (error) {
    console.error('Price proxy error:', error.message);
    res.status(500).json({ error: 'Unable to fetch prices', details: error.message });
  }
};
