const historyCache = {};

const coinSources = {
  BTC: { cg: 'bitcoin', name: 'Bitcoin' },
  ETH: { cg: 'ethereum', name: 'Ethereum' },
  SOL: { cg: 'solana', name: 'Solana' },
  HYPE: { cg: 'hyperliquid', name: 'Hyperliquid' }
};

const RANGES = {
  '1': { days: '1', ttl: 5 * 60 * 1000 },
  '7': { days: '7', ttl: 30 * 60 * 1000 },
  '30': { days: '30', ttl: 60 * 60 * 1000 }
};

function buildFallback(symbol, days) {
  const base = { BTC: 62750, ETH: 1776, SOL: 76.4, HYPE: 65.1 }[symbol] || 100;
  const points = days === '1' ? 48 : days === '7' ? 56 : 60;
  const now = Date.now();
  const span = Number(days) * 24 * 60 * 60 * 1000;
  const prices = [];
  let value = base * 0.96;
  for (let i = 0; i < points; i++) {
    const t = now - span + (span / (points - 1)) * i;
    value = value * (1 + (Math.sin(i / 4) * 0.012) + (i / points) * 0.001);
    prices.push([Math.round(t), Number(value.toFixed(2))]);
  }
  return prices;
}

async function fetchCoinGeckoHistory(id, days) {
  const url = 'https://api.coingecko.com/api/v3/coins/' + id +
    '/market_chart?vs_currency=usd&days=' + days;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error('CoinGecko history error: ' + response.status);
  const data = await response.json();
  if (!Array.isArray(data.prices) || !data.prices.length) {
    throw new Error('CoinGecko history empty');
  }
  return data.prices.map(function (p) { return [p[0], p[1]]; });
}

export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'public, max-age=300, s-maxage=300'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const symbol = (url.searchParams.get('symbol') || 'BTC').toUpperCase();
  const rangeKey = url.searchParams.get('range') || '1';

  const coin = coinSources[symbol];
  const range = RANGES[rangeKey];

  if (!coin || !range) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid symbol or range' }), { status: 400, headers });
  }

  const cacheKey = symbol + ':' + rangeKey;
  const now = Date.now();
  const cached = historyCache[cacheKey];
  if (cached && now - cached.updatedAt < range.ttl) {
    return new Response(JSON.stringify(cached.payload), { status: 200, headers });
  }

  try {
    const prices = await fetchCoinGeckoHistory(coin.cg, range.days);
    const payload = { ok: true, symbol: symbol, name: coin.name, range: rangeKey, prices: prices, source: 'coingecko' };
    historyCache[cacheKey] = { payload: payload, updatedAt: now };
    return new Response(JSON.stringify(payload), { status: 200, headers });
  } catch (err) {
    if (cached) {
      return new Response(JSON.stringify(cached.payload), { status: 200, headers });
    }
    const payload = { ok: true, symbol: symbol, name: coin.name, range: rangeKey, prices: buildFallback(symbol, range.days), source: 'fallback' };
    return new Response(JSON.stringify(payload), { status: 200, headers });
  }
}
