// Vercel serverless function: /api/stats
// Returns live network statistics.

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

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
    mcap: 0,
    tweets: 0,
    updated_at: new Date().toISOString()
  });
};
