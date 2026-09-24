import type { D1Database } from './types'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } })

export function rid(): string {
  const a = new Uint8Array(16)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/

export function defaultUsername(address: string): string {
  const a = address.toLowerCase()
  return `${a.slice(2, 6)}${a.slice(-4)}`
}

export interface UserRow {
  id: string
  address: string
  username: string
  display_name: string
  pfp: string
  bio: string
  banner: string | null
  twitter: string | null
  website: string | null
  created_at: number
  followers?: number
  following?: number
  cast_count?: number
}

export interface User {
  id: string
  address: string
  username: string
  displayName: string
  pfp: string
  bio: string
  banner: string
  twitter: string
  website: string
  createdAt: number
  followers: number
  following: number
  castCount: number
}

export interface CastRow {
  id: string
  author_id: string
  text: string
  created_at: number
  channel: string | null
  parent_id: string | null
  quote_id: string | null
  images: string
  position: string | null
  like_count: number
  recast_count: number
  reply_count: number
}

export interface Cast {
  id: string
  author: User
  text: string
  timestamp: number
  channel: string | null
  parentId: string | null
  parentAuthor: User | null
  quoteId: string | null
  quote: Cast | null
  images: string[]
  position: unknown | null
  likes: number
  recasts: number
  replies: number
  liked: boolean
  recasted: boolean
}

export const USER_SELECT = `
  u.id, u.address, u.username, u.display_name, u.pfp, u.bio, u.banner, u.twitter, u.website, u.created_at,
  (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
  (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
  (SELECT COUNT(*) FROM casts c WHERE c.author_id = u.id AND c.parent_id IS NULL) AS cast_count`

export function toUser(r: UserRow): User {
  return {
    id: r.id,
    address: r.address,
    username: r.username,
    displayName: r.display_name || r.username,
    pfp: r.pfp,
    bio: r.bio,
    banner: r.banner ?? '',
    twitter: r.twitter ?? '',
    website: r.website ?? '',
    createdAt: r.created_at,
    followers: r.followers ?? 0,
    following: r.following ?? 0,
    castCount: r.cast_count ?? 0,
  }
}

export async function getUserById(db: D1Database, id: string): Promise<User | null> {
  const r = await db.prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.id = ?`).bind(id.toLowerCase()).first<UserRow>()
  return r ? toUser(r) : null
}

export async function getUserByHandle(db: D1Database, handle: string): Promise<User | null> {
  const h = handle.toLowerCase()
  const r = await db.prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.id = ? OR u.username = ? COLLATE NOCASE`).bind(h, h).first<UserRow>()
  return r ? toUser(r) : null
}

export async function getUsers(db: D1Database, ids: string[]): Promise<Map<string, User>> {
  const out = new Map<string, User>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return out
  for (let i = 0; i < uniq.length; i += 50) {
    const chunk = uniq.slice(i, i + 50)
    const rows = await db
      .prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.id IN (${chunk.map(() => '?').join(',')})`)
      .bind(...chunk)
      .all<UserRow>()
    rows.results.forEach((r) => out.set(r.id, toUser(r)))
  }
  return out
}

function placeholderUser(id: string): User {
  const name = defaultUsername(id)
  return { id, address: id, username: name, displayName: name, pfp: '', bio: '', banner: '', twitter: '', website: '', createdAt: 0, followers: 0, following: 0, castCount: 0 }
}

/** Attach authors, parent authors, quotes and the viewer's reactions to raw cast rows. */
export async function hydrateCasts(db: D1Database, rows: CastRow[], viewer: string | null, depth = 0): Promise<Cast[]> {
  if (!rows.length) return []
  const parentIds = rows.map((r) => r.parent_id).filter((x): x is string => !!x)
  const quoteIds = depth === 0 ? rows.map((r) => r.quote_id).filter((x): x is string => !!x) : []
  const [parents, quotes] = await Promise.all([fetchCastRows(db, parentIds), fetchCastRows(db, quoteIds)])
  const quoteCasts = quotes.length ? await hydrateCasts(db, quotes, viewer, 1) : []
  const quoteMap = new Map(quoteCasts.map((c) => [c.id, c]))
  const parentMap = new Map(parents.map((p) => [p.id, p]))
  const users = await getUsers(db, [...rows.map((r) => r.author_id), ...parents.map((p) => p.author_id)])

  const liked = new Set<string>()
  const recasted = new Set<string>()
  if (viewer) {
    const ids = rows.map((r) => r.id)
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50)
      const rx = await db
        .prepare(`SELECT cast_id, kind FROM reactions WHERE user_id = ? AND cast_id IN (${chunk.map(() => '?').join(',')})`)
        .bind(viewer, ...chunk)
        .all<{ cast_id: string; kind: string }>()
      rx.results.forEach((r) => (r.kind === 'like' ? liked : recasted).add(r.cast_id))
    }
  }

  return rows.map((r) => {
    const parent = r.parent_id ? parentMap.get(r.parent_id) : undefined
    let images: string[] = []
    try {
      images = JSON.parse(r.images) as string[]
    } catch {
      /* ignore */
    }
    let position: unknown = null
    if (r.position) {
      try {
        position = JSON.parse(r.position)
      } catch {
        /* ignore */
      }
    }
    return {
      id: r.id,
      author: users.get(r.author_id) ?? placeholderUser(r.author_id),
      text: r.text,
      timestamp: r.created_at,
      channel: r.channel,
      parentId: r.parent_id,
      parentAuthor: parent ? users.get(parent.author_id) ?? placeholderUser(parent.author_id) : null,
      quoteId: r.quote_id,
      quote: r.quote_id ? quoteMap.get(r.quote_id) ?? null : null,
      images,
      position,
      likes: r.like_count,
      recasts: r.recast_count,
      replies: r.reply_count,
      liked: liked.has(r.id),
      recasted: recasted.has(r.id),
    }
  })
}

export async function fetchCastRows(db: D1Database, ids: string[]): Promise<CastRow[]> {
  const uniq = Array.from(new Set(ids))
  if (!uniq.length) return []
  const rows = await db
    .prepare(`SELECT * FROM casts WHERE id IN (${uniq.map(() => '?').join(',')})`)
    .bind(...uniq)
    .all<CastRow>()
  return rows.results
}

export async function pushActivity(db: D1Database, recipient: string, kind: string, actor: string, castId: string | null) {
  if (recipient === actor) return
  await db.prepare('INSERT INTO activity (id, user_id, kind, actor_id, cast_id, created_at, read) VALUES (?, ?, ?, ?, ?, ?, 0)').bind(rid(), recipient, kind, actor, castId, Date.now()).run()
}
