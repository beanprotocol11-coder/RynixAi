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

  // Demo stats. In production these should come from real on-chain data.
  const stats = {
    mode: 'demo',
    wallets: 0,
    trades_this_month: 0,
    total_volume: 0,
    total_trades: 0,
    analysis_runs: 0,
    unique_assets: 4,
    active: 0,
    open_positions: 0,
    jobs_processed: 0,
    mcap: 0,
    tweets: 0,
    updated_at: new Date().toISOString()
  };

  return new Response(JSON.stringify(stats), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      'Cache-Control': 'no-store'
    }
  });
}
