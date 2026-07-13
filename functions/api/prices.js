const priceCache = { data: null, updatedAt: 0 };

const priceSources = {
  BTC: { kraken: 'XBTUSD', cg: 'bitcoin' },
  ETH: { kraken: 'ETHUSD', cg: 'ethereum' },
  SOL: { kraken: 'SOLUSD', cg: 'solana' },
  HYPE: { kraken: 'HYPEUSD', cg: 'hyperliquid' }
};

const CACHE_TTL = 60 * 1000;

const FALLBACK_PRICES = {
  BTC: { price: 62750, change24h: -1.5 },
  ETH: { price: 1776, change24h: -1.0 },
  SOL: { price: 76.4, change24h: 0.3 },
  HYPE: { price: 65.1, change24h: -2.6 }
};

function getKrakenResult(data) {
  const result = {};
  for (const [symbol, config] of Object.entries(priceSources)) {
    const key = Object.keys(data).find(k => k.includes(config.kraken.replace('USD', '')) || k.includes(symbol));
    if (!key) continue;
    const ticker = data[key];
    const last = parseFloat(ticker.c[0]);
    const open = parseFloat(ticker.o);
    if (!isNaN(last) && !isNaN(open) && open !== 0) {
      result[symbol] = {
        price: last,
        change24h: ((last - open) / open) * 100
      };
    }
  }
  return result;
}

function getCoinGeckoResult(data) {
  const result = {};
  for (const [symbol, config] of Object.entries(priceSources)) {
    const id = config.cg;
    if (data[id] && typeof data[id].usd === 'number') {
      result[symbol] = {
        price: data[id].usd,
        change24h: data[id].usd_24h_change || 0
      };
    }
  }
  return result;
}

async function fetchKrakenPrices() {
  const pairs = Object.values(priceSources).map(s => s.kraken).join(',');
  const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + pairs, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
    cf: { cacheTtl: 60, cacheEverything: true }
  });
  if (!response.ok) throw new Error('Kraken API error: ' + response.status);
  const data = await response.json();
  if (data.error && data.error.length) throw new Error('Kraken API error: ' + data.error.join(', '));
  return getKrakenResult(data.result);
}

async function fetchCoinGeckoPrices() {
  const ids = Object.values(priceSources).map(s => s.cg).join(',');
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
    cf: { cacheTtl: 60, cacheEverything: true }
  });
  if (!response.ok) throw new Error('CoinGecko API error: ' + response.status);
  const data = await response.json();
  return getCoinGeckoResult(data);
}

export async function onRequest(context) {
  const request = context.request;
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=60, s-maxage=60'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const now = Date.now();

  if (priceCache.data && now - priceCache.updatedAt < CACHE_TTL) {
    return new Response(JSON.stringify(priceCache.data), { status: 200, headers });
  }

  let result = null;
  let errors = [];

  try {
    result = await fetchKrakenPrices();
    if (Object.keys(result).length === Object.keys(priceSources).length) {
      priceCache.data = result;
      priceCache.updatedAt = now;
      return new Response(JSON.stringify(result), { status: 200, headers });
    }
  } catch (err) {
    errors.push('Kraken: ' + err.message);
  }

  try {
    result = await fetchCoinGeckoPrices();
    if (Object.keys(result).length > 0) {
      priceCache.data = result;
      priceCache.updatedAt = now;
      return new Response(JSON.stringify(result), { status: 200, headers });
    }
  } catch (err) {
    errors.push('CoinGecko: ' + err.message);
  }

  if (priceCache.data) {
    return new Response(JSON.stringify(priceCache.data), { status: 200, headers });
  }

  // Last resort: serve static fallback so UI never breaks
  return new Response(JSON.stringify(FALLBACK_PRICES), { status: 200, headers });
}
