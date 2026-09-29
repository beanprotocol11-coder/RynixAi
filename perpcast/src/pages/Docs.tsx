import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { cx } from '../lib/format'
import { MASCOTS_CONTRACT, MASCOTS_V1_CONTRACT, MASCOT_SUPPLY } from '../lib/mascots'
import { ROBINHOOD_CHAIN } from '../lib/wallet'

const UPDATED = 'September 30, 2026'

type Doc = { id: string; title: string; body: React.ReactNode }

function P({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-relaxed text-ink-2">{children}</p>
}
function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 text-[15px] leading-relaxed text-ink-2">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}
function Bullets({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-ink-2">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  )
}
function Note({ children }: { children: React.ReactNode }) {
  return <div className="card border-accent/40 bg-accent-soft/40 p-3 text-sm leading-relaxed text-ink-2">{children}</div>
}
function Code({ children }: { children: React.ReactNode }) {
  return <code className="mono rounded bg-surface-2 px-1.5 py-0.5 text-[13px]">{children}</code>
}

const DOCS: Doc[] = [
  {
    id: 'intro',
    title: 'What is Perpcast?',
    body: (
      <>
        <P>
          Perpcast is a social network for traders: post casts, reply, like, recast and follow — while trading perpetual futures on live
          Hyperliquid prices in the same tab. It runs on Robinhood Chain for everything on-chain: token launches through Pons, the Perpcast
          Mascots NFT collection and your wallet balances.
        </P>
        <Bullets
          items={[
            <>
              <strong>Cast</strong> — a short post (text, images, $TICKER mentions, channels). Replies, quotes, likes and recasts work like you expect.
            </>,
            <>
              <strong>Trade</strong> — a perp terminal (chart, order book, market/limit orders, leverage, TP/SL, positions) on Hyperliquid data. Trading is a
              paper simulation: no real funds are at risk.
            </>,
            <>
              <strong>Launch</strong> — deploy a meme token on Robinhood Chain via the Pons V2 factory from your own wallet.
            </>,
            <>
              <strong>NFTs</strong> — mint a Perpcast Mascot (pixel-art, {MASCOT_SUPPLY} supply, one per wallet, tradeable on OpenSea).
            </>,
            <>
              <strong>DMs</strong> — private messages, end-to-end encrypted on your device.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'signin',
    title: 'Getting started & sign in',
    body: (
      <>
        <P>Tap the account button in the top-right corner (or the Get started button) and pick one of two ways in:</P>
        <Steps
          items={[
            <>
              <strong>Continue with email</strong> — enter your email, we send a 6-digit code from <Code>login@perpcast.app</Code> (check
              Spam/Promotions the first time). Codes expire after 10 minutes. No password, ever.
            </>,
            <>
              <strong>Connect wallet</strong> — Bitget, MetaMask, Rabby, Phantom, Trust, OKX or WalletConnect. You sign one login message; that
              signature never sends a transaction or costs gas.
            </>,
          ]}
        />
        <P>
          After signing in, choose an @username, avatar and banner in Settings. Your wallet address is never shown publicly. An email account
          can connect a wallet later from the account menu (Get connected → Connect wallet) so you can mint and launch.
        </P>
        <Note>Your account lives on the Perpcast server, so it is the same on your phone, tablet and PC — sign in once per device.</Note>
      </>
    ),
  },
  {
    id: 'casts',
    title: 'Casts, channels & profiles',
    body: (
      <>
        <Bullets
          items={[
            <>
              <strong>Compose</strong> from Home: text up to 320 characters, up to 4 images (upload from device or paste a URL), <Code>$BTC</Code>-style
              tickers become live price chips, <Code>/memes</Code>-style channels group posts.
            </>,
            <>
              <strong>Categories</strong> — the keycap buttons (Memes, Stocks, RWAs, NFTs, Hyperliquid, Macro, Dev, Launch token) filter the feed and the
              Trade markets.
            </>,
            <>
              <strong>Reactions</strong> — like, recast, quote, reply, bookmark. Notifications (Alerts tab) tell you about replies, likes, follows and new
              users joining Perpcast.
            </>,
            <>
              <strong>Share a position</strong> — from Trade, post your open position as a cast with entry, mark and PnL.
            </>,
            <>
              <strong>Search</strong> (Explore) — tabs for People, Casts and Memes (Pons tokens already deployed on Robinhood Chain).
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'dm',
    title: 'Private messages (end-to-end encrypted)',
    body: (
      <>
        <P>
          When you first sign in on a device, the browser generates a key pair. The private key never leaves your device; only the public key is
          published. Every message is encrypted on your device before it is sent, and our database stores ciphertext only — Perpcast cannot read
          your DMs.
        </P>
        <Bullets
          items={[
            'A message sealed on your phone can only be opened on that phone (keys are not synced between devices).',
            'Clearing browser data deletes the key; past messages cannot be recovered by us.',
            'Who you chat with and when is still visible to the server (metadata), the content is not.',
          ]}
        />
        <P>
          Details in the <Link to="/privacy" className="text-accent underline">Privacy Policy</Link>.
        </P>
      </>
    ),
  },
  {
    id: 'trade',
    title: 'Trade perps',
    body: (
      <>
        <P>
          Open <Link to="/trade" className="text-accent underline">Trade</Link>, pick a market (Crypto, Memes, Stocks, RWAs — all streamed from Hyperliquid)
          and use the order form: market or limit, size in USD, leverage slider, optional take-profit / stop-loss. Positions, fills, liquidation
          price and equity are tracked in Portfolio.
        </P>
        <Note>
          The terminal is a paper-trading desk on real prices. Your desk starts at $0 — add paper USDC from Portfolio when you want to practice.
          Real funds in your wallet (Hyperliquid, Robinhood Chain, Arbitrum) are shown separately in the Balance chip and Portfolio → Wallet.
        </Note>
      </>
    ),
  },
  {
    id: 'launch',
    title: 'Launch a token (Pons on Robinhood Chain)',
    body: (
      <>
        <Steps
          items={[
            'Sign in with a wallet (or connect one to your email account) and make sure it holds a little ETH on Robinhood Chain for gas + the launch fee.',
            <>
              Open <Link to="/launch" className="text-accent underline">Launch</Link>: name, ticker, logo (upload from device), description, links, and the pair
              token.
            </>,
            'Review the economics preview and confirm the transaction in your wallet. The app switches your wallet to Robinhood Chain if needed.',
            'Your token gets its own page under Memes with chart, holders and a Cast button; it also shows up in Search → Memes.',
          ]}
        />
        <P>
          Launches go through the Pons V2 factory contracts — Perpcast never holds your tokens or fees. Balances and factory data are read through
          several RPCs with automatic fallback (official RPC → dRPC → <Code>perpcast.app/api/rpc</Code>).
        </P>
      </>
    ),
  },
  {
    id: 'nfts',
    title: 'Perpcast Mascots NFT',
    body: (
      <>
        <P>
          {MASCOT_SUPPLY} hand-cut pixel-art mascots, each with Element / Background / Hat / Item / Aura traits, minted as ERC-721 on Robinhood Chain and
          visible on OpenSea and Blockscout.
        </P>
        <Steps
          items={[
            'Sign in with the wallet you want to receive the NFT (accounts younger than 2 minutes wait briefly — anti-bot).',
            <>
              Open <Link to="/nfts/perpcast" className="text-accent underline">NFTs → Perpcast Mascots</Link> and tap <strong>Mint free</strong>. The server issues a
              signed voucher for your wallet, you confirm one transaction (gas only).
            </>,
            'A reveal shows which mascot you got; it appears under the Mine tab and on OpenSea after indexing.',
          ]}
        />
        <Bullets
          items={[
            <>
              Current collection (v2, voucher-gated, 1 per wallet): <Code>{MASCOTS_CONTRACT}</Code>
            </>,
            <>
              Genesis collection (v1, sold out, kept for history): <Code>{MASCOTS_V1_CONTRACT}</Code>
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'wallet',
    title: 'Wallet, balances & network',
    body: (
      <>
        <Bullets
          items={[
            <>
              <strong>Robinhood Chain</strong> — chain id {ROBINHOOD_CHAIN.id}, RPC <Code>{String(ROBINHOOD_CHAIN.rpc)}</Code>, explorer{' '}
              <a href={ROBINHOOD_CHAIN.explorer} target="_blank" rel="noreferrer" className="text-accent underline">
                Blockscout
              </a>
              . The app adds/switches the network in your wallet automatically.
            </>,
            <>
              <strong>Balance chip</strong> (top bar) — live total of Hyperliquid account value + spot USDC, Robinhood Chain ETH/USDG and Arbitrum USDC. Tap
              it to open Portfolio → Wallet with deposit links.
            </>,
            <>
              <strong>Non-custodial</strong> — Perpcast never sees private keys or seed phrases and cannot move your funds. Every transaction is confirmed
              in your own wallet.
            </>,
          ]}
        />
      </>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ',
    body: (
      <>
        <div className="space-y-3">
          {[
            ['The page shows an old version / a button is missing.', 'Close the tab and open perpcast.app again; the app also reloads itself when a new build is live.'],
            ['"Failed to fetch" on Launch or NFTs.', 'One RPC was unreachable from your network. Perpcast retries other RPCs automatically — try again in a few seconds.'],
            ['Mint says "Minted ✓" but I want another.', 'The contract allows one mascot per wallet. Sign in with another wallet to mint again.'],
            ['I cannot read my DMs on another device.', 'Keys are device-local by design. Read the conversation on the device where it was sent, or ask your friend to resend.'],
            ['Is trading real money?', 'No — the perp desk is a simulation on live prices. Token launches and NFT mints you sign in your wallet are real.'],
            ['I did not receive the email code.', 'Check Spam/Promotions for login@perpcast.app, wait a minute, then request a new code.'],
          ].map(([q, a]) => (
            <div key={q}>
              <div className="font-semibold">{q}</div>
              <div className="text-[15px] leading-relaxed text-ink-2">{a}</div>
            </div>
          ))}
        </div>
        <P>
          Legal: <Link to="/privacy" className="text-accent underline">Privacy</Link> · <Link to="/terms" className="text-accent underline">Terms</Link> · Contact{' '}
          <Code>login@perpcast.app</Code>
        </P>
      </>
    ),
  },
]

export default function Docs() {
  const [active, setActive] = useState(DOCS[0].id)
  useEffect(() => {
    const els = DOCS.map((d) => document.getElementById(d.id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (top) setActive(top.target.id)
      },
      { rootMargin: '-20% 0px -70% 0px' },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Docs</span>} />
      <div className="hidden md:block">
        <PageHeader title="Perpcast Docs" sub={`Everything you need to cast, chat, trade, launch and mint · Updated ${UPDATED}`} />
      </div>
      <div className="flex gap-6 px-4 pb-16 pt-4 md:px-6">
        <aside className="hidden w-48 shrink-0 lg:block">
          <nav className="sticky top-20 space-y-0.5 text-sm">
            {DOCS.map((d) => (
              <a key={d.id} href={`#${d.id}`} className={cx('block rounded-lg px-2.5 py-1.5 hover:bg-surface-2', active === d.id ? 'bg-accent-soft font-semibold text-accent' : 'text-ink-2')}>
                {d.title}
              </a>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="mb-5 flex flex-wrap gap-1.5 lg:hidden">
            {DOCS.map((d) => (
              <a key={d.id} href={`#${d.id}`} className="chip">
                {d.title}
              </a>
            ))}
          </div>
          {DOCS.map((d) => (
            <section key={d.id} id={d.id} className="mb-9 scroll-mt-20">
              <h2 className="mb-2.5 font-display text-xl font-extrabold">{d.title}</h2>
              <div className="space-y-3">{d.body}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
