/**
 * Real NFT collections on Robinhood Chain, read live from the chain explorer (Blockscout API v2).
 * Collections are ranked by holder count; LP-position NFTs (Uniswap etc.) are filtered out since
 * they are not art collections. Responses are cached in memory + localStorage.
 */
const BS = 'https://robinhoodchain.blockscout.com/api/v2'
const TTL_MS = 300_000
const LS_KEY = 'perpcast.nfts.v2'

export interface NftCollection {
  address: string
  name: string
  symbol: string
  type: 'ERC-721' | 'ERC-1155'
  holders: number
  supply: number | null
  icon: string | null
  /** Filled lazily from the first minted item. */
  cover: string | null
}

export interface NftItem {
  id: string
  name: string
  image: string | null
  owner: string | null
  collection: string
}

interface BsToken {
  address_hash: string
  name: string | null
  symbol: string | null
  type: string
  holders_count: string | null
  total_supply: string | null
  icon_url: string | null
}
interface BsList<T> {
  items: T[]
  next_page_params: Record<string, string | number> | null
}
interface BsInstance {
  id: string
  image_url: string | null
  media_url?: string | null
  metadata: { name?: string; image?: string } | null
  owner: { hash: string } | null
  thumbnails?: { '250x250'?: string; '500x500'?: string } | null
}

const POSITION_RE = /position|uniswap|liquidity|fee beneficiary|-pos\b|posm|receipt/i

async function get<T>(path: string, retry = 1): Promise<T> {
  const res = await fetch(`${BS}${path}`, { headers: { Accept: 'application/json' } })
  if (res.status === 429 && retry > 0) {
    await new Promise((r) => setTimeout(r, 1500))
    return get<T>(path, retry - 1)
  }
  if (!res.ok) throw new Error(res.status === 429 ? 'Explorer is rate-limiting — try again in a moment' : `Explorer responded ${res.status}`)
  return (await res.json()) as T
}

function toCollection(t: BsToken): NftCollection | null {
  if (!t.name || (t.type !== 'ERC-721' && t.type !== 'ERC-1155')) return null
  if (POSITION_RE.test(t.name) || POSITION_RE.test(t.symbol ?? '')) return null
  return {
    address: t.address_hash,
    name: t.name,
    symbol: t.symbol ?? '',
    type: t.type,
    holders: Number(t.holders_count ?? 0),
    supply: t.total_supply ? Number(t.total_supply) : null,
    icon: nftImageUrl(t.icon_url),
    cover: null,
  }
}

let mem: { at: number; list: NftCollection[] } | null = null

export async function fetchCollections(opts: { force?: boolean } = {}): Promise<NftCollection[]> {
  if (!opts.force) {
    if (mem && Date.now() - mem.at < TTL_MS) return mem.list
    try {
      const raw = localStorage.getItem(LS_KEY)
      if (raw) {
        const c = JSON.parse(raw) as { at: number; list: NftCollection[] }
        if (Date.now() - c.at < TTL_MS) {
          mem = c
          return c.list
        }
      }
    } catch {
      /* ignore */
    }
  }
  const out: NftCollection[] = []
  let params: Record<string, string | number> | null = null
  for (let page = 0; page < 2; page++) {
    const qs = new URLSearchParams({ type: 'ERC-721,ERC-1155' })
    if (params) for (const [k, v] of Object.entries(params)) qs.set(k, String(v))
    const data: BsList<BsToken> = await get(`/tokens?${qs.toString()}`)
    for (const t of data.items) {
      const c = toCollection(t)
      if (c) out.push(c)
    }
    params = data.next_page_params
    if (!params) break
  }
  out.sort((a, b) => b.holders - a.holders)
  mem = { at: Date.now(), list: out }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(mem))
  } catch {
    /* ignore */
  }
  return out
}

export async function fetchCollection(address: string): Promise<NftCollection | null> {
  const cached = mem?.list.find((c) => c.address.toLowerCase() === address.toLowerCase())
  if (cached) return cached
  const t: BsToken = await get(`/tokens/${address}`)
  return toCollection(t)
}

const GATEWAY_RE = /^https?:\/\/(?:dweb\.link|ipfs\.io|cloudflare-ipfs\.com|gateway\.pinata\.cloud|nftstorage\.link|w3s\.link)\/ipfs\//i

/** Normalise ipfs:// and flaky public gateways onto one fast gateway. */
export function nftImageUrl(u: string | null | undefined): string | null {
  if (!u) return null
  if (u.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${u.slice(7).replace(/^ipfs\//, '')}`
  return u.replace(GATEWAY_RE, 'https://ipfs.io/ipfs/')
}

/** Alternate gateway used by <img onError>. */
export function nftImageFallback(u: string): string | null {
  return /https:\/\/ipfs\.io\/ipfs\//.test(u) ? u.replace('https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/') : null
}

function pickImage(i: BsInstance): string | null {
  return nftImageUrl(i.thumbnails?.['500x500'] ?? i.image_url ?? i.media_url ?? i.metadata?.image ?? null)
}

export async function fetchItems(address: string, cursor?: Record<string, string | number> | null): Promise<{ items: NftItem[]; next: Record<string, string | number> | null }> {
  const qs = new URLSearchParams()
  if (cursor) for (const [k, v] of Object.entries(cursor)) qs.set(k, String(v))
  const data: BsList<BsInstance> = await get(`/tokens/${address}/instances${qs.size ? `?${qs}` : ''}`)
  return {
    items: data.items.map((i) => ({
      id: i.id,
      name: i.metadata?.name?.trim() || `#${i.id}`,
      image: pickImage(i),
      owner: i.owner?.hash ?? null,
      collection: address,
    })),
    next: data.next_page_params,
  }
}

const coverCache = new Map<string, Promise<string | null>>()
const COVER_LS = 'perpcast.nfts.covers.v1'
const coverStore: Record<string, string | null> = (() => {
  try {
    return JSON.parse(localStorage.getItem(COVER_LS) ?? '{}') as Record<string, string | null>
  } catch {
    return {}
  }
})()

/** The explorer rate-limits bursts, so cover lookups run through a small worker pool. */
const queue: Array<() => void> = []
let running = 0
const MAX_PARALLEL = 3
function schedule<T>(job: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => {
      running++
      job()
        .then(resolve, reject)
        .finally(() => {
          running--
          queue.shift()?.()
        })
    }
    if (running < MAX_PARALLEL) run()
    else queue.push(run)
  })
}

/** First item image of a collection, used as the card cover. */
export function fetchCover(address: string): Promise<string | null> {
  const key = address.toLowerCase()
  if (key in coverStore) return Promise.resolve(coverStore[key])
  let p = coverCache.get(key)
  if (!p) {
    p = schedule(() => fetchItems(address))
      .then((r) => r.items.find((i) => i.image)?.image ?? null)
      .then((u) => {
        coverStore[key] = u
        try {
          localStorage.setItem(COVER_LS, JSON.stringify(coverStore))
        } catch {
          /* ignore */
        }
        return u
      })
      .catch(() => null)
    coverCache.set(key, p)
  }
  return p
}

export function explorerNft(address: string, id?: string) {
  return id ? `https://robinhoodchain.blockscout.com/token/${address}/instance/${id}` : `https://robinhoodchain.blockscout.com/token/${address}`
}
