const INFO_URL = 'https://api.hyperliquid.xyz/info'
const WS_URL = 'wss://api.hyperliquid.xyz/ws'

export type MarketCategory = 'crypto' | 'memes' | 'stocks' | 'rwa'

export const CATEGORIES: Array<{ id: MarketCategory | 'all' | 'favs'; label: string; hint: string }> = [
  { id: 'all', label: 'All', hint: 'Every perp market' },
  { id: 'favs', label: 'Favorites', hint: 'Markets you starred' },
  { id: 'crypto', label: 'Crypto', hint: 'Majors, L1s, DeFi' },
  { id: 'memes', label: 'Memes', hint: 'Dog coins, frogs and culture' },
  { id: 'stocks', label: 'Stocks', hint: 'Equities & ETFs via the xyz dex' },
  { id: 'rwa', label: 'RWAs', hint: 'Commodities, indices, FX, rates' },
]

export interface Market {
  coin: string // canonical symbol e.g. BTC, kPEPE, xyz:TSLA
  symbol: string // display symbol without dex prefix
  dex: string // '' for the main Hyperliquid dex
  category: MarketCategory
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

/** Builder-deployed perp dexes (HIP-3) that Perpcast lists next to the main dex. */
export const DEXES = ['', 'xyz']

const MEMES = new Set([
  'DOGE', 'kPEPE', 'PEPE', 'WIF', 'kBONK', 'BONK', 'kSHIB', 'SHIB', 'kFLOKI', 'FLOKI', 'TRUMP', 'MELANIA', 'FARTCOIN', 'PUMP', 'POPCAT', 'MEW', 'BRETT', 'MOODENG', 'GOAT', 'PNUT', 'kNEIRO', 'NEIROETH', 'CHILLGUY', 'SPX', 'AI16Z', 'VINE', 'TURBO', 'PENGU', 'BOME', 'kDOGS', 'DEGEN', 'PEOPLE', 'MEME', 'HPOS', 'kLUNC', 'MOG', 'WOJAK', 'TOSHI', 'PONKE', 'GIGA', 'BAN', 'ACT', 'MYRO', 'SLERF', 'SHIA', 'LADYS', 'PURR', 'ANIME', 'PIPPIN', 'TST', 'BROCCOLI', 'DOOD', 'HOUSE', 'USELESS', 'MOODENG', 'TRUMPCOIN', 'BABYDOGE', 'kBABYDOGE', 'YZY', 'WLFI', 'FLOCK', 'PEPECOIN', 'SNEK', 'kSNEK', 'DOG', 'NEIRO', 'APU', 'RETARDIO', 'MICHI', 'CAT', 'TITCOIN', 'FWOG', 'BUTTHOLE', 'GORK', 'CHEEMS', 'PWEASE', 'BOBO',
])

const RWA = new Set([
  'CL', 'BRENTOIL', 'NATGAS', 'TTF', 'HO', 'GOLD', 'SILVER', 'COPPER', 'PLATINUM', 'PALLADIUM', 'ALUMINIUM', 'URANIUM', 'CORN', 'WHEAT', 'DRAM', 'H100',
  'SP500', 'XYZ100', 'JP225', 'KR200', 'NIFTY', 'IBOV', 'VIX', 'VOL', 'DXY', 'EUR', 'GBP', 'JPY', 'KRW', 'TLT',
])

function categorize(dex: string, symbol: string): MarketCategory {
  if (dex === 'xyz') return RWA.has(symbol) ? 'rwa' : 'stocks'
  if (MEMES.has(symbol)) return 'memes'
  return 'crypto'
}

export function displaySymbol(coin: string): string {
  const i = coin.indexOf(':')
  return i >= 0 ? coin.slice(i + 1) : coin
}
export function dexOf(coin: string): string {
  const i = coin.indexOf(':')
  return i >= 0 ? coin.slice(0, i) : ''
}

async function fetchDexMarkets(dex: string): Promise<Market[]> {
  const [meta, ctxs] = await info<[{ universe: UniverseAsset[] }, AssetCtx[]]>(dex ? { type: 'metaAndAssetCtxs', dex } : { type: 'metaAndAssetCtxs' })
  const out: Market[] = []
  meta.universe.forEach((u, i) => {
    const c = ctxs[i]
    if (!c || u.isDelisted) return
    const mark = parseFloat(c.markPx)
    if (!isFinite(mark) || mark <= 0) return
    const symbol = displaySymbol(u.name)
    out.push({
      coin: u.name,
      symbol,
      dex,
      category: categorize(dex, symbol),
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
  return out
}

/** All markets across the main dex and the builder dexes Perpcast lists (stocks, RWAs). Builder dexes failing never hides the main dex. */
export async function fetchMarkets(): Promise<Market[]> {
  const results = await Promise.allSettled(DEXES.map((d) => fetchDexMarkets(d)))
  const main = results[0]
  if (main.status === 'rejected') throw main.reason instanceof Error ? main.reason : new Error(String(main.reason))
  const out = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
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
      if (msg.channel === 'allMids') key = `allMids:${typeof d?.dex === 'string' ? d.dex : ''}`
      else if (msg.channel === 'l2Book' && d && typeof d.coin === 'string') key = `l2Book:${d.coin}`
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
  const handler = (data: unknown) => {
    const d = data as { mids: Record<string, string> }
    if (!d?.mids) return
    const out: Record<string, number> = {}
    for (const k in d.mids) {
      if (k.startsWith('@')) continue
      out[k] = parseFloat(d.mids[k])
    }
    fn(out)
  }
  const offs = DEXES.map((dex) => hlSocket.subscribe(`allMids:${dex}`, dex ? { type: 'allMids', dex } : { type: 'allMids' }, handler))
  return () => offs.forEach((off) => off())
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

const XYZ_META: Record<string, { name: string; color: string }> = {
  TSLA: { name: 'Tesla', color: '#cc0000' },
  NVDA: { name: 'NVIDIA', color: '#76b900' },
  AAPL: { name: 'Apple', color: '#555555' },
  MSFT: { name: 'Microsoft', color: '#0078d4' },
  AMZN: { name: 'Amazon', color: '#ff9900' },
  GOOGL: { name: 'Alphabet', color: '#4285f4' },
  META: { name: 'Meta', color: '#0866ff' },
  AMD: { name: 'AMD', color: '#ed1c24' },
  INTC: { name: 'Intel', color: '#0071c5' },
  MU: { name: 'Micron', color: '#0084c9' },
  COIN: { name: 'Coinbase', color: '#0052ff' },
  HOOD: { name: 'Robinhood', color: '#00c805' },
  MSTR: { name: 'Strategy', color: '#e8542a' },
  CRCL: { name: 'Circle', color: '#1fb56b' },
  PLTR: { name: 'Palantir', color: '#101113' },
  NFLX: { name: 'Netflix', color: '#e50914' },
  ORCL: { name: 'Oracle', color: '#f80000' },
  TSM: { name: 'TSMC', color: '#c8102e' },
  ASML: { name: 'ASML', color: '#0f238c' },
  AVGO: { name: 'Broadcom', color: '#cc092f' },
  GME: { name: 'GameStop', color: '#000000' },
  RKLB: { name: 'Rocket Lab', color: '#1f1f1f' },
  SP500: { name: 'S&P 500', color: '#1d4ed8' },
  XYZ100: { name: 'XYZ 100', color: '#7c3aed' },
  JP225: { name: 'Nikkei 225', color: '#bc002d' },
  KR200: { name: 'KOSPI 200', color: '#0047a0' },
  NIFTY: { name: 'Nifty 50', color: '#ff9933' },
  IBOV: { name: 'Ibovespa', color: '#009c3b' },
  VIX: { name: 'VIX', color: '#7f1d1d' },
  DXY: { name: 'US Dollar Index', color: '#14532d' },
  GOLD: { name: 'Gold', color: '#d4a017' },
  SILVER: { name: 'Silver', color: '#a8a9ad' },
  COPPER: { name: 'Copper', color: '#b87333' },
  PLATINUM: { name: 'Platinum', color: '#8e8e93' },
  PALLADIUM: { name: 'Palladium', color: '#6b7280' },
  ALUMINIUM: { name: 'Aluminium', color: '#94a3b8' },
  URANIUM: { name: 'Uranium', color: '#65a30d' },
  CL: { name: 'WTI Crude Oil', color: '#1f2937' },
  BRENTOIL: { name: 'Brent Crude', color: '#374151' },
  NATGAS: { name: 'Natural Gas', color: '#0ea5e9' },
  TTF: { name: 'Dutch TTF Gas', color: '#0284c7' },
  HO: { name: 'Heating Oil', color: '#4b5563' },
  CORN: { name: 'Corn', color: '#eab308' },
  WHEAT: { name: 'Wheat', color: '#ca8a04' },
  EUR: { name: 'Euro / USD', color: '#003399' },
  GBP: { name: 'Pound / USD', color: '#012169' },
  JPY: { name: 'Yen / USD', color: '#bc002d' },
  KRW: { name: 'Won / USD', color: '#0047a0' },
  TLT: { name: '20Y+ Treasury ETF', color: '#166534' },
  DRAM: { name: 'DRAM Index', color: '#3b82f6' },
  H100: { name: 'H100 GPU Rental', color: '#76b900' },
}

function metaOf(coin: string): { name: string; color: string } | undefined {
  return dexOf(coin) === 'xyz' ? XYZ_META[displaySymbol(coin)] : COIN_META[coin]
}

export function coinName(coin: string): string {
  return metaOf(coin)?.name ?? displaySymbol(coin)
}
export function coinColor(coin: string): string {
  const m = metaOf(coin)
  if (m) return m.color
  let h = 0
  for (let i = 0; i < coin.length; i++) h = (h * 31 + coin.charCodeAt(i)) >>> 0
  return `hsl(${h % 360} 65% 55%)`
}

export function roundToSz(size: number, szDecimals: number): number {
  const m = 10 ** szDecimals
  return Math.floor(size * m + 1e-9) / m
}
