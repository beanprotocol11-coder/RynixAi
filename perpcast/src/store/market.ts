import { create } from 'zustand'
import { fetchMarkets, subscribeAllMids, hlSocket, type Market } from '../lib/hyperliquid'
import { useTrading } from './trading'

interface MarketState {
  markets: Market[]
  byCoin: Record<string, Market>
  mids: Record<string, number>
  loaded: boolean
  error: string | null
  wsStatus: 'idle' | 'connecting' | 'open' | 'closed'
  lastUpdate: number
  start: () => void
}

let started = false
let unsubMids: (() => void) | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null
let pendingMids: Record<string, number> | null = null
let raf = 0

export const useMarket = create<MarketState>()((set, get) => ({
  markets: [],
  byCoin: {},
  mids: {},
  loaded: false,
  error: null,
  wsStatus: 'idle',
  lastUpdate: 0,
  start: () => {
    if (started) return
    started = true
    const load = async () => {
      try {
        const markets = await fetchMarkets()
        const byCoin: Record<string, Market> = {}
        const mids = { ...get().mids }
        markets.forEach((m) => {
          byCoin[m.coin] = m
          if (!mids[m.coin]) mids[m.coin] = m.midPx
        })
        set({ markets, byCoin, mids, loaded: true, error: null, lastUpdate: Date.now() })
      } catch (e) {
        set({ error: (e as Error).message, loaded: get().markets.length > 0 })
      }
    }
    void load()
    refreshTimer = setInterval(load, 60_000)
    hlSocket.onStatus((s) => set({ wsStatus: s }))
    unsubMids = subscribeAllMids((mids) => {
      pendingMids = { ...(pendingMids ?? {}), ...mids }
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (!pendingMids) return
        const merged = { ...get().mids, ...pendingMids }
        pendingMids = null
        set({ mids: merged, lastUpdate: Date.now() })
        useTrading.getState().tick(merged)
      })
    })
  },
}))

export function stopMarket() {
  unsubMids?.()
  if (refreshTimer) clearInterval(refreshTimer)
  started = false
}

export function change24h(m: Market, mid?: number): number {
  const p = mid ?? m.midPx
  if (!m.prevDayPx) return 0
  return ((p - m.prevDayPx) / m.prevDayPx) * 100
}
