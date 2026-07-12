const { getChatCompletion } = require('./llm');

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
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
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
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
