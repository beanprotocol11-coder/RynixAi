import type { Activity, Cast, CastPage, DMMessage, DMThread, FeedKind, PublishInput, User } from './social'
import { LocalBackend } from './localBackend'

export interface FeedQuery {
  kind: FeedKind
  key?: string // channel id, username, market coin or search query
  cursor?: string
  limit?: number
}

export interface AuthNonce {
  nonce: string
  message: string
}

export interface AuthResult {
  token: string
  user: User
}

export interface ProfilePatch {
  username?: string
  displayName?: string
  bio?: string
  pfp?: string
  banner?: string
  twitter?: string
  website?: string
}

/** Everything the UI needs from a social backend. Implemented by the HTTP client (Pages Functions + D1) and by the localStorage fallback. */
export interface Backend {
  readonly mode: 'server' | 'local'
  nonce(address: string, chainId: number): Promise<AuthNonce>
  verify(address: string, message: string, signature: string): Promise<AuthResult>
  emailStart(email: string): Promise<void>
  emailVerify(email: string, code: string): Promise<AuthResult>
  googleVerify(credential: string): Promise<AuthResult>
  recentUsers(since: number): Promise<User[]>
  me(): Promise<User | null>
  signOut(): Promise<void>
  updateProfile(patch: ProfilePatch): Promise<User>
  publishDmKey(key: string): Promise<void>

  getUser(handle: string): Promise<User | null>
  searchUsers(q: string, limit?: number): Promise<User[]>
  suggestedUsers(limit?: number): Promise<User[]>
  follow(userId: string, on: boolean): Promise<void>
  following(userId: string): Promise<User[]>
  followers(userId: string): Promise<User[]>
  myFollowing(): Promise<string[]>

  feed(q: FeedQuery): Promise<CastPage>
  getCast(id: string): Promise<Cast | null>
  replies(id: string): Promise<Cast[]>
  publish(input: PublishInput): Promise<Cast>
  remove(id: string): Promise<void>
  react(id: string, kind: 'like' | 'recast', on: boolean): Promise<Cast>
  myReactions(): Promise<{ likes: string[]; recasts: string[] }>
  likedCasts(cursor?: string): Promise<CastPage>

  activity(): Promise<Activity[]>
  markActivityRead(): Promise<void>

  dmThreads(): Promise<DMThread[]>
  dmMessages(peerId: string, since?: number): Promise<DMMessage[]>
  dmSend(peerId: string, text: string): Promise<DMMessage>
  dmRead(peerId: string): Promise<void>
}

const TOKEN_KEY = 'perpcast:token'

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

class HttpBackend implements Backend {
  readonly mode = 'server' as const

  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (body !== undefined) headers['content-type'] = 'application/json'
    const token = getToken()
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (res.status === 204) return undefined as T
    const data = (await res.json().catch(() => ({}))) as { error?: string } & T
    if (!res.ok) {
      if (res.status === 401) setToken(null)
      throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`)
    }
    return data
  }
  private get<T>(path: string) {
    return this.call<T>('GET', path)
  }
  private post<T>(path: string, body?: unknown) {
    return this.call<T>('POST', path, body ?? {})
  }
  private del<T>(path: string) {
    return this.call<T>('DELETE', path)
  }

  nonce(address: string, chainId: number) {
    return this.post<AuthNonce>('/auth/nonce', { address, chainId, uri: location.origin, domain: location.host })
  }
  async verify(address: string, message: string, signature: string) {
    const r = await this.post<AuthResult>('/auth/verify', { address, message, signature })
    setToken(r.token)
    return r
  }
  async emailStart(email: string) {
    await this.post('/auth/email/start', { email })
  }
  async emailVerify(email: string, code: string) {
    const r = await this.post<AuthResult>('/auth/email/verify', { email, code })
    setToken(r.token)
    return r
  }
  async googleVerify(credential: string) {
    const r = await this.post<AuthResult>('/auth/google', { credential })
    setToken(r.token)
    return r
  }
  async recentUsers(since: number) {
    return (await this.get<{ users: User[] }>(`/users/recent?since=${since}`)).users
  }
  async me() {
    if (!getToken()) return null
    try {
      return (await this.get<{ user: User | null }>('/auth/me')).user
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return null
      throw e
    }
  }
  async signOut() {
    if (getToken()) await this.post('/auth/logout').catch(() => undefined)
    setToken(null)
  }
  async updateProfile(patch: ProfilePatch) {
    return (await this.call<{ user: User }>('PATCH', '/me', patch)).user
  }

  async getUser(handle: string) {
    try {
      return (await this.get<{ user: User }>(`/users/${encodeURIComponent(handle)}`)).user
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  }
  async searchUsers(q: string, limit = 20) {
    return (await this.get<{ users: User[] }>(`/users?q=${encodeURIComponent(q)}&limit=${limit}`)).users
  }
  async suggestedUsers(limit = 8) {
    return (await this.get<{ users: User[] }>(`/users?suggested=1&limit=${limit}`)).users
  }
  async follow(userId: string, on: boolean) {
    await this.call(on ? 'POST' : 'DELETE', `/users/${encodeURIComponent(userId)}/follow`, on ? {} : undefined)
  }
  async following(userId: string) {
    return (await this.get<{ users: User[] }>(`/users/${encodeURIComponent(userId)}/following`)).users
  }
  async followers(userId: string) {
    return (await this.get<{ users: User[] }>(`/users/${encodeURIComponent(userId)}/followers`)).users
  }
  async myFollowing() {
    return (await this.get<{ ids: string[] }>('/me/following')).ids
  }

  feed(q: FeedQuery) {
    const p = new URLSearchParams({ kind: q.kind })
    if (q.key) p.set('key', q.key)
    if (q.cursor) p.set('cursor', q.cursor)
    if (q.limit) p.set('limit', String(q.limit))
    return this.get<CastPage>(`/casts?${p.toString()}`)
  }
  async getCast(id: string) {
    try {
      return (await this.get<{ cast: Cast }>(`/casts/${encodeURIComponent(id)}`)).cast
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null
      throw e
    }
  }
  async replies(id: string) {
    return (await this.get<{ casts: Cast[] }>(`/casts/${encodeURIComponent(id)}/replies`)).casts
  }
  async publish(input: PublishInput) {
    return (await this.post<{ cast: Cast }>('/casts', input)).cast
  }
  async remove(id: string) {
    await this.del(`/casts/${encodeURIComponent(id)}`)
  }
  async react(id: string, kind: 'like' | 'recast', on: boolean) {
    return (await this.call<{ cast: Cast }>(on ? 'POST' : 'DELETE', `/casts/${encodeURIComponent(id)}/${kind}`, on ? {} : undefined)).cast
  }
  myReactions() {
    return this.get<{ likes: string[]; recasts: string[] }>('/me/reactions')
  }
  likedCasts(cursor?: string) {
    return this.get<CastPage>(`/me/likes${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
  }

  async activity() {
    return (await this.get<{ items: Activity[] }>('/activity')).items
  }
  async markActivityRead() {
    await this.post('/activity/read')
  }

  async publishDmKey(key: string) {
    await this.call('PUT', '/me/dmkey', { key })
  }
  async dmThreads() {
    return (await this.get<{ threads: DMThread[] }>('/dm')).threads
  }
  async dmMessages(peerId: string, since?: number) {
    return (await this.get<{ messages: DMMessage[] }>(`/dm/${encodeURIComponent(peerId)}${since ? `?since=${since}` : ''}`)).messages
  }
  async dmSend(peerId: string, text: string) {
    return (await this.post<{ message: DMMessage }>(`/dm/${encodeURIComponent(peerId)}`, { text })).message
  }
  async dmRead(peerId: string) {
    await this.post(`/dm/${encodeURIComponent(peerId)}/read`)
  }
}

let backend: Backend | null = null
let ready: Promise<Backend> | null = null
let googleClient: string | null = null
let xEnabled = false

/** True when the server has X (Twitter) OAuth credentials configured. */
export function xSignInEnabled(): boolean {
  return xEnabled
}

/** Google OAuth client ID advertised by the server; null when Google sign-in is not configured. */
export function googleClientId(): string | null {
  return googleClient
}

/** Probe the Pages Functions API once; fall back to the on-device store when it is unavailable (static preview, no D1 binding, offline). */
export function initBackend(): Promise<Backend> {
  if (ready) return ready
  ready = (async () => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch('/api/health', { signal: ctrl.signal, headers: { accept: 'application/json' } })
      clearTimeout(t)
      const data = (await res.json()) as { ok?: boolean; db?: boolean; google?: string | null; x?: boolean }
      googleClient = typeof data.google === 'string' && data.google ? data.google : null
      xEnabled = data.x === true
      backend = res.ok && data.ok && data.db ? new HttpBackend() : new LocalBackend()
    } catch {
      backend = new LocalBackend()
    }
    return backend
  })()
  return ready
}

export function api(): Backend {
  if (!backend) throw new Error('backend not ready')
  return backend
}

export function backendMode(): 'server' | 'local' | 'pending' {
  return backend?.mode ?? 'pending'
}
