---
name: testing-rynix-ui
description: Test the Rynix AI static website end-to-end across desktop and phone-sized layouts.
---

# Testing Rynix AI UI

## Devin Secrets Needed

None. The local UI, price fallback data, terminal, wallet chooser, and external integration links can be tested without credentials.

## Start the app

From the repository root:

```bash
npm install
npm start
```

Open `http://127.0.0.1:3000/` in the existing Chrome session. The expected server message is:

```text
Rynix AI server running on port 3000
```

## Desktop golden path

1. Maximize Chrome and start an annotated recording.
2. Verify the hero heading `Vibe trading is here.`, all three CTAs, and motion between two video frames.
3. Click `Open Terminal`; verify `#terminal`, lime RYNIX ASCII, and `OK`, `ACTIVE`, `ANCHORED`.
4. Run `status` and `market`; verify the exact status line and BTC, ETH, SOL, HYPE output.
5. Click `open chat`; verify the chat input and close control.
6. Run `statistics`; verify `Live network analytics`.
7. Click the Hyperliquid logo button and verify the URL begins `https://app.hyperliquid.xyz/trade`.
8. In Devin's automated Chrome profile, the external URL may replace the current tab despite `target="_blank"`. Use browser Back (`Alt+Left`) to return. Do not use `Ctrl+W`.
9. Open `Robinhood Chain`; verify the supplied logo, exact heading, and `Open Verification Terminal`.
10. Open the wallet modal; verify Brave Wallet, MetaMask, and WalletConnect are present and Demo Wallet is absent.

## Phone-sized regression

With Chrome active:

```bash
wmctrl -r :ACTIVE: -b remove,maximized_vert,maximized_horz
wmctrl -r :ACTIVE: -e 0,0,0,390,929
```

The outer height accounts for Chrome controls and produces a viewport near 390 × 844.

1. Verify the hero video, heading, and all three CTAs are readable without page-width clipping.
2. Open the hamburger menu and select `Terminal`.
3. Verify the menu closes, the URL reaches `#terminal`, and the input, full-width Run button, and quick actions fit the page.
4. Run `help` to prove the phone-sized input and submit flow work.

Restore the browser after testing:

```bash
wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz
```

## Evidence

- Use one continuous recording with setup, test-start, and consolidated assertion annotations.
- Capture full-screen screenshots for hero motion, terminal output, integrations, wallet options, and the phone-sized terminal.
- Write `test-report.md` with expected, actual, and pass/fail results. Embed screenshots in two-column tables where practical.
