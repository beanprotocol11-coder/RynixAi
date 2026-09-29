import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CastCard } from '../components/CastCard'
import { PageHeader, Empty, CastSkeleton } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { BookmarkIcon } from '../components/Icons'
import { api } from '../lib/api'
import type { Cast } from '../lib/social'
import { useSocial } from '../store/social'
import { useAuth } from '../store/auth'

export default function Bookmarks() {
  const bookmarks = useSocial((s) => s.bookmarks)
  const cached = useSocial((s) => s.casts)
  const deleted = useSocial((s) => s.deleted)
  const absorb = useSocial((s) => s.absorb)
  const hydrated = useAuth((s) => s.hydrated)
  const ids = useMemo(() => Object.entries(bookmarks).sort((a, b) => b[1] - a[1]).map(([id]) => id), [bookmarks])
  const [missingState, setMissing] = useState<Record<string, true>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    const missing = ids.filter((id) => !cached[id] && !missingState[id] && !deleted[id])
    if (!missing.length) return
    let alive = true
    setLoading(true)
    Promise.all(missing.map((id) => api().getCast(id).catch(() => null))).then((casts) => {
      if (!alive) return
      absorb(casts.filter((c): c is Cast => !!c))
      const gone = Object.fromEntries(missing.filter((_, i) => !casts[i]).map((id) => [id, true as const]))
      if (Object.keys(gone).length) setMissing((m) => ({ ...m, ...gone }))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [ids, cached, missingState, deleted, absorb, hydrated])

  const items = ids.map((id) => cached[id]).filter((c): c is Cast => !!c && !deleted[c.id])

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Bookmarks</span>} />
      <div className="hidden md:block">
        <PageHeader title="Bookmarks" sub={`${ids.length} saved`} />
      </div>
      {ids.length === 0 && <Empty title="No bookmarks yet" body="Save casts to read them later. Bookmarks are private to this device." icon={<BookmarkIcon />} action={<Link to="/" className="btn btn-outline">Back to feed</Link>} />}
      {items.map((c) => (
        <CastCard key={c.id} cast={c} />
      ))}
      {loading && <CastSkeleton />}
      {!loading && ids.length > 0 && items.length === 0 && <Empty title="Saved casts unavailable" body="The casts you bookmarked have been deleted or can't be loaded right now." icon={<BookmarkIcon />} />}
    </div>
  )
}
