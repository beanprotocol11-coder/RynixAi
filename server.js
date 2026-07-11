const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

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

app.use(express.static(path.join(__dirname)));

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    return res.json(cache.data);
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
    res.json(result);
  } catch (error) {
    console.error('Price proxy error:', error.message);
    if (cache.data) {
      return res.json(cache.data);
    }
    res.status(500).json({
      error: 'Unable to fetch prices',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log('Rynix AI server running on port ' + PORT);
});
