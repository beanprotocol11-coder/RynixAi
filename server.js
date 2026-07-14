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

app.post('/api/acp/submit', express.json(), (req, res) => {
  const body = req.body || {};
  const intent = body.intent;
  const signature = body.signature;

  if (!intent || !signature || !intent.account || !intent.asset || !intent.side) {
    return res.status(400).json({ ok: false, error: 'missing intent fields or signature' });
  }
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return res.status(400).json({ ok: false, error: 'malformed signature' });
  }

  let h = 0;
  const seed = String(intent.account) + String(intent.nonce || '') + Date.now();
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) >>> 0;
  const jobId = 'acp-' + h.toString(16).padStart(8, '0').slice(0, 8);

  res.json({
    ok: true,
    jobId,
    status: '$QUEUED',
    account: intent.account,
    asset: intent.asset,
    side: intent.side,
    venue: intent.venue || 'HyperLiquid',
    receivedAt: Date.now(),
    signature
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
