import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CastCard } from './CastCard'
import { CastSkeleton, Empty, Spinner } from './ui'
import { RefreshIcon, SparkIcon } from './Icons'
import type { Cast, CastPage } from '../lib/social'
import { api } from '../lib/api'
import type { FeedQuery } from '../lib/api'
import { useSocial } from '../store/social'
import { useAuth } from '../store/auth'
import { cx } from '../lib/format'

export type Loader = (cursor?: string) => Promise<CastPage>

/** Build a loader for one of the backend feeds. */
export function feedLoader(q: Omit<FeedQuery, 'cursor'>): Loader {
  return (cursor) => api().feed({ ...q, cursor })
}

interface Props {
  load: Loader
  /** Which freshly-published casts belong in this feed (defaults to top-level casts). */
  freshFilter?: (c: Cast) => boolean
  emptyTitle?: string
  emptyBody?: string
  emptyAction?: React.ReactNode
  showParentContext?: boolean
  refreshKey?: string
  pollMs?: number
}

export function Feed({ load, freshFilter, emptyTitle = 'Nothing here yet', emptyBody, emptyAction, showParentContext = true, refreshKey, pollMs = 30_000 }: Props) {
  const [remote, setRemote] = useState<Cast[]>([])
  const [next, setNext] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Cast[]>([])
  const ready = useAuth((s) => s.hydrated)
  const fresh = useSocial((s) => s.fresh)
  const deleted = useSocial((s) => s.deleted)
  const muted = useSocial((s) => s.muted)
  const hidden = useSocial((s) => s.hidden)
  const absorb = useSocial((s) => s.absorb)
  const sentinel = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  const run = useCallback(
    async (mode: 'init' | 'more' | 'refresh') => {
      const my = ++seq.current
      if (mode === 'init') {
        setLoading(true)
        setError(null)
      } else if (mode === 'more') setMore(true)
      try {
        const page = await load(mode === 'more' ? next : undefined)
        if (my !== seq.current) return
        absorb(page.casts)
        if (mode === 'more') setRemote((r) => dedupe([...r, ...page.casts]))
        else if (mode === 'refresh') {
          setRemote((r) => {
            const known = new Set(r.map((c) => c.id))
            const freshOnes = page.casts.filter((c) => !known.has(c.id))
            if (freshOnes.length && r.length) {
              setPending(freshOnes)
              return r
            }
            return dedupe(page.casts)
          })
        } else setRemote(dedupe(page.casts))
        if (mode !== 'refresh') setNext(page.next)
      } catch (e) {
        if (my !== seq.current) return
        setError((e as Error).message || 'Failed to load')
      } finally {
        if (my === seq.current) {
          setLoading(false)
          setMore(false)
        }
      }
    },
    [load, next, absorb],
  )

  useEffect(() => {
    if (!ready) return
    setRemote([])
    setNext(undefined)
    setPending([])
    void run('init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey, ready])

  useEffect(() => {
    if (!ready || !pollMs) return
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void run('refresh')
    }, pollMs)
    return () => clearInterval(t)
  }, [ready, pollMs, run])

  useEffect(() => {
    const el = sentinel.current
    if (!el || !next) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !more && !loading) void run('more')
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [next, more, loading, run])

  const items = useMemo(() => {
    const filter = freshFilter ?? ((c: Cast) => !c.parentId)
    const known = new Set(remote.map((c) => c.id))
    const locals = fresh.filter((c) => filter(c) && !known.has(c.id))
    const all = [...locals, ...remote].filter((c) => !muted[c.author.id] && !hidden[c.id] && !deleted[c.id])
    all.sort((a, b) => b.timestamp - a.timestamp)
    return all
  }, [fresh, remote, freshFilter, muted, hidden, deleted])

  const showPending = () => {
    setRemote((r) => dedupe([...pending, ...r]))
    setPending([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if ((loading || !ready) && items.length === 0) {
    return (
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <CastSkeleton key={i} />
        ))}
      </div>
    )
  }

  return (
    <div>
      {pending.length > 0 && (
        <button className="sticky top-14 z-20 mx-auto my-2 flex items-center gap-2 rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-white shadow-pop anim-pop" onClick={showPending}>
          <SparkIcon size={14} /> {pending.length} new cast{pending.length > 1 ? 's' : ''}
        </button>
      )}
      {error && items.length === 0 && (
        <Empty
          title="Couldn't load this feed"
          body={error}
          icon={<RefreshIcon />}
          action={
            <button className="btn btn-outline" onClick={() => void run('init')}>
              Try again
            </button>
          }
        />
      )}
      {!error && items.length === 0 && <Empty title={emptyTitle} body={emptyBody} action={emptyAction} icon={<SparkIcon />} />}
      {items.map((c) => (
        <CastCard key={c.id} cast={c} showParentContext={showParentContext} />
      ))}
      <div ref={sentinel} className={cx('flex items-center justify-center py-6 text-sm text-ink-3', !next && items.length > 0 && 'border-t border-line')}>
        {more ? <Spinner /> : next ? (
          <button className="btn btn-ghost text-sm" onClick={() => void run('more')}>
            Load more
          </button>
        ) : items.length > 0 ? (
          "You're all caught up"
        ) : null}
      </div>
    </div>
  )
}

function dedupe(casts: Cast[]): Cast[] {
  const seen = new Set<string>()
  return casts.filter((c) => {
    if (seen.has(c.id)) return false
    seen.add(c.id)
    return true
  })
}
