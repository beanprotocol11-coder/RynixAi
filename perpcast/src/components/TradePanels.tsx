import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CoinLogo } from './CoinLogo'
import { CATEGORIES, coinName, displaySymbol, fetchBook, subscribeBook, subscribeTrades, type L2Book, type Market, type MarketCategory, type Trade } from '../lib/hyperliquid'
import { useMarket } from '../store/market'
import { useTrading, liqPrice, unrealized, roe, TAKER_FEE, MAKER_FEE, type Position, type Order, type Fill, type Side } from '../store/trading'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { cx, usd, px, pct, num, timeAgo, clamp } from '../lib/format'
import { Empty, Modal, ModalHeader, Tabs } from './ui'
import { ShareIcon, CloseIcon, ChartIcon } from './Icons'
import { toast } from '../store/notify'

// ---------------------------------------------------------------- Order form

type OrderType = 'market' | 'limit'

export function OrderForm({ market, mark, className }: { market: Market; mark: number; className?: string }) {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const balance = useTrading((s) => s.balance)
  const orders = useTrading((s) => s.orders)
  const openMarket = useTrading((s) => s.openMarket)
  const placeLimit = useTrading((s) => s.placeLimit)
  const deposit = useTrading((s) => s.deposit)

  const [side, setSide] = useState<Side>('long')
  const [type, setType] = useState<OrderType>('market')
  const [sizeUsd, setSizeUsd] = useState('')
  const [limitPx, setLimitPx] = useState('')
  const [leverage, setLeverage] = useState(() => clamp(Number(localStorage.getItem(`perpcast:lev:${market.coin}`)) || 10, 1, market.maxLeverage))
  const [tpsl, setTpsl] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [unit, setUnit] = useState<'usd' | 'coin'>('usd')

  useEffect(() => {
    setLeverage(clamp(Number(localStorage.getItem(`perpcast:lev:${market.coin}`)) || 10, 1, market.maxLeverage))
    setLimitPx('')
    setTp('')
    setSl('')
  }, [market.coin, market.maxLeverage])

  useEffect(() => {
    if (type === 'limit' && !limitPx && mark) setLimitPx(px(mark, market.szDecimals).replace(/,/g, ''))
  }, [type, mark, limitPx, market.szDecimals])

  const reserved = orders.reduce((a, o) => a + o.margin, 0)
  const free = Math.max(0, balance - reserved)
  const price = type === 'limit' ? parseFloat(limitPx) || mark : mark
  const notional = unit === 'usd' ? parseFloat(sizeUsd) || 0 : (parseFloat(sizeUsd) || 0) * price
  const coinSize = price > 0 ? notional / price : 0
  const margin = leverage > 0 ? notional / leverage : 0
  const fee = notional * (type === 'market' ? TAKER_FEE : MAKER_FEE)
  const liq = price > 0 ? liqPrice(price, side, leverage, market.maxLeverage) : 0
  const maxNotional = free * leverage
  const pctUsed = maxNotional > 0 ? clamp((notional / maxNotional) * 100, 0, 100) : 0
  const tpN = tpsl ? parseFloat(tp) || null : null
  const slN = tpsl ? parseFloat(sl) || null : null
  const tpBad = tpN !== null && (side === 'long' ? tpN <= price : tpN >= price)
  const slBad = slN !== null && (side === 'long' ? slN >= price || slN <= liq : slN <= price || slN >= liq)
  const tooBig = margin + fee > free + 1e-9
  const can = notional > 0 && !tooBig && !tpBad && !slBad && price > 0

  const setPct = (p: number) => {
    const n = (maxNotional * p) / 100
    setSizeUsd(unit === 'usd' ? n.toFixed(2) : (n / price).toFixed(market.szDecimals))
  }

  const submit = () => {
    if (!me) {
      openSignIn('Sign in to start trading on Perpcast.')
      return
    }
    if (!can) return
    const args = { coin: market.coin, side, sizeUsd: notional, leverage, maxLeverage: market.maxLeverage, tp: tpN, sl: slN, szDecimals: market.szDecimals }
    const ok = type === 'market' ? openMarket({ ...args, mark }) : placeLimit({ ...args, price })
    if (ok) setSizeUsd('')
  }

  return (
    <div className={cx('flex flex-col gap-3 p-3', className)}>
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
        <button className={cx('rounded-lg py-2 text-sm font-bold transition-colors', side === 'long' ? 'bg-long text-white shadow' : 'text-ink-3 hover:text-ink')} onClick={() => setSide('long')}>
          Long
        </button>
        <button className={cx('rounded-lg py-2 text-sm font-bold transition-colors', side === 'short' ? 'bg-short text-white shadow' : 'text-ink-3 hover:text-ink')} onClick={() => setSide('short')}>
          Short
        </button>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex gap-3">
          {(['market', 'limit'] as OrderType[]).map((t) => (
            <button key={t} className={cx('font-semibold capitalize transition-colors', type === t ? 'text-ink' : 'text-ink-3 hover:text-ink-2')} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
        <span className="text-ink-3">
          Avail <span className="mono text-ink">{usd(free)}</span>
        </span>
      </div>

      {type === 'limit' && (
        <label className="block">
          <span className="mb-1 flex justify-between text-xs text-ink-3">
            <span>Limit price</span>
            <button className="text-accent" onClick={() => setLimitPx(px(mark, market.szDecimals).replace(/,/g, ''))} type="button">
              Mid
            </button>
          </span>
          <div className="relative">
            <input className="input mono pr-14" inputMode="decimal" value={limitPx} onChange={(e) => setLimitPx(e.target.value.replace(/[^\d.]/g, ''))} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-3">USD</span>
          </div>
        </label>
      )}

      <label className="block">
        <span className="mb-1 flex justify-between text-xs text-ink-3">
          <span>Size</span>
          <button type="button" className="text-accent" onClick={() => { setUnit(unit === 'usd' ? 'coin' : 'usd'); setSizeUsd('') }}>
            {unit === 'usd' ? `Switch to ${market.coin}` : 'Switch to USD'}
          </button>
        </span>
        <div className="relative">
          <input className="input mono pr-16 text-lg" inputMode="decimal" placeholder="0.00" value={sizeUsd} onChange={(e) => setSizeUsd(e.target.value.replace(/[^\d.]/g, ''))} onKeyDown={(e) => e.key === 'Enter' && submit()} />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-ink-3">{unit === 'usd' ? 'USD' : market.coin}</span>
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-ink-3 mono">
          <span>≈ {unit === 'usd' ? `${num(coinSize, market.szDecimals)} ${market.coin}` : usd(notional)}</span>
          <span>{pctUsed.toFixed(0)}% of max</span>
        </div>
      </label>

      <div className="grid grid-cols-4 gap-1.5">
        {[25, 50, 75, 100].map((p) => (
          <button key={p} className="chip justify-center !py-1.5 text-xs" onClick={() => setPct(p)} type="button">
            {p}%
          </button>
        ))}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs text-ink-3">
          <span>Leverage</span>
          <span className="mono rounded-md bg-surface-2 px-2 py-0.5 font-bold text-ink">{leverage}x</span>
        </div>
        <input
          type="range"
          min={1}
          max={market.maxLeverage}
          step={1}
          value={leverage}
          onChange={(e) => {
            const v = Number(e.target.value)
            setLeverage(v)
            localStorage.setItem(`perpcast:lev:${market.coin}`, String(v))
          }}
          className="w-full accent-[var(--accent)]"
        />
        <div className="mt-1 flex justify-between text-[10px] text-ink-3 mono">
          {[1, Math.round(market.maxLeverage / 4), Math.round(market.maxLeverage / 2), Math.round((market.maxLeverage * 3) / 4), market.maxLeverage].map((v, i) => (
            <button key={i} type="button" className="hover:text-ink" onClick={() => { setLeverage(Math.max(1, v)); localStorage.setItem(`perpcast:lev:${market.coin}`, String(Math.max(1, v))) }}>
              {Math.max(1, v)}x
            </button>
          ))}
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={tpsl} onChange={(e) => setTpsl(e.target.checked)} />
        Take profit / Stop loss
      </label>
      {tpsl && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <input className={cx('input mono !py-2 text-sm', tpBad && '!border-short')} inputMode="decimal" placeholder="TP price" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ''))} />
            {tpN && !tpBad && <div className="mt-0.5 text-[11px] text-long mono">{pct(((side === 'long' ? tpN - price : price - tpN) / price) * 100 * leverage)}</div>}
            {tpBad && <div className="mt-0.5 text-[11px] text-short">TP must be {side === 'long' ? 'above' : 'below'} entry</div>}
          </div>
          <div>
            <input className={cx('input mono !py-2 text-sm', slBad && '!border-short')} inputMode="decimal" placeholder="SL price" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ''))} />
            {slN && !slBad && <div className="mt-0.5 text-[11px] text-short mono">{pct(((side === 'long' ? slN - price : price - slN) / price) * 100 * leverage)}</div>}
            {slBad && <div className="mt-0.5 text-[11px] text-short">SL must be between liq & entry</div>}
          </div>
        </div>
      )}

      <button className={cx('btn w-full !py-3 text-base', side === 'long' ? 'btn-long' : 'btn-short')} disabled={!!me && !can} onClick={submit}>
        {!me ? 'Sign in to trade' : tooBig ? 'Insufficient margin' : `${type === 'market' ? '' : 'Limit '}${side === 'long' ? 'Long' : 'Short'} ${market.coin}`}
      </button>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs [&>dt]:text-ink-3 [&>dd]:mono [&>dd]:text-right">
        <dt>Est. liquidation</dt>
        <dd className={liq ? 'text-amber-500' : ''}>{liq ? px(liq, market.szDecimals) : '—'}</dd>
        <dt>Margin required</dt>
        <dd>{usd(margin)}</dd>
        <dt>Fee ({type === 'market' ? 'taker' : 'maker'})</dt>
        <dd>{usd(fee)}</dd>
        <dt>Max leverage</dt>
        <dd>{market.maxLeverage}x</dd>
      </dl>

      {free < 100 && me && (
        <button className="btn btn-ghost w-full text-xs" onClick={() => deposit(10_000)}>
          Low balance — deposit $10,000 paper USDC
        </button>
      )}
      <p className="text-center text-[11px] leading-snug text-ink-3">Paper trading on live Hyperliquid prices. No real funds are used.</p>
    </div>
  )
}

// ---------------------------------------------------------------- Order book

export function OrderBook({ coin, szDecimals, mark, rows = 12, className, onPick }: { coin: string; szDecimals: number; mark: number; rows?: number; className?: string; onPick?: (px: number) => void }) {
  const [book, setBook] = useState<L2Book | null>(null)
  useEffect(() => {
    setBook(null)
    let alive = true
    fetchBook(coin).then((b) => alive && setBook(b)).catch(() => undefined)
    const un = subscribeBook(coin, (b) => alive && setBook(b))
    return () => {
      alive = false
      un()
    }
  }, [coin])

  const asks = useMemo(() => (book?.asks ?? []).slice(0, rows).reverse(), [book, rows])
  const bids = useMemo(() => (book?.bids ?? []).slice(0, rows), [book, rows])
  const maxSz = useMemo(() => Math.max(1e-9, ...asks.map((l) => l.sz), ...bids.map((l) => l.sz)), [asks, bids])
  const spread = book && book.asks[0] && book.bids[0] ? book.asks[0].px - book.bids[0].px : 0
  const bidVol = bids.reduce((a, l) => a + l.sz, 0)
  const askVol = asks.reduce((a, l) => a + l.sz, 0)
  const bidShare = bidVol + askVol > 0 ? (bidVol / (bidVol + askVol)) * 100 : 50

  return (
    <div className={cx('flex flex-col text-[11px] mono', className)}>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-ink-3">
        <span>Price</span>
        <span className="text-right">Size ({displaySymbol(coin)})</span>
        <span className="text-right">Total</span>
      </div>
      <div className="flex-1">
        {!book && (
          <div className="flex flex-col gap-1 px-3">
            {Array.from({ length: rows * 2 }).map((_, i) => (
              <div key={i} className="skeleton h-4" />
            ))}
          </div>
        )}
        {asks.map((l, i) => {
          const total = asks.slice(i).reduce((a, x) => a + x.sz, 0)
          return (
            <button key={`a${l.px}`} className="relative grid w-full grid-cols-3 px-3 py-[2px] text-left hover:bg-surface-hover" onClick={() => onPick?.(l.px)}>
              <span className="absolute inset-y-0 right-0 bg-short/15" style={{ width: `${(l.sz / maxSz) * 100}%` }} />
              <span className="relative text-short">{px(l.px, szDecimals)}</span>
              <span className="relative text-right text-ink-2">{num(l.sz, Math.min(4, szDecimals))}</span>
              <span className="relative text-right text-ink-3">{num(total, Math.min(3, szDecimals))}</span>
            </button>
          )
        })}
        {book && (
          <div className="flex items-center justify-between border-y border-line bg-surface-2/60 px-3 py-1.5">
            <span className="font-sans text-sm font-bold text-ink">{px(mark, szDecimals)}</span>
            <span className="text-[10px] text-ink-3">
              Spread {px(spread, szDecimals)} ({mark ? ((spread / mark) * 100).toFixed(3) : '0'}%)
            </span>
          </div>
        )}
        {bids.map((l, i) => {
          const total = bids.slice(0, i + 1).reduce((a, x) => a + x.sz, 0)
          return (
            <button key={`b${l.px}`} className="relative grid w-full grid-cols-3 px-3 py-[2px] text-left hover:bg-surface-hover" onClick={() => onPick?.(l.px)}>
              <span className="absolute inset-y-0 right-0 bg-long/15" style={{ width: `${(l.sz / maxSz) * 100}%` }} />
              <span className="relative text-long">{px(l.px, szDecimals)}</span>
              <span className="relative text-right text-ink-2">{num(l.sz, Math.min(4, szDecimals))}</span>
              <span className="relative text-right text-ink-3">{num(total, Math.min(3, szDecimals))}</span>
            </button>
          )
        })}
      </div>
      {book && (
        <div className="px-3 py-2">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
            <span className="bg-long" style={{ width: `${bidShare}%` }} />
            <span className="flex-1 bg-short" />
          </div>
          <div className="mt-1 flex justify-between text-[10px]">
            <span className="text-long">B {bidShare.toFixed(0)}%</span>
            <span className="text-short">A {(100 - bidShare).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- Recent trades

export function RecentTrades({ coin, szDecimals, className, limit = 40 }: { coin: string; szDecimals: number; className?: string; limit?: number }) {
  const [trades, setTrades] = useState<Trade[]>([])
  useEffect(() => {
    setTrades([])
    return subscribeTrades(coin, (t) => setTrades((prev) => [...t.slice().reverse(), ...prev].slice(0, limit)))
  }, [coin, limit])
  return (
    <div className={cx('flex flex-col text-[11px] mono', className)}>
      <div className="grid grid-cols-3 px-3 py-1.5 text-[10px] font-sans font-semibold uppercase tracking-wider text-ink-3">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Time</span>
      </div>
      {trades.length === 0 && <div className="px-3 py-6 text-center font-sans text-xs text-ink-3">Waiting for trades…</div>}
      {trades.map((t) => (
        <div key={t.tid} className="grid grid-cols-3 px-3 py-[2px] animate-[fade-up_.3s_ease]">
          <span className={t.side === 'B' ? 'text-long' : 'text-short'}>{px(t.px, szDecimals)}</span>
          <span className="text-right text-ink-2">{num(t.sz, Math.min(4, szDecimals))}</span>
          <span className="text-right text-ink-3">{new Date(t.time).toLocaleTimeString([], { hour12: false })}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- Positions / orders / fills

type DeskTab = 'positions' | 'orders' | 'fills'

export function Desk({ coinFilter, className, compact }: { coinFilter?: string; className?: string; compact?: boolean }) {
  const positions = useTrading((s) => s.positions)
  const orders = useTrading((s) => s.orders)
  const fills = useTrading((s) => s.fills)
  const [tab, setTab] = useState<DeskTab>('positions')
  const [all, setAll] = useState(!coinFilter)
  const f = <T extends { coin: string }>(xs: T[]) => (all || !coinFilter ? xs : xs.filter((x) => x.coin === coinFilter))

  return (
    <div className={cx('flex flex-col', className)}>
      <div className="flex items-center">
        <Tabs
          className="flex-1 !border-0"
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'positions', label: <>Positions {positions.length > 0 && <Count n={f(positions).length} />}</> },
            { id: 'orders', label: <>Orders {orders.length > 0 && <Count n={f(orders).length} />}</> },
            { id: 'fills', label: 'History' },
          ]}
        />
        {coinFilter && (
          <label className="mr-3 flex items-center gap-1.5 text-xs text-ink-3">
            <input type="checkbox" className="accent-[var(--accent)]" checked={all} onChange={(e) => setAll(e.target.checked)} /> All markets
          </label>
        )}
      </div>
      <div className="border-t border-line">
        {tab === 'positions' && <PositionsTable positions={f(positions)} compact={compact} />}
        {tab === 'orders' && <OrdersTable orders={f(orders)} />}
        {tab === 'fills' && <FillsTable fills={f(fills)} />}
      </div>
    </div>
  )
}

function Count({ n }: { n: number }) {
  return <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-[10px] font-bold text-accent">{n}</span>
}

export function PositionsTable({ positions, compact }: { positions: Position[]; compact?: boolean }) {
  const mids = useMarket((s) => s.mids)
  const byCoin = useMarket((s) => s.byCoin)
  const [closing, setClosing] = useState<Position | null>(null)
  const [editing, setEditing] = useState<Position | null>(null)
  if (positions.length === 0) return <Empty title="No open positions" body="Pick a side above to open your first paper position." icon={<ChartIcon />} />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-ink-3">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th>Market</th>
            <th>Size</th>
            <th>Entry</th>
            <th>Mark</th>
            <th>Liq.</th>
            <th>Margin</th>
            <th>PnL (ROE)</th>
            {!compact && <th>TP / SL</th>}
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="mono">
          {positions.map((p) => {
            const mark = mids[p.coin] ?? p.entry
            const u = unrealized(p, mark)
            const r = roe(p, mark)
            const sd = byCoin[p.coin]?.szDecimals ?? 2
            return (
              <tr key={p.id} className="border-t border-line [&>td]:px-3 [&>td]:py-2">
                <td>
                  <Link to={`/trade/${encodeURIComponent(p.coin)}`} className="flex items-center gap-2 font-sans font-bold hover:underline">
                    <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side === 'long' ? 'Long' : 'Short'}</span>
                    {p.coin}
                    <span className="text-ink-3">{p.leverage.toFixed(0)}x</span>
                  </Link>
                </td>
                <td>
                  {num(p.size, sd)} <span className="text-ink-3">({usd(p.size * mark, { compact: true })})</span>
                </td>
                <td>{px(p.entry, sd)}</td>
                <td>{px(mark, sd)}</td>
                <td className="text-amber-500">{px(p.liq, sd)}</td>
                <td>{usd(p.margin)}</td>
                <td className={u >= 0 ? 'text-long' : 'text-short'}>
                  {usd(u, { sign: true })} <span className="opacity-80">({pct(r)})</span>
                </td>
                {!compact && (
                  <td>
                    <button className="hover:text-accent" onClick={() => setEditing(p)}>
                      {p.tp ? px(p.tp, sd) : '—'} / {p.sl ? px(p.sl, sd) : '—'}
                    </button>
                  </td>
                )}
                <td className="text-right font-sans">
                  <div className="inline-flex gap-1">
                    <SharePositionBtn p={p} mark={mark} />
                    {compact && (
                      <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(p)}>
                        TP/SL
                      </button>
                    )}
                    <button className="btn btn-ghost !px-2 !py-1 text-xs" onClick={() => setClosing(p)}>
                      Close
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {closing && <CloseModal p={closing} onClose={() => setClosing(null)} />}
      {editing && <TpSlModal p={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function SharePositionBtn({ p, mark }: { p: Position; mark: number }) {
  const openComposer = useUI((s) => s.openComposer)
  const nav = useNavigate()
  const u = unrealized(p, mark)
  return (
    <button
      className="btn btn-ghost !px-2 !py-1 text-xs gap-1"
      title="Share to feed"
      onClick={() => {
        openComposer({ position: { coin: p.coin, side: p.side, leverage: p.leverage, entry: p.entry, size: p.size, pnl: u, pnlPct: roe(p, mark) }, text: `${p.side === 'long' ? 'Long' : 'Short'} $${displaySymbol(p.coin)} ${p.leverage.toFixed(0)}x from ${px(p.entry)} ` })
        if (window.innerWidth < 768) nav('/')
      }}
    >
      <ShareIcon size={13} /> Share
    </button>
  )
}

function CloseModal({ p, onClose }: { p: Position; onClose: () => void }) {
  const mark = useMarket((s) => s.mids[p.coin]) ?? p.entry
  const sd = useMarket((s) => s.byCoin[p.coin]?.szDecimals ?? 2)
  const closePosition = useTrading((s) => s.closePosition)
  const [frac, setFrac] = useState(100)
  const size = p.size * (frac / 100)
  const est = unrealized({ ...p, size }, mark) - size * mark * TAKER_FEE
  return (
    <Modal open onClose={onClose} size="sm" label="Close position">
      <ModalHeader title={`Close ${p.side} ${displaySymbol(p.coin)}`} sub={`Mark ${px(mark, sd)} · Entry ${px(p.entry, sd)}`} onClose={onClose} />
      <div className="flex flex-col gap-4 px-5 pb-5">
        <div>
          <div className="mb-1 flex justify-between text-xs text-ink-3">
            <span>Amount to close</span>
            <span className="mono text-ink">
              {num(size, sd)} {displaySymbol(p.coin)} ({frac}%)
            </span>
          </div>
          <input type="range" min={1} max={100} value={frac} onChange={(e) => setFrac(Number(e.target.value))} className="w-full accent-[var(--accent)]" />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[25, 50, 75, 100].map((v) => (
              <button key={v} className={cx('chip justify-center !py-1.5 text-xs', frac === v && 'chip-active')} onClick={() => setFrac(v)}>
                {v}%
              </button>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&>dt]:text-ink-3 [&>dd]:mono [&>dd]:text-right">
          <dt>Est. realized PnL</dt>
          <dd className={est >= 0 ? 'text-long' : 'text-short'}>{usd(est, { sign: true })}</dd>
          <dt>Margin returned</dt>
          <dd>{usd(Math.max(0, p.margin * (frac / 100) + est))}</dd>
        </dl>
        <button
          className={cx('btn w-full !py-3', p.side === 'long' ? 'btn-short' : 'btn-long')}
          onClick={() => {
            closePosition(p.id, mark, frac / 100)
            onClose()
          }}
        >
          {frac === 100 ? 'Close position' : `Close ${frac}%`} at market
        </button>
      </div>
    </Modal>
  )
}

function TpSlModal({ p, onClose }: { p: Position; onClose: () => void }) {
  const mark = useMarket((s) => s.mids[p.coin]) ?? p.entry
  const sd = useMarket((s) => s.byCoin[p.coin]?.szDecimals ?? 2)
  const setTpSl = useTrading((s) => s.setTpSl)
  const [tp, setTp] = useState(p.tp ? String(p.tp) : '')
  const [sl, setSl] = useState(p.sl ? String(p.sl) : '')
  const tpN = parseFloat(tp) || null
  const slN = parseFloat(sl) || null
  const tpBad = tpN !== null && (p.side === 'long' ? tpN <= mark : tpN >= mark)
  const slBad = slN !== null && (p.side === 'long' ? slN >= mark || slN <= p.liq : slN <= mark || slN >= p.liq)
  const gain = (target: number) => unrealized(p, target)
  return (
    <Modal open onClose={onClose} size="sm" label="Take profit / stop loss">
      <ModalHeader title="Take profit / Stop loss" sub={`${p.side} ${displaySymbol(p.coin)} ${p.leverage.toFixed(0)}x · Mark ${px(mark, sd)}`} onClose={onClose} />
      <div className="flex flex-col gap-3 px-5 pb-5">
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Take profit price</span>
          <input className={cx('input mono', tpBad && '!border-short')} inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value.replace(/[^\d.]/g, ''))} placeholder="None" />
          {tpN && !tpBad && <span className="mt-1 block text-xs text-long mono">Est. {usd(gain(tpN), { sign: true })}</span>}
          {tpBad && <span className="mt-1 block text-xs text-short">Must be {p.side === 'long' ? 'above' : 'below'} mark</span>}
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-ink-3">Stop loss price</span>
          <input className={cx('input mono', slBad && '!border-short')} inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value.replace(/[^\d.]/g, ''))} placeholder="None" />
          {slN && !slBad && <span className="mt-1 block text-xs text-short mono">Est. {usd(gain(slN), { sign: true })}</span>}
          {slBad && <span className="mt-1 block text-xs text-short">Must be between liquidation ({px(p.liq, sd)}) and mark</span>}
        </label>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1" onClick={() => { setTpSl(p.id, null, null); onClose() }}>
            Clear
          </button>
          <button className="btn btn-primary flex-1" disabled={tpBad || slBad} onClick={() => { setTpSl(p.id, tpN, slN); onClose() }}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function OrdersTable({ orders }: { orders: Order[] }) {
  const cancel = useTrading((s) => s.cancelOrder)
  const mids = useMarket((s) => s.mids)
  const byCoin = useMarket((s) => s.byCoin)
  if (orders.length === 0) return <Empty title="No open orders" body="Limit orders fill automatically when the live price crosses your level." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-ink-3">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th>Market</th>
            <th>Type</th>
            <th>Size</th>
            <th>Limit</th>
            <th>Mark</th>
            <th>Margin</th>
            <th>Placed</th>
            <th className="text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="mono">
          {orders.map((o) => {
            const sd = byCoin[o.coin]?.szDecimals ?? 2
            const mark = mids[o.coin]
            const dist = mark ? ((o.price - mark) / mark) * 100 : 0
            return (
              <tr key={o.id} className="border-t border-line [&>td]:px-3 [&>td]:py-2">
                <td>
                  <Link to={`/trade/${o.coin}`} className="flex items-center gap-2 font-sans font-bold hover:underline">
                    <span className={cx('badge', o.side === 'long' ? 'badge-long' : 'badge-short')}>{o.side === 'long' ? 'Long' : 'Short'}</span>
                    {o.coin}
                    <span className="text-ink-3">{o.leverage}x</span>
                  </Link>
                </td>
                <td className="font-sans capitalize">{o.type}</td>
                <td>{num(o.size, sd)}</td>
                <td>{px(o.price, sd)}</td>
                <td>
                  {mark ? px(mark, sd) : '—'} <span className="text-ink-3">({pct(dist)})</span>
                </td>
                <td>{usd(o.margin)}</td>
                <td className="font-sans text-ink-3">{timeAgo(o.createdAt)}</td>
                <td className="text-right font-sans">
                  <button className="btn btn-ghost !px-2 !py-1 text-xs gap-1" onClick={() => cancel(o.id)}>
                    <CloseIcon size={12} /> Cancel
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function FillsTable({ fills, limit = 100 }: { fills: Fill[]; limit?: number }) {
  const byCoin = useMarket((s) => s.byCoin)
  if (fills.length === 0) return <Empty title="No trade history" body="Your fills, closes and liquidations will appear here." />
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-ink-3">
          <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-semibold">
            <th>Time</th>
            <th>Market</th>
            <th>Action</th>
            <th>Size</th>
            <th>Price</th>
            <th>Fee</th>
            <th className="text-right">Realized PnL</th>
          </tr>
        </thead>
        <tbody className="mono">
          {fills.slice(0, limit).map((f) => {
            const sd = byCoin[f.coin]?.szDecimals ?? 2
            return (
              <tr key={f.id} className="border-t border-line [&>td]:px-3 [&>td]:py-2">
                <td className="font-sans text-ink-3" title={new Date(f.time).toLocaleString()}>
                  {timeAgo(f.time)}
                </td>
                <td>
                  <Link to={`/trade/${f.coin}`} className="flex items-center gap-2 font-sans font-bold hover:underline">
                    <span className={cx('badge', f.side === 'long' ? 'badge-long' : 'badge-short')}>{f.side === 'long' ? 'Long' : 'Short'}</span>
                    {f.coin}
                    <span className="text-ink-3">{f.leverage.toFixed(0)}x</span>
                  </Link>
                </td>
                <td className={cx('font-sans capitalize', f.action === 'liquidation' && 'text-amber-500', f.action === 'tp' && 'text-long', f.action === 'sl' && 'text-short')}>{f.action === 'tp' ? 'Take profit' : f.action === 'sl' ? 'Stop loss' : f.action}</td>
                <td>{num(f.size, sd)}</td>
                <td>{px(f.price, sd)}</td>
                <td className="text-ink-3">{usd(f.fee)}</td>
                <td className={cx('text-right', f.pnl > 0 ? 'text-long' : f.pnl < 0 ? 'text-short' : 'text-ink-3')}>{f.action === 'open' || f.action === 'increase' ? '—' : usd(f.pnl, { sign: true })}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---------------------------------------------------------------- Market selector

export type SelectorCat = MarketCategory | 'all' | 'favs'

export function MarketSelector({ current, onPick, open, onClose, initialCat = 'all' }: { current: string; onPick: (coin: string) => void; open: boolean; onClose: () => void; initialCat?: SelectorCat }) {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<SelectorCat>(initialCat)
  const [favs, setFavs] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('perpcast:favs') ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (open) {
      setCat(initialCat)
      setTimeout(() => inputRef.current?.focus(), 30)
    } else setQ('')
  }, [open, initialCat])
  const toggleFav = (c: string) => {
    const next = favs.includes(c) ? favs.filter((x) => x !== c) : [...favs, c]
    setFavs(next)
    localStorage.setItem('perpcast:favs', JSON.stringify(next))
  }
  const counts = useMemo(() => {
    const n: Record<string, number> = { all: markets.length, favs: favs.filter((f) => markets.some((m) => m.coin === f)).length }
    for (const m of markets) n[m.category] = (n[m.category] ?? 0) + 1
    return n
  }, [markets, favs])
  const list = useMemo(() => {
    const ql = q.trim().toLowerCase()
    let xs = markets
    if (cat === 'favs') xs = xs.filter((m) => favs.includes(m.coin))
    else if (cat !== 'all') xs = xs.filter((m) => m.category === cat)
    if (ql) xs = xs.filter((m) => m.symbol.toLowerCase().includes(ql) || coinName(m.coin).toLowerCase().includes(ql))
    return [...xs].sort((a, b) => Number(favs.includes(b.coin)) - Number(favs.includes(a.coin)) || b.dayNtlVlm - a.dayNtlVlm)
  }, [markets, q, favs, cat])

  return (
    <Modal open={open} onClose={onClose} size="md" label="Select market" className="!p-0">
      <ModalHeader title="Markets" sub={`${markets.length} perpetuals · crypto, memes, stocks & RWAs · live from Hyperliquid`} onClose={onClose} />
      <div className="px-4 pb-2">
        <input ref={inputRef} className="input" placeholder="Search markets…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { onPick(list[0].coin); onClose() } }} />
      </div>
      <div className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pb-3">
        {CATEGORIES.map((c) => (
          <button key={c.id} className={cx('chip shrink-0 !py-1 text-xs', cat === c.id && 'chip-active')} title={c.hint} onClick={() => setCat(c.id)}>
            {c.label}
            <span className="ml-1 text-ink-3">{counts[c.id] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-3 px-4 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-3">
        <span className="w-4" />
        <span>Market</span>
        <span className="text-right">Price</span>
        <span className="w-20 text-right">24h</span>
      </div>
      <div className="max-h-[60dvh] overflow-y-auto pb-2">
        {list.map((m) => {
          const mid = mids[m.coin] ?? m.midPx
          const ch = m.prevDayPx ? ((mid - m.prevDayPx) / m.prevDayPx) * 100 : 0
          return (
            <div key={m.coin} className={cx('grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3 px-4 py-2 hover:bg-surface-hover', m.coin === current && 'bg-accent-soft/40')}>
              <button className={cx('w-4 text-base leading-none', favs.includes(m.coin) ? 'text-amber-400' : 'text-ink-3 hover:text-amber-400')} onClick={() => toggleFav(m.coin)} aria-label="Favourite">
                ★
              </button>
              <button className="flex min-w-0 items-center gap-2 text-left" onClick={() => { onPick(m.coin); onClose() }}>
                <CoinLogo coin={m.coin} size={30} />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate font-bold">{m.symbol}-USD</span>
                  <span className="block truncate text-[10px] text-ink-3">{coinName(m.coin)}</span>
                </span>
                <span className="hidden text-[10px] text-ink-3 sm:inline">{m.maxLeverage}x</span>
              </button>
              <button className="mono text-right text-sm" onClick={() => { onPick(m.coin); onClose() }}>
                {px(mid, m.szDecimals)}
              </button>
              <button className={cx('mono w-20 text-right text-sm', ch >= 0 ? 'text-long' : 'text-short')} onClick={() => { onPick(m.coin); onClose() }}>
                {pct(ch)}
              </button>
            </div>
          )
        })}
        {list.length === 0 && <div className="px-4 py-8 text-center text-sm text-ink-3">{cat === 'favs' && !q ? 'Star a market to keep it here.' : `No markets match “${q}”.`}</div>}
      </div>
    </Modal>
  )
}

export function copyToast(text: string, title = 'Copied') {
  navigator.clipboard?.writeText(text).then(() => toast({ kind: 'success', title })).catch(() => toast({ kind: 'error', title: 'Copy failed' }))
}
