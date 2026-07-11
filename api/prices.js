// Vercel serverless function: /api/prices
// Fetches live prices from CoinGecko and caches them in memory for 60 seconds.

const fetch = require('node-fetch');

const priceMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};

let cache = {
  data: null,
  updatedAt: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds

module.exports = async (req, res) => {
  // Enable CORS for the frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    res.status(200).json(cache.data);
    return;
  }

  try {
    const ids = Object.values(priceMap).join(',');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    if (!response.ok) {
      throw new Error('CoinGecko API error: ' + response.status);
    }

    const data = await response.json();
    const result = {};

    for (const [symbol, id] of Object.entries(priceMap)) {
      if (data[id] && typeof data[id].usd === 'number') {
        result[symbol] = {
          price: data[id].usd,
          change24h: data[id].usd_24h_change || 0
        };
      }
    }

    cache = { data: result, updatedAt: now };
    res.status(200).json(result);
  } catch (error) {
    console.error('Price proxy error:', error.message);
    if (cache.data) {
      res.status(200).json(cache.data);
      return;
    }
    res.status(500).json({
      error: 'Unable to fetch prices',
      details: error.message
    });
  }
};
