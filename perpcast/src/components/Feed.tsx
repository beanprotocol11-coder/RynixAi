import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CastCard } from './CastCard'
import { CastSkeleton, Empty, Spinner } from './ui'
import { RefreshIcon, SparkIcon } from './Icons'
import type { Cast, CastPage } from '../lib/farcaster'
import { useSocial, type LocalCast } from '../store/social'
import { cx } from '../lib/format'

export type Loader = (pageToken?: string) => Promise<CastPage>

interface Props {
  load: Loader
  /** Which local casts belong in this feed (defaults to top-level casts). */
  localFilter?: (c: LocalCast) => boolean
  emptyTitle?: string
  emptyBody?: string
  emptyAction?: React.ReactNode
  showParentContext?: boolean
  refreshKey?: string
}

export function Feed({ load, localFilter, emptyTitle = 'Nothing here yet', emptyBody, emptyAction, showParentContext = true, refreshKey }: Props) {
  const [remote, setRemote] = useState<Cast[]>([])
  const [next, setNext] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Cast[]>([])
  const localCasts = useSocial((s) => s.casts)
  const muted = useSocial((s) => s.mutedFids)
  const hidden = useSocial((s) => s.hiddenCasts)
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
        if (mode === 'more') setRemote((r) => dedupe([...r, ...page.casts]))
        else if (mode === 'refresh') {
          setRemote((r) => {
            const known = new Set(r.map((c) => c.id))
            const fresh = page.casts.filter((c) => !known.has(c.id))
            if (fresh.length && r.length) {
              setPending(fresh)
              return r
            }
            return dedupe(page.casts)
          })
        } else setRemote(dedupe(page.casts))
        setNext(page.next)
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
    [load, next],
  )

  useEffect(() => {
    setRemote([])
    setNext(undefined)
    setPending([])
    void run('init')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refreshKey])

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
    const filter = localFilter ?? ((c: LocalCast) => !c.parentId)
    const locals = localCasts.filter(filter)
    const all = [...locals, ...remote].filter((c) => !muted[c.fid] && !hidden[c.id])
    all.sort((a, b) => b.timestamp - a.timestamp)
    return all
  }, [localCasts, remote, localFilter, muted, hidden])

  const showPending = () => {
    setRemote((r) => dedupe([...pending, ...r]))
    setPending([])
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (loading && items.length === 0) {
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
          title="Couldn't reach the Farcaster network"
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

/** Merge several channel loaders into one feed (used for the Home "For you" feed). */
export function mergeLoaders(loaders: Loader[]): Loader {
  return async (pageToken?: string) => {
    const tokens: Array<string | undefined> = pageToken ? (JSON.parse(pageToken) as Array<string | undefined>) : loaders.map(() => undefined)
    const pages = await Promise.all(loaders.map((l, i) => (pageToken && !tokens[i] ? Promise.resolve<CastPage>({ casts: [] }) : l(tokens[i]).catch(() => ({ casts: [] } as CastPage)))))
    const casts = pages.flatMap((p) => p.casts).filter((c) => !c.parent)
    casts.sort((a, b) => b.timestamp - a.timestamp)
    const nextTokens = pages.map((p) => p.next)
    return { casts, next: nextTokens.some(Boolean) ? JSON.stringify(nextTokens) : undefined }
  }
}
