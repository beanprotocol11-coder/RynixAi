export async function onRequest(context) {
  const { request, waitUntil } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const priceMap = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    HYPE: 'hyperliquid'
  };

  const cache = caches.default;
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await cache.match(cacheKey);

  if (cached) {
    const cachedAt = cached.headers.get('x-cached-at');
    if (cachedAt && (Date.now() - parseInt(cachedAt, 10)) < 60000) {
      return new Response(cached.body, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
          'x-cached-at': cachedAt,
          'x-cache': 'HIT'
        }
      });
    }
  }

  try {
    const ids = Object.values(priceMap).join(',');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true',
      {
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

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

    const now = Date.now();
    const body = JSON.stringify(result);

    const responseToCache = new Response(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
        'x-cached-at': String(now),
        'x-cache': 'MISS'
      }
    });

    if (typeof waitUntil === 'function') {
      waitUntil(cache.put(cacheKey, responseToCache.clone()));
    } else {
      await cache.put(cacheKey, responseToCache.clone());
    }

    return responseToCache;
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Unable to fetch prices', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
