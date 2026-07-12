const { getPrices } = require('../lib/prices');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
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
