import { create } from 'zustand'
import { api } from '../lib/api'
import type { DMMessage, DMThread, User } from '../lib/social'
import { useAuth } from './auth'
import { toast } from './notify'
import { deviceKey, isEncrypted, open as openSealed, seal } from '../lib/e2e'

export class NoPeerKeyError extends Error {
  constructor(name: string) {
    super(`${name} hasn't opened Perpcast since encrypted DMs launched, so there's no key to encrypt to yet. Ask them to sign in once, then try again.`)
  }
}

/** Turns a stored (encrypted) message into what this device can show. */
function reveal(m: DMMessage): DMMessage {
  const me = useAuth.getState().user
  if (!me || !isEncrypted(m.text)) return m
  const r = openSealed(m.text, deviceKey(me.id))
  return r.ok ? { ...m, text: r.text } : { ...m, text: '', locked: r.reason }
}

interface DMState {
  threads: DMThread[]
  messages: Record<string, DMMessage[]> // peerId -> ascending
  loading: boolean
  loaded: boolean
  refreshThreads: () => Promise<void>
  open: (peer: User) => void
  loadMessages: (peerId: string) => Promise<void>
  send: (peer: User, text: string) => Promise<void>
  markRead: (peerId: string) => Promise<void>
  unreadCount: () => number
  reset: () => void
}

export const useDMs = create<DMState>()((set, get) => ({
  threads: [],
  messages: {},
  loading: false,
  loaded: false,

  refreshThreads: async () => {
    if (!useAuth.getState().user) return
    set({ loading: true })
    try {
      const threads = (await api().dmThreads()).map((t) => (t.last ? { ...t, last: reveal(t.last) } : t))
      set((s) => {
        // keep locally-opened empty threads that the server does not know about yet
        const known = new Set(threads.map((t) => t.peer.id))
        const extra = s.threads.filter((t) => !t.last && !known.has(t.peer.id))
        return { threads: [...threads, ...extra], loaded: true }
      })
    } catch (e) {
      if (!get().loaded) toast({ kind: 'error', title: (e as Error).message })
    } finally {
      set({ loading: false })
    }
  },

  open: (peer) => {
    if (get().threads.some((t) => t.peer.id === peer.id)) return
    set((s) => ({ threads: [{ peer, last: null, unread: 0 }, ...s.threads] }))
  },

  loadMessages: async (peerId) => {
    const have = get().messages[peerId]
    const since = have?.length ? have[have.length - 1].time : undefined
    try {
      const list = (await api().dmMessages(peerId, since)).map(reveal)
      if (!list.length && have) return
      set((s) => {
        const prev = s.messages[peerId] ?? []
        const ids = new Set(prev.map((m) => m.id))
        const merged = [...prev, ...list.filter((m) => !ids.has(m.id))].sort((a, b) => a.time - b.time)
        return { messages: { ...s.messages, [peerId]: merged } }
      })
    } catch {
      /* transient */
    }
  },

  send: async (peer, text) => {
    const me = useAuth.getState().user
    if (!me) throw new Error('Sign in to send messages')
    let peerKey = peer.dmKey
    if (!peerKey) {
      const fresh = await api().getUser(peer.username).catch(() => null)
      peerKey = fresh?.dmKey
      if (fresh) peer = fresh
    }
    if (!peerKey) throw new NoPeerKeyError(peer.displayName || `@${peer.username}`)
    const sent = await api().dmSend(peer.id, seal(text, deviceKey(me.id), peerKey))
    const msg: DMMessage = { ...sent, text }
    set((s) => {
      const prev = s.messages[peer.id] ?? []
      const threads = s.threads.filter((t) => t.peer.id !== peer.id)
      return { messages: { ...s.messages, [peer.id]: [...prev, msg] }, threads: [{ peer, last: msg, unread: 0 }, ...threads] }
    })
  },

  markRead: async (peerId) => {
    set((s) => ({ threads: s.threads.map((t) => (t.peer.id === peerId ? { ...t, unread: 0 } : t)) }))
    await api().dmRead(peerId).catch(() => undefined)
  },

  unreadCount: () => get().threads.reduce((n, t) => n + t.unread, 0),
  reset: () => set({ threads: [], messages: {}, loaded: false }),
}))

export function lastTime(t: DMThread): number {
  return t.last?.time ?? 0
}
