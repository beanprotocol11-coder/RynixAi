import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/format'
import { primeUser, type FcUser } from '../lib/farcaster'

export interface DMMessage {
  id: string
  from: number
  text: string
  time: number
}

export interface DMThread {
  id: string
  peer: FcUser
  messages: DMMessage[]
  lastRead: number
  createdAt: number
}

interface DMState {
  threads: DMThread[]
  open: (peer: FcUser) => DMThread
  send: (threadId: string, from: number, text: string) => void
  markRead: (threadId: string) => void
  remove: (threadId: string) => void
  unreadCount: () => number
}

export const useDMs = create<DMState>()(
  persist(
    (set, get) => ({
      threads: [],
      open: (peer) => {
        primeUser(peer)
        const existing = get().threads.find((t) => t.peer.fid === peer.fid)
        if (existing) return existing
        const t: DMThread = { id: `dm:${uid()}`, peer, messages: [], lastRead: Date.now(), createdAt: Date.now() }
        set((s) => ({ threads: [t, ...s.threads] }))
        return t
      },
      send: (threadId, from, text) =>
        set((s) => ({
          threads: s.threads
            .map((t) => (t.id === threadId ? { ...t, messages: [...t.messages, { id: uid(), from, text, time: Date.now() }], lastRead: Date.now() } : t))
            .sort((a, b) => lastTime(b) - lastTime(a)),
        })),
      markRead: (threadId) => set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, lastRead: Date.now() } : t)) })),
      remove: (threadId) => set((s) => ({ threads: s.threads.filter((t) => t.id !== threadId) })),
      unreadCount: () => get().threads.reduce((n, t) => n + t.messages.filter((m) => m.time > t.lastRead && m.from === t.peer.fid).length, 0),
    }),
    {
      name: 'perpcast:dm',
      onRehydrateStorage: () => (state) => state?.threads.forEach((t) => primeUser(t.peer)),
    },
  ),
)

export function lastTime(t: DMThread): number {
  return t.messages.length ? t.messages[t.messages.length - 1].time : t.createdAt
}
