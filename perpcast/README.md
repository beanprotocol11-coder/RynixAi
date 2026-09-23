# Perpcast

Cast, chat and trade perps in one place. A cast-style social network with a Hyperliquid-powered paper-trading terminal. Identity is your wallet — no third-party social protocol.

- **Social** — casts, replies, quotes, likes, recasts, follows, channels, profiles, bookmarks, search, notifications and DMs. Every user is a wallet address with a chosen @username.
- **Markets** — Crypto, Memes, Stocks and RWAs from Hyperliquid (main dex + the `xyz` builder dex): live prices, candles, order book and trades; market/limit orders, leverage, TP/SL, liquidation, fills and portfolio. **Paper trading only — no real funds.**
- **Sign in** — connect any EVM wallet (EIP-6963 discovery, legacy `window.ethereum`, or mobile wallet deep links) and sign a nonce message. Signing never sends a transaction or spends gas.
- Share positions as casts, trade from any `$TICKER` mention, market rooms per coin.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # tsc -b && vite build → dist/
npm run lint     # oxlint
```

## Backend

`functions/` contains Cloudflare Pages Functions (`/api/*`) backed by D1 (`migrations/0001_init.sql`): wallet auth (nonce + signature verify), users, casts, reactions, follows, activity and DMs.

The client probes `/api/health` on boot. If the API is reachable it runs in **server** mode (shared social graph). Otherwise it falls back to **local** mode, where the same API surface is served from the browser's `localStorage` (`perpcast:` prefix) — the UI shows which mode is active in Settings.

To enable server mode, create a D1 database, put its id in `wrangler.toml`, apply the migration (`wrangler d1 migrations apply perpcast`), and bind it to the Pages project as `DB`.

## Deploy

Cloudflare Pages: root directory `perpcast`, build command `npm run build`, output `dist`. `public/_redirects` handles client-side routing. `.github/workflows/deploy-perpcast.yml` deploys on push to `main`.
