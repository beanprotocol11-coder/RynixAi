import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMarket, change24h } from '../store/market'
import { mascotImage } from '../lib/mascots'
import { CoinLogo } from '../components/CoinLogo'
import { cx, px, pct } from '../lib/format'
import { PAIR_CANDIDATES } from '../lib/pons'
import { fetchPonsTokens, type PonsToken } from '../lib/robinhood'

const PAIR_LOGO = Object.fromEntries(PAIR_CANDIDATES.map((p) => [p.symbol, p.logo ?? '']))
const LAUNCH_ORBIT = ['ETH', 'USDG', 'TSLA', 'NVDA', 'AAPL', 'GLD', 'SPY', 'MSTR']

const NAMES = ['nova', 'kenji', 'aria', 'degen.eth', 'maya', 'zed', 'luna', 'satoshi_jr', 'pixel', 'rio', 'hana', 'orbit']
const COINS = ['BTC', 'ETH', 'SOL', 'HYPE', 'DOGE', 'PEPE']

type Act =
  | { k: 'long' | 'short'; coin: string; lev: number; pnl: number }
  | { k: 'launch'; ticker: string; pair: string }
  | { k: 'mint'; id: number }
  | { k: 'cast'; text: string }
  | { k: 'reply' | 'like' | 'recast'; to: string }

const ACTS: Act[] = [
  { k: 'long', coin: 'BTC', lev: 10, pnl: 4.2 },
  { k: 'cast', text: 'gm perps fam — who is trading the CPI print?' },
  { k: 'mint', id: 7 },
  { k: 'launch', ticker: 'MOON', pair: 'ETH' },
  { k: 'reply', to: 'nova' },
  { k: 'short', coin: 'ETH', lev: 5, pnl: -1.1 },
  { k: 'like', to: 'kenji' },
  { k: 'long', coin: 'HYPE', lev: 20, pnl: 12.8 },
  { k: 'launch', ticker: 'TSLAX', pair: 'TSLA' },
  { k: 'mint', id: 42 },
  { k: 'recast', to: 'maya' },
  { k: 'cast', text: 'just shared my SOL long to the feed, roast me' },
  { k: 'short', coin: 'DOGE', lev: 3, pnl: 2.4 },
  { k: 'launch', ticker: 'GOLDY', pair: 'GLD' },
  { k: 'reply', to: 'degen.eth' },
  { k: 'mint', id: 88 },
]

function ActRow({ a, i }: { a: Act; i: number }) {
  const name = NAMES[i % NAMES.length]
  const body = (() => {
    switch (a.k) {
      case 'long':
      case 'short':
        return (
          <>
            opened <b className={a.k === 'long' ? 'text-long' : 'text-short'}>{a.k.toUpperCase()} {a.coin} {a.lev}x</b>
            <span className={cx('ml-1 font-mono text-[11px]', a.pnl >= 0 ? 'text-long' : 'text-short')}>{pct(a.pnl)}</span>
          </>
        )
      case 'launch':
        return (
          <>
            launched <b>${a.ticker}</b> on Pons <span className="text-ink-3">· paired {a.pair}</span>
          </>
        )
      case 'mint':
        return (
          <>
            minted <b>Perpcast Mascot #{a.id}</b>
          </>
        )
      case 'cast':
        return <span className="italic">“{a.text}”</span>
      case 'reply':
        return (
          <>
            replied to <b>@{a.to}</b>
          </>
        )
      case 'like':
        return (
          <>
            liked <b>@{a.to}</b>'s cast
          </>
        )
      case 'recast':
        return (
          <>
            recasted <b>@{a.to}</b>
          </>
        )
    }
  })()
  return (
    <div className="showcase-act">
      <img src={mascotImage((i % 100) + 1)} alt="" width={26} height={26} className="rounded-lg" />
      <span className="font-semibold">@{name}</span>
      <span className="text-ink-2">{body}</span>
    </div>
  )
}

const SLIDES = [
  { to: '/trade', tag: 'Perps', title: 'Trade perps while you cast', sub: 'Live Hyperliquid prices · share positions to the feed', cls: 'from-accent to-accent-2' },
  { to: '/launch', tag: 'Pons Launchpad', title: 'Launch on Pons', sub: 'Memes · Stocks · RWAs — paired with real Robinhood tokens', cls: 'from-[#0f0c29] via-[#302b63] to-[#24243e]' },
  { to: '/nfts/perpcast', tag: 'NFTs', title: 'Perpcast NFTs Collection', sub: '100 generative pieces · minting soon on Robinhood Chain', cls: 'from-fuchsia-500 to-orange-400' },
] as const

export function HomeShowcase() {
  const start = useMarket((s) => s.start)
  const byCoin = useMarket((s) => s.byCoin)
  const mids = useMarket((s) => s.mids)
  useEffect(() => start(), [start])
  const [slide, setSlide] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 4500)
    return () => clearInterval(t)
  }, [])
  const ticker = useMemo(() => COINS.filter((c) => byCoin[c]).map((c) => ({ c, px: mids[c] ?? byCoin[c].midPx, ch: change24h(byCoin[c], mids[c]) })), [byCoin, mids])
  const acts = [...ACTS, ...ACTS]
  const [memes, setMemes] = useState<PonsToken[]>([])
  useEffect(() => {
    fetchPonsTokens()
      .then((s) => setMemes(s.tokens.filter((t) => t.image).slice(0, 6)))
      .catch(() => {})
  }, [])

  return (
    <section className="showcase mx-3 mt-3 space-y-2 md:mx-4">
      <div className="relative h-[124px] overflow-hidden rounded-3xl">
        {SLIDES.map((s, i) => (
          <Link
            key={s.to}
            to={s.to}
            aria-hidden={i !== slide}
            tabIndex={i === slide ? 0 : -1}
            className={cx('showcase-slide absolute inset-0 flex items-center gap-4 bg-gradient-to-br p-4 text-white', s.cls, i === slide ? 'showcase-slide-on' : '')}
          >
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-widest opacity-80">{s.tag}</div>
              <div className="font-display text-xl font-extrabold leading-tight">{s.title}</div>
              <div className="mt-1 text-xs opacity-90">{s.sub}</div>
            </div>
            {s.to === '/trade' ? (
              <div className="hidden flex-col gap-1 sm:flex">
                {ticker.slice(0, 3).map((t) => (
                  <div key={t.c} className="flex items-center gap-2 rounded-xl bg-white/15 px-2 py-1 text-xs backdrop-blur">
                    <CoinLogo coin={t.c} size={16} />
                    <b>{t.c}</b>
                    <span className="font-mono">{px(t.px)}</span>
                    <span className={cx('font-mono', t.ch >= 0 ? 'text-emerald-200' : 'text-rose-200')}>{pct(t.ch)}</span>
                  </div>
                ))}
              </div>
            ) : s.to === '/nfts/perpcast' ? (
              <div className="flex -space-x-3">
                {[3, 11, 27, 64].map((n) => (
                  <img key={n} src={mascotImage(n)} alt="" width={56} height={56} className="rounded-2xl ring-2 ring-white/70 showcase-float" style={{ animationDelay: `${n % 4}00ms` }} />
                ))}
              </div>
            ) : (
              <div className="launch-orbit" aria-hidden>
                <img src="/robinhood-chain.png" alt="" width={40} height={40} className="launch-core" />
                {[...memes.map((m) => m.image as string), ...LAUNCH_ORBIT.map((c) => PAIR_LOGO[c])].slice(0, 10).map((src, i, arr) => (
                  <img key={i} src={src} alt="" width={26} height={26} loading="lazy" className="launch-sat" style={{ ['--i' as string]: i, ['--n' as string]: arr.length }} />
                ))}
              </div>
            )}
          </Link>
        ))}
        <div className="absolute bottom-2 left-4 flex gap-1">
          {SLIDES.map((s, i) => (
            <button key={s.to} aria-label={s.tag} onClick={() => setSlide(i)} className={cx('h-1.5 rounded-full bg-white transition-all', i === slide ? 'w-5' : 'w-1.5 opacity-50')} />
          ))}
        </div>
      </div>

      {ticker.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="tape flex items-center gap-2 py-1.5">
            {[...ticker, ...ticker, ...ticker].map((t, i) => (
              <Link key={i} to={`/trade/${t.c}`} className="flex shrink-0 items-center gap-1.5 px-3 text-xs">
                <CoinLogo coin={t.c} size={16} />
                <b>{t.c}</b>
                <span className="font-mono text-ink-2">{px(t.px)}</span>
                <span className={cx('font-mono', t.ch >= 0 ? 'text-long' : 'text-short')}>{pct(t.ch)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-line bg-surface py-1.5">
        <span className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-md bg-surface px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-3 ring-1 ring-line">Demo</span>
        <div className="showcase-tape flex items-center gap-2 pl-14">
          {acts.map((a, i) => (
            <ActRow key={i} a={a} i={i} />
          ))}
        </div>
      </div>
    </section>
  )
}
