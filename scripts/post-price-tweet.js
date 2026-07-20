#!/usr/bin/env node
/**
 * Auto-posts a Rynix terminal price update to X (Twitter) for @Rynixai_.
 *
 * Pulls live prices for every pair on the Rynix website (BTC, ETH, SOL, HYPE)
 * from the deployed /api/prices endpoint and publishes a formatted tweet using
 * the X API v2 (POST /2/tweets) with OAuth 1.0a user-context auth.
 *
 * Required env vars (set as GitHub Actions secrets):
 *   X_API_KEY             (consumer key)
 *   X_API_SECRET          (consumer secret)
 *   X_ACCESS_TOKEN        (user access token)
 *   X_ACCESS_TOKEN_SECRET (user access token secret)
 *
 * Optional env vars:
 *   PRICES_URL   defaults to https://rynixai.pages.dev/api/prices
 *   SITE_URL     defaults to https://rynixai.pages.dev
 *   DRY_RUN      when "true", prints the tweet instead of posting
 */

const crypto = require('crypto');

const PRICES_URL = process.env.PRICES_URL || 'https://rynixai.pages.dev/api/prices';
const SITE_URL = process.env.SITE_URL || 'https://rynixai.pages.dev';
const DRY_RUN = String(process.env.DRY_RUN || '').toLowerCase() === 'true';

// Order the pairs the same way they appear on the website terminal.
const PAIR_ORDER = ['BTC', 'ETH', 'SOL', 'HYPE'];

function formatPrice(value) {
  if (!isFinite(value)) return '—';
  const decimals = value >= 100 ? 2 : value >= 1 ? 2 : 4;
  return '$' + Number(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatChange(change) {
  if (!isFinite(change)) return '';
  const arrow = change >= 0 ? '🟢 +' : '🔴 ';
  return `${arrow}${change.toFixed(2)}%`;
}

function buildTweet(prices) {
  const lines = [];
  lines.push('📊 RYNIX Terminal — live market update');
  lines.push('');
  for (const symbol of PAIR_ORDER) {
    const p = prices[symbol];
    if (!p || typeof p.price !== 'number') continue;
    lines.push(`${symbol}  ${formatPrice(p.price)}  ${formatChange(p.change24h)}`);
  }
  lines.push('');
  lines.push('Vibe trade the HyperLiquid ecosystem 👇');
  lines.push(SITE_URL);
  lines.push('#RynixAI #HyperLiquid #Crypto');
  return lines.join('\n');
}

async function fetchPrices() {
  const res = await fetch(PRICES_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'RynixAI-Autopost/1.0' }
  });
  if (!res.ok) throw new Error(`Prices API error: ${res.status}`);
  const data = await res.json();
  const hasAny = PAIR_ORDER.some((s) => data[s] && typeof data[s].price === 'number');
  if (!hasAny) throw new Error('Prices API returned no usable pairs');
  return data;
}

// --- OAuth 1.0a signing (HMAC-SHA1) ---------------------------------------
function percentEncode(str) {
  return encodeURIComponent(str).replace(
    /[!*()']/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
}

function buildOAuthHeader(method, url, creds) {
  const oauthParams = {
    oauth_consumer_key: creds.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: creds.accessToken,
    oauth_version: '1.0'
  };

  // POST /2/tweets sends a JSON body, so only oauth_* params are signed.
  const paramString = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
    .join('&');

  const baseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString)
  ].join('&');

  const signingKey = `${percentEncode(creds.apiSecret)}&${percentEncode(
    creds.accessTokenSecret
  )}`;
  const signature = crypto
    .createHmac('sha1', signingKey)
    .update(baseString)
    .digest('base64');

  oauthParams.oauth_signature = signature;

  return (
    'OAuth ' +
    Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
      .join(', ')
  );
}

async function postTweet(text, creds) {
  const url = 'https://api.twitter.com/2/tweets';
  const authHeader = buildOAuthHeader('POST', url, creds);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ text })
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`X API error ${res.status}: ${body}`);
  }
  return JSON.parse(body);
}

function loadCreds() {
  const creds = {
    apiKey: process.env.X_API_KEY,
    apiSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN,
    accessTokenSecret: process.env.X_ACCESS_TOKEN_SECRET
  };
  const missing = Object.entries(creds)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      'Missing X API credentials: ' +
        missing
          .map((k) => k.replace('api', 'X_API_').replace('access', 'X_ACCESS_'))
          .join(', ')
    );
  }
  return creds;
}

async function main() {
  const prices = await fetchPrices();
  const tweet = buildTweet(prices);

  if (tweet.length > 280) {
    console.warn(`Tweet is ${tweet.length} chars (>280); X may reject it.`);
  }

  if (DRY_RUN) {
    console.log('--- DRY RUN (not posting) ---');
    console.log(tweet);
    console.log(`--- length: ${tweet.length} ---`);
    return;
  }

  const creds = loadCreds();
  const result = await postTweet(tweet, creds);
  const id = result && result.data && result.data.id;
  console.log('Posted tweet:', id ? `https://x.com/Rynixai_/status/${id}` : result);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
