/** Perpcast-native social types shared by the client, the local fallback store and the Pages Functions API. */

export interface User {
  id: string // lowercase wallet address
  address: string // checksummed / as signed
  username: string
  displayName: string
  pfp: string
  bio: string
  banner?: string
  twitter?: string
  website?: string
  /** X25519 public key (hex) for end-to-end encrypted DMs; empty until the account sets one up. */
  dmKey?: string
  createdAt: number
  followers: number
  following: number
  castCount: number
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

export interface Cast {
  id: string
  author: User
  text: string
  timestamp: number
  channel: string | null // channel id or `market:BTC`
  parentId: string | null
  parentAuthor: User | null
  quoteId: string | null
  quote: Cast | null
  images: string[]
  position: PositionEmbed | null
  likes: number
  recasts: number
  replies: number
  liked: boolean
  recasted: boolean
}

export interface CastPage {
  casts: Cast[]
  next?: string
}

export type FeedKind = 'home' | 'following' | 'trending' | 'channel' | 'user' | 'user-replies' | 'user-likes' | 'market' | 'search'

export interface PublishInput {
  text: string
  channel?: string | null
  parentId?: string | null
  quoteId?: string | null
  images?: string[]
  position?: PositionEmbed | null
}

export type ActivityKind = 'like' | 'recast' | 'reply' | 'follow' | 'mention' | 'quote'

export interface Activity {
  id: string
  kind: ActivityKind
  actor: User
  castId: string | null
  castText: string | null
  time: number
  read: boolean
}

export interface DMMessage {
  id: string
  from: string
  to: string
  text: string
  time: number
  /** Set when the ciphertext could not be opened on this device (sealed for another device's key). */
  locked?: 'other-device' | 'corrupt'
}

export interface DMThread {
  peer: User
  last: DMMessage | null
  unread: number
}

export interface Channel {
  id: string
  name: string
  description: string
  emoji: string
  icon?: string
  accent: string
}

export const CHANNELS: Channel[] = [
  { id: 'perpcast', name: 'Perpcast', description: 'Trade ideas, PnL flexes and market talk from Perpcast traders', emoji: '📈', accent: '#8b5a2b' },
  { id: 'robinhood', name: 'Robinhood Chain', description: 'The chain Perpcast is built on — onchain equities, tokens and apps', emoji: '🪶', icon: '/robinhood-chain.png', accent: '#7fa11a' },
  { id: 'crypto', name: 'Crypto', description: 'BTC, ETH, SOL and everything onchain', emoji: '🪙', accent: '#c47f2a' },
  { id: 'memes', name: 'Memes', description: 'Dog coins, frog coins and the dankest charts', emoji: '😹', accent: '#d4a017' },
  { id: 'stocks', name: 'Stocks', description: 'Equities perps — TSLA, NVDA, AAPL and more', emoji: '🏛️', accent: '#5b7f5b' },
  { id: 'rwa', name: 'RWAs', description: 'Gold, oil, indices, FX and real-world assets', emoji: '🏺', accent: '#a5673f' },
  { id: 'hyperliquid', name: 'Hyperliquid', description: 'The perps venue powering Perpcast markets', emoji: '💧', accent: '#4f8a8b' },
  { id: 'macro', name: 'Macro', description: 'Rates, dollars, central banks and the big picture', emoji: '🌍', accent: '#6b705c' },
  { id: 'dev', name: 'Dev', description: 'Builders shipping onchain', emoji: '🛠️', accent: '#7d6b91' },
  { id: 'founders', name: 'Founders', description: 'Startups, fundraising and lessons learned', emoji: '🚀', accent: '#b5651d' },
  { id: 'lounge', name: 'Lounge', description: 'Off-topic, coffee and vibes', emoji: '☕', accent: '#8d6e63' },
]

export const MARKET_CHANNEL_PREFIX = 'market:'

export function channelById(id: string | null | undefined): Channel | undefined {
  if (!id) return undefined
  return CHANNELS.find((c) => c.id === id)
}

export function marketOfChannel(channel: string | null | undefined): string | null {
  if (!channel || !channel.startsWith(MARKET_CHANNEL_PREFIX)) return null
  return channel.slice(MARKET_CHANNEL_PREFIX.length)
}

export const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i
export function isImageUrl(url: string): boolean {
  return IMAGE_RE.test(url)
}

export const URL_RE = /https?:\/\/[^\s<>"')]+/g
export function extractLinks(text: string): string[] {
  return Array.from(text.matchAll(URL_RE), (m) => m[0])
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function defaultUsername(address: string): string {
  const a = address.toLowerCase()
  return `${a.slice(2, 6)}${a.slice(-4)}`
}

export function castPath(c: Cast | { id: string }): string {
  return `/cast/${encodeURIComponent(c.id)}`
}

export function userPath(u: User | { username: string }): string {
  return `/u/${u.username}`
}
