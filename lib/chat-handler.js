const { getChatCompletion } = require('./llm');
const { setCors } = require('./cors');
const { rateLimit } = require('./rate-limit');

const MAX_BODY_SIZE = 1024 * 1024;

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (Buffer.isBuffer(req.body) && req.body.length > MAX_BODY_SIZE) {
    throw new Error('Request body too large');
  }

  return new Promise((resolve, reject) => {
    let data = '';
    let size = 0;

    req.on('data', chunk => {
      size += Buffer.byteLength(chunk, 'utf8');
      if (size > MAX_BODY_SIZE) {
        reject(new Error('Request body too large'));
        return;
      }
      data += chunk;
    });

    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });

    req.on('error', reject);
  });
}

module.exports = async function chatHandler(req, res) {
  const allowed = setCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(allowed ? 200 : 403).end();
    return;
  }

  if (!allowed) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!rateLimit(req)) {
    res.status(429).json({ error: 'Rate limit exceeded' });
    return;
  }

  try {
    const body = await parseBody(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const wallet = typeof body.wallet === 'string' ? body.wallet : null;
    const connected = Boolean(body.connected);
    const context = typeof body.context === 'string' ? body.context : null;

    if (messages.length === 0) {
      res.status(400).json({ error: 'messages array is required' });
      return;
    }

    const reply = await getChatCompletion(messages, { wallet, connected, context });
    res.status(200).json({ role: 'assistant', content: reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    const status = err.message && err.message.includes('API key') ? 503 : 500;
    res.status(status).json({
      error: 'Chat failed',
      details: err.message || 'Unable to process chat'
    });
  }
};
