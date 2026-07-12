export async function onRequest(context) {
  const priceMap = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    HYPE: 'hyperliquid'
  };

  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Content-Type', 'application/json');

  const request = context.request;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers });
  }

  const ids = Object.values(priceMap).join(',');
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true',
      { headers: { Accept: 'application/json' } }
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
          change24h: data[id].usd_24h_change || 0
        };
      }
    }
    return new Response(JSON.stringify(result), { status: 200, headers });
  } catch (error) {
    console.error('Price proxy error:', error.message);
    return new Response(JSON.stringify({ error: 'Unable to fetch prices', details: error.message }), { status: 500, headers });
  }
}
