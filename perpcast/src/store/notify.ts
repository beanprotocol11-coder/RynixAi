import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/format'

export type ToastKind = 'info' | 'success' | 'error' | 'long' | 'short'

export interface Toast {
  id: string
  kind: ToastKind
  title: string
  body?: string
  ttl: number
  action?: { label: string; onClick: () => void }
}

export type NotificationKind = 'fill' | 'close' | 'liquidation' | 'tp' | 'sl' | 'system' | 'cast' | 'reply' | 'like' | 'recast' | 'follow' | 'joined'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body?: string
  time: number
  read: boolean
  href?: string
}

interface NotifyState {
  toasts: Toast[]
  notifications: AppNotification[]
  toast: (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => void
  dismiss: (id: string) => void
  push: (n: Omit<AppNotification, 'id' | 'time' | 'read'>) => void
  markAllRead: () => void
  markRead: (id: string) => void
  clear: () => void
}

export const useNotify = create<NotifyState>()(
  persist(
    (set) => ({
      toasts: [],
      notifications: [],
      toast: (t) => {
        const toast: Toast = { id: uid(), ttl: t.ttl ?? 3600, ...t }
        set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }))
        setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== toast.id) })), toast.ttl)
      },
      dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      push: (n) =>
        set((s) => {
          if (n.kind === 'joined' && s.notifications.some((x) => x.kind === 'joined' && x.href === n.href)) return s
          return { notifications: [{ id: uid(), time: Date.now(), read: false, ...n }, ...s.notifications].slice(0, 200) }
        }),
      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
      markRead: (id) => set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),
      clear: () => set({ notifications: [] }),
    }),
    {
      name: 'perpcast:notify',
      partialize: (s) => ({ notifications: s.notifications }),
      merge: (persisted, current) => {
        const p = persisted as Partial<Pick<NotifyState, 'notifications'>> | undefined
        const seen = new Set<string>()
        const list = (p?.notifications ?? []).filter((n) => {
          if (/^Signed in with /.test(n.title)) return false
          if (n.kind === 'joined') {
            if (n.href === '/u/zouravxbt') return false
            const k = `joined:${n.href}`
            if (seen.has(k)) return false
            seen.add(k)
          }
          return true
        })
        return { ...current, notifications: list }
      },
    },
  ),
)

export const toast = (t: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }) => useNotify.getState().toast(t)
export const notify = (n: Omit<AppNotification, 'id' | 'time' | 'read'>) => useNotify.getState().push(n)
