# Perpcast

Cast, chat and trade perps in one place. A Farcaster-style social client with a Hyperliquid-powered paper-trading terminal.

- **Social** — live casts from Farcaster Hubs (For you / Following / Traders), channels, profiles, replies, quotes, likes, recasts, bookmarks, search, notifications and DMs.
- **Trade** — live prices, candles, order book and trades from Hyperliquid; market/limit orders, leverage, TP/SL, liquidation, fills and portfolio. **Paper trading only — no real funds.**
- **Sign in** — Sign in with Farcaster (QR / Warpcast) or an injected EVM wallet (MetaMask, Rabby, …).
- Share positions as casts, trade from any `$TICKER` mention, market rooms per coin.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint
```

## Deploy

Static SPA. On Cloudflare Pages set root directory `perpcast`, build command `npm run build`, output `dist`. `public/_redirects` handles client-side routing.

All user state (session, casts you publish, reactions, positions, DMs) is stored in the browser's `localStorage` under the `perpcast:` prefix.
