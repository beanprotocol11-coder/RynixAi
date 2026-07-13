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
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
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
