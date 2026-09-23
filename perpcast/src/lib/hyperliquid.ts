const INFO_URL = 'https://api.hyperliquid.xyz/info'
const WS_URL = 'wss://api.hyperliquid.xyz/ws'

export interface Market {
  coin: string
  szDecimals: number
  maxLeverage: number
  markPx: number
  midPx: number
  oraclePx: number
  prevDayPx: number
  dayNtlVlm: number
  funding: number
  openInterest: number
  premium: number
}

export interface Candle {
  time: number // seconds
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface BookLevel {
  px: number
  sz: number
  n: number
}
export interface L2Book {
  coin: string
  time: number
  bids: BookLevel[]
  asks: BookLevel[]
}

export interface Trade {
  coin: string
  side: 'B' | 'A'
  px: number
  sz: number
  time: number
  tid: number
}

export type Interval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d'
export const INTERVALS: Interval[] = ['1m', '5m', '15m', '1h', '4h', '1d']
export const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
}

async function info<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`hyperliquid ${res.status}`)
  return (await res.json()) as T
}

interface UniverseAsset {
  name: string
  szDecimals: number
  maxLeverage: number
  isDelisted?: boolean
}
interface AssetCtx {
  funding: string
  openInterest: string
  prevDayPx: string
  dayNtlVlm: string
  premium: string | null
  oraclePx: string
  markPx: string
  midPx: string | null
}

export async function fetchMarkets(): Promise<Market[]> {
  const [meta, ctxs] = await info<[{ universe: UniverseAsset[] }, AssetCtx[]]>({ type: 'metaAndAssetCtxs' })
  const out: Market[] = []
  meta.universe.forEach((u, i) => {
    const c = ctxs[i]
    if (!c || u.isDelisted) return
    const mark = parseFloat(c.markPx)
    if (!isFinite(mark) || mark <= 0) return
    out.push({
      coin: u.name,
      szDecimals: u.szDecimals,
      maxLeverage: u.maxLeverage,
      markPx: mark,
      midPx: c.midPx ? parseFloat(c.midPx) : mark,
      oraclePx: parseFloat(c.oraclePx),
      prevDayPx: parseFloat(c.prevDayPx),
      dayNtlVlm: parseFloat(c.dayNtlVlm),
      funding: parseFloat(c.funding),
      openInterest: parseFloat(c.openInterest),
      premium: c.premium ? parseFloat(c.premium) : 0,
    })
  })
  out.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm)
  return out
}

interface RawCandle {
  t: number
  o: string
  h: string
  l: string
  c: string
  v: string
}
export async function fetchCandles(coin: string, interval: Interval, bars = 300): Promise<Candle[]> {
  const end = Date.now()
  const start = end - INTERVAL_MS[interval] * bars
  const raw = await info<RawCandle[]>({ type: 'candleSnapshot', req: { coin, interval, startTime: start, endTime: end } })
  return raw.map((c) => ({
    time: Math.floor(c.t / 1000),
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
  }))
}

interface RawLevel {
  px: string
  sz: string
  n: number
}
function parseBook(coin: string, time: number, levels: [RawLevel[], RawLevel[]]): L2Book {
  const conv = (l: RawLevel): BookLevel => ({ px: parseFloat(l.px), sz: parseFloat(l.sz), n: l.n })
  return { coin, time, bids: levels[0].map(conv), asks: levels[1].map(conv) }
}

export async function fetchBook(coin: string): Promise<L2Book> {
  const raw = await info<{ coin: string; time: number; levels: [RawLevel[], RawLevel[]] }>({ type: 'l2Book', coin, nSigFigs: 5 })
  return parseBook(raw.coin, raw.time, raw.levels)
}

// ---------------- websocket ----------------

type Listener = (data: unknown) => void

class HLSocket {
  private ws: WebSocket | null = null
  private subs = new Map<string, { sub: Record<string, unknown>; listeners: Set<Listener> }>()
  private retry = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private ping: ReturnType<typeof setInterval> | null = null
  private opening = false
  status: 'idle' | 'connecting' | 'open' | 'closed' = 'idle'
  private statusListeners = new Set<(s: HLSocket['status']) => void>()

  onStatus(fn: (s: HLSocket['status']) => void) {
    this.statusListeners.add(fn)
    fn(this.status)
    return () => this.statusListeners.delete(fn)
  }
  private setStatus(s: HLSocket['status']) {
    this.status = s
    this.statusListeners.forEach((f) => f(s))
  }

  private ensure() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.opening) return
    this.opening = true
    this.setStatus('connecting')
    const ws = new WebSocket(WS_URL)
    this.ws = ws
    ws.onopen = () => {
      this.opening = false
      this.retry = 0
      this.setStatus('open')
      this.subs.forEach((s) => ws.send(JSON.stringify({ method: 'subscribe', subscription: s.sub })))
      if (this.ping) clearInterval(this.ping)
      this.ping = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ method: 'ping' }))
      }, 40_000)
    }
    ws.onmessage = (ev) => {
      let msg: { channel?: string; data?: unknown }
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return
      }
      if (!msg.channel || msg.channel === 'pong' || msg.channel === 'subscriptionResponse') return
      const d = msg.data as Record<string, unknown> | undefined
      let key = msg.channel
      if (msg.channel === 'l2Book' && d && typeof d.coin === 'string') key = `l2Book:${d.coin}`
      else if (msg.channel === 'trades' && Array.isArray(d) && d.length) key = `trades:${(d[0] as { coin: string }).coin}`
      else if (msg.channel === 'candle' && d && typeof d.s === 'string') key = `candle:${d.s}:${d.i as string}`
      const s = this.subs.get(key)
      s?.listeners.forEach((l) => l(msg.data))
    }
    ws.onclose = () => {
      this.opening = false
      this.setStatus('closed')
      if (this.ping) clearInterval(this.ping)
      if (this.subs.size) this.scheduleReconnect()
    }
    ws.onerror = () => {
      ws.close()
    }
  }

  private scheduleReconnect() {
    if (this.timer) return
    const delay = Math.min(15_000, 800 * 2 ** this.retry++)
    this.timer = setTimeout(() => {
      this.timer = null
      this.ensure()
    }, delay)
  }

  subscribe(key: string, sub: Record<string, unknown>, listener: Listener): () => void {
    let entry = this.subs.get(key)
    if (!entry) {
      entry = { sub, listeners: new Set() }
      this.subs.set(key, entry)
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: 'subscribe', subscription: sub }))
    }
    entry.listeners.add(listener)
    this.ensure()
    return () => {
      const e = this.subs.get(key)
      if (!e) return
      e.listeners.delete(listener)
      if (e.listeners.size === 0) {
        this.subs.delete(key)
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription: sub }))
      }
    }
  }
}

export const hlSocket = new HLSocket()

export function subscribeAllMids(fn: (mids: Record<string, number>) => void) {
  return hlSocket.subscribe('allMids', { type: 'allMids' }, (data) => {
    const d = data as { mids: Record<string, string> }
    if (!d?.mids) return
    const out: Record<string, number> = {}
    for (const k in d.mids) {
      if (k.startsWith('@')) continue
      out[k] = parseFloat(d.mids[k])
    }
    fn(out)
  })
}

export function subscribeBook(coin: string, fn: (book: L2Book) => void) {
  return hlSocket.subscribe(`l2Book:${coin}`, { type: 'l2Book', coin, nSigFigs: 5 }, (data) => {
    const d = data as { coin: string; time: number; levels: [RawLevel[], RawLevel[]] }
    if (d?.levels) fn(parseBook(d.coin, d.time, d.levels))
  })
}

export function subscribeTrades(coin: string, fn: (trades: Trade[]) => void) {
  return hlSocket.subscribe(`trades:${coin}`, { type: 'trades', coin }, (data) => {
    const d = data as Array<{ coin: string; side: 'B' | 'A'; px: string; sz: string; time: number; tid: number }>
    if (Array.isArray(d)) fn(d.map((t) => ({ coin: t.coin, side: t.side, px: parseFloat(t.px), sz: parseFloat(t.sz), time: t.time, tid: t.tid })))
  })
}

export function subscribeCandle(coin: string, interval: Interval, fn: (c: Candle) => void) {
  return hlSocket.subscribe(`candle:${coin}:${interval}`, { type: 'candle', coin, interval }, (data) => {
    const c = data as RawCandle
    if (!c?.t) return
    fn({ time: Math.floor(c.t / 1000), open: parseFloat(c.o), high: parseFloat(c.h), low: parseFloat(c.l), close: parseFloat(c.c), volume: parseFloat(c.v) })
  })
}

export const COIN_META: Record<string, { name: string; color: string }> = {
  BTC: { name: 'Bitcoin', color: '#f7931a' },
  ETH: { name: 'Ethereum', color: '#627eea' },
  SOL: { name: 'Solana', color: '#9945ff' },
  HYPE: { name: 'Hyperliquid', color: '#50e3c2' },
  DOGE: { name: 'Dogecoin', color: '#c2a633' },
  XRP: { name: 'XRP', color: '#23292f' },
  BNB: { name: 'BNB', color: '#f3ba2f' },
  AVAX: { name: 'Avalanche', color: '#e84142' },
  LINK: { name: 'Chainlink', color: '#2a5ada' },
  SUI: { name: 'Sui', color: '#4da2ff' },
  ARB: { name: 'Arbitrum', color: '#28a0f0' },
  OP: { name: 'Optimism', color: '#ff0420' },
  PEPE: { name: 'Pepe', color: '#3d8b3d' },
  WIF: { name: 'dogwifhat', color: '#c8a27a' },
  APT: { name: 'Aptos', color: '#2dd8a3' },
  TIA: { name: 'Celestia', color: '#7b2bf9' },
  ADA: { name: 'Cardano', color: '#0033ad' },
  LTC: { name: 'Litecoin', color: '#bfbbbb' },
  NEAR: { name: 'NEAR', color: '#00ec97' },
  TON: { name: 'Toncoin', color: '#0098ea' },
  TRUMP: { name: 'Official Trump', color: '#d4af37' },
  FARTCOIN: { name: 'Fartcoin', color: '#8bd450' },
  ENA: { name: 'Ethena', color: '#3b6df6' },
  AAVE: { name: 'Aave', color: '#b6509e' },
  UNI: { name: 'Uniswap', color: '#ff007a' },
  DOT: { name: 'Polkadot', color: '#e6007a' },
  TAO: { name: 'Bittensor', color: '#2f2f2f' },
  WLD: { name: 'Worldcoin', color: '#1f1f1f' },
  ONDO: { name: 'Ondo', color: '#1b1b1b' },
  kPEPE: { name: 'Pepe (1000x)', color: '#3d8b3d' },
  kBONK: { name: 'Bonk (1000x)', color: '#f5a623' },
  kSHIB: { name: 'Shiba Inu (1000x)', color: '#ffa409' },
  BERA: { name: 'Berachain', color: '#e8a24b' },
  IP: { name: 'Story', color: '#111' },
  PUMP: { name: 'Pump.fun', color: '#22c55e' },
  ZORA: { name: 'Zora', color: '#000' },
  DEGEN: { name: 'Degen', color: '#a36efd' },
}

export function coinName(coin: string): string {
  return COIN_META[coin]?.name ?? coin
}
export function coinColor(coin: string): string {
  if (COIN_META[coin]) return COIN_META[coin].color
  let h = 0
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 65% 55%)`
}

export function roundToSz(size: number, szDecimals: number): number {
  const m = 10 ** szDecimals
  return Math.floor(size * m + 1e-9) / m
}
