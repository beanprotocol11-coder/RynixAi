const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};

const HYPERLIQUID_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE'];

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

async function fetchLivePrices() {
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

  return result;
}

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
  const response = { output: '', mode: 'live' };

  if (!cmd) {
    response.output = 'Usage: type a command and press Enter. Try `help`.';
  } else if (cmd === 'help') {
    response.output = `Available commands:
  help        - show this help
  status      - show agent status
  price       - show current prices
  balance     - show wallet balance
  trades      - show recent trades
  automations - list automations
  clear       - clear terminal
  ping        - pong`;
  } else if (cmd === 'status') {
    response.output = `Status: online
Connected: HyperLiquid mainnet
Automations: 3
Open positions: 2`;
  } else if (cmd === 'price' || cmd === 'prices') {
    try {
      const prices = await fetchLivePrices();
      const lines = Object.entries(prices).map(([symbol, info]) => {
        return `${symbol}/USD: $${info.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${info.change24h >= 0 ? '+' : ''}${info.change24h.toFixed(2)}%)`;
      });
      response.output = lines.join('\n');
    } catch (err) {
      response.output = 'Unable to fetch live prices.';
    }
  } else if (cmd === 'balance') {
    response.output = `Balance: 0.00 USDC
0.00 BTC
0.00 ETH
0.00 SOL
0.00 HYPE`;
  } else if (cmd === 'trades') {
    response.output = 'No trades yet. Use real wallets to execute trades.';
  } else if (cmd === 'automations') {
    response.output = '3 active automations.';
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
