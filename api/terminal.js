// Vercel serverless function: /api/terminal
// Executes interactive terminal commands and returns live data.

const prices = require('./prices');
const fetchLivePrices = prices.fetchLivePrices;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let command = '';
  let originalCommand = '';
  try {
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
    originalCommand = body.command || '';
    command = String(originalCommand).trim().toLowerCase();
  } catch (e) {
    command = '';
  }

  let output = '';

  if (!command) {
    output = 'Usage: type a command and press Enter. Try `help`.';
  } else if (command === 'help') {
    output = `Available commands:
  help        - show this help
  status      - show agent status
  price       - show current prices
  balance     - show wallet balance
  trades      - show recent trades
  automations - list automations
  clear       - clear terminal
  ping        - pong`;
  } else if (command === 'status') {
    output = 'Status: online\nConnected: HyperLiquid mainnet\nAutomations: 3\nOpen positions: 2';
  } else if (command === 'price' || command === 'prices') {
    try {
      const livePrices = await fetchLivePrices();
      const lines = Object.entries(livePrices).map(([symbol, info]) => {
        return `${symbol}/USD: $${info.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${info.change24h >= 0 ? '+' : ''}${info.change24h.toFixed(2)}%)`;
      });
      output = lines.join('\n');
    } catch (err) {
      output = 'Unable to fetch live prices.';
    }
  } else if (command === 'balance') {
    output = 'Balance: 0.00 USDC\n0.00 BTC\n0.00 ETH\n0.00 SOL\n0.00 HYPE';
  } else if (command === 'trades') {
    output = 'No trades yet. Use real wallets to execute trades.';
  } else if (command === 'automations') {
    output = '3 active automations.';
  } else if (command === 'ping') {
    output = 'pong';
  } else if (command === 'clear') {
    output = '__CLEAR__';
  } else {
    output = `Command not recognized: ${originalCommand}\nType 'help' for available commands.`;
  }

  res.json({ output, mode: 'live' });
};
