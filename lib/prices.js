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

async function getPrices() {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    return cache.data;
  }

  try {
    const ids = Object.values(priceMap).join(',');
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' }, timeout: 10000 }
    );

    if (!response.ok) {
      throw new Error('CoinGecko API error: ' + response.status);
    }

    const data = await response.json();
    const result = {};

    for (const [symbol, id] of Object.entries(priceMap)) {
      if (data[id] && typeof data[id].usd === 'number') {
        result[symbol] = {
          price: data[id].usd,
          change: data[id].usd_24h_change || 0
        };
      }
    }

    cache = { data: result, updatedAt: now };
    return result;
  } catch (error) {
    console.error('Price fetch error:', error.message);
    if (cache.data) {
      return cache.data;
    }
    throw error;
  }
}

module.exports = { getPrices, priceMap };
