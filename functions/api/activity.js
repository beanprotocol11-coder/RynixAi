export async function onRequest(context) {
  const request = context.request;
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

  const now = Date.now();
  const events = [
    { type: 'info', symbol: 'BTC', message: 'Demo automation stopped' },
    { type: 'open', symbol: 'ETH', message: 'Demo position opened' },
    { type: 'close', symbol: 'HYPE', message: 'Demo position closed' },
    { type: 'info', symbol: 'BTC', message: 'Demo automation started' },
    { type: 'open', symbol: 'BTC', message: 'Demo position opened' },
    { type: 'close', symbol: 'BTC', message: 'Demo position closed' }
  ];

  const activities = events.map((event, i) => {
    const time = new Date(now - (events.length - 1 - i) * 3600000).toISOString();
    return {
      time,
      type: event.type,
      symbol: event.symbol,
      message: event.message,
      tx: null,
      demo: true
    };
  });

  return new Response(JSON.stringify({ activities, mode: 'demo' }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      'Cache-Control': 'no-store'
    }
  });
}
