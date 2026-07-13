// Vercel serverless function: /api/prices
// Fetches live prices from Hyperliquid (real-time perp mid prices) and CoinGecko (24h change).

const fetch = require('node-fetch');

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};

const HYPERLIQUID_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE'];

let cache = {
  data: null,
  updatedAt: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds

function isValidPrice(value) {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

async function fetchHyperliquidPrices() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const [midsResponse, ctxsResponse] = await Promise.all([
      fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
        signal: controller.signal
      }),
      fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
        signal: controller.signal
      })
    ]);

    clearTimeout(timeoutId);

    if (!midsResponse.ok) {
      throw new Error('Hyperliquid allMids API error: ' + midsResponse.status);
    }
    if (!ctxsResponse.ok) {
      throw new Error('Hyperliquid metaAndAssetCtxs API error: ' + ctxsResponse.status);
    }

    const midsData = await midsResponse.json();
    const [meta, assetCtxs] = await ctxsResponse.json();

    const symbolToIndex = {};
    if (meta && Array.isArray(meta.universe)) {
      for (let i = 0; i < meta.universe.length; i++) {
        symbolToIndex[meta.universe[i].name] = i;
      }
    }

    const result = {};

    for (const symbol of HYPERLIQUID_SYMBOLS) {
      const mid = midsData[symbol];
      const price = mid && (typeof mid === 'string' || typeof mid === 'number') ? parseFloat(mid) : null;

      const ctxIndex = symbolToIndex[symbol];
      const ctx = typeof ctxIndex === 'number' ? assetCtxs[ctxIndex] : null;
      const markPx = ctx && typeof ctx.markPx === 'string' ? parseFloat(ctx.markPx) : null;
      const prevDayPx = ctx && typeof ctx.prevDayPx === 'string' ? parseFloat(ctx.prevDayPx) : null;

      const entry = {};
      if (isValidPrice(price)) {
        entry.price = price;
      }
      if (isValidPrice(markPx) && isValidPrice(prevDayPx) && prevDayPx > 0) {
        entry.change24h = ((markPx - prevDayPx) / prevDayPx) * 100;
      }

      if (Object.keys(entry).length > 0) {
        result[symbol] = entry;
      }
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function fetchCoinGeckoPrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('CoinGecko API error: ' + response.status);
    }

    const data = await response.json();
    const result = {};

    for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
      if (data[id] && typeof data[id].usd === 'number') {
        result[symbol] = {
          price: data[id].usd,
          change24h: data[id].usd_24h_change || 0
        };
      }
    }

    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function mergePriceData(hyperliquidData, coinGeckoData) {
  const result = {};

  for (const symbol of HYPERLIQUID_SYMBOLS) {
    const hl = hyperliquidData[symbol];
    const cg = coinGeckoData[symbol];

    if (!hl && !cg) continue;

    const price = hl && isValidPrice(hl.price) ? hl.price : (cg && isValidPrice(cg.price) ? cg.price : null);
    const change24h =
      hl && typeof hl.change24h === 'number' ? hl.change24h :
      (cg && typeof cg.change24h === 'number' ? cg.change24h : 0);

    if (isValidPrice(price)) {
      result[symbol] = {
        price: price,
        change24h: change24h
      };
    }
  }

  return result;
}

async function fetchLivePrices() {
  const [hyperliquidData, coinGeckoData] = await Promise.allSettled([
    fetchHyperliquidPrices(),
    fetchCoinGeckoPrices()
  ]);

  const hl = hyperliquidData.status === 'fulfilled' ? hyperliquidData.value : {};
  const cg = coinGeckoData.status === 'fulfilled' ? coinGeckoData.value : {};

  const errors = [];
  if (hyperliquidData.status === 'rejected') errors.push('Hyperliquid: ' + hyperliquidData.reason.message);
  if (coinGeckoData.status === 'rejected') errors.push('CoinGecko: ' + coinGeckoData.reason.message);

  const result = mergePriceData(hl, cg);

  if (Object.keys(result).length === 0) {
    throw new Error('Unable to fetch prices from any source. ' + errors.join('; '));
  }

  return result;
}

const pricesHandler = async (req, res) => {
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
    const result = await fetchLivePrices();
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

pricesHandler.fetchLivePrices = fetchLivePrices;
module.exports = pricesHandler;
