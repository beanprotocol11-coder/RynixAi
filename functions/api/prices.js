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

  const COINGECKO_IDS = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    HYPE: 'hyperliquid'
  };

  const HYPERLIQUID_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE'];

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

  function isValidPrice(value) {
    return typeof value === 'number' && !isNaN(value) && value > 0;
  }

  async function fetchHyperliquidPrices() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch('https://api.hyperliquid.xyz/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Hyperliquid API error: ' + response.status);
      }

      const data = await response.json();
      const result = {};

      for (const symbol of HYPERLIQUID_SYMBOLS) {
        if (data[symbol] && (typeof data[symbol] === 'string' || typeof data[symbol] === 'number')) {
          const price = parseFloat(data[symbol]);
          if (isValidPrice(price)) {
            result[symbol] = { price: price };
          }
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
      const change24h = cg && typeof cg.change24h === 'number' ? cg.change24h : 0;

      if (isValidPrice(price)) {
        result[symbol] = {
          price: price,
          change24h: change24h
        };
      }
    }

    return result;
  }

  try {
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
