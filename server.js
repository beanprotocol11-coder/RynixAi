const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

const priceSources = {
  BTC: { kraken: 'XBTUSD', cg: 'bitcoin' },
  ETH: { kraken: 'ETHUSD', cg: 'ethereum' },
  SOL: { kraken: 'SOLUSD', cg: 'solana' },
  HYPE: { kraken: 'HYPEUSD', cg: 'hyperliquid' }
};

const FALLBACK_PRICES = {
  BTC: { price: 62750, change24h: -1.5 },
  ETH: { price: 1776, change24h: -1.0 },
  SOL: { price: 76.4, change24h: 0.3 },
  HYPE: { price: 65.1, change24h: -2.6 }
};

let cache = {
  data: null,
  updatedAt: 0
};

const CACHE_TTL = 60 * 1000; // 60 seconds

app.use(express.static(path.join(__dirname)));

app.get('/statistics', (req, res) => {
  res.sendFile(path.join(__dirname, 'statistics.html'));
});

app.get('/charts', (req, res) => {
  res.sendFile(path.join(__dirname, 'charts.html'));
});

function getKrakenResult(data) {
  const result = {};
  for (const [symbol, config] of Object.entries(priceSources)) {
    const key = Object.keys(data).find(k => k.includes(config.kraken.replace('USD', '')) || k.includes(symbol));
    if (!key) continue;
    const ticker = data[key];
    const last = parseFloat(ticker.c[0]);
    const open = parseFloat(ticker.o);
    if (!isNaN(last) && !isNaN(open) && open !== 0) {
      result[symbol] = {
        price: last,
        change24h: ((last - open) / open) * 100
      };
    }
  }
  return result;
}

function getCoinGeckoResult(data) {
  const result = {};
  for (const [symbol, config] of Object.entries(priceSources)) {
    const id = config.cg;
    if (data[id] && typeof data[id].usd === 'number') {
      result[symbol] = {
        price: data[id].usd,
        change24h: data[id].usd_24h_change || 0
      };
    }
  }
  return result;
}

async function fetchKrakenPrices() {
  const pairs = Object.values(priceSources).map(s => s.kraken).join(',');
  const response = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + pairs, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
    timeout: 10000
  });
  if (!response.ok) throw new Error('Kraken API error: ' + response.status);
  const data = await response.json();
  if (data.error && data.error.length) throw new Error('Kraken API error: ' + data.error.join(', '));
  return getKrakenResult(data.result);
}

async function fetchCoinGeckoPrices() {
  const ids = Object.values(priceSources).map(s => s.cg).join(',');
  const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true', {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
    timeout: 10000
  });
  if (!response.ok) throw new Error('CoinGecko API error: ' + response.status);
  const data = await response.json();
  return getCoinGeckoResult(data);
}

app.get('/api/prices', async (req, res) => {
  const now = Date.now();
  if (cache.data && now - cache.updatedAt < CACHE_TTL) {
    return res.json(cache.data);
  }

  try {
    const result = await fetchKrakenPrices();
    if (Object.keys(result).length === Object.keys(priceSources).length) {
      cache = { data: result, updatedAt: now };
      return res.json(result);
    }
  } catch (error) {
    console.error('Kraken fetch error:', error.message);
  }

  try {
    const result = await fetchCoinGeckoPrices();
    if (Object.keys(result).length > 0) {
      cache = { data: result, updatedAt: now };
      return res.json(result);
    }
  } catch (error) {
    console.error('CoinGecko fetch error:', error.message);
  }

  if (cache.data) {
    return res.json(cache.data);
  }

  res.json(FALLBACK_PRICES);
});

const HISTORY_RANGES = {
  '1': { days: '1', ttl: 5 * 60 * 1000 },
  '7': { days: '7', ttl: 30 * 60 * 1000 },
  '30': { days: '30', ttl: 60 * 60 * 1000 }
};

const historyCoins = {
  BTC: { cg: 'bitcoin', name: 'Bitcoin' },
  ETH: { cg: 'ethereum', name: 'Ethereum' },
  SOL: { cg: 'solana', name: 'Solana' },
  HYPE: { cg: 'hyperliquid', name: 'Hyperliquid' }
};

const historyCache = {};

function buildHistoryFallback(symbol, days) {
  const base = (FALLBACK_PRICES[symbol] && FALLBACK_PRICES[symbol].price) || 100;
  const points = days === '1' ? 48 : days === '7' ? 56 : 60;
  const now = Date.now();
  const span = Number(days) * 24 * 60 * 60 * 1000;
  const prices = [];
  let value = base * 0.96;
  for (let i = 0; i < points; i++) {
    const t = now - span + (span / (points - 1)) * i;
    value = value * (1 + (Math.sin(i / 4) * 0.012) + (i / points) * 0.001);
    prices.push([Math.round(t), Number(value.toFixed(2))]);
  }
  return prices;
}

app.get('/api/history', async (req, res) => {
  const symbol = String(req.query.symbol || 'BTC').toUpperCase();
  const rangeKey = String(req.query.range || '1');
  const coin = historyCoins[symbol];
  const range = HISTORY_RANGES[rangeKey];

  if (!coin || !range) {
    return res.status(400).json({ ok: false, error: 'Invalid symbol or range' });
  }

  const cacheKey = symbol + ':' + rangeKey;
  const now = Date.now();
  const cached = historyCache[cacheKey];
  if (cached && now - cached.updatedAt < range.ttl) {
    return res.json(cached.payload);
  }

  try {
    const url = 'https://api.coingecko.com/api/v3/coins/' + coin.cg +
      '/market_chart?vs_currency=usd&days=' + range.days;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; RynixAI/1.0)' },
      timeout: 10000
    });
    if (!response.ok) throw new Error('CoinGecko history error: ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data.prices) || !data.prices.length) {
      throw new Error('CoinGecko history empty');
    }
    const payload = {
      ok: true, symbol, name: coin.name, range: rangeKey,
      prices: data.prices.map(p => [p[0], p[1]]), source: 'coingecko'
    };
    historyCache[cacheKey] = { payload, updatedAt: now };
    return res.json(payload);
  } catch (error) {
    console.error('History fetch error:', error.message);
    if (cached) {
      return res.json(cached.payload);
    }
    return res.json({
      ok: true, symbol, name: coin.name, range: rangeKey,
      prices: buildHistoryFallback(symbol, range.days), source: 'fallback'
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
