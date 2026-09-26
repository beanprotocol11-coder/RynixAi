/**
 * Robinhood Chain onchain markets (Pons launchpad tokens) via GeckoTerminal's public API.
 * The free tier is ~30 req/min per IP, so every response is cached in memory + localStorage and
 * a 429 falls back to the last good snapshot instead of failing the page.
 */
const GT = 'https://api.geckoterminal.com/api/v2'
const NETWORK = 'robinhood'
const HEADERS = { Accept: 'application/json;version=20230302' }
const TTL_MS = 120_000

export type PonsVenue = 'pons-v1' | 'pons-v2' | 'pons-v2-dex'

/** GeckoTerminal DEX ids for the Pons venues on Robinhood Chain. */
export const PONS_DEXES: Array<{ id: string; venue: PonsVenue; label: string }> = [
  { id: 'pons-v2', venue: 'pons-v2', label: 'Pons V2 · bonding curve' },
  { id: 'pons-v2-dex', venue: 'pons-v2-dex', label: 'Pons V2 · graduated (Uniswap V4)' },
  { id: 'pons-dot-family', venue: 'pons-v1', label: 'Pons V1' },
]

export const VENUE_LABEL: Record<PonsVenue, string> = { 'pons-v1': 'Pons V1', 'pons-v2': 'Pons V2', 'pons-v2-dex': 'Pons V2 · graduated' }

export interface PonsToken {
  address: string
  symbol: string
  name: string
  image: string | null
  poolAddress: string
  poolName: string
  venue: PonsVenue
  quoteSymbol: string
  quoteAddress: string
  priceUsd: number
  marketCap: number | null
  fdv: number | null
  liquidity: number
  volume24h: number
  change24h: number
  change1h: number
  txns24h: number
  createdAt: number
}

export interface PonsSnapshot {
  tokens: PonsToken[]
  fetchedAt: number
  stale: boolean
  partial: boolean
}

interface GtToken {
  id: string
  type: 'token'
  attributes: { address: string; name: string; symbol: string; image_url: string | null }
}

interface GtPool {
  id: string
  type: 'pool'
  attributes: {
    name: string
    address: string
    base_token_price_usd: string | null
    market_cap_usd: string | null
    fdv_usd: string | null
    reserve_in_usd: string | null
    pool_created_at: string
    price_change_percentage: { h1?: string; h24?: string }
    transactions: { h24?: { buys: number; sells: number } }
    volume_usd: { h24?: string }
  }
  relationships: {
    base_token: { data: { id: string } }
    quote_token: { data: { id: string } }
  }
}

interface GtResponse {
  data?: GtPool[]
  included?: Array<GtToken | { id: string; type: string }>
  status?: { error_code: number; error_message: string }
}

export class RateLimitError extends Error {
  constructor() {
    super('GeckoTerminal rate limit reached — showing the last snapshot')
  }
}

const num = (s: string | null | undefined): number | null => {
  if (s == null) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function isToken(x: { type: string }): x is GtToken {
  return x.type === 'token'
}

function parsePools(res: GtResponse, venue: PonsVenue): PonsToken[] {
  const tokens = new Map<string, GtToken>()
  for (const inc of res.included ?? []) if (isToken(inc)) tokens.set(inc.id, inc)
  const out: PonsToken[] = []
  for (const p of res.data ?? []) {
    const base = tokens.get(p.relationships.base_token.data.id)
    const quote = tokens.get(p.relationships.quote_token.data.id)
    if (!base) continue
    const a = p.attributes
    out.push({
      address: base.attributes.address.toLowerCase(),
      symbol: base.attributes.symbol,
      name: base.attributes.name,
      image: base.attributes.image_url && !/missing/i.test(base.attributes.image_url) ? base.attributes.image_url : null,
      poolAddress: a.address,
      poolName: a.name,
      venue,
      quoteSymbol: quote?.attributes.symbol ?? 'ETH',
      quoteAddress: quote?.attributes.address ?? '',
      priceUsd: num(a.base_token_price_usd) ?? 0,
      marketCap: num(a.market_cap_usd),
      fdv: num(a.fdv_usd),
      liquidity: num(a.reserve_in_usd) ?? 0,
      volume24h: num(a.volume_usd?.h24) ?? 0,
      change24h: num(a.price_change_percentage?.h24) ?? 0,
      change1h: num(a.price_change_percentage?.h1) ?? 0,
      txns24h: (a.transactions?.h24?.buys ?? 0) + (a.transactions?.h24?.sells ?? 0),
      createdAt: Date.parse(a.pool_created_at) || 0,
    })
  }
  return out
}

async function gtFetch<T>(path: string): Promise<T> {
  const r = await fetch(`${GT}${path}`, { headers: HEADERS })
  if (r.status === 429) throw new RateLimitError()
  if (!r.ok) throw new Error(`GeckoTerminal ${r.status}`)
  return (await r.json()) as T
}

/** Rank: real market cap first, then FDV as a proxy, then liquidity. Never invents a number. */
export function valuation(t: PonsToken): number {
  return t.marketCap ?? t.fdv ?? 0
}

export function rankByValuation(tokens: PonsToken[]): PonsToken[] {
  return [...tokens].sort((a, b) => valuation(b) - valuation(a) || b.liquidity - a.liquidity || b.volume24h - a.volume24h)
}

const KEY = 'perpcast:pons:snapshot:v1'
let mem: PonsSnapshot | null = null
let inflight: Promise<PonsSnapshot> | null = null

function readCache(): PonsSnapshot | null {
  if (mem) return mem
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as PonsSnapshot
    if (!Array.isArray(s.tokens)) return null
    mem = s
    return s
  } catch {
    return null
  }
}

function writeCache(s: PonsSnapshot) {
  mem = s
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* quota */
  }
}

/** Every Pons venue, deduplicated per base token (keeps the pool with the most liquidity). */
export async function fetchPonsTokens(opts: { force?: boolean } = {}): Promise<PonsSnapshot> {
  const cached = readCache()
  if (!opts.force && cached && Date.now() - cached.fetchedAt < TTL_MS) return { ...cached, stale: false }
  if (inflight) return inflight
  inflight = (async () => {
    const results = await Promise.allSettled(PONS_DEXES.map((d) => gtFetch<GtResponse>(`/networks/${NETWORK}/dexes/${d.id}/pools?page=1&sort=h24_volume_usd_desc&include=base_token,quote_token`).then((r) => parsePools(r, d.venue))))
    const ok = results.filter((r): r is PromiseFulfilledResult<PonsToken[]> => r.status === 'fulfilled')
    if (ok.length === 0) {
      if (cached) return { ...cached, stale: true }
      const first = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')
      throw first?.reason instanceof Error ? first.reason : new Error('Could not load Robinhood Chain markets')
    }
    const byToken = new Map<string, PonsToken>()
    for (const t of ok.flatMap((r) => r.value)) {
      const prev = byToken.get(t.address)
      if (!prev || t.liquidity > prev.liquidity) byToken.set(t.address, t)
    }
    let tokens = rankByValuation(Array.from(byToken.values()))
    const partial = ok.length < PONS_DEXES.length
    if (partial && cached) {
      // Merge venues that failed this round from the previous snapshot so the list doesn't shrink.
      const okVenues = new Set(tokens.map((t) => t.venue))
      const carry = cached.tokens.filter((t) => !okVenues.has(t.venue) && !byToken.has(t.address))
      tokens = rankByValuation([...tokens, ...carry])
    }
    const snap: PonsSnapshot = { tokens, fetchedAt: Date.now(), stale: false, partial }
    writeCache(snap)
    return snap
  })().finally(() => {
    inflight = null
  })
  return inflight
}

export interface Ohlc {
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type PonsTimeframe = '5m' | '15m' | '1h' | '4h' | '1d'

const TF_PATH: Record<PonsTimeframe, string> = { '5m': 'minute?aggregate=5', '15m': 'minute?aggregate=15', '1h': 'hour?aggregate=1', '4h': 'hour?aggregate=4', '1d': 'day?aggregate=1' }

const ohlcCache = new Map<string, { at: number; data: Ohlc[] }>()

export async function fetchPoolOhlc(pool: string, tf: PonsTimeframe): Promise<Ohlc[]> {
  const key = `${pool}:${tf}`
  const c = ohlcCache.get(key)
  if (c && Date.now() - c.at < 60_000) return c.data
  try {
    const r = await gtFetch<{ data?: { attributes: { ohlcv_list: number[][] } } }>(`/networks/${NETWORK}/pools/${pool}/ohlcv/${TF_PATH[tf]}&limit=300&currency=usd`)
    const list = r.data?.attributes.ohlcv_list ?? []
    const data = list
      .map(([t, o, h, l, cl, v]) => ({ time: t, open: o, high: h, low: l, close: cl, volume: v }))
      .sort((a, b) => a.time - b.time)
    ohlcCache.set(key, { at: Date.now(), data })
    return data
  } catch (e) {
    if (c) return c.data
    throw e
  }
}

export function geckoPoolUrl(pool: string): string {
  return `https://www.geckoterminal.com/${NETWORK}/pools/${pool}`
}

export function findPonsToken(tokens: PonsToken[], addressOrSymbol: string): PonsToken | undefined {
  const k = addressOrSymbol.toLowerCase()
  return tokens.find((t) => t.address === k) ?? tokens.find((t) => t.symbol.toLowerCase() === k)
}
