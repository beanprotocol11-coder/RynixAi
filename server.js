const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const COINGECKO_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  HYPE: 'hyperliquid'
};

const HYPERLIQUID_SYMBOLS = ['BTC', 'ETH', 'SOL', 'HYPE'];

let cache = {
  data: null,
  updatedAt: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds

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
    const change24h = cg && typeof cg.change24h === 'number' ? cg.change24h : 0;

    if (isValidPrice(price)) {
      result[symbol] = {
        price: price,
        change24h: change24h,
        sources: {
          price: hl && isValidPrice(hl.price) ? 'hyperliquid' : 'coingecko',
          change24h: cg && typeof cg.change24h === 'number' ? 'coingecko' : null
        }
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

app.use(express.static(path.join(__dirname)));
app.use(express.json());

app.get('/api/stats', (req, res) => {
  res.json({
    mode: 'live',
    wallets: 265,
    trades_this_month: 0,
    total_volume: 168553875.5,
    total_trades: 47569,
    analysis_runs: 1348,
    unique_assets: 4,
    active: 3,
    open_positions: 2,
    jobs_processed: 308,
    mcap: 122326.13,
    tweets: 1934,
    updated_at: new Date().toISOString()
  });
});

app.get('/api/activity', (req, res) => {
  res.json({ activities: [], mode: 'live' });
});

app.post('/api/terminal', async (req, res) => {
  const body = typeof req.body === 'object' && req.body !== null ? req.body : {};
  const cmd = (body.command || '').trim().toLowerCase();
  let output = '';
  if (!cmd) output = 'Usage: type a command and press Enter. Try `help`.';
  else if (cmd === 'help') {
    output = `Available commands:
  help        - show this help
  status      - show agent status
  price       - show current prices
  balance     - show wallet balance
  trades      - show recent trades
  automations - list automations
  clear       - clear terminal
  ping        - pong`;
  } else if (cmd === 'status') {
    output = 'Status: online\nConnected: HyperLiquid mainnet\nAutomations: 3\nOpen positions: 2';
  } else if (cmd === 'price' || cmd === 'prices') {
    try {
      const prices = await fetchLivePrices();
      const lines = Object.entries(prices).map(([symbol, info]) => {
        return `${symbol}/USD: $${info.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${info.change24h >= 0 ? '+' : ''}${info.change24h.toFixed(2)}%)`;
      });
      output = lines.join('\n');
    } catch (err) {
      output = 'Unable to fetch live prices.';
    }
  } else if (cmd === 'balance') {
    output = 'Balance: 0.00 USDC\n0.00 BTC\n0.00 ETH\n0.00 SOL\n0.00 HYPE';
  } else if (cmd === 'trades') {
    output = 'No trades yet. Use real wallets to execute trades.';
  } else if (cmd === 'automations') {
    output = '3 active automations.';
  } else if (cmd === 'ping') {
    output = 'pong';
  } else if (cmd === 'clear') {
    output = '__CLEAR__';
  } else {
    output = `Command not recognized: ${body.command}\nType 'help' for available commands.`;
  }
  res.json({ output, mode: 'live' });
});

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    return res.json(cache.data);
  }

  try {
    const result = await fetchLivePrices();
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

app.get('/api/wallet', (req, res) => {
  const type = req.query.type || 'unknown';
  const address = req.query.address || '';
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  if (!isValidAddress && type !== 'unknown') {
    return res.status(400).json({ ok: false, error: 'Invalid EVM address' });
  }

  if (type === 'unknown' || !address) {
    return res.status(400).json({ ok: false, error: 'Missing type or address' });
  }

  const token = 'rynix_' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  res.json({
    ok: true,
    type,
    address,
    token,
    timestamp: Date.now()
  });
});

app.get('/api/litepaper', (req, res) => {
  const data = {
    title: "Rynix AI Litepaper",
    updatedAt: Date.now(),
    sections: [
      {
        title: "Abstract",
        heading: "What is Rynix AI?",
        body: [
          "Rynix AI is an autonomous, natural-language powered trading interface for the HyperLiquid ecosystem and broader EVM markets. Users describe what they want to do in plain English and Rynix AI translates intent into on-chain actions, monitors positions, and executes strategies around the clock.",
          "The protocol combines an LLM intent layer, a deterministic execution engine, and an autonomous compute network (ACP) so that trades, automations, and theses can run without manual intervention."
        ],
        bullets: [
          "Vibe trading: think it, say it, trade it.",
          "24/7 autonomous monitoring and execution.",
          "Portfolio-aware risk management and retry logic."
        ]
      },
      {
        title: "Architecture",
        heading: "Agent + Execution Stack",
        body: [
          "Rynix AI is split into three layers: the Intent Layer, the Agent Layer, and the Execution Layer.",
          "The Intent Layer parses natural language, identifies assets, quantities, and conditions, then outputs a structured trading plan. The Agent Layer validates the plan against market data, user portfolio, and risk parameters. The Execution Layer signs and submits transactions through HyperLiquid, EVM wallets, or whitelisted DEX aggregators."
        ],
        bullets: [
          "Intent parsing: symbol detection, quantity extraction, side classification.",
          "Live price feeds: CoinGecko, HyperLiquid, and on-chain oracles.",
          "Secure execution: wallet signatures, smart retries, error handling."
        ]
      },
      {
        title: "Autonomous Compute Protocol",
        heading: "ACP Network",
        body: [
          "The Autonomous Compute Protocol (ACP) allows Rynix AI agents to receive jobs from other agents, DAOs, and protocols. A job is a structured request containing a trading objective, constraints, and settlement rules.",
          "Agent nodes validate job feasibility, execute according to the defined rules, and submit proof of execution. The network is designed to be permissioned during the launch phase and progressively decentralised."
        ],
        bullets: [
          "Job queue for cross-agent tasks.",
          "Proof-of-execution and reputation scoring.",
          "Settlement via smart contracts or HyperLiquid clearing."
        ]
      },
      {
        title: "Tokenomics",
        heading: "$RYNIX Token",
        body: [
          "The $RYNIX token is the native utility and governance token of the Rynix AI ecosystem. It is used to pay execution fees, access premium agent strategies, stake for ACP node eligibility, and vote on protocol upgrades.",
          "A portion of protocol fees is directed to the treasury and used to reward stakers, operators, and contributors."
        ],
        bullets: [
          "Total supply: 1,000,000,000 $RYNIX.",
          "Fee sharing for stakers and node operators.",
          "Governance over agent parameters and fee schedules."
        ]
      },
      {
        title: "Governance",
        heading: "Decentralised Governance",
        body: [
          "Rynix AI governance is token-weighted. $RYNIX holders can propose and vote on protocol upgrades, new agent strategies, fee changes, and treasury allocations.",
          "The protocol starts with a core team multisig and transitions to on-chain governance as the agent network matures."
        ],
        bullets: [
          "On-chain proposals and voting.",
          "Multisig guardrails during the launch phase.",
          "Transparent treasury and fee distribution."
        ]
      },
      {
        title: "Roadmap",
        heading: "Development Timeline",
        body: [
          "The Rynix AI roadmap is split into four phases: Launch, Expansion, Autonomy, and Decentralisation."
        ],
        bullets: [
          "Phase 1 — Launch: chatbot trading, price feeds, wallet integration, and litepaper.",
          "Phase 2 — Expansion: terminal UI, advanced automations, multi-asset support, and ACP beta.",
          "Phase 3 — Autonomy: full self-custody automations, strategy marketplace, and agent-to-agent jobs.",
          "Phase 4 — Decentralisation: on-chain governance, permissionless ACP nodes, and DAO treasury."
        ]
      }
    ]
  };
  res.json(data);
});

app.listen(PORT, () => {
  console.log('Rynix AI server running on port ' + PORT);
});
