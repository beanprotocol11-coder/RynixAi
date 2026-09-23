import { fcTimeToMs } from './format'

const HUBS = ['https://snap.farcaster.xyz:3381', 'https://hub.pinata.cloud']

export interface FcUser {
  fid: number
  username: string
  displayName: string
  pfp: string
  bio: string
}

export interface FcEmbed {
  url?: string
  castId?: { fid: number; hash: string }
}

export interface Cast {
  id: string // `${fid}:${hash}` for hub casts, local id for local
  fid: number
  hash: string
  text: string
  timestamp: number // ms
  parentUrl: string | null
  parent: { fid: number; hash: string } | null
  embeds: FcEmbed[]
  mentions: number[]
  mentionsPositions: number[]
  local?: boolean
  position?: PositionEmbed
  channel?: string | null
}

export interface PositionEmbed {
  coin: string
  side: 'long' | 'short'
  leverage: number
  entry: number
  size: number
  pnl?: number
  pnlPct?: number
}

interface HubCastMessage {
  data: {
    type: string
    fid: number
    timestamp: number
    castAddBody?: {
      text: string
      parentUrl?: string | null
      parentCastId?: { fid: number; hash: string } | null
      embeds?: Array<{ url?: string; castId?: { fid: number; hash: string } }>
      mentions?: number[]
      mentionsPositions?: number[]
    }
    userDataBody?: { type: string; value: string }
    reactionBody?: { type: string; targetCastId?: { fid: number; hash: string } }
    linkBody?: { type: string; targetFid: number }
  }
  hash: string
}

interface HubPage<T> {
  messages: T[]
  nextPageToken?: string
}

export interface Channel {
  id: string
  name: string
  url: string
  description: string
  emoji: string
  accent: string
}

export const CHANNELS: Channel[] = [
  { id: 'farcaster', name: 'Farcaster', url: 'chain://eip155:7777777/erc721:0x4f86113fc3e9783cf3ec9a552cbb566716a57628', description: 'Discussions about Farcaster on Farcaster', emoji: '🟣', accent: '#8a63d2' },
  { id: 'degen', name: 'Degen', url: 'chain://eip155:7777777/erc721:0x5d6a07d07354f8793d1ca06280c4adf04767ad7e', description: 'Tip, trade and talk $DEGEN', emoji: '🎩', accent: '#a36efd' },
  { id: 'base', name: 'Base', url: 'https://onchainsummer.xyz', description: 'Building onchain, on Base', emoji: '🔵', accent: '#0052ff' },
  { id: 'ethereum', name: 'Ethereum', url: 'https://ethereum.org', description: 'The world computer', emoji: '💎', accent: '#627eea' },
  { id: 'bitcoin', name: 'Bitcoin', url: 'https://bitcoin.org', description: 'Sound money and orange coin talk', emoji: '🟠', accent: '#f7931a' },
  { id: 'hyperliquid', name: 'Hyperliquid', url: 'https://warpcast.com/~/channel/hyperliquid', description: 'The perps venue powering Perpcast markets', emoji: '💧', accent: '#50e3c2' },
  { id: 'memes', name: 'Memes', url: 'chain://eip155:1/erc721:0xfd8427165df67df6d7fd689ae67c8ebf56d9ca61', description: 'Only the dankest', emoji: '😹', accent: '#f5b301' },
  { id: 'dev', name: 'Dev', url: 'chain://eip155:1/erc721:0x7dd4e31f1530ac682c8ea4d8016e95773e08d8b0', description: 'Builders shipping onchain', emoji: '🛠️', accent: '#3ecf8e' },
  { id: 'founders', name: 'Founders', url: 'https://farcaster.group/founders', description: 'Startups, fundraising and lessons learned', emoji: '🚀', accent: '#ff7a45' },
  { id: 'perpcast', name: 'Perpcast', url: 'perpcast://channel/perpcast', description: 'Trade ideas, PnL flexes and market talk from Perpcast traders', emoji: '📈', accent: '#ff7a45' },
]

export const PERPCAST_CHANNEL_URL = 'perpcast://channel/perpcast'
export const MARKET_CHANNEL_PREFIX = 'perpcast://market/'

export function channelByUrl(url: string | null | undefined): Channel | undefined {
  if (!url) return undefined
  return CHANNELS.find((c) => c.url === url)
}
export function channelById(id: string): Channel | undefined {
  return CHANNELS.find((c) => c.id === id)
}

let hubIndex = 0
async function hubGet<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')
  let lastErr: unknown
  for (let attempt = 0; attempt < HUBS.length; attempt++) {
    const base = HUBS[(hubIndex + attempt) % HUBS.length]
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 9000)
      const res = await fetch(`${base}/v1/${path}?${qs}`, { signal: ctrl.signal })
      clearTimeout(t)
      if (!res.ok) throw new Error(`hub ${res.status}`)
      return (await res.json()) as T
    } catch (e) {
      lastErr = e
      hubIndex = (hubIndex + attempt + 1) % HUBS.length
    }
  }
  throw lastErr
}

export function castMessageToCast(m: HubCastMessage): Cast | null {
  const b = m.data.castAddBody
  if (!b || m.data.type !== 'MESSAGE_TYPE_CAST_ADD') return null
  return {
    id: `${m.data.fid}:${m.hash}`,
    fid: m.data.fid,
    hash: m.hash,
    text: b.text ?? '',
    timestamp: fcTimeToMs(m.data.timestamp),
    parentUrl: b.parentUrl ?? null,
    parent: b.parentCastId ?? null,
    embeds: (b.embeds ?? []).map((e) => ({ url: e.url, castId: e.castId })),
    mentions: b.mentions ?? [],
    mentionsPositions: b.mentionsPositions ?? [],
  }
}

export interface CastPage {
  casts: Cast[]
  next?: string
}

export async function fetchChannelCasts(url: string, pageSize = 25, pageToken?: string): Promise<CastPage> {
  const res = await hubGet<HubPage<HubCastMessage>>('castsByParent', { url, pageSize, reverse: true, pageToken })
  const casts = res.messages.map(castMessageToCast).filter((c): c is Cast => !!c)
  casts.sort((a, b) => b.timestamp - a.timestamp)
  return { casts, next: res.nextPageToken }
}

export async function fetchUserCasts(fid: number, pageSize = 25, pageToken?: string): Promise<CastPage> {
  const res = await hubGet<HubPage<HubCastMessage>>('castsByFid', { fid, pageSize, reverse: true, pageToken })
  const casts = res.messages.map(castMessageToCast).filter((c): c is Cast => !!c)
  return { casts, next: res.nextPageToken }
}

export async function fetchReplies(fid: number, hash: string, pageSize = 50): Promise<Cast[]> {
  const res = await hubGet<HubPage<HubCastMessage>>('castsByParent', { fid, hash, pageSize, reverse: true })
  const casts = res.messages.map(castMessageToCast).filter((c): c is Cast => !!c)
  casts.sort((a, b) => a.timestamp - b.timestamp)
  return casts
}

const castCache = new Map<string, Promise<Cast | null>>()
export function fetchCast(fid: number, hash: string): Promise<Cast | null> {
  const key = `${fid}:${hash}`
  let p = castCache.get(key)
  if (!p) {
    p = hubGet<HubCastMessage>('castById', { fid, hash })
      .then((m) => castMessageToCast(m))
      .catch(() => null)
    castCache.set(key, p)
  }
  return p
}

export interface CastStats {
  likes: number
  recasts: number
  replies: number
  capped: boolean
}

const STAT_CAP = 60
const statsCache = new Map<string, Promise<CastStats>>()
export function fetchCastStats(fid: number, hash: string): Promise<CastStats> {
  const key = `${fid}:${hash}`
  let p = statsCache.get(key)
  if (!p) {
    p = (async () => {
      const [likes, recasts, replies] = await Promise.all([
        hubGet<HubPage<unknown>>('reactionsByCast', { target_fid: fid, target_hash: hash, reaction_type: 'Like', pageSize: STAT_CAP }).catch(() => ({ messages: [] })),
        hubGet<HubPage<unknown>>('reactionsByCast', { target_fid: fid, target_hash: hash, reaction_type: 'Recast', pageSize: STAT_CAP }).catch(() => ({ messages: [] })),
        hubGet<HubPage<unknown>>('castsByParent', { fid, hash, pageSize: STAT_CAP }).catch(() => ({ messages: [] })),
      ])
      return {
        likes: likes.messages.length,
        recasts: recasts.messages.length,
        replies: replies.messages.length,
        capped: likes.messages.length >= STAT_CAP || recasts.messages.length >= STAT_CAP || replies.messages.length >= STAT_CAP,
      }
    })()
    statsCache.set(key, p)
  }
  return p
}

// ---------- users ----------

const userCache = new Map<number, Promise<FcUser>>()
const userStore = new Map<number, FcUser>()
const usernameToFid = new Map<string, number>()

export function cachedUser(fid: number): FcUser | undefined {
  return userStore.get(fid)
}

export function primeUser(u: FcUser) {
  userStore.set(u.fid, u)
  userCache.set(u.fid, Promise.resolve(u))
  if (u.username) usernameToFid.set(u.username.toLowerCase(), u.fid)
}

export function fetchUser(fid: number): Promise<FcUser> {
  let p = userCache.get(fid)
  if (!p) {
    p = hubGet<HubPage<HubCastMessage>>('userDataByFid', { fid })
      .then((res) => {
        const u: FcUser = { fid, username: '', displayName: '', pfp: '', bio: '' }
        for (const m of res.messages) {
          const b = m.data.userDataBody
          if (!b) continue
          if (b.type === 'USER_DATA_TYPE_PFP') u.pfp = b.value
          else if (b.type === 'USER_DATA_TYPE_DISPLAY') u.displayName = b.value
          else if (b.type === 'USER_DATA_TYPE_BIO') u.bio = b.value
          else if (b.type === 'USER_DATA_TYPE_USERNAME') u.username = b.value
        }
        if (!u.username) u.username = `fid:${fid}`
        if (!u.displayName) u.displayName = u.username
        userStore.set(fid, u)
        usernameToFid.set(u.username.toLowerCase(), fid)
        return u
      })
      .catch(() => {
        const u: FcUser = { fid, username: `fid:${fid}`, displayName: `fid ${fid}`, pfp: '', bio: '' }
        userCache.delete(fid)
        return u
      })
    userCache.set(fid, p)
  }
  return p
}

export async function fetchUsers(fids: number[]): Promise<Map<number, FcUser>> {
  const unique = Array.from(new Set(fids))
  const out = new Map<number, FcUser>()
  const results = await Promise.all(unique.map((f) => fetchUser(f)))
  results.forEach((u) => out.set(u.fid, u))
  return out
}

export async function fidByUsername(name: string): Promise<number | null> {
  const clean = name.replace(/^@/, '').toLowerCase().trim()
  if (!clean) return null
  const hit = usernameToFid.get(clean)
  if (hit) return hit
  try {
    const res = await hubGet<{ fid: number }>('userNameProofByName', { name: clean })
    if (res?.fid) {
      usernameToFid.set(clean, res.fid)
      return res.fid
    }
  } catch {
    /* not found */
  }
  return null
}

export interface FollowCounts {
  following: number
  followers: number
  followingCapped: boolean
  followersCapped: boolean
}
const FOLLOW_CAP = 300
export async function fetchFollowCounts(fid: number): Promise<FollowCounts> {
  const [following, followers] = await Promise.all([
    hubGet<HubPage<unknown>>('linksByFid', { fid, link_type: 'follow', pageSize: FOLLOW_CAP }).catch(() => ({ messages: [] })),
    hubGet<HubPage<unknown>>('linksByTargetFid', { target_fid: fid, link_type: 'follow', pageSize: FOLLOW_CAP }).catch(() => ({ messages: [] })),
  ])
  return {
    following: following.messages.length,
    followers: followers.messages.length,
    followingCapped: following.messages.length >= FOLLOW_CAP,
    followersCapped: followers.messages.length >= FOLLOW_CAP,
  }
}

export async function fetchFollowingFids(fid: number, max = 60): Promise<number[]> {
  const res = await hubGet<HubPage<HubCastMessage>>('linksByFid', { fid, link_type: 'follow', pageSize: max, reverse: true }).catch(() => ({ messages: [] as HubCastMessage[] }))
  return res.messages.map((m) => m.data.linkBody?.targetFid).filter((f): f is number => typeof f === 'number')
}

export async function fetchFollowingFeed(fid: number): Promise<Cast[]> {
  const fids = await fetchFollowingFids(fid, 24)
  const pages = await Promise.all(fids.map((f) => fetchUserCasts(f, 6).catch(() => ({ casts: [] as Cast[] }))))
  const casts = pages.flatMap((p) => p.casts).filter((c) => !c.parent)
  casts.sort((a, b) => b.timestamp - a.timestamp)
  return casts.slice(0, 60)
}

/** Replace mention byte offsets with @username tokens. */
export function renderMentions(text: string, mentions: number[], positions: number[], users: Map<number, FcUser>): string {
  if (!mentions.length) return text
  const enc = new TextEncoder()
  const dec = new TextDecoder()
  const bytes = enc.encode(text)
  let out = ''
  let last = 0
  mentions.forEach((fid, i) => {
    const pos = positions[i] ?? bytes.length
    out += dec.decode(bytes.slice(last, pos))
    const u = users.get(fid)
    out += `@${u?.username ?? `fid:${fid}`}`
    last = pos
  })
  out += dec.decode(bytes.slice(last))
  return out
}

export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i
export function isImageUrl(url: string): boolean {
  return IMAGE_RE.test(url) || /imagedelivery\.net|imgur\.com\/\w+\.(png|jpg|gif)|\/ipfs\/.*\.(png|jpg|webp)|supercast\.mypinata|wrpcd\.net\/cdn-cgi\/imagedelivery/i.test(url)
}

export function warpcastUrl(username: string, hash: string): string {
  return `https://warpcast.com/${username}/${hash.slice(0, 10)}`
}
