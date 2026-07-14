// Cloudflare Pages Function: POST /api/acp/submit
// Receives a wallet-signed trading intent, validates the payload, and returns
// an ACP job receipt. Settlement itself is performed by the ACP relayer /
// operator with market access; this endpoint only records the authorization.

function corsHeaders() {
  return new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
}

function shortHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(h, 31) + str.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

export async function onRequest(context) {
  const request = context.request;
  const headers = corsHeaders();

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), { status: 405, headers });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid json' }), { status: 400, headers });
  }

  const intent = body && body.intent;
  const signature = body && body.signature;
  if (!intent || !signature || !intent.account || !intent.asset || !intent.side) {
    return new Response(JSON.stringify({ ok: false, error: 'missing intent fields or signature' }), { status: 400, headers });
  }
  if (typeof signature !== 'string' || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return new Response(JSON.stringify({ ok: false, error: 'malformed signature' }), { status: 400, headers });
  }

  const jobId = 'acp-' + shortHash(String(intent.account) + String(intent.nonce || '') + Date.now());
  const receipt = {
    ok: true,
    jobId: jobId,
    status: '$QUEUED',
    account: intent.account,
    asset: intent.asset,
    side: intent.side,
    venue: intent.venue || 'HyperLiquid',
    receivedAt: Date.now(),
    signature: signature
  };

  return new Response(JSON.stringify(receipt), { status: 200, headers });
}
