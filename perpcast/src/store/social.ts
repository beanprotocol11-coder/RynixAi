import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { uid } from '../lib/format'
import type { Cast, FcUser, PositionEmbed } from '../lib/farcaster'
import { primeUser } from '../lib/farcaster'
import { notify } from './notify'

export interface LocalCast extends Cast {
  local: true
  author: FcUser
  parentId?: string | null // id of parent cast (hub `${fid}:${hash}` or local id)
  parentAuthor?: FcUser | null
  quoteId?: string | null
  images?: string[]
}

interface SocialState {
  casts: LocalCast[]
  likes: Record<string, number> // castId -> liked at
  recasts: Record<string, number>
  bookmarks: Record<string, number>
  follows: Record<number, number> // fid -> followed at
  mutedFids: Record<number, number>
  hiddenCasts: Record<string, number>
  replyCounts: Record<string, number>
  likeCounts: Record<string, number> // local like deltas per cast

  publish: (input: {
    author: FcUser
    text: string
    channelUrl?: string | null
    parent?: Cast | null
    quote?: Cast | null
    position?: PositionEmbed
    images?: string[]
  }) => LocalCast
  remove: (id: string) => void
  toggleLike: (id: string) => boolean
  toggleRecast: (id: string) => boolean
  toggleBookmark: (id: string) => boolean
  toggleFollow: (fid: number, user?: FcUser) => boolean
  toggleMute: (fid: number) => boolean
  hide: (id: string) => void
  isLiked: (id: string) => boolean
  isRecast: (id: string) => boolean
  isBookmarked: (id: string) => boolean
  isFollowing: (fid: number) => boolean
}

export const useSocial = create<SocialState>()(
  persist(
    (set, get) => ({
      casts: [],
      likes: {},
      recasts: {},
      bookmarks: {},
      follows: {},
      mutedFids: {},
      hiddenCasts: {},
      replyCounts: {},
      likeCounts: {},

      publish: ({ author, text, channelUrl, parent, quote, position, images }) => {
        const id = `local:${uid()}`
        const parentAuthor = parent ? (parent as LocalCast).author ?? null : null
        const cast: LocalCast = {
          id,
          local: true,
          fid: author.fid,
          hash: id,
          author,
          text,
          timestamp: Date.now(),
          parentUrl: parent ? null : channelUrl ?? null,
          parent: parent ? { fid: parent.fid, hash: parent.hash } : null,
          parentId: parent?.id ?? null,
          parentAuthor,
          quoteId: quote?.id ?? null,
          embeds: quote ? [{ castId: { fid: quote.fid, hash: quote.hash } }] : [],
          mentions: [],
          mentionsPositions: [],
          position,
          images,
          channel: channelUrl ?? null,
        }
        set((s) => ({
          casts: [cast, ...s.casts],
          replyCounts: parent ? { ...s.replyCounts, [parent.id]: (s.replyCounts[parent.id] ?? 0) + 1 } : s.replyCounts,
        }))
        return cast
      },

      remove: (id) =>
        set((s) => {
          const target = s.casts.find((c) => c.id === id)
          const replyCounts = { ...s.replyCounts }
          if (target?.parentId && replyCounts[target.parentId]) replyCounts[target.parentId] = Math.max(0, replyCounts[target.parentId] - 1)
          return { casts: s.casts.filter((c) => c.id !== id && c.parentId !== id), replyCounts }
        }),

      toggleLike: (id) => {
        const on = !get().likes[id]
        set((s) => {
          const likes = { ...s.likes }
          if (on) likes[id] = Date.now()
          else delete likes[id]
          return { likes, likeCounts: { ...s.likeCounts, [id]: (s.likeCounts[id] ?? 0) + (on ? 1 : -1) } }
        })
        return on
      },
      toggleRecast: (id) => {
        const on = !get().recasts[id]
        set((s) => {
          const recasts = { ...s.recasts }
          if (on) recasts[id] = Date.now()
          else delete recasts[id]
          return { recasts }
        })
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
      toggleFollow: (fid, user) => {
        const on = !get().follows[fid]
        if (user) primeUser(user)
        set((s) => {
          const follows = { ...s.follows }
          if (on) follows[fid] = Date.now()
          else delete follows[fid]
          return { follows }
        })
        if (on && user) notify({ kind: 'follow', title: `You followed @${user.username}`, href: `/u/${user.username}` })
        return on
      },
      toggleMute: (fid) => {
        const on = !get().mutedFids[fid]
        set((s) => {
          const mutedFids = { ...s.mutedFids }
          if (on) mutedFids[fid] = Date.now()
          else delete mutedFids[fid]
          return { mutedFids }
        })
        return on
      },
      hide: (id) => set((s) => ({ hiddenCasts: { ...s.hiddenCasts, [id]: Date.now() } })),
      isLiked: (id) => !!get().likes[id],
      isRecast: (id) => !!get().recasts[id],
      isBookmarked: (id) => !!get().bookmarks[id],
      isFollowing: (fid) => !!get().follows[fid],
    }),
    {
      name: 'perpcast:social',
      onRehydrateStorage: () => (state) => {
        state?.casts.forEach((c) => primeUser(c.author))
      },
    },
  ),
)

export function selectLocalReplies(casts: LocalCast[], parentId: string): LocalCast[] {
  return casts.filter((c) => c.parentId === parentId).sort((a, b) => a.timestamp - b.timestamp)
}
