import { verifyMessage } from 'viem'
import type { Backend, AuthNonce, AuthResult, FeedQuery, ProfilePatch } from './api'
import { getToken, setToken } from './api'
import { defaultUsername, marketOfChannel, type Activity, type Cast, type CastPage, type DMMessage, type DMThread, type PublishInput, type User } from './social'
import { uid } from './format'
import { buildSignInMessage, randomNonce } from './wallet'

interface StoredUser extends Omit<User, 'followers' | 'following' | 'castCount'> {}
interface StoredCast {
  id: string
  authorId: string
  text: string
  timestamp: number
  channel: string | null
  parentId: string | null
  quoteId: string | null
  images: string[]
  position: Cast['position']
}
interface StoredActivity {
  id: string
  userId: string
  kind: Activity['kind']
  actorId: string
  castId: string | null
  time: number
  read: boolean
}
interface DB {
  users: Record<string, StoredUser>
  casts: StoredCast[]
  likes: Record<string, string[]> // castId -> userIds
  recasts: Record<string, string[]>
  follows: Record<string, string[]> // followerId -> followeeIds
  activity: StoredActivity[]
  dms: DMMessage[]
  dmRead: Record<string, number> // `${me}|${peer}` -> ts
  sessions: Record<string, string> // token -> userId
}

const KEY = 'perpcast:db'
const PAGE = 25

function emptyDB(): DB {
  return { users: {}, casts: [], likes: {}, recasts: {}, follows: {}, activity: [], dms: [], dmRead: {}, sessions: {} }
}

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...emptyDB(), ...(JSON.parse(raw) as Partial<DB>) }
  } catch {
    /* ignore */
  }
  return emptyDB()
}

/** On-device implementation used when the Pages Functions API is unreachable. Data lives in this browser only. */
export class LocalBackend implements Backend {
  readonly mode = 'local' as const
  private db: DB = load()
  private nonces = new Map<string, string>()

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.db))
    } catch {
      /* quota */
    }
  }
  private meId(): string | null {
    const t = getToken()
    return t ? this.db.sessions[t] ?? null : null
  }
  private requireMe(): string {
    const id = this.meId()
    if (!id) throw new Error('Sign in required')
    return id
  }
  private hydrateUser(u: StoredUser | undefined): User | null {
    if (!u) return null
    const followers = Object.values(this.db.follows).filter((ids) => ids.includes(u.id)).length
    return {
      ...u,
      followers,
      following: this.db.follows[u.id]?.length ?? 0,
      castCount: this.db.casts.filter((c) => c.authorId === u.id && !c.parentId).length,
    }
  }
  private user(id: string): User {
    return (
      this.hydrateUser(this.db.users[id]) ?? {
        id,
        address: id,
        username: defaultUsername(id),
        displayName: defaultUsername(id),
        pfp: '',
        bio: '',
        createdAt: 0,
        followers: 0,
        following: 0,
        castCount: 0,
      }
    )
  }
  private hydrate(c: StoredCast, depth = 0): Cast {
    const me = this.meId()
    const parent = c.parentId ? this.db.casts.find((x) => x.id === c.parentId) : undefined
    const quote = depth === 0 && c.quoteId ? this.db.casts.find((x) => x.id === c.quoteId) : undefined
    return {
      id: c.id,
      author: this.user(c.authorId),
      text: c.text,
      timestamp: c.timestamp,
      channel: c.channel,
      parentId: c.parentId,
      parentAuthor: parent ? this.user(parent.authorId) : null,
      quoteId: c.quoteId,
      quote: quote ? this.hydrate(quote, 1) : null,
      images: c.images,
      position: c.position,
      likes: this.db.likes[c.id]?.length ?? 0,
      recasts: this.db.recasts[c.id]?.length ?? 0,
      replies: this.db.casts.filter((x) => x.parentId === c.id).length,
      liked: !!me && !!this.db.likes[c.id]?.includes(me),
      recasted: !!me && !!this.db.recasts[c.id]?.includes(me),
    }
  }
  private page(list: StoredCast[], cursor?: string): CastPage {
    const sorted = [...list].sort((a, b) => b.timestamp - a.timestamp)
    const start = cursor ? Number(cursor) : 0
    const slice = sorted.slice(start, start + PAGE)
    return { casts: slice.map((c) => this.hydrate(c)), next: start + PAGE < sorted.length ? String(start + PAGE) : undefined }
  }
  private pushActivity(userId: string, kind: Activity['kind'], actorId: string, castId: string | null) {
    if (userId === actorId) return
    this.db.activity.unshift({ id: uid(), userId, kind, actorId, castId, time: Date.now(), read: false })
    this.db.activity = this.db.activity.slice(0, 500)
  }

  async nonce(address: string, chainId: number): Promise<AuthNonce> {
    const nonce = randomNonce()
    this.nonces.set(address.toLowerCase(), nonce)
    return { nonce, message: buildSignInMessage(address, nonce, chainId) }
  }
  async verify(address: string, message: string, signature: string): Promise<AuthResult> {
    const id = address.toLowerCase()
    const nonce = this.nonces.get(id)
    if (!nonce || !message.includes(`Nonce: ${nonce}`)) throw new Error('Nonce mismatch — please try again')
    const ok = await verifyMessage({ address: address as `0x${string}`, message, signature: signature as `0x${string}` })
    if (!ok) throw new Error('Signature did not match this wallet')
    this.nonces.delete(id)
    if (!this.db.users[id]) {
      const base = defaultUsername(id)
      this.db.users[id] = { id, address, username: base, displayName: base, pfp: '', bio: '', createdAt: Date.now() }
    }
    const token = `local:${randomNonce()}${randomNonce()}`
    this.db.sessions[token] = id
    this.save()
    setToken(token)
    return { token, user: this.user(id) }
  }
  async me() {
    const id = this.meId()
    return id ? this.user(id) : null
  }
  async signOut() {
    const t = getToken()
    if (t) delete this.db.sessions[t]
    setToken(null)
    this.save()
  }
  async updateProfile(patch: ProfilePatch) {
    const id = this.requireMe()
    const u = this.db.users[id]
    if (patch.username !== undefined) {
      const taken = Object.values(this.db.users).find((x) => x.username === patch.username && x.id !== id)
      if (taken) throw new Error('Username already taken')
      u.username = patch.username
    }
    if (patch.displayName !== undefined) u.displayName = patch.displayName
    if (patch.bio !== undefined) u.bio = patch.bio
    if (patch.pfp !== undefined) u.pfp = patch.pfp
    this.save()
    return this.user(id)
  }

  async getUser(handle: string) {
    const h = handle.toLowerCase()
    const u = this.db.users[h] ?? Object.values(this.db.users).find((x) => x.username.toLowerCase() === h)
    return this.hydrateUser(u)
  }
  async searchUsers(q: string, limit = 20) {
    const s = q.toLowerCase().replace(/^@/, '')
    return Object.values(this.db.users)
      .filter((u) => u.username.toLowerCase().includes(s) || u.displayName.toLowerCase().includes(s) || u.id.includes(s))
      .slice(0, limit)
      .map((u) => this.user(u.id))
  }
  async suggestedUsers(limit = 8) {
    const me = this.meId()
    return Object.values(this.db.users)
      .filter((u) => u.id !== me)
      .map((u) => this.user(u.id))
      .sort((a, b) => b.followers + b.castCount - (a.followers + a.castCount))
      .slice(0, limit)
  }
  async follow(userId: string, on: boolean) {
    const me = this.requireMe()
    const target = userId.toLowerCase()
    const set = new Set(this.db.follows[me] ?? [])
    if (on) {
      set.add(target)
      this.pushActivity(target, 'follow', me, null)
    } else set.delete(target)
    this.db.follows[me] = Array.from(set)
    this.save()
  }
  async following(userId: string) {
    return (this.db.follows[userId.toLowerCase()] ?? []).map((id) => this.user(id))
  }
  async followers(userId: string) {
    const t = userId.toLowerCase()
    return Object.entries(this.db.follows)
      .filter(([, ids]) => ids.includes(t))
      .map(([id]) => this.user(id))
  }
  async myFollowing() {
    const me = this.meId()
    return me ? this.db.follows[me] ?? [] : []
  }

  async feed(q: FeedQuery): Promise<CastPage> {
    const all = this.db.casts
    const top = all.filter((c) => !c.parentId)
    switch (q.kind) {
      case 'home':
      case 'trending': {
        if (q.kind === 'trending') {
          const scored = top.map((c) => ({ c, s: (this.db.likes[c.id]?.length ?? 0) * 2 + (this.db.recasts[c.id]?.length ?? 0) * 3 + all.filter((x) => x.parentId === c.id).length }))
          scored.sort((a, b) => b.s - a.s || b.c.timestamp - a.c.timestamp)
          const start = q.cursor ? Number(q.cursor) : 0
          const slice = scored.slice(start, start + PAGE)
          return { casts: slice.map((x) => this.hydrate(x.c)), next: start + PAGE < scored.length ? String(start + PAGE) : undefined }
        }
        return this.page(top, q.cursor)
      }
      case 'following': {
        const me = this.meId()
        const ids = new Set([...(me ? this.db.follows[me] ?? [] : []), ...(me ? [me] : [])])
        return this.page(top.filter((c) => ids.has(c.authorId)), q.cursor)
      }
      case 'channel':
        return this.page(top.filter((c) => c.channel === q.key), q.cursor)
      case 'market':
        return this.page(top.filter((c) => marketOfChannel(c.channel) === q.key), q.cursor)
      case 'user': {
        const u = await this.getUser(q.key ?? '')
        if (!u) return { casts: [] }
        const recasted = Object.entries(this.db.recasts)
          .filter(([, ids]) => ids.includes(u.id))
          .map(([id]) => id)
        return this.page(all.filter((c) => (c.authorId === u.id && !c.parentId) || recasted.includes(c.id)), q.cursor)
      }
      case 'user-replies': {
        const u = await this.getUser(q.key ?? '')
        if (!u) return { casts: [] }
        return this.page(all.filter((c) => c.authorId === u.id && !!c.parentId), q.cursor)
      }
      case 'user-likes': {
        const u = await this.getUser(q.key ?? '')
        if (!u) return { casts: [] }
        const liked = new Set(
          Object.entries(this.db.likes)
            .filter(([, ids]) => ids.includes(u.id))
            .map(([id]) => id),
        )
        return this.page(all.filter((c) => liked.has(c.id)), q.cursor)
      }
      case 'search': {
        const s = (q.key ?? '').toLowerCase()
        if (!s) return { casts: [] }
        return this.page(all.filter((c) => c.text.toLowerCase().includes(s)), q.cursor)
      }
    }
  }
  async getCast(id: string) {
    const c = this.db.casts.find((x) => x.id === id)
    return c ? this.hydrate(c) : null
  }
  async replies(id: string) {
    return this.db.casts
      .filter((c) => c.parentId === id)
      .sort((a, b) => a.timestamp - b.timestamp)
      .map((c) => this.hydrate(c))
  }
  async publish(input: PublishInput) {
    const me = this.requireMe()
    const text = input.text.trim()
    if (!text && !input.images?.length && !input.position) throw new Error('Cast is empty')
    const cast: StoredCast = {
      id: uid() + uid(),
      authorId: me,
      text,
      timestamp: Date.now(),
      channel: input.parentId ? null : input.channel ?? null,
      parentId: input.parentId ?? null,
      quoteId: input.quoteId ?? null,
      images: input.images ?? [],
      position: input.position ?? null,
    }
    this.db.casts.unshift(cast)
    const parent = cast.parentId ? this.db.casts.find((x) => x.id === cast.parentId) : undefined
    if (parent) this.pushActivity(parent.authorId, 'reply', me, cast.id)
    const quoted = cast.quoteId ? this.db.casts.find((x) => x.id === cast.quoteId) : undefined
    if (quoted) this.pushActivity(quoted.authorId, 'quote', me, cast.id)
    for (const m of text.matchAll(/@([a-z0-9_]{3,20})/gi)) {
      const u = Object.values(this.db.users).find((x) => x.username.toLowerCase() === m[1].toLowerCase())
      if (u) this.pushActivity(u.id, 'mention', me, cast.id)
    }
    this.save()
    return this.hydrate(cast)
  }
  async remove(id: string) {
    const me = this.requireMe()
    const c = this.db.casts.find((x) => x.id === id)
    if (!c) return
    if (c.authorId !== me) throw new Error('Not your cast')
    this.db.casts = this.db.casts.filter((x) => x.id !== id)
    this.save()
  }
  async react(id: string, kind: 'like' | 'recast', on: boolean) {
    const me = this.requireMe()
    const c = this.db.casts.find((x) => x.id === id)
    if (!c) throw new Error('Cast not found')
    const table = kind === 'like' ? this.db.likes : this.db.recasts
    const set = new Set(table[id] ?? [])
    if (on) {
      if (!set.has(me)) this.pushActivity(c.authorId, kind, me, id)
      set.add(me)
    } else set.delete(me)
    table[id] = Array.from(set)
    this.save()
    return this.hydrate(c)
  }
  async myReactions() {
    const me = this.meId()
    if (!me) return { likes: [], recasts: [] }
    const pick = (t: Record<string, string[]>) => Object.entries(t).filter(([, ids]) => ids.includes(me)).map(([id]) => id)
    return { likes: pick(this.db.likes), recasts: pick(this.db.recasts) }
  }
  async likedCasts(cursor?: string) {
    const me = this.meId()
    if (!me) return { casts: [] }
    return this.feed({ kind: 'user-likes', key: me, cursor })
  }

  async activity() {
    const me = this.meId()
    if (!me) return []
    return this.db.activity
      .filter((a) => a.userId === me)
      .slice(0, 100)
      .map((a) => {
        const c = a.castId ? this.db.casts.find((x) => x.id === a.castId) : undefined
        return { id: a.id, kind: a.kind, actor: this.user(a.actorId), castId: a.castId, castText: c?.text ?? null, time: a.time, read: a.read }
      })
  }
  async markActivityRead() {
    const me = this.meId()
    if (!me) return
    this.db.activity.forEach((a) => {
      if (a.userId === me) a.read = true
    })
    this.save()
  }

  async dmThreads(): Promise<DMThread[]> {
    const me = this.meId()
    if (!me) return []
    const peers = new Map<string, DMMessage>()
    for (const m of this.db.dms) {
      if (m.from !== me && m.to !== me) continue
      const peer = m.from === me ? m.to : m.from
      const prev = peers.get(peer)
      if (!prev || m.time > prev.time) peers.set(peer, m)
    }
    return Array.from(peers.entries())
      .map(([peer, last]) => {
        const readAt = this.db.dmRead[`${me}|${peer}`] ?? 0
        const unread = this.db.dms.filter((m) => m.from === peer && m.to === me && m.time > readAt).length
        return { peer: this.user(peer), last, unread }
      })
      .sort((a, b) => (b.last?.time ?? 0) - (a.last?.time ?? 0))
  }
  async dmMessages(peerId: string, since = 0) {
    const me = this.meId()
    if (!me) return []
    const p = peerId.toLowerCase()
    return this.db.dms.filter((m) => ((m.from === me && m.to === p) || (m.from === p && m.to === me)) && m.time > since).sort((a, b) => a.time - b.time)
  }
  async dmSend(peerId: string, text: string) {
    const me = this.requireMe()
    const msg: DMMessage = { id: uid(), from: me, to: peerId.toLowerCase(), text: text.trim(), time: Date.now() }
    this.db.dms.push(msg)
    this.db.dmRead[`${me}|${msg.to}`] = msg.time
    this.save()
    return msg
  }
  async dmRead(peerId: string) {
    const me = this.meId()
    if (!me) return
    this.db.dmRead[`${me}|${peerId.toLowerCase()}`] = Date.now()
    this.save()
  }
}
