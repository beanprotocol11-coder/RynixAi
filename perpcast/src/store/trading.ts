import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid, usd, pct } from '../lib/format'
import { notify, toast } from './notify'

export type Side = 'long' | 'short'

export interface Position {
  id: string
  coin: string
  side: Side
  size: number // coin units
  entry: number
  leverage: number
  margin: number // USDC isolated margin
  liq: number
  openedAt: number
  tp?: number | null
  sl?: number | null
  fees: number
  realized: number
  maxLeverage: number
}

export interface Order {
  id: string
  coin: string
  side: Side
  type: 'limit'
  size: number
  price: number
  leverage: number
  margin: number
  createdAt: number
  tp?: number | null
  sl?: number | null
  maxLeverage: number
}

export interface Fill {
  id: string
  coin: string
  side: Side
  action: 'open' | 'close' | 'liquidation' | 'tp' | 'sl' | 'increase' | 'partial'
  size: number
  price: number
  notional: number
  fee: number
  pnl: number
  time: number
  leverage: number
}

export const TAKER_FEE = 0.00045
export const MAKER_FEE = 0.00015
export const START_BALANCE = 10_000

export function maintenanceRate(maxLeverage: number): number {
  return 1 / (2 * Math.max(1, maxLeverage))
}

export function liqPrice(entry: number, side: Side, leverage: number, maxLeverage: number): number {
  const im = 1 / leverage
  const mm = maintenanceRate(maxLeverage)
  const move = Math.max(0.0005, im - mm)
  return side === 'long' ? entry * (1 - move) : entry * (1 + move)
}

export function unrealized(p: Position, mark: number): number {
  return p.side === 'long' ? (mark - p.entry) * p.size : (p.entry - mark) * p.size
}

export function roe(p: Position, mark: number): number {
  return (unrealized(p, mark) / p.margin) * 100
}

interface TradingState {
  balance: number
  positions: Position[]
  orders: Order[]
  fills: Fill[]
  equityHistory: Array<{ t: number; v: number }>
  totalDeposited: number

  openMarket: (args: { coin: string; side: Side; sizeUsd: number; leverage: number; mark: number; maxLeverage: number; tp?: number | null; sl?: number | null; szDecimals: number }) => Position | null
  placeLimit: (args: { coin: string; side: Side; sizeUsd: number; leverage: number; price: number; maxLeverage: number; tp?: number | null; sl?: number | null; szDecimals: number }) => Order | null
  cancelOrder: (id: string) => void
  closePosition: (id: string, mark: number, fraction?: number, action?: Fill['action']) => number
  setTpSl: (id: string, tp: number | null, sl: number | null) => void
  tick: (mids: Record<string, number>) => void
  deposit: (amount: number) => void
  reset: () => void
}

function fillNotional(size: number, price: number) {
  return size * price
}

export const useTrading = create<TradingState>()(
  persist(
    (set, get) => ({
      balance: START_BALANCE,
      positions: [],
      orders: [],
      fills: [],
      equityHistory: [],
      totalDeposited: START_BALANCE,

      openMarket: ({ coin, side, sizeUsd, leverage, mark, maxLeverage, tp, sl, szDecimals }) => {
        const s = get()
        if (!(mark > 0) || !(sizeUsd > 0)) return null
        const size = Math.floor((sizeUsd / mark) * 10 ** szDecimals) / 10 ** szDecimals
        if (size <= 0) {
          toast({ kind: 'error', title: 'Size too small', body: `Minimum size for ${coin} is ${1 / 10 ** szDecimals} ${coin}` })
          return null
        }
        const notional = size * mark
        const margin = notional / leverage
        const fee = notional * TAKER_FEE
        if (margin + fee > s.balance + 1e-9) {
          toast({ kind: 'error', title: 'Insufficient balance', body: `Need ${usd(margin + fee)} but you have ${usd(s.balance)}.` })
          return null
        }
        // Slippage: cross a fraction of the spread proportional to size
        const slip = Math.min(0.002, 0.00005 + notional / 50_000_000)
        const price = side === 'long' ? mark * (1 + slip) : mark * (1 - slip)

        const existing = s.positions.find((p) => p.coin === coin && p.side === side)
        let pos: Position
        if (existing) {
          const newSize = existing.size + size
          const entry = (existing.entry * existing.size + price * size) / newSize
          const newMargin = existing.margin + margin
          const lev = (newSize * entry) / newMargin
          pos = { ...existing, size: newSize, entry, margin: newMargin, leverage: lev, liq: liqPrice(entry, side, lev, maxLeverage), fees: existing.fees + fee, tp: tp ?? existing.tp, sl: sl ?? existing.sl }
          set({
            balance: s.balance - margin - fee,
            positions: s.positions.map((p) => (p.id === existing.id ? pos : p)),
            fills: [{ id: uid(), coin, side, action: 'increase' as const, size, price, notional, fee, pnl: 0, time: Date.now(), leverage }, ...s.fills].slice(0, 500),
          })
        } else {
          pos = { id: uid(), coin, side, size, entry: price, leverage, margin, liq: liqPrice(price, side, leverage, maxLeverage), openedAt: Date.now(), tp: tp ?? null, sl: sl ?? null, fees: fee, realized: 0, maxLeverage }
          set({
            balance: s.balance - margin - fee,
            positions: [pos, ...s.positions],
            fills: [{ id: uid(), coin, side, action: 'open' as const, size, price, notional, fee, pnl: 0, time: Date.now(), leverage }, ...s.fills].slice(0, 500),
          })
        }
        toast({ kind: side, title: `${side === 'long' ? 'Long' : 'Short'} ${coin} filled`, body: `${size} ${coin} @ ${usd(price)} · ${leverage.toFixed(0)}x` })
        notify({ kind: 'fill', title: `Opened ${side} ${coin} ${leverage.toFixed(0)}x`, body: `${size} ${coin} @ ${usd(price)}`, href: `/trade/${coin}` })
        return pos
      },

      placeLimit: ({ coin, side, sizeUsd, leverage, price, maxLeverage, tp, sl, szDecimals }) => {
        const s = get()
        if (!(price > 0) || !(sizeUsd > 0)) return null
        const size = Math.floor((sizeUsd / price) * 10 ** szDecimals) / 10 ** szDecimals
        if (size <= 0) {
          toast({ kind: 'error', title: 'Size too small' })
          return null
        }
        const margin = (size * price) / leverage
        const reserved = s.orders.reduce((a, o) => a + o.margin, 0)
        if (margin > s.balance - reserved + 1e-9) {
          toast({ kind: 'error', title: 'Insufficient balance', body: `Need ${usd(margin)} free margin.` })
          return null
        }
        const order: Order = { id: uid(), coin, side, type: 'limit', size, price, leverage, margin, createdAt: Date.now(), tp: tp ?? null, sl: sl ?? null, maxLeverage }
        set({ orders: [order, ...s.orders] })
        toast({ kind: 'info', title: 'Limit order placed', body: `${side} ${size} ${coin} @ ${usd(price)}` })
        return order
      },

      cancelOrder: (id) => {
        set((s) => ({ orders: s.orders.filter((o) => o.id !== id) }))
        toast({ kind: 'info', title: 'Order cancelled' })
      },

      closePosition: (id, mark, fraction = 1, action = 'close') => {
        const s = get()
        const p = s.positions.find((x) => x.id === id)
        if (!p || !(mark > 0)) return 0
        const f = Math.min(1, Math.max(0.0001, fraction))
        const size = f >= 0.9999 ? p.size : Math.floor(p.size * f * 1e6) / 1e6
        const slip = Math.min(0.002, 0.00005 + (size * mark) / 50_000_000)
        const price = action === 'liquidation' ? mark : p.side === 'long' ? mark * (1 - slip) : mark * (1 + slip)
        const pnlRaw = p.side === 'long' ? (price - p.entry) * size : (p.entry - price) * size
        const fee = size * price * TAKER_FEE
        const marginPart = p.margin * (size / p.size)
        let pnl = pnlRaw - fee
        if (action === 'liquidation') pnl = -marginPart
        const returned = Math.max(0, marginPart + pnl)
        const remaining = p.size - size
        const positions = remaining > 1e-9 ? s.positions.map((x) => (x.id === id ? { ...x, size: remaining, margin: x.margin - marginPart, realized: x.realized + pnl, fees: x.fees + fee } : x)) : s.positions.filter((x) => x.id !== id)
        const finalAction: Fill['action'] = action === 'close' && remaining > 1e-9 ? 'partial' : action
        set({
          balance: s.balance + returned,
          positions,
          fills: [{ id: uid(), coin: p.coin, side: p.side, action: finalAction, size, price, notional: size * price, fee, pnl, time: Date.now(), leverage: p.leverage }, ...s.fills].slice(0, 500),
        })
        const label = action === 'liquidation' ? 'Liquidated' : action === 'tp' ? 'Take profit hit' : action === 'sl' ? 'Stop loss hit' : remaining > 1e-9 ? 'Partially closed' : 'Closed'
        toast({ kind: pnl >= 0 ? 'success' : 'error', title: `${label} ${p.side} ${p.coin}`, body: `PnL ${usd(pnl, { sign: true })} (${pct((pnl / marginPart) * 100)})` })
        notify({ kind: action === 'liquidation' ? 'liquidation' : action === 'tp' ? 'tp' : action === 'sl' ? 'sl' : 'close', title: `${label} ${p.side} ${p.coin} ${p.leverage.toFixed(0)}x`, body: `${size} ${p.coin} @ ${usd(price)} · PnL ${usd(pnl, { sign: true })}`, href: '/portfolio' })
        return pnl
      },

      setTpSl: (id, tp, sl) => {
        set((s) => ({ positions: s.positions.map((p) => (p.id === id ? { ...p, tp, sl } : p)) }))
        toast({ kind: 'info', title: 'TP / SL updated' })
      },

      tick: (mids) => {
        const s = get()
        // liquidations, TP, SL
        for (const p of s.positions) {
          const m = mids[p.coin]
          if (!(m > 0)) continue
          const liq = p.side === 'long' ? m <= p.liq : m >= p.liq
          if (liq) {
            get().closePosition(p.id, p.liq, 1, 'liquidation')
            continue
          }
          if (p.tp && (p.side === 'long' ? m >= p.tp : m <= p.tp)) {
            get().closePosition(p.id, p.tp, 1, 'tp')
            continue
          }
          if (p.sl && (p.side === 'long' ? m <= p.sl : m >= p.sl)) {
            get().closePosition(p.id, p.sl, 1, 'sl')
            continue
          }
        }
        // limit fills
        for (const o of get().orders) {
          const m = mids[o.coin]
          if (!(m > 0)) continue
          const crossed = o.side === 'long' ? m <= o.price : m >= o.price
          if (!crossed) continue
          const st = get()
          const notional = o.size * o.price
          const fee = notional * MAKER_FEE
          if (o.margin + fee > st.balance) {
            set({ orders: st.orders.filter((x) => x.id !== o.id) })
            toast({ kind: 'error', title: `Limit ${o.coin} rejected`, body: 'Insufficient balance at fill time.' })
            continue
          }
          const pos: Position = { id: uid(), coin: o.coin, side: o.side, size: o.size, entry: o.price, leverage: o.leverage, margin: o.margin, liq: liqPrice(o.price, o.side, o.leverage, o.maxLeverage), openedAt: Date.now(), tp: o.tp ?? null, sl: o.sl ?? null, fees: fee, realized: 0, maxLeverage: o.maxLeverage }
          set({
            balance: st.balance - o.margin - fee,
            orders: st.orders.filter((x) => x.id !== o.id),
            positions: [pos, ...st.positions],
            fills: [{ id: uid(), coin: o.coin, side: o.side, action: 'open' as const, size: o.size, price: o.price, notional, fee, pnl: 0, time: Date.now(), leverage: o.leverage }, ...st.fills].slice(0, 500),
          })
          toast({ kind: o.side, title: `Limit ${o.side} ${o.coin} filled`, body: `${o.size} ${o.coin} @ ${usd(o.price)}` })
          notify({ kind: 'fill', title: `Limit filled: ${o.side} ${o.coin} ${o.leverage.toFixed(0)}x`, body: `${o.size} ${o.coin} @ ${usd(o.price)}`, href: `/trade/${o.coin}` })
        }
        // equity sample (every ~30s)
        const st = get()
        const last = st.equityHistory[st.equityHistory.length - 1]
        const now = Date.now()
        if (!last || now - last.t > 30_000) {
          const eq = st.balance + st.positions.reduce((a, p) => a + p.margin + unrealized(p, mids[p.coin] ?? p.entry), 0)
          set({ equityHistory: [...st.equityHistory, { t: now, v: eq }].slice(-2000) })
        }
      },

      deposit: (amount) => {
        set((s) => ({ balance: s.balance + amount, totalDeposited: s.totalDeposited + amount }))
        toast({ kind: 'success', title: `Deposited ${usd(amount)}`, body: 'Paper USDC added to your desk balance.' })
        notify({ kind: 'system', title: `Deposited ${usd(amount)} paper USDC` })
      },

      reset: () => {
        set({ balance: START_BALANCE, positions: [], orders: [], fills: [], equityHistory: [], totalDeposited: START_BALANCE })
        toast({ kind: 'info', title: 'Desk reset', body: `Balance restored to ${usd(START_BALANCE)}.` })
      },
    }),
    { name: 'perpcast:trading' },
  ),
)

export function fillNotionalOf(f: Fill) {
  return fillNotional(f.size, f.price)
}
