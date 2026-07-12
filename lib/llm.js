const OpenAI = require('openai');
const { getPrices } = require('./prices');

function createClient() {
  const useOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  if (useOpenRouter) {
    return new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': process.env.OPENROUTER_REFERER || 'https://rynix-ai.com/',
        'X-Title': 'Rynix AI'
      }
    });
  }
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('LLM API key not configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY.');
  }
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const DEFAULT_MODEL = process.env.LLM_MODEL ||
  (process.env.OPENROUTER_API_KEY ? 'openai/gpt-4o' : 'gpt-4o');
const MAX_HISTORY = 20;

function formatPrice(n) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildSystemPrompt(ctx) {
  const priceEntries = ctx.prices ? Object.entries(ctx.prices) : [];
  const priceLines = priceEntries.length
    ? priceEntries
        .map(([sym, d]) => `  - ${sym}: ${formatPrice(d.price)} (${d.change >= 0 ? '+' : ''}${d.change.toFixed(2)}% 24h)`)
        .join('\n')
    : '  Prices are unavailable right now.';

  const walletLine = ctx.wallet ? `  Connected wallet: ${ctx.wallet}` : '  Wallet: not connected';
  const contextLine = ctx.context ? `  Current user context: ${ctx.context}` : '';

  return `You are Rynix AI, an autonomous on-chain trading assistant and research companion built on Robinhood Chain.

About Robinhood Chain:
- It is a permissionless, EVM-compatible Layer-2 blockchain built with Arbitrum technology.
- It uses ETH as the native gas token and is optimized for real-world assets (RWA), equities, ETFs, and 24/7 on-chain trading.
- It has first-come, first-served sequencing and full smart-contract support.

Rynix AI capabilities:
- Natural-language trading assistant: users describe trades, strategies, and automations in plain English. You help translate intent into clear steps, but you do not execute real trades on your own.
- Real-time market data from CoinGecko for BTC, ETH, SOL, and HYPE.
- Wallet-aware context: when a wallet is connected, you can use the address in your replies.
- Persistent conversation memory: the user is continuing an ongoing conversation; keep context and avoid repeating yourself.
- Litepaper and documentation are available at /litepaper.

Current live context (UTC: ${new Date().toISOString()}):
Live prices:
${priceLines}

${walletLine}
${contextLine}

Rules:
- Be concise, accurate, and helpful. Do not hallucinate prices, trades, or token contracts.
- If a user asks to place a trade, explain the one-time wallet authorization required and that execution is settled on Robinhood Chain once the user confirms.
- If asked about Rynix AI, Robinhood Chain, the litepaper, tokenomics, or the roadmap, answer from the knowledge above.
- Never reference ERC-8004, ERC-8183, x402, HyperLiquid, or any other chain's standards as part of Rynix AI.
- Never invent a token contract address. If the contract is not set, say it has not been published yet.
- If asked for financial advice, remind the user that this is not financial advice.
- Keep responses focused and avoid unnecessary verbosity.

Tone: professional, confident, and slightly futuristic. Use the Rynix AI branding and the Robinhood Chain ecosystem context where relevant.`;
}

function sanitizeMessages(messages) {
  return messages
    .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: String(m.content || '').slice(0, 2000) }))
    .slice(-MAX_HISTORY);
}

async function getChatCompletion(messages, ctx = {}) {
  const client = createClient();
  const prices = await getPrices().catch(() => null);
  const system = buildSystemPrompt({ ...ctx, prices });
  const history = sanitizeMessages(messages);

  const response = await client.chat.completions.create({
    model: DEFAULT_MODEL,
    messages: [{ role: 'system', content: system }, ...history],
    temperature: 0.7,
    max_tokens: 1024
  });

  const choice = response.choices && response.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Invalid response from LLM');
  }

  return choice.message.content.trim();
}

module.exports = { getChatCompletion, buildSystemPrompt };
