import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createChart, AreaSeries, ColorType, type IChartApi, type UTCTimestamp } from 'lightweight-charts'
import { useTrading, unrealized, START_BALANCE } from '../store/trading'
import { useMarket } from '../store/market'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { Desk } from '../components/TradePanels'
import { CoinLogo } from '../components/CoinLogo'
import { PageHeader, Modal, ModalHeader, Empty } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { RefreshIcon, ChartIcon } from '../components/Icons'
import { WalletFunds } from '../components/WalletFunds'
import { cx, usd, pct, compact } from '../lib/format'

export default function Portfolio() {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const balance = useTrading((s) => s.balance)
  const positions = useTrading((s) => s.positions)
  const orders = useTrading((s) => s.orders)
  const fills = useTrading((s) => s.fills)
  const totalDeposited = useTrading((s) => s.totalDeposited)
  const equityHistory = useTrading((s) => s.equityHistory)
  const deposit = useTrading((s) => s.deposit)
  const reset = useTrading((s) => s.reset)
  const mids = useMarket((s) => s.mids)
  const [depositOpen, setDepositOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)

  const upnl = positions.reduce((a, p) => a + unrealized(p, mids[p.coin] ?? p.entry), 0)
  const marginUsed = positions.reduce((a, p) => a + p.margin, 0)
  const reserved = orders.reduce((a, o) => a + o.margin, 0)
  const equity = balance + marginUsed + upnl
  const realized = fills.reduce((a, f) => a + f.pnl, 0)
  const fees = fills.reduce((a, f) => a + f.fee, 0)
  const closes = fills.filter((f) => f.action !== 'open' && f.action !== 'increase')
  const wins = closes.filter((f) => f.pnl > 0).length
  const winRate = closes.length ? (wins / closes.length) * 100 : 0
  const volume = fills.reduce((a, f) => a + f.notional, 0)
  const ret = totalDeposited > 0 ? ((equity - totalDeposited) / totalDeposited) * 100 : 0
  const exposure = useMemo(() => {
    const m: Record<string, number> = {}
    positions.forEach((p) => (m[p.coin] = (m[p.coin] ?? 0) + p.size * (mids[p.coin] ?? p.entry)))
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [positions, mids])
  const totalExposure = exposure.reduce((a, [, v]) => a + v, 0)

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Portfolio</span>} />
      <div className="hidden md:block">
        <PageHeader
          title="Portfolio"
          sub="Real wallet balances · non-custodial"
        />
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-2">
        <WalletFunds className="sm:col-span-2" />

        <div className="card p-5 sm:col-span-2">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
                Paper desk <span className="chip !py-0.5 text-[10px] normal-case tracking-normal">Simulated · practice only</span>
              </div>
              <div className="mono mt-1 text-3xl font-bold tabular-nums">{usd(equity)}</div>
              <div className={cx('mono mt-1 text-sm font-semibold', ret >= 0 ? 'text-long' : 'text-short')}>
                {usd(equity - totalDeposited, { sign: true })} ({pct(ret)}) all time · live marks from Hyperliquid
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost !py-2 gap-1.5" onClick={() => setResetOpen(true)}>
                <RefreshIcon size={15} /> Reset
              </button>
              <button className="btn btn-ghost !py-2" onClick={() => (me ? setDepositOpen(true) : openSignIn('Sign in to manage your desk.'))}>
                Add paper funds
              </button>
            </div>
          </div>
          <EquityChart history={equityHistory} equity={equity} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="Available" value={usd(Math.max(0, balance - reserved))} />
            <Metric label="In positions" value={usd(marginUsed)} sub={`${positions.length} open`} />
            <Metric label="Unrealized PnL" value={usd(upnl, { sign: true })} tone={upnl >= 0 ? 'long' : 'short'} />
            <Metric label="Reserved (orders)" value={usd(reserved)} sub={`${orders.length} open`} />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Performance</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Realized PnL" value={usd(realized, { sign: true })} tone={realized >= 0 ? 'long' : 'short'} />
            <Metric label="Fees paid" value={usd(fees)} />
            <Metric label="Win rate" value={closes.length ? `${winRate.toFixed(0)}%` : '—'} sub={`${wins}/${closes.length} closes`} />
            <Metric label="Volume traded" value={usd(volume, { compact: true })} sub={`${fills.length} fills`} />
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">Exposure</div>
          {exposure.length === 0 ? (
            <div className="py-4 text-center text-sm text-ink-3">
              No exposure.{' '}
              <Link to="/trade" className="text-accent">
                Open a position →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {exposure.map(([coin, v]) => (
                <Link key={coin} to={`/trade/${coin}`} className="group">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <CoinLogo coin={coin} size={18} /> {coin}
                    </span>
                    <span className="mono text-ink-2">
                      {usd(v, { compact: true })} <span className="text-ink-3">({((v / totalExposure) * 100).toFixed(0)}%)</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-gradient-to-r from-accent to-accent-2 transition-all group-hover:opacity-80" style={{ width: `${(v / totalExposure) * 100}%` }} />
                  </div>
                </Link>
              ))}
              <div className="mt-1 text-xs text-ink-3">
                Total notional {usd(totalExposure)} · {totalExposure && equity ? (totalExposure / equity).toFixed(1) : '0'}x account leverage
              </div>
            </div>
          )}
        </div>
      </div>

      {positions.length + orders.length + fills.length === 0 ? (
        <Empty title="Your desk is empty" body="Head to the trading terminal to open your first position." icon={<ChartIcon />} action={<Link to="/trade" className="btn btn-primary">Open terminal</Link>} />
      ) : (
        <Desk className="border-t border-line" />
      )}

      <Modal open={depositOpen} onClose={() => setDepositOpen(false)} size="sm" label="Deposit">
        <ModalHeader title="Add paper USDC" sub="Practice balance only — not real money. Use Deposit in the wallet card above for real funds." onClose={() => setDepositOpen(false)} />
        <div className="grid grid-cols-2 gap-2 px-5 pb-5">
          {[1_000, 5_000, 10_000, 50_000].map((a) => (
            <button
              key={a}
              className="btn btn-ghost !py-3 mono"
              onClick={() => {
                deposit(a)
                setDepositOpen(false)
              }}
            >
              +{usd(a)}
            </button>
          ))}
        </div>
      </Modal>
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} size="sm" label="Reset desk">
        <ModalHeader title="Reset your desk?" sub="Closes everything and restores the starting balance" onClose={() => setResetOpen(false)} />
        <div className="flex gap-2 px-5 pb-5">
          <button className="btn btn-ghost flex-1" onClick={() => setResetOpen(false)}>
            Cancel
          </button>
          <button
            className="btn btn-short flex-1"
            onClick={() => {
              reset()
              setResetOpen(false)
            }}
          >
            Reset to {compact(START_BALANCE)}
          </button>
        </div>
      </Modal>
    </div>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'long' | 'short' }) {
  return (
    <div>
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={cx('mono font-semibold tabular-nums', tone === 'long' && 'text-long', tone === 'short' && 'text-short')}>{value}</div>
      {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
    </div>
  )
}

function EquityChart({ history, equity }: { history: Array<{ t: number; v: number }>; equity: number }) {
  const box = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const theme = useUI((s) => s.theme)
  const data = useMemo(() => {
    const pts = history.length ? history : [{ t: Date.now() - 60_000, v: equity }]
    const all = [...pts, { t: Date.now(), v: equity }]
    const seen = new Set<number>()
    return all
      .map((p) => ({ time: Math.floor(p.t / 1000) as UTCTimestamp, value: p.v }))
      .filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true)))
      .sort((a, b) => a.time - b.time)
  }, [history, equity])
  const up = data.length ? data[data.length - 1].value >= data[0].value : true

  useEffect(() => {
    const el = box.current
    if (!el) return
    const text = theme === 'dark' ? '#8b8f9c' : '#6b6f7b'
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: text, attributionLogo: false, fontFamily: 'Inter, ui-sans-serif, system-ui' },
      grid: { vertLines: { visible: false }, horzLines: { visible: false } },
      rightPriceScale: { visible: false },
      leftPriceScale: { visible: false },
      timeScale: { visible: data.length > 2, borderVisible: false, timeVisible: true },
      crosshair: { horzLine: { visible: false } },
      handleScroll: false,
      handleScale: false,
    })
    const color = up ? '#22c55e' : '#f43f5e'
    const s = chart.addSeries(AreaSeries, { lineColor: color, topColor: up ? 'rgba(34,197,94,0.35)' : 'rgba(244,63,94,0.35)', bottomColor: 'rgba(0,0,0,0)', lineWidth: 2, priceLineVisible: false, lastValueVisible: false })
    s.setData(data)
    chart.timeScale().fitContent()
    chartRef.current = chart
    return () => {
      chart.remove()
      chartRef.current = null
    }
  }, [data, up, theme])

  return <div ref={box} className="mt-4 h-36 w-full" />
}
