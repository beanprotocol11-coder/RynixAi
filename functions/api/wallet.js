export async function onRequest(context) {
  const request = context.request;
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'unknown';
  const address = url.searchParams.get('address') || '';

  const headers = new Headers({
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);
  if (!isValidAddress && type !== 'unknown') {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid EVM address' }), { status: 400, headers });
  }

  if (type === 'unknown' || !address) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing type or address' }), { status: 400, headers });
  }

  const token = 'rynix_' + Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  return new Response(JSON.stringify({
    ok: true,
    type,
    address,
    token,
    timestamp: Date.now()
  }), { status: 200, headers });
}
