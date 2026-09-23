import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CastCard } from '../components/CastCard'
import { PageHeader, Empty, CastSkeleton } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { BookmarkIcon } from '../components/Icons'
import { fetchCast, type Cast } from '../lib/farcaster'
import { useSocial } from '../store/social'

export default function Bookmarks() {
  const bookmarks = useSocial((s) => s.bookmarks)
  const localCasts = useSocial((s) => s.casts)
  const ids = useMemo(() => Object.entries(bookmarks).sort((a, b) => b[1] - a[1]).map(([id]) => id), [bookmarks])
  const [remote, setRemote] = useState<Record<string, Cast | null>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const missing = ids.filter((id) => !id.startsWith('local:') && remote[id] === undefined)
    if (!missing.length) return
    let alive = true
    setLoading(true)
    Promise.all(
      missing.map(async (id) => {
        const [fid, hash] = id.split(':')
        return [id, await fetchCast(Number(fid), hash)] as const
      }),
    ).then((pairs) => {
      if (!alive) return
      setRemote((r) => ({ ...r, ...Object.fromEntries(pairs) }))
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [ids, remote])

  const items = ids.map((id) => (id.startsWith('local:') ? localCasts.find((c) => c.id === id) : remote[id])).filter((c): c is Cast => !!c)

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
    </div>
  )
}
