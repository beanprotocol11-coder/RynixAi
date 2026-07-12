export async function onRequest(context) {
  const request = context.request;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const cmd = (body.command || '').trim().toLowerCase();
  const response = { output: '', mode: 'demo' };

  if (!cmd) {
    response.output = 'Usage: type a command and press Enter. Try `help`.';
  } else if (cmd === 'help') {
    response.output = `Available commands:
  help        - show this help
  status      - show agent status
  price       - show current prices
  balance     - show demo wallet balance
  trades      - show recent demo trades
  automations - list demo automations
  clear       - clear terminal
  ping        - pong`;
  } else if (cmd === 'status') {
    response.output = `Status: online\nMode: demo\nConnected: HyperLiquid testnet\nAutomations: 0\nOpen positions: 0`;
  } else if (cmd === 'price' || cmd === 'prices') {
    response.output = `BTC/USD: $63,800.00\nETH/USD: $1,800.00\nSOL/USD: $76.00\nHYPE/USD: $66.00\n(Data is demo; real prices are fetched from CoinGecko on the main page.)`;
  } else if (cmd === 'balance') {
    response.output = `Demo balance: 0.00 USDC\n0.00 BTC\n0.00 ETH\n0.00 SOL\n0.00 HYPE`;
  } else if (cmd === 'trades') {
    response.output = 'No demo trades yet. Use real wallets to execute trades.';
  } else if (cmd === 'automations') {
    response.output = 'No active automations in demo mode.';
  } else if (cmd === 'ping') {
    response.output = 'pong';
  } else if (cmd === 'clear') {
    response.output = '__CLEAR__';
  } else {
    response.output = `Command not recognized: ${body.command}\nType 'help' for available commands.`;
  }

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
      'Cache-Control': 'no-store'
    }
  });
}
