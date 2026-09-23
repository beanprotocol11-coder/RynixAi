import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api } from '../lib/api'
import type { Cast, PublishInput, User } from '../lib/social'
import { useAuth } from './auth'
import { notify, toast } from './notify'

interface SocialState {
  /** Latest known version of every cast the UI has seen — keeps likes/replies consistent across feeds. */
  casts: Record<string, Cast>
  /** Casts published in this session, newest first, so they appear instantly in feeds. */
  fresh: Cast[]
  deleted: Record<string, true>
  follows: Record<string, true>
  bookmarks: Record<string, number> // castId -> saved at (device local)
  muted: Record<string, number>
  hidden: Record<string, number>
  tick: number

  absorb: (casts: Cast[]) => void
  hydrateMine: () => Promise<void>
  publish: (input: PublishInput) => Promise<Cast>
  remove: (id: string) => Promise<void>
  toggleLike: (cast: Cast) => Promise<boolean>
  toggleRecast: (cast: Cast) => Promise<boolean>
  toggleBookmark: (id: string) => boolean
  toggleFollow: (user: User) => Promise<boolean>
  toggleMute: (userId: string) => boolean
  hide: (id: string) => void
  isFollowing: (userId: string) => boolean
  bump: () => void
}

export const useSocial = create<SocialState>()(
  persist(
    (set, get) => ({
      casts: {},
      fresh: [],
      deleted: {},
      follows: {},
      bookmarks: {},
      muted: {},
      hidden: {},
      tick: 0,

      absorb: (list) => {
        if (!list.length) return
        set((s) => {
          const casts = { ...s.casts }
          for (const c of list) {
            casts[c.id] = c
            if (c.quote) casts[c.quote.id] = { ...casts[c.quote.id], ...c.quote }
          }
          return { casts }
        })
      },

      hydrateMine: async () => {
        if (!useAuth.getState().user) {
          set({ follows: {}, fresh: [] })
          return
        }
        try {
          const ids = await api().myFollowing()
          const follows: Record<string, true> = {}
          ids.forEach((id) => (follows[id] = true))
          set({ follows })
        } catch {
          /* offline */
        }
      },

      publish: async (input) => {
        const cast = await api().publish(input)
        set((s) => {
          const casts = { ...s.casts, [cast.id]: cast }
          if (cast.parentId && casts[cast.parentId]) casts[cast.parentId] = { ...casts[cast.parentId], replies: casts[cast.parentId].replies + 1 }
          return { casts, fresh: [cast, ...s.fresh].slice(0, 100) }
        })
        return cast
      },

      remove: async (id) => {
        await api().remove(id)
        set((s) => {
          const target = s.casts[id]
          const casts = { ...s.casts }
          delete casts[id]
          if (target?.parentId && casts[target.parentId]) casts[target.parentId] = { ...casts[target.parentId], replies: Math.max(0, casts[target.parentId].replies - 1) }
          return { casts, fresh: s.fresh.filter((c) => c.id !== id), deleted: { ...s.deleted, [id]: true } }
        })
      },

      toggleLike: async (cast) => {
        const cur = get().casts[cast.id] ?? cast
        const on = !cur.liked
        set((s) => ({ casts: { ...s.casts, [cast.id]: { ...cur, liked: on, likes: Math.max(0, cur.likes + (on ? 1 : -1)) } } }))
        try {
          const fresh = await api().react(cast.id, 'like', on)
          set((s) => ({ casts: { ...s.casts, [cast.id]: fresh } }))
        } catch (e) {
          set((s) => ({ casts: { ...s.casts, [cast.id]: cur } }))
          toast({ kind: 'error', title: (e as Error).message })
          return !on
        }
        return on
      },

      toggleRecast: async (cast) => {
        const cur = get().casts[cast.id] ?? cast
        const on = !cur.recasted
        set((s) => ({ casts: { ...s.casts, [cast.id]: { ...cur, recasted: on, recasts: Math.max(0, cur.recasts + (on ? 1 : -1)) } } }))
        try {
          const fresh = await api().react(cast.id, 'recast', on)
          set((s) => ({ casts: { ...s.casts, [cast.id]: fresh } }))
        } catch (e) {
          set((s) => ({ casts: { ...s.casts, [cast.id]: cur } }))
          toast({ kind: 'error', title: (e as Error).message })
          return !on
        }
        return on
      },

      toggleBookmark: (id) => {
        const on = !get().bookmarks[id]
        set((s) => {
          const bookmarks = { ...s.bookmarks }
          if (on) bookmarks[id] = Date.now()
          else delete bookmarks[id]
          return { bookmarks }
        })
        return on
      },

      toggleFollow: async (user) => {
        const on = !get().follows[user.id]
        set((s) => {
          const follows = { ...s.follows }
          if (on) follows[user.id] = true
          else delete follows[user.id]
          return { follows }
        })
        try {
          await api().follow(user.id, on)
        } catch (e) {
          set((s) => {
            const follows = { ...s.follows }
            if (on) delete follows[user.id]
            else follows[user.id] = true
            return { follows }
          })
          toast({ kind: 'error', title: (e as Error).message })
          return !on
        }
        if (on) notify({ kind: 'follow', title: `You followed @${user.username}`, href: `/u/${user.username}` })
        get().bump()
        return on
      },

      toggleMute: (userId) => {
        const on = !get().muted[userId]
        set((s) => {
          const muted = { ...s.muted }
          if (on) muted[userId] = Date.now()
          else delete muted[userId]
          return { muted }
        })
        return on
      },
      hide: (id) => set((s) => ({ hidden: { ...s.hidden, [id]: Date.now() } })),
      isFollowing: (userId) => !!get().follows[userId],
      bump: () => set((s) => ({ tick: s.tick + 1 })),
    }),
    {
      name: 'perpcast:social',
      version: 2,
      partialize: (s) => ({ bookmarks: s.bookmarks, muted: s.muted, hidden: s.hidden }),
      migrate: () => ({ bookmarks: {}, muted: {}, hidden: {} }),
    },
  ),
)

/** Live view of a cast: server copy merged with any optimistic updates. */
export function useCast(cast: Cast): Cast {
  return useSocial((s) => s.casts[cast.id]) ?? cast
}
