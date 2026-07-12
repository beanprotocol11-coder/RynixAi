const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const priceMap = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};

let cache = {
  data: null,
  updatedAt: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds

app.use(express.static(path.join(__dirname)));
app.use(express.json());

app.get('/api/stats', (req, res) => {
  res.json({
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
  });
});

app.get('/api/activity', (req, res) => {
  const now = Date.now();
  const events = [
    { type: 'info', symbol: 'BTC', message: 'Demo automation stopped' },
    { type: 'open', symbol: 'ETH', message: 'Demo position opened' },
    { type: 'close', symbol: 'HYPE', message: 'Demo position closed' },
    { type: 'info', symbol: 'BTC', message: 'Demo automation started' },
    { type: 'open', symbol: 'BTC', message: 'Demo position opened' },
    { type: 'close', symbol: 'BTC', message: 'Demo position closed' }
  ];
  const activities = events.map((event, i) => ({
    time: new Date(now - (events.length - 1 - i) * 3600000).toISOString(),
    type: event.type,
    symbol: event.symbol,
    message: event.message,
    tx: null,
    demo: true
  }));
  res.json({ activities, mode: 'demo' });
});

app.post('/api/terminal', (req, res) => {
  const cmd = (req.body.command || '').trim().toLowerCase();
  let output = '';
  if (!cmd) output = 'Usage: type a command and press Enter. Try `help`.';
  else if (cmd === 'help') {
    output = `Available commands:
  help        - show this help
  status      - show agent status
  price       - show current prices
  balance     - show demo wallet balance
  trades      - show recent demo trades
  automations - list demo automations
  clear       - clear terminal
  ping        - pong`;
  } else if (cmd === 'status') output = 'Status: online\nMode: demo\nConnected: HyperLiquid testnet\nAutomations: 0\nOpen positions: 0';
  else if (cmd === 'price' || cmd === 'prices') output = 'BTC/USD: $63,800.00\nETH/USD: $1,800.00\nSOL/USD: $76.00\nHYPE/USD: $66.00\n(Data is demo; real prices are fetched from CoinGecko on the main page.)';
  else if (cmd === 'balance') output = 'Demo balance: 0.00 USDC\n0.00 BTC\n0.00 ETH\n0.00 SOL\n0.00 HYPE';
  else if (cmd === 'trades') output = 'No demo trades yet. Use real wallets to execute trades.';
  else if (cmd === 'automations') output = 'No active automations in demo mode.';
  else if (cmd === 'ping') output = 'pong';
  else if (cmd === 'clear') output = '__CLEAR__';
  else output = `Command not recognized: ${req.body.command}\nType 'help' for available commands.`;
  res.json({ output, mode: 'demo' });
});

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    return res.json(cache.data);
  }

  try {
    const ids = Object.values(priceMap).join(',');
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
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

    cache = { data: result, updatedAt: now };
    res.json(result);
  } catch (error) {
    console.error('Price proxy error:', error.message);
    if (cache.data) {
      return res.json(cache.data);
    }
    res.status(500).json({
      error: 'Unable to fetch prices',
      details: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log('Rynix AI server running on port ' + PORT);
});
