import { verifyMessage } from 'viem'
import type { D1Database, Env, PagesFunction } from '../lib/types'
import { HttpError, USERNAME_RE, USER_SELECT, defaultUsername, fetchCastRows, getUserByHandle, getUserById, getUsers, hydrateCasts, json, pushActivity, rid, toUser, type Cast, type CastRow, type User, type UserRow } from '../lib/db'

const PAGE = 25
const SESSION_TTL = 1000 * 60 * 60 * 24 * 30
const NONCE_TTL = 1000 * 60 * 10
const MAX_TEXT = 1024

interface Ctx {
  db: D1Database
  env: Env
  req: Request
  url: URL
  viewer: User | null
}

type Handler = (ctx: Ctx, params: Record<string, string>) => Promise<Response>
interface Route {
  method: string
  pattern: RegExp
  keys: string[]
  handler: Handler
}

const routes: Route[] = []
function route(method: string, path: string, handler: Handler) {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' +
      path
        .split('/')
        .filter(Boolean)
        .map((seg) => {
          if (seg.startsWith(':')) {
            keys.push(seg.slice(1))
            return '([^/]+)'
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        })
        .join('/') +
      '$',
  )
  routes.push({ method, pattern, keys, handler })
}

async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    throw new HttpError(400, 'Invalid JSON body')
  }
}

function requireViewer(ctx: Ctx): User {
  if (!ctx.viewer) throw new HttpError(401, 'Sign in required')
  return ctx.viewer
}

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function isAddress(a: unknown): a is `0x${string}` {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)
}

/* ---------------- health ---------------- */

route('GET', '/health', async (ctx) => {
  let db = false
  try {
    await ctx.db.prepare('SELECT 1 FROM users LIMIT 1').first()
    db = true
  } catch {
    db = false
  }
  return json({ ok: true, db, time: Date.now() })
})

/* ---------------- auth ---------------- */

route('POST', '/auth/nonce', async (ctx) => {
  const b = await body<{ address?: string; chainId?: number; domain?: string; uri?: string }>(ctx.req)
  if (!isAddress(b.address)) throw new HttpError(400, 'Invalid address')
  const nonce = rid()
  const now = Date.now()
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM nonces WHERE created_at < ?').bind(now - NONCE_TTL),
    ctx.db.prepare('INSERT INTO nonces (nonce, address, created_at) VALUES (?, ?, ?)').bind(nonce, b.address.toLowerCase(), now),
  ])
  const domain = ctx.url.host
  const chainId = Number.isFinite(b.chainId) && (b.chainId as number) > 0 ? Math.floor(b.chainId as number) : 1
  const message = [
    `${domain} wants you to sign in with your Ethereum account:`,
    b.address,
    '',
    'Sign in to Perpcast. This signature only proves you own this wallet — it does not send a transaction, approve spending or cost gas.',
    '',
    `URI: ${ctx.url.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
  ].join('\n')
  return json({ nonce, message })
})

route('POST', '/auth/verify', async (ctx) => {
  const b = await body<{ address?: string; message?: string; signature?: string }>(ctx.req)
  if (!isAddress(b.address) || typeof b.message !== 'string' || typeof b.signature !== 'string') throw new HttpError(400, 'Missing fields')
  const id = b.address.toLowerCase()
  const nonce = /Nonce: ([0-9a-f]{32})/.exec(b.message)?.[1]
  if (!nonce) throw new HttpError(400, 'Malformed message')
  if (!b.message.includes(`${ctx.url.host} wants you to sign in`) || !b.message.split('\n')[1]?.toLowerCase().includes(id)) throw new HttpError(400, 'Message does not match this site or address')
  const row = await ctx.db.prepare('SELECT address, created_at FROM nonces WHERE nonce = ?').bind(nonce).first<{ address: string; created_at: number }>()
  if (!row || row.address !== id || row.created_at < Date.now() - NONCE_TTL) throw new HttpError(400, 'Nonce expired — please try again')
  let ok = false
  try {
    ok = await verifyMessage({ address: b.address, message: b.message, signature: b.signature as `0x${string}` })
  } catch {
    ok = false
  }
  if (!ok) throw new HttpError(401, 'Signature did not match this wallet')
  await ctx.db.prepare('DELETE FROM nonces WHERE nonce = ?').bind(nonce).run()

  let user = await getUserById(ctx.db, id)
  if (!user) {
    const username = await freeUsername(ctx.db, defaultUsername(id))
    await ctx.db.prepare('INSERT INTO users (id, address, username, display_name, pfp, bio, created_at) VALUES (?, ?, ?, ?, "", "", ?)').bind(id, b.address, username, username, Date.now()).run()
    user = await getUserById(ctx.db, id)
  }
  return json(await openSession(ctx.db, id, user))
})

async function freeUsername(db: D1Database, base: string): Promise<string> {
  const clash = await db.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(base).first()
  return clash ? `${base}${rid().slice(0, 3)}` : base
}

async function openSession(db: D1Database, userId: string, user: User | null) {
  const token = rid() + rid()
  const now = Date.now()
  await db.batch([
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(token, userId, now, now + SESSION_TTL),
  ])
  return { token, user }
}

/* ---------------- email OTP ---------------- */

const CODE_TTL = 1000 * 60 * 10
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

function otpHtml(code: string, host: string): string {
  const digits = code.split('').map((d) => `<td style="width:44px;height:56px;border-radius:12px;background:#15102a;color:#fff;font:700 28px/56px ui-monospace,Menlo,monospace;text-align:center">${d}</td>`).join('<td style="width:8px"></td>')
  return `<!doctype html><html><body style="margin:0;background:#07050f;padding:32px 16px;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#e7e2ff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table role="presentation" width="420" cellpadding="0" cellspacing="0" style="max-width:420px;background:#0e0a1f;border:1px solid #2a2347;border-radius:24px;padding:32px">
    <tr><td align="center" style="padding-bottom:16px"><img src="https://${host}/logo-224.png" width="64" height="64" alt="Perpcast" style="display:block;border-radius:18px;width:64px;height:64px"></td></tr>
    <tr><td align="center" style="font-size:13px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#c7b6ff;padding-bottom:14px">Perpcast</td></tr>
    <tr><td align="center" style="font-size:22px;font-weight:800;padding-bottom:6px">Your Perpcast sign-in code</td></tr>
    <tr><td align="center" style="font-size:14px;color:#9d95bd;padding-bottom:24px">Enter this code on ${host}. It expires in 10 minutes.</td></tr>
    <tr><td align="center" style="padding-bottom:24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table></td></tr>
    <tr><td align="center" style="font-size:12px;color:#6f679a">If you didn't request this, you can safely ignore this email. Nobody from Perpcast will ever ask you for this code.</td></tr>
  </table></td></tr></table></body></html>`
}

async function sendCode(env: Env, host: string, to: string, code: string) {
  if (!env.RESEND_API_KEY) throw new HttpError(503, 'Email sign-in is not configured yet')
  const from = env.EMAIL_FROM || `Perpcast <login@${host.replace(/^www\./, '')}>`
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: `${code} is your Perpcast code`, html: otpHtml(code, host), text: `Your Perpcast sign-in code is ${code}. It expires in 10 minutes.` }),
  })
  if (!res.ok) {
    const msg = (await res.json().catch(() => ({}))) as { message?: string }
    console.error('resend', res.status, msg)
    throw new HttpError(502, msg.message ? `Email failed: ${msg.message}` : 'Could not send the email, try again')
  }
}

route('POST', '/auth/email/start', async (ctx) => {
  const b = await body<{ email?: string }>(ctx.req)
  const email = str(b.email, 254).trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address')
  const now = Date.now()
  const last = await ctx.db.prepare('SELECT created_at FROM email_codes WHERE email = ?').bind(email).first<{ created_at: number }>()
  if (last && now - last.created_at < 30_000) throw new HttpError(429, 'Code already sent — check your inbox (and spam), or retry in 30s')
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await sendCode(ctx.env, ctx.url.host, email, code)
  await ctx.db.batch([
    ctx.db.prepare('DELETE FROM email_codes WHERE created_at < ?').bind(now - CODE_TTL),
    ctx.db.prepare('INSERT OR REPLACE INTO email_codes (email, code_hash, created_at, attempts) VALUES (?, ?, ?, 0)').bind(email, await sha256(`${email}:${code}`), now),
  ])
  return json({ ok: true })
})

route('POST', '/auth/email/verify', async (ctx) => {
  const b = await body<{ email?: string; code?: string }>(ctx.req)
  const email = str(b.email, 254).trim().toLowerCase()
  const code = str(b.code, 6).replace(/\D/g, '')
  if (!EMAIL_RE.test(email) || code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code')
  const row = await ctx.db.prepare('SELECT code_hash, created_at, attempts FROM email_codes WHERE email = ?').bind(email).first<{ code_hash: string; created_at: number; attempts: number }>()
  if (!row || row.created_at < Date.now() - CODE_TTL) throw new HttpError(400, 'Code expired — request a new one')
  if (row.attempts >= 5) throw new HttpError(429, 'Too many attempts — request a new code')
  if (row.code_hash !== (await sha256(`${email}:${code}`))) {
    await ctx.db.prepare('UPDATE email_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run()
    throw new HttpError(401, 'Wrong code, try again')
  }
  await ctx.db.prepare('DELETE FROM email_codes WHERE email = ?').bind(email).run()

  let id = (await ctx.db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>())?.id
  if (!id) {
    id = `em_${rid().slice(0, 20)}`
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 15) || 'caster'
    const username = await freeUsername(ctx.db, base.length >= 3 ? base : `${base}${rid().slice(0, 3)}`)
    await ctx.db.prepare('INSERT INTO users (id, address, username, display_name, pfp, bio, email, created_at) VALUES (?, "", ?, ?, "", "", ?, ?)').bind(id, username, username, email, Date.now()).run()
  }
  return json(await openSession(ctx.db, id, await getUserById(ctx.db, id)))
})

/** Newest accounts, for the cross-device "just joined Perpcast" feed. */
route('GET', '/users/recent', async (ctx) => {
  const since = Number(ctx.url.searchParams.get('since')) || 0
  const rows = await ctx.db.prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.created_at > ? ORDER BY u.created_at DESC LIMIT 20`).bind(since).all<UserRow>()
  return json({ users: rows.results.map(toUser) })
})

route('GET', '/auth/me', async (ctx) => json({ user: ctx.viewer }))

route('POST', '/auth/logout', async (ctx) => {
  const token = bearer(ctx.req)
  if (token) await ctx.db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run()
  return json({ ok: true })
})

/* ---------------- me ---------------- */

route('PATCH', '/me', async (ctx) => {
  const me = requireViewer(ctx)
  const b = await body<{ username?: string; displayName?: string; bio?: string; pfp?: string; banner?: string; twitter?: string; website?: string }>(ctx.req)
  if (b.username !== undefined) {
    const u = str(b.username, 20).toLowerCase()
    if (!USERNAME_RE.test(u)) throw new HttpError(400, 'Username must be 3–20 chars: a–z, 0–9, _')
    const taken = await ctx.db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?').bind(u, me.id).first()
    if (taken) throw new HttpError(409, 'Username already taken')
    await ctx.db.prepare('UPDATE users SET username = ? WHERE id = ?').bind(u, me.id).run()
  }
  if (b.displayName !== undefined) await ctx.db.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(str(b.displayName, 50).trim(), me.id).run()
  if (b.bio !== undefined) await ctx.db.prepare('UPDATE users SET bio = ? WHERE id = ?').bind(str(b.bio, 280).trim(), me.id).run()
  if (b.pfp !== undefined) {
    const p = str(b.pfp, 500_000)
    if (p && !/^(https?:\/\/|data:image\/)/.test(p)) throw new HttpError(400, 'Avatar must be an image URL')
    await ctx.db.prepare('UPDATE users SET pfp = ? WHERE id = ?').bind(p, me.id).run()
  }
  if (b.banner !== undefined) {
    const p = str(b.banner, 900_000)
    if (p && !/^(https?:\/\/|data:image\/)/.test(p)) throw new HttpError(400, 'Banner must be an image URL')
    await ctx.db.prepare('UPDATE users SET banner = ? WHERE id = ?').bind(p, me.id).run()
  }
  if (b.twitter !== undefined) await ctx.db.prepare('UPDATE users SET twitter = ? WHERE id = ?').bind(str(b.twitter, 30).replace(/^@/, '').trim(), me.id).run()
  if (b.website !== undefined) {
    const w = str(b.website, 200).trim()
    if (w && !/^https?:\/\//.test(w)) throw new HttpError(400, 'Website must start with http(s)://')
    await ctx.db.prepare('UPDATE users SET website = ? WHERE id = ?').bind(w, me.id).run()
  }
  return json({ user: await getUserById(ctx.db, me.id) })
})

route('GET', '/me/following', async (ctx) => {
  const me = requireViewer(ctx)
  const rows = await ctx.db.prepare('SELECT followee_id FROM follows WHERE follower_id = ?').bind(me.id).all<{ followee_id: string }>()
  return json({ ids: rows.results.map((r) => r.followee_id) })
})

route('GET', '/me/reactions', async (ctx) => {
  const me = requireViewer(ctx)
  const rows = await ctx.db.prepare('SELECT cast_id, kind FROM reactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 2000').bind(me.id).all<{ cast_id: string; kind: string }>()
  return json({ likes: rows.results.filter((r) => r.kind === 'like').map((r) => r.cast_id), recasts: rows.results.filter((r) => r.kind === 'recast').map((r) => r.cast_id) })
})

route('GET', '/me/likes', async (ctx) => {
  const me = requireViewer(ctx)
  return json(await likedFeed(ctx, me.id, ctx.url.searchParams.get('cursor')))
})

/* ---------------- users ---------------- */

route('GET', '/users', async (ctx) => {
  const q = ctx.url.searchParams.get('q')?.trim().replace(/^@/, '').toLowerCase() ?? ''
  const limit = Math.min(50, Number(ctx.url.searchParams.get('limit')) || 20)
  if (ctx.url.searchParams.get('suggested')) {
    const rows = await ctx.db
      .prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.id != ? ${ctx.viewer ? 'AND u.id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)' : ''} ORDER BY (followers * 3 + cast_count) DESC, u.created_at DESC LIMIT ?`)
      .bind(...(ctx.viewer ? [ctx.viewer.id, ctx.viewer.id, limit] : ['', limit]))
      .all<UserRow>()
    return json({ users: rows.results.map(toUser) })
  }
  if (!q) return json({ users: [] })
  const like = `%${q.replace(/[%_]/g, '')}%`
  const rows = await ctx.db
    .prepare(`SELECT ${USER_SELECT} FROM users u WHERE u.username LIKE ? OR lower(u.display_name) LIKE ? OR u.id LIKE ? ORDER BY followers DESC LIMIT ?`)
    .bind(like, like, like, limit)
    .all<UserRow>()
  return json({ users: rows.results.map(toUser) })
})

route('GET', '/users/:handle', async (ctx, p) => {
  const user = await getUserByHandle(ctx.db, p.handle)
  if (!user) throw new HttpError(404, 'User not found')
  return json({ user })
})

route('POST', '/users/:handle/follow', async (ctx, p) => {
  const me = requireViewer(ctx)
  const target = await getUserByHandle(ctx.db, p.handle)
  if (!target) throw new HttpError(404, 'User not found')
  if (target.id === me.id) throw new HttpError(400, "You can't follow yourself")
  const r = await ctx.db.prepare('INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').bind(me.id, target.id, Date.now()).run()
  if (r.meta.changes) await pushActivity(ctx.db, target.id, 'follow', me.id, null)
  return json({ ok: true })
})

route('DELETE', '/users/:handle/follow', async (ctx, p) => {
  const me = requireViewer(ctx)
  const target = await getUserByHandle(ctx.db, p.handle)
  if (!target) throw new HttpError(404, 'User not found')
  await ctx.db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').bind(me.id, target.id).run()
  return json({ ok: true })
})

route('GET', '/users/:handle/following', async (ctx, p) => {
  const user = await getUserByHandle(ctx.db, p.handle)
  if (!user) throw new HttpError(404, 'User not found')
  const rows = await ctx.db.prepare(`SELECT ${USER_SELECT} FROM users u JOIN follows f ON f.followee_id = u.id WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT 200`).bind(user.id).all<UserRow>()
  return json({ users: rows.results.map(toUser) })
})

route('GET', '/users/:handle/followers', async (ctx, p) => {
  const user = await getUserByHandle(ctx.db, p.handle)
  if (!user) throw new HttpError(404, 'User not found')
  const rows = await ctx.db.prepare(`SELECT ${USER_SELECT} FROM users u JOIN follows f ON f.follower_id = u.id WHERE f.followee_id = ? ORDER BY f.created_at DESC LIMIT 200`).bind(user.id).all<UserRow>()
  return json({ users: rows.results.map(toUser) })
})

/* ---------------- casts ---------------- */

async function page(ctx: Ctx, where: string, binds: unknown[], cursor: string | null, order = 'c.created_at DESC', extraFrom = ''): Promise<{ casts: Cast[]; next?: string }> {
  const offset = Math.max(0, Number(cursor) || 0)
  const rows = await ctx.db
    .prepare(`SELECT c.* FROM casts c ${extraFrom} WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...binds, PAGE + 1, offset)
    .all<CastRow>()
  const list = rows.results.slice(0, PAGE)
  const casts = await hydrateCasts(ctx.db, list, ctx.viewer?.id ?? null)
  return { casts, next: rows.results.length > PAGE ? String(offset + PAGE) : undefined }
}

async function likedFeed(ctx: Ctx, userId: string, cursor: string | null) {
  return page(ctx, 'r.user_id = ? AND r.kind = "like"', [userId], cursor, 'r.created_at DESC', 'JOIN reactions r ON r.cast_id = c.id')
}

route('GET', '/casts', async (ctx) => {
  const kind = ctx.url.searchParams.get('kind') ?? 'home'
  const key = ctx.url.searchParams.get('key') ?? ''
  const cursor = ctx.url.searchParams.get('cursor')
  switch (kind) {
    case 'home':
      return json(await page(ctx, 'c.parent_id IS NULL', [], cursor))
    case 'trending': {
      const since = Date.now() - 1000 * 60 * 60 * 24 * 7
      return json(await page(ctx, 'c.parent_id IS NULL AND c.created_at > ?', [since], cursor, '(c.like_count * 2 + c.recast_count * 3 + c.reply_count) DESC, c.created_at DESC'))
    }
    case 'following': {
      const me = requireViewer(ctx)
      return json(await page(ctx, 'c.parent_id IS NULL AND (c.author_id = ? OR c.author_id IN (SELECT followee_id FROM follows WHERE follower_id = ?))', [me.id, me.id], cursor))
    }
    case 'channel':
      return json(await page(ctx, 'c.parent_id IS NULL AND c.channel = ?', [key], cursor))
    case 'market':
      return json(await page(ctx, 'c.parent_id IS NULL AND c.channel = ?', [`market:${key}`], cursor))
    case 'user': {
      const u = await getUserByHandle(ctx.db, key)
      if (!u) return json({ casts: [] })
      return json(
        await page(
          ctx,
          '(c.author_id = ? AND c.parent_id IS NULL) OR c.id IN (SELECT cast_id FROM reactions WHERE user_id = ? AND kind = "recast")',
          [u.id, u.id],
          cursor,
        ),
      )
    }
    case 'user-replies': {
      const u = await getUserByHandle(ctx.db, key)
      if (!u) return json({ casts: [] })
      return json(await page(ctx, 'c.author_id = ? AND c.parent_id IS NOT NULL', [u.id], cursor))
    }
    case 'user-likes': {
      const u = await getUserByHandle(ctx.db, key)
      if (!u) return json({ casts: [] })
      return json(await likedFeed(ctx, u.id, cursor))
    }
    case 'search': {
      const q = key.trim().toLowerCase()
      if (!q) return json({ casts: [] })
      return json(await page(ctx, 'lower(c.text) LIKE ?', [`%${q.replace(/[%_]/g, '')}%`], cursor))
    }
    default:
      throw new HttpError(400, 'Unknown feed')
  }
})

route('POST', '/casts', async (ctx) => {
  const me = requireViewer(ctx)
  const b = await body<{ text?: string; channel?: string | null; parentId?: string | null; quoteId?: string | null; images?: string[]; position?: unknown }>(ctx.req)
  const text = str(b.text, MAX_TEXT).trim()
  const images = Array.isArray(b.images) ? b.images.filter((i) => typeof i === 'string' && /^(https?:\/\/|data:image\/)/.test(i)).slice(0, 4) : []
  const position = b.position && typeof b.position === 'object' ? b.position : null
  if (!text && !images.length && !position) throw new HttpError(400, 'Cast is empty')
  const channel = b.parentId ? null : b.channel ? str(b.channel, 64) : null
  const parentId = b.parentId ? str(b.parentId, 64) : null
  const quoteId = b.quoteId ? str(b.quoteId, 64) : null
  const [parent, quote] = await Promise.all([parentId ? fetchCastRows(ctx.db, [parentId]) : [], quoteId ? fetchCastRows(ctx.db, [quoteId]) : []])
  if (parentId && !parent.length) throw new HttpError(404, 'Parent cast not found')
  if (quoteId && !quote.length) throw new HttpError(404, 'Quoted cast not found')
  const id = rid()
  const now = Date.now()
  const stmts = [
    ctx.db
      .prepare('INSERT INTO casts (id, author_id, text, created_at, channel, parent_id, quote_id, images, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, me.id, text, now, channel, parentId, quoteId, JSON.stringify(images), position ? JSON.stringify(position) : null),
  ]
  if (parentId) stmts.push(ctx.db.prepare('UPDATE casts SET reply_count = reply_count + 1 WHERE id = ?').bind(parentId))
  await ctx.db.batch(stmts)
  if (parent[0]) await pushActivity(ctx.db, parent[0].author_id, 'reply', me.id, id)
  if (quote[0]) await pushActivity(ctx.db, quote[0].author_id, 'quote', me.id, id)
  const mentions = Array.from(new Set(Array.from(text.matchAll(/@([a-z0-9_]{3,20})/gi), (m) => m[1].toLowerCase()))).slice(0, 10)
  if (mentions.length) {
    const rows = await ctx.db
      .prepare(`SELECT id FROM users WHERE username IN (${mentions.map(() => '?').join(',')}) COLLATE NOCASE`)
      .bind(...mentions)
      .all<{ id: string }>()
    for (const r of rows.results) await pushActivity(ctx.db, r.id, 'mention', me.id, id)
  }
  const [cast] = await hydrateCasts(ctx.db, await fetchCastRows(ctx.db, [id]), me.id)
  return json({ cast }, 201)
})

route('GET', '/casts/:id', async (ctx, p) => {
  const rows = await fetchCastRows(ctx.db, [p.id])
  if (!rows.length) throw new HttpError(404, 'Cast not found')
  const [cast] = await hydrateCasts(ctx.db, rows, ctx.viewer?.id ?? null)
  return json({ cast })
})

route('DELETE', '/casts/:id', async (ctx, p) => {
  const me = requireViewer(ctx)
  const [row] = await fetchCastRows(ctx.db, [p.id])
  if (!row) return json({ ok: true })
  if (row.author_id !== me.id) throw new HttpError(403, 'Not your cast')
  const stmts = [ctx.db.prepare('DELETE FROM casts WHERE id = ?').bind(row.id)]
  if (row.parent_id) stmts.push(ctx.db.prepare('UPDATE casts SET reply_count = MAX(0, reply_count - 1) WHERE id = ?').bind(row.parent_id))
  await ctx.db.batch(stmts)
  return json({ ok: true })
})

route('GET', '/casts/:id/replies', async (ctx, p) => {
  const rows = await ctx.db.prepare('SELECT * FROM casts c WHERE c.parent_id = ? ORDER BY c.created_at ASC LIMIT 200').bind(p.id).all<CastRow>()
  return json({ casts: await hydrateCasts(ctx.db, rows.results, ctx.viewer?.id ?? null) })
})

async function react(ctx: Ctx, id: string, kind: 'like' | 'recast', on: boolean): Promise<Response> {
  const me = requireViewer(ctx)
  const [row] = await fetchCastRows(ctx.db, [id])
  if (!row) throw new HttpError(404, 'Cast not found')
  const col = kind === 'like' ? 'like_count' : 'recast_count'
  if (on) {
    const r = await ctx.db.prepare('INSERT OR IGNORE INTO reactions (user_id, cast_id, kind, created_at) VALUES (?, ?, ?, ?)').bind(me.id, id, kind, Date.now()).run()
    if (r.meta.changes) {
      await ctx.db.prepare(`UPDATE casts SET ${col} = ${col} + 1 WHERE id = ?`).bind(id).run()
      await pushActivity(ctx.db, row.author_id, kind, me.id, id)
    }
  } else {
    const r = await ctx.db.prepare('DELETE FROM reactions WHERE user_id = ? AND cast_id = ? AND kind = ?').bind(me.id, id, kind).run()
    if (r.meta.changes) await ctx.db.prepare(`UPDATE casts SET ${col} = MAX(0, ${col} - 1) WHERE id = ?`).bind(id).run()
  }
  const [cast] = await hydrateCasts(ctx.db, await fetchCastRows(ctx.db, [id]), me.id)
  return json({ cast })
}

route('POST', '/casts/:id/like', (ctx, p) => react(ctx, p.id, 'like', true))
route('DELETE', '/casts/:id/like', (ctx, p) => react(ctx, p.id, 'like', false))
route('POST', '/casts/:id/recast', (ctx, p) => react(ctx, p.id, 'recast', true))
route('DELETE', '/casts/:id/recast', (ctx, p) => react(ctx, p.id, 'recast', false))

/* ---------------- activity ---------------- */

route('GET', '/activity', async (ctx) => {
  const me = requireViewer(ctx)
  const rows = await ctx.db
    .prepare('SELECT a.id, a.kind, a.actor_id, a.cast_id, a.created_at, a.read, c.text AS cast_text FROM activity a LEFT JOIN casts c ON c.id = a.cast_id WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 100')
    .bind(me.id)
    .all<{ id: string; kind: string; actor_id: string; cast_id: string | null; created_at: number; read: number; cast_text: string | null }>()
  const users = await getUsers(
    ctx.db,
    rows.results.map((r) => r.actor_id),
  )
  return json({
    items: rows.results
      .filter((r) => users.has(r.actor_id))
      .map((r) => ({ id: r.id, kind: r.kind, actor: users.get(r.actor_id), castId: r.cast_id, castText: r.cast_text, time: r.created_at, read: !!r.read })),
  })
})

route('POST', '/activity/read', async (ctx) => {
  const me = requireViewer(ctx)
  await ctx.db.prepare('UPDATE activity SET read = 1 WHERE user_id = ? AND read = 0').bind(me.id).run()
  return json({ ok: true })
})

/* ---------------- direct messages ---------------- */

route('GET', '/dm', async (ctx) => {
  const me = requireViewer(ctx)
  const rows = await ctx.db
    .prepare(
      `SELECT m.* FROM messages m WHERE m.id IN (
         SELECT id FROM messages x WHERE (x.from_id = ? OR x.to_id = ?)
         GROUP BY CASE WHEN x.from_id = ? THEN x.to_id ELSE x.from_id END
         HAVING MAX(x.created_at)
       ) ORDER BY m.created_at DESC LIMIT 100`,
    )
    .bind(me.id, me.id, me.id)
    .all<{ id: string; from_id: string; to_id: string; text: string; created_at: number }>()
  const peers = rows.results.map((m) => (m.from_id === me.id ? m.to_id : m.from_id))
  const users = await getUsers(ctx.db, peers)
  const reads = await ctx.db.prepare('SELECT peer_id, read_at FROM dm_reads WHERE user_id = ?').bind(me.id).all<{ peer_id: string; read_at: number }>()
  const readAt = new Map(reads.results.map((r) => [r.peer_id, r.read_at]))
  const threads = []
  for (const m of rows.results) {
    const peer = m.from_id === me.id ? m.to_id : m.from_id
    const u = users.get(peer)
    if (!u) continue
    const unread = await ctx.db
      .prepare('SELECT COUNT(*) AS n FROM messages WHERE from_id = ? AND to_id = ? AND created_at > ?')
      .bind(peer, me.id, readAt.get(peer) ?? 0)
      .first<{ n: number }>()
    threads.push({ peer: u, last: { id: m.id, from: m.from_id, to: m.to_id, text: m.text, time: m.created_at }, unread: unread?.n ?? 0 })
  }
  return json({ threads })
})

route('GET', '/dm/:peer', async (ctx, p) => {
  const me = requireViewer(ctx)
  const peer = p.peer.toLowerCase()
  const since = Number(ctx.url.searchParams.get('since')) || 0
  const rows = await ctx.db
    .prepare('SELECT * FROM messages WHERE ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) AND created_at > ? ORDER BY created_at ASC LIMIT 500')
    .bind(me.id, peer, peer, me.id, since)
    .all<{ id: string; from_id: string; to_id: string; text: string; created_at: number }>()
  return json({ messages: rows.results.map((m) => ({ id: m.id, from: m.from_id, to: m.to_id, text: m.text, time: m.created_at })) })
})

route('POST', '/dm/:peer', async (ctx, p) => {
  const me = requireViewer(ctx)
  const peer = await getUserByHandle(ctx.db, p.peer)
  if (!peer) throw new HttpError(404, 'User not found')
  if (peer.id === me.id) throw new HttpError(400, "You can't message yourself")
  const b = await body<{ text?: string }>(ctx.req)
  const text = str(b.text, 2000).trim()
  if (!text) throw new HttpError(400, 'Message is empty')
  const id = rid()
  const now = Date.now()
  await ctx.db.batch([
    ctx.db.prepare('INSERT INTO messages (id, from_id, to_id, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, me.id, peer.id, text, now),
    ctx.db.prepare('INSERT OR REPLACE INTO dm_reads (user_id, peer_id, read_at) VALUES (?, ?, ?)').bind(me.id, peer.id, now),
  ])
  return json({ message: { id, from: me.id, to: peer.id, text, time: now } }, 201)
})

route('POST', '/dm/:peer/read', async (ctx, p) => {
  const me = requireViewer(ctx)
  await ctx.db.prepare('INSERT OR REPLACE INTO dm_reads (user_id, peer_id, read_at) VALUES (?, ?, ?)').bind(me.id, p.peer.toLowerCase(), Date.now()).run()
  return json({ ok: true })
})

/* ---------------- dispatch ---------------- */

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  if (!h?.startsWith('Bearer ')) return null
  return h.slice(7).trim() || null
}

async function viewerFromRequest(db: D1Database, req: Request): Promise<User | null> {
  const token = bearer(req)
  if (!token) return null
  const s = await db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').bind(token).first<{ user_id: string; expires_at: number }>()
  if (!s || s.expires_at < Date.now()) return null
  return getUserById(db, s.user_id)
}

export const onRequest: PagesFunction<{ route?: string[] }> = async ({ request, env, params }) => {
  const url = new URL(request.url)
  const path = '/' + (Array.isArray(params.route) ? params.route.join('/') : (params.route as string | undefined) ?? '')
  if (!env.DB) {
    if (path === '/health') return json({ ok: true, db: false, time: Date.now() })
    return json({ error: 'Database not configured' }, 503)
  }
  try {
    for (const r of routes) {
      if (r.method !== request.method) continue
      const m = r.pattern.exec(path.replace(/^\//, ''))
      if (!m) continue
      const p: Record<string, string> = {}
      r.keys.forEach((k, i) => (p[k] = decodeURIComponent(m[i + 1])))
      const viewer = path === '/health' ? null : await viewerFromRequest(env.DB, request)
      return await r.handler({ db: env.DB, env, req: request, url, viewer }, p)
    }
    return json({ error: 'Not found' }, 404)
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: (e as Error).message || 'Internal error' }, 500)
  }
}
