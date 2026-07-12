const express = require('express');
const path = require('path');
const { getPrices } = require('./lib/prices');
const chatHandler = require('./lib/chat-handler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/api/prices', async (req, res) => {
  try {
    const data = await getPrices();
    res.json(data);
  } catch (error) {
    console.error('Price proxy error:', error.message);
    res.status(500).json({
      error: 'Unable to fetch prices',
      details: error.message
    });
  }
});

app.post('/api/chat', (req, res) => chatHandler(req, res));

app.listen(PORT, () => {
  console.log('Rynix AI server running on port ' + PORT);
});
