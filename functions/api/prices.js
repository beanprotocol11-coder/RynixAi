const priceCache = { data: null, updatedAt: 0 };
const priceMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};
const CACHE_TTL = 60 * 1000;

export async function onRequest(context) {
  const request = context.request;
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const now = Date.now();

  if (priceCache.data && now - priceCache.updatedAt < CACHE_TTL) {
    return new Response(JSON.stringify(priceCache.data), { status: 200, headers });
  }

  try {
    const ids = Object.values(priceMap).join(',');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
      headers: { 'Accept': 'application/json' },
      cf: { cacheTtl: 60 }
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

    priceCache.data = result;
    priceCache.updatedAt = now;

    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    console.error('Price proxy error:', error.message);
    if (priceCache.data) {
      return new Response(JSON.stringify(priceCache.data), { status: 200, headers });
    }
    return new Response(JSON.stringify({ error: 'Unable to fetch prices', details: error.message }), { status: 500, headers });
  }
}
