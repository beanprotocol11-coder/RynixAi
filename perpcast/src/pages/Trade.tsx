import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMarket, change24h } from '../store/market'
import { useTrading, unrealized } from '../store/trading'
import { useAuth } from '../store/auth'
import { TradingChart } from '../components/TradingChart'
import { OrderForm, OrderBook, RecentTrades, Desk, MarketSelector, type SelectorCat } from '../components/TradePanels'
import { CoinLogo } from '../components/CoinLogo'
import { Feed, feedLoader } from '../components/Feed'
import { ComposerBody } from '../components/Composer'
import { LiveNumber, Skeleton, Tabs } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { ChevronDownIcon, ExternalIcon, MessageIcon } from '../components/Icons'
import { MARKET_CHANNEL_PREFIX } from '../lib/social'
import { CATEGORIES, coinName, displaySymbol, dexOf } from '../lib/hyperliquid'
import { cx, usd, px, pct, compact } from '../lib/format'

const CATEGORY_CHANNEL: Record<string, string> = { crypto: 'crypto', memes: 'memes', stocks: 'stocks', rwa: 'rwa' }

function isSelectorCat(v: string | null): v is SelectorCat {
  return !!v && CATEGORIES.some((c) => c.id === v)
}

type SidePanel = 'book' | 'trades' | 'chat'
type MobilePanel = 'chart' | 'trade' | 'book' | 'chat'

export default function Trade() {
  const { coin: rawParam } = useParams()
  const [search, setSearch] = useSearchParams()
  const catParam = search.get('cat')
  const nav = useNavigate()
  const me = useAuth((s) => s.user)
  const markets = useMarket((s) => s.markets)
  const byCoin = useMarket((s) => s.byCoin)
  const loaded = useMarket((s) => s.loaded)
  const error = useMarket((s) => s.error)
  const wsStatus = useMarket((s) => s.wsStatus)
  const param = rawParam ? decodeURIComponent(rawParam) : undefined
  const requested = param ?? localStorage.getItem('perpcast:lastCoin') ?? 'BTC'
  const coin = useMemo(() => {
    if (byCoin[requested]) return requested
    const lower = requested.toLowerCase()
    return markets.find((m) => m.coin.toLowerCase() === lower)?.coin ?? markets.find((m) => m.symbol.toLowerCase() === lower)?.coin ?? requested.toUpperCase()
  }, [requested, byCoin, markets])
  const market = byCoin[coin]
  const mid = useMarket((s) => s.mids[coin])
  const positions = useTrading((s) => s.positions)
  const [selector, setSelector] = useState(() => isSelectorCat(catParam))
  const [selectorCat, setSelectorCat] = useState<SelectorCat>(() => (isSelectorCat(catParam) ? catParam : 'all'))
  const [side, setSide] = useState<SidePanel>('book')
  const [mobile, setMobile] = useState<MobilePanel>('chart')
  const symbol = displaySymbol(coin)
  const category = market ? CATEGORIES.find((c) => c.id === market.category) : undefined

  useEffect(() => {
    if (isSelectorCat(catParam)) {
      setSelectorCat(catParam)
      setSelector(true)
    }
  }, [catParam])
  useEffect(() => {
    if (!param || (market && param !== coin)) nav({ pathname: `/trade/${encodeURIComponent(coin)}`, search: search.toString() ? `?${search}` : '' }, { replace: true })
  }, [param, coin, market, nav, search])
  useEffect(() => {
    if (market) localStorage.setItem('perpcast:lastCoin', coin)
  }, [coin, market])
  useEffect(() => {
    if (loaded && markets.length && !market) nav('/trade/BTC', { replace: true })
  }, [loaded, markets.length, market, nav])
  useEffect(() => {
    if (!mid) return
    document.title = `${px(mid, market?.szDecimals)} ${symbol} · Perpcast`
    return () => {
      document.title = 'Perpcast'
    }
  }, [mid, symbol, market?.szDecimals])

  const mark = mid ?? market?.markPx ?? 0
  const ch = market ? change24h(market, mid) : 0
  const coinPositions = useMemo(() => positions.filter((p) => p.coin === coin), [positions, coin])
  const coinPnl = coinPositions.reduce((a, p) => a + unrealized(p, mark || p.entry), 0)
  const channelId = `${MARKET_CHANNEL_PREFIX}${coin}`
  const categoryChannel = market ? CATEGORY_CHANNEL[market.category] : undefined
  const chatLoader = useMemo(() => feedLoader({ kind: 'market', key: coin }), [coin])
  const pick = useCallback((c: string) => nav(`/trade/${encodeURIComponent(c)}`), [nav])
  const closeSelector = useCallback(() => {
    setSelector(false)
    if (search.has('cat')) {
      const next = new URLSearchParams(search)
      next.delete('cat')
      setSearch(next, { replace: true })
    }
  }, [search, setSearch])
  const hlUrl = dexOf(coin) ? `https://app.hyperliquid.xyz/trade/${encodeURIComponent(coin)}` : `https://app.hyperliquid.xyz/trade/${coin}`

  if (loaded && error && !market) {
    return (
      <div className="p-10 text-center text-sm text-ink-3">
        Could not load markets from Hyperliquid: {error}
        <div className="mt-3">
          <button className="btn btn-primary" onClick={() => location.reload()}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  const header = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line px-3 py-2">
      <button className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-surface-hover" onClick={() => setSelector(true)}>
        <CoinLogo coin={coin} size={30} />
        <span className="text-left leading-tight">
          <span className="flex items-center gap-1 font-display text-lg font-extrabold">
            {symbol}-USD <ChevronDownIcon size={16} className="text-ink-3" />
          </span>
          <span className="block text-[11px] text-ink-3">
            {coinName(coin)} · {category?.label ?? 'Perp'} · {market?.maxLeverage ?? '—'}x
          </span>
        </span>
      </button>
      <div className="flex items-baseline gap-2">
        {mark ? <LiveNumber value={mark} format={(n) => px(n, market?.szDecimals)} className="mono text-2xl font-bold tabular-nums" /> : <Skeleton className="h-7 w-28" />}
        <span className={cx('mono text-sm font-semibold', ch >= 0 ? 'text-long' : 'text-short')}>{pct(ch)}</span>
      </div>
      <Stat label="Mark" value={market ? px(market.markPx, market.szDecimals) : '—'} />
      <Stat label="Oracle" value={market ? px(market.oraclePx, market.szDecimals) : '—'} />
      <Stat label="24h volume" value={market ? usd(market.dayNtlVlm, { compact: true }) : '—'} />
      <Stat label="Open interest" value={market ? `${compact(market.openInterest)} ${symbol}` : '—'} />
      <Stat label="Funding / 1h" value={market ? `${(market.funding * 100).toFixed(4)}%` : '—'} tone={market ? (market.funding >= 0 ? 'long' : 'short') : undefined} />
      {coinPositions.length > 0 && <Stat label={`Your PnL (${coinPositions.length})`} value={usd(coinPnl, { sign: true })} tone={coinPnl >= 0 ? 'long' : 'short'} />}
      <span className="ml-auto flex items-center gap-1.5 text-[11px] text-ink-3">
        <span className={cx('h-1.5 w-1.5 rounded-full', wsStatus === 'open' ? 'bg-long animate-pulse' : wsStatus === 'connecting' ? 'bg-amber-400' : 'bg-short')} />
        {wsStatus === 'open' ? 'Live' : wsStatus === 'connecting' ? 'Connecting' : 'Reconnecting'}
        <a href={hlUrl} target="_blank" rel="noreferrer" className="ml-2 hidden items-center gap-1 hover:text-ink lg:flex">
          Hyperliquid <ExternalIcon size={11} />
        </a>
      </span>
    </div>
  )

  const chat = (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="border-b border-line px-3 py-2">
        <ComposerBody opts={{ channel: channelId }} autoFocus={false} />
      </div>
      <Feed load={chatLoader} refreshKey={`${coin}:${me?.id ?? ''}`} freshFilter={(c) => !c.parentId && (c.channel === channelId || c.position?.coin === coin)} emptyTitle={`No ${symbol} chatter yet`} emptyBody="Be the first to post in this market room." showParentContext={false} />
    </div>
  )

  return (
    <div className="flex flex-col md:min-h-[calc(100dvh-2rem)]">
      <MobileTopBar title={<span className="font-display font-extrabold">Trade</span>} />
      {header}

      {/* Desktop */}
      <div className="hidden flex-1 min-h-0 md:grid md:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_280px_320px]">
        <div className="flex min-h-0 flex-col border-r border-line">
          {market ? <TradingChart coin={coin} szDecimals={market.szDecimals} positions={positions} className="h-[440px] shrink-0 border-b border-line" /> : <Skeleton className="m-3 h-[440px]" />}
          <Desk coinFilter={coin} className="min-h-[260px] flex-1" />
        </div>
        <div className="flex min-h-0 flex-col border-r border-line xl:order-none">
          <Tabs
            value={side}
            onChange={setSide}
            tabs={[
              { id: 'book', label: 'Book' },
              { id: 'trades', label: 'Trades' },
              { id: 'chat', label: <span className="flex items-center gap-1"><MessageIcon size={13} /> Room</span> },
            ]}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {market && side === 'book' && <OrderBook coin={coin} szDecimals={market.szDecimals} mark={mark} rows={14} />}
            {market && side === 'trades' && <RecentTrades coin={coin} szDecimals={market.szDecimals} />}
            {side === 'chat' && <div className="xl:hidden">{chat}</div>}
            {side === 'chat' && (
              <div className="hidden p-4 text-sm text-ink-3 xl:block">
                The {symbol} room is open on the right.{' '}
                {categoryChannel && (
                  <Link to={`/channel/${categoryChannel}`} className="text-accent">
                    Open /{categoryChannel} →
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="hidden min-h-0 flex-col xl:flex">
          {market ? <OrderForm market={market} mark={mark} className="border-b border-line" /> : <Skeleton className="m-3 h-96" />}
          <div className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-ink-3">
            <MessageIcon size={13} /> {symbol} room
          </div>
          {chat}
        </div>
      </div>
      {/* md-only order form (2-col layout puts the form under the book) */}
      <div className="hidden border-t border-line md:block xl:hidden">{market && <OrderForm market={market} mark={mark} className="mx-auto max-w-lg" />}</div>

      {/* Mobile */}
      <div className="md:hidden">
        <div className="sticky top-14 z-20 glass border-b border-line">
          <div className="segment m-2">
            {(['chart', 'trade', 'book', 'chat'] as MobilePanel[]).map((m) => (
              <button key={m} data-active={mobile === m} onClick={() => setMobile(m)} className="capitalize">
                {m === 'chat' ? 'Room' : m}
              </button>
            ))}
          </div>
        </div>
        {mobile === 'chart' && (
          <>
            {market ? <TradingChart coin={coin} szDecimals={market.szDecimals} positions={positions} className="h-[360px] border-b border-line" /> : <Skeleton className="m-3 h-[360px]" />}
            <Desk coinFilter={coin} compact />
          </>
        )}
        {mobile === 'trade' && market && (
          <>
            <OrderForm market={market} mark={mark} />
            <Desk coinFilter={coin} compact className="border-t border-line" />
          </>
        )}
        {mobile === 'book' && market && (
          <div className="grid grid-cols-2 divide-x divide-line">
            <OrderBook coin={coin} szDecimals={market.szDecimals} mark={mark} rows={12} />
            <RecentTrades coin={coin} szDecimals={market.szDecimals} limit={26} />
          </div>
        )}
        {mobile === 'chat' && chat}
      </div>

      <MarketSelector current={coin} open={selector} onClose={closeSelector} onPick={pick} initialCat={selectorCat} />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'long' | 'short' }) {
  return (
    <span className="hidden leading-tight sm:block">
      <span className="block text-[10px] uppercase tracking-wider text-ink-3">{label}</span>
      <span className={cx('mono text-sm font-semibold', tone === 'long' && 'text-long', tone === 'short' && 'text-short')}>{value}</span>
    </span>
  )
}
