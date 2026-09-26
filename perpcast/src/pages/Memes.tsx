import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { createChart, CandlestickSeries, HistogramSeries, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import { PageHeader, Spinner, Empty, LiveNumber } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { CategoryBar } from '../components/CategoryBar'
import { ArrowLeftIcon, ExternalIcon, RefreshIcon, RocketIcon, SearchIcon, TrendDownIcon, TrendUpIcon, MessageIcon, HashIcon } from '../components/Icons'
import { fetchPonsTokens, fetchPoolOhlc, findPonsToken, geckoPoolUrl, valuation, VENUE_LABEL, type PonsSnapshot, type PonsTimeframe, type PonsToken, type PonsVenue } from '../lib/robinhood'
import { explorerAddress, PONS_APP, readTokenLogo } from '../lib/pons'
import type { Address } from 'viem'
import { CHART_PALETTE, CHART_LONG, CHART_SHORT, CHART_LONG_VOL, CHART_SHORT_VOL, chartOptions } from '../lib/chartTheme'
import { useUI } from '../store/ui'
import { useAuth } from '../store/auth'
import { cx, pct, usd, shortAddr, timeAgo } from '../lib/format'

type VenueFilter = 'all' | PonsVenue
const VENUES: Array<{ id: VenueFilter; label: string }> = [
  { id: 'all', label: 'All Pons' },
  { id: 'pons-v2-dex', label: 'Graduated' },
  { id: 'pons-v2', label: 'On curve' },
  { id: 'pons-v1', label: 'V1' },
]

function usePons() {
  const [snap, setSnap] = useState<PonsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const load = (force = false) => {
    setLoading(true)
    fetchPonsTokens({ force })
      .then((s) => {
        setSnap(s)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    load()
    const t = setInterval(() => load(), 120_000)
    return () => clearInterval(t)
  }, [])
  return { snap, loading, error, reload: () => load(true) }
}

export default function Memes() {
  const { address } = useParams()
  const pons = usePons()
  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Robinhood Memes</span>} />
      {address ? <TokenDetail address={address} {...pons} /> : <TokenList {...pons} />}
    </div>
  )
}

function SourceNote({ snap }: { snap: PonsSnapshot | null }) {
  return (
    <p className="px-4 pb-2 text-[11px] text-ink-3">
      Live onchain data from{' '}
      <a href="https://www.geckoterminal.com/robinhood/pools" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink">
        GeckoTerminal
      </a>{' '}
      · Robinhood Chain · Pons launchpad. Ranked by market cap (FDV when mcap is unavailable).
      {snap && (
        <>
          {' '}
          Updated {timeAgo(snap.fetchedAt)}
          {snap.stale && <span className="text-accent-3"> · rate-limited, showing last snapshot</span>}
          {snap.partial && !snap.stale && <span className="text-accent-3"> · one venue didn’t respond</span>}
        </>
      )}
    </p>
  )
}

function TokenList({ snap, loading, error, reload }: ReturnType<typeof usePons>) {
  const [venue, setVenue] = useState<VenueFilter>('all')
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (snap?.tokens ?? []).filter((t) => (venue === 'all' || t.venue === venue) && (!k || t.symbol.toLowerCase().includes(k) || t.name.toLowerCase().includes(k) || t.address.includes(k)))
  }, [snap, venue, q])

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          title="Robinhood Chain Memes"
          sub="Top Pons launchpad tokens by market cap"
          right={
            <button className="icon-btn" title="Refresh" onClick={reload} disabled={loading}>
              {loading ? <Spinner size={16} /> : <RefreshIcon size={18} />}
            </button>
          }
        />
      </div>
      <CategoryBar />
      <div className="dreamy-card mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <img src="/robinhood-chain.png" alt="" width={40} height={40} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-extrabold">Memecoins born on Robinhood Chain</div>
          <div className="text-xs text-ink-3">Every token launched through Pons — bonding curve to graduated Uniswap V4 pool. Tap one for the chart, or launch your own.</div>
        </div>
        <Link to="/launch" className="btn btn-primary !py-2 text-sm">
          <RocketIcon size={16} /> Launch token
        </Link>
      </div>
      <SourceNote snap={snap} />
      <div className="flex items-center gap-2 px-4 pb-3">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {VENUES.map((v) => (
            <button key={v.id} className={cx('chip whitespace-nowrap', venue === v.id && 'chip-active')} onClick={() => setVenue(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto hidden sm:block">
          <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input !h-8 !rounded-full !pl-8 !text-xs w-40" placeholder="Search token" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {error && !snap && (
        <Empty
          title="Couldn’t load Robinhood Chain markets"
          body={error}
          action={
            <button className="btn btn-outline" onClick={reload}>
              <RefreshIcon size={16} /> Retry
            </button>
          }
        />
      )}
      {!snap && !error && (
        <div className="space-y-2 px-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="skeleton h-14" />
          ))}
        </div>
      )}
      {snap && list.length === 0 && <Empty title="No tokens match" body="Try another venue or clear the search." />}
      {list.length > 0 && (
        <div className="hidden grid-cols-[2rem_1fr_7rem_6rem_6rem_6rem] gap-3 px-4 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3 sm:grid">
          <span>#</span>
          <span>Token</span>
          <span className="text-right">Price</span>
          <span className="text-right">24h</span>
          <span className="text-right">Mcap</span>
          <span className="text-right">Liquidity</span>
        </div>
      )}
      <ol>
        {list.map((t, i) => (
          <li key={t.address}>
            <TokenRow t={t} rank={i + 1} />
          </li>
        ))}
      </ol>
    </div>
  )
}

function TokenLogo({ t, size = 40 }: { t: PonsToken; size?: number }) {
  const [broken, setBroken] = useState(false)
  const [onchain, setOnchain] = useState<string | null>(null)
  const needsOnchain = !t.image || broken
  useEffect(() => {
    if (!needsOnchain) return
    let alive = true
    readTokenLogo(t.address as Address).then((u) => alive && setOnchain(u))
    return () => {
      alive = false
    }
  }, [needsOnchain, t.address])
  const src = !broken && t.image ? t.image : onchain
  if (src) return <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} loading="lazy" onError={() => (src === t.image ? setBroken(true) : setOnchain(null))} />
  const hue = Array.from(t.address).reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
  return (
    <span className="grid shrink-0 place-items-center rounded-full font-display font-extrabold text-white" style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 70% 55%), hsl(${(hue + 50) % 360} 70% 45%))` }}>
      {t.symbol.slice(0, 2).toUpperCase()}
    </span>
  )
}

function TokenRow({ t, rank }: { t: PonsToken; rank: number }) {
  const v = valuation(t)
  return (
    <Link to={`/memes/${t.address}`} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover sm:grid-cols-[2rem_1fr_7rem_6rem_6rem_6rem]">
      <span className="mono text-xs text-ink-3">{rank}</span>
      <span className="flex min-w-0 items-center gap-3">
        <TokenLogo t={t} />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-bold">{t.symbol}</span>
            <span className="badge hidden text-[10px] sm:inline-flex">{VENUE_LABEL[t.venue]}</span>
          </span>
          <span className="block truncate text-[11px] text-ink-3">
            {t.name} · /{t.quoteSymbol}
          </span>
        </span>
      </span>
      <span className="text-right sm:hidden">
        <span className="mono block text-sm font-semibold">{usd(t.priceUsd)}</span>
        <span className={cx('mono text-[11px]', t.change24h >= 0 ? 'text-long' : 'text-short')}>{pct(t.change24h)}</span>
      </span>
      <span className="mono hidden text-right text-sm font-semibold sm:block">{usd(t.priceUsd)}</span>
      <span className={cx('mono hidden items-center justify-end gap-0.5 text-right text-xs sm:flex', t.change24h >= 0 ? 'text-long' : 'text-short')}>
        {t.change24h >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
        {pct(t.change24h)}
      </span>
      <span className="mono hidden text-right text-xs sm:block" title={t.marketCap == null ? 'Market cap unavailable — showing FDV' : 'Market cap'}>
        {v ? usd(v, { compact: true }) : '—'}
        {t.marketCap == null && v ? <span className="text-ink-3"> fdv</span> : null}
      </span>
      <span className="mono hidden text-right text-xs text-ink-2 sm:block">{usd(t.liquidity, { compact: true })}</span>
    </Link>
  )
}

const TFS: PonsTimeframe[] = ['5m', '15m', '1h', '4h', '1d']

function TokenDetail({ address, snap, loading, error, reload }: { address: string } & ReturnType<typeof usePons>) {
  const nav = useNavigate()
  const t = snap ? findPonsToken(snap.tokens, address) : undefined
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const openComposer = useUI((s) => s.openComposer)

  if (!snap && loading) {
    return (
      <div className="flex h-[40dvh] items-center justify-center">
        <Spinner size={22} />
      </div>
    )
  }
  if (!t) {
    return (
      <Empty
        title="Token not found"
        body={error ?? 'This token isn’t in the current Pons snapshot.'}
        action={
          <div className="flex gap-2">
            <Link to="/memes" className="btn btn-outline">
              Back to list
            </Link>
            <button className="btn btn-ghost" onClick={reload}>
              <RefreshIcon size={16} /> Refresh
            </button>
          </div>
        }
      />
    )
  }

  const cast = () => {
    if (!me) return openSignIn('Sign in to cast.')
    openComposer({ channel: 'memes', text: `$${t.symbol} on Robinhood Chain — ${usd(t.priceUsd)} (${pct(t.change24h)} 24h), mcap ${usd(valuation(t), { compact: true })}\n${location.origin}/memes/${t.address}\n` })
  }

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          back={
            <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back">
              <ArrowLeftIcon size={18} />
            </button>
          }
          title={
            <span className="flex items-center gap-2">
              <TokenLogo t={t} size={28} /> {t.symbol}
              <span className="badge text-[10px]">{VENUE_LABEL[t.venue]}</span>
            </span>
          }
          sub={`${t.name} · ${t.poolName}`}
        />
      </div>
      <CategoryBar />
      <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-3">
        <div>
          <div className="flex items-center gap-3 md:hidden">
            <TokenLogo t={t} size={36} />
            <div>
              <div className="font-display text-lg font-extrabold">{t.symbol}</div>
              <div className="text-xs text-ink-3">{t.name}</div>
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <LiveNumber value={t.priceUsd} format={(n) => usd(n)} className="font-display text-3xl font-extrabold tracking-tight" />
            <span className={cx('mono text-sm font-semibold', t.change24h >= 0 ? 'text-long' : 'text-short')}>{pct(t.change24h)} 24h</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary !py-2 text-sm" onClick={cast}>
            <MessageIcon size={16} /> Cast about it
          </button>
          <Link to="/channel/memes" className="btn btn-outline !py-2 text-sm">
            <HashIcon size={16} /> /memes
          </Link>
        </div>
      </div>
      <PonsChart pool={t.poolAddress} symbol={t.symbol} />
      <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4">
        <Stat label={t.marketCap == null ? 'FDV' : 'Market cap'} value={valuation(t) ? usd(valuation(t), { compact: true }) : '—'} />
        <Stat label="Liquidity" value={usd(t.liquidity, { compact: true })} />
        <Stat label="Volume 24h" value={usd(t.volume24h, { compact: true })} />
        <Stat label="Trades 24h" value={t.txns24h.toLocaleString()} />
        <Stat label="1h" value={pct(t.change1h)} tone={t.change1h >= 0 ? 'long' : 'short'} />
        <Stat label="Pair" value={t.quoteSymbol} />
        <Stat label="Venue" value={VENUE_LABEL[t.venue]} />
        <Stat label="Created" value={t.createdAt ? timeAgo(t.createdAt) + ' ago' : '—'} />
      </div>
      <div className="flex flex-wrap gap-2 px-4 pb-4">
        <a className="btn btn-outline !py-1.5 text-xs" href={explorerAddress(t.address)} target="_blank" rel="noreferrer">
          {shortAddr(t.address)} on Blockscout <ExternalIcon size={12} />
        </a>
        <a className="btn btn-outline !py-1.5 text-xs" href={geckoPoolUrl(t.poolAddress)} target="_blank" rel="noreferrer">
          GeckoTerminal <ExternalIcon size={12} />
        </a>
        <a className="btn btn-outline !py-1.5 text-xs" href={PONS_APP} target="_blank" rel="noreferrer">
          Trade on Pons <ExternalIcon size={12} />
        </a>
      </div>
      <SourceNote snap={snap} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'long' | 'short' }) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
      <div className={cx('mono mt-0.5 text-sm font-semibold', tone === 'long' && 'text-long', tone === 'short' && 'text-short')}>{value}</div>
    </div>
  )
}

function PonsChart({ pool, symbol }: { pool: string; symbol: string }) {
  const theme = useUI((s) => s.theme)
  const [tf, setTf] = useState<PonsTimeframe>('1h')
  const box = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading')

  useEffect(() => {
    const el = box.current
    if (!el) return
    const base = chartOptions(theme)
    const c = createChart(el, {
      autoSize: true,
      ...base,
      rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.08, bottom: 0.22 } },
      timeScale: { ...base.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 3 },
      localization: { priceFormatter: (p: number) => usd(p) },
    })
    const cs = c.addSeries(CandlestickSeries, { upColor: CHART_LONG, downColor: CHART_SHORT, wickUpColor: CHART_LONG, wickDownColor: CHART_SHORT, borderVisible: false, priceFormat: { type: 'price', precision: 8, minMove: 1e-8 } })
    const vs = c.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false })
    c.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } })
    chart.current = c
    let alive = true
    setState('loading')
    fetchPoolOhlc(pool, tf)
      .then((rows) => {
        if (!alive) return
        if (!rows.length) return setState('empty')
        cs.setData(rows.map((r) => ({ time: r.time as UTCTimestamp, open: r.open, high: r.high, low: r.low, close: r.close })))
        vs.setData(rows.map((r) => ({ time: r.time as UTCTimestamp, value: r.volume, color: r.close >= r.open ? CHART_LONG_VOL : CHART_SHORT_VOL })))
        c.timeScale().fitContent()
        setState('ok')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
      c.remove()
      chart.current = null
    }
  }, [pool, tf, theme])

  return (
    <div className="mx-4 overflow-hidden rounded-2xl border border-line">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1.5" style={{ background: CHART_PALETTE[theme].bg }}>
        {TFS.map((x) => (
          <button key={x} className={cx('rounded-lg px-2 py-1 text-xs font-semibold', tf === x ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink')} onClick={() => setTf(x)}>
            {x}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-ink-3">OHLC · GeckoTerminal</span>
      </div>
      <div className="relative h-[300px]" style={{ background: CHART_PALETTE[theme].bg }}>
        <div ref={box} className="absolute inset-0" />
        <div className="pointer-events-none absolute left-3 top-2 z-10 select-none font-display text-2xl font-extrabold tracking-tight" style={{ color: CHART_PALETTE[theme].watermark }}>
          {symbol} · Perpcast
        </div>
        {state === 'loading' && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner size={20} />
          </div>
        )}
        {state === 'empty' && <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">No candles yet for this timeframe.</div>}
        {state === 'error' && <div className="absolute inset-0 grid place-items-center text-sm text-ink-3">Chart unavailable right now (rate-limited). Try again in a minute.</div>}
      </div>
    </div>
  )
}
