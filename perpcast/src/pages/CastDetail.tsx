import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CastCard } from '../components/CastCard'
import { ComposerBody } from '../components/Composer'
import { PageHeader, CastSkeleton, Empty } from '../components/ui'
import { BackBtn } from './Channel'
import { fetchCast, fetchReplies, type Cast } from '../lib/farcaster'
import { useSocial, selectLocalReplies } from '../store/social'
import { MessageIcon } from '../components/Icons'

export default function CastDetail() {
  const { fid, hash, localId } = useParams()
  const nav = useNavigate()
  const localCasts = useSocial((s) => s.casts)
  const muted = useSocial((s) => s.mutedFids)
  const [cast, setCast] = useState<Cast | null | undefined>(undefined)
  const [parents, setParents] = useState<Cast[]>([])
  const [replies, setReplies] = useState<Cast[]>([])
  const [loadingReplies, setLoadingReplies] = useState(true)

  const local = localId ? localCasts.find((c) => c.id === decodeURIComponent(localId)) : undefined

  useEffect(() => {
    let alive = true
    setParents([])
    setReplies([])
    setLoadingReplies(true)
    const run = async () => {
      let c: Cast | null | undefined = local
      if (!c && fid && hash) c = await fetchCast(Number(fid), hash)
      if (!alive) return
      setCast(c ?? null)
      if (!c) return

      // Ancestors (up to 6 levels)
      const chain: Cast[] = []
      let cur: Cast | null = c
      for (let i = 0; i < 6 && cur?.parent; i++) {
        const parentLocalId: string | null | undefined = (cur as { parentId?: string | null }).parentId
        const parentRef: { fid: number; hash: string } = cur.parent
        const p: Cast | null = parentLocalId ? (localCasts.find((x) => x.id === parentLocalId) ?? null) : await fetchCast(parentRef.fid, parentRef.hash)
        if (!p) break
        chain.unshift(p)
        cur = p
      }
      if (alive) setParents(chain)

      if (!c.local) {
        const r = await fetchReplies(c.fid, c.hash).catch(() => [] as Cast[])
        if (alive) setReplies(r)
      }
      if (alive) setLoadingReplies(false)
    }
    void run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fid, hash, localId])

  useEffect(() => {
    if (local === undefined && localId && cast !== undefined) setCast(null)
  }, [local, localId, cast])

  const allReplies = useMemo(() => {
    if (!cast) return []
    const locals = selectLocalReplies(localCasts, cast.id)
    const merged = [...locals, ...replies].filter((c) => !muted[c.fid])
    merged.sort((a, b) => a.timestamp - b.timestamp)
    return merged
  }, [cast, localCasts, replies, muted])

  if (cast === undefined) {
    return (
      <div>
        <PageHeader title="Cast" back={<BackBtn />} />
        <CastSkeleton />
        <CastSkeleton />
      </div>
    )
  }
  if (cast === null) {
    return (
      <div>
        <PageHeader title="Cast" back={<BackBtn />} />
        <Empty title="This cast isn't available" body="It may have been deleted, or the hub is temporarily unreachable." icon={<MessageIcon />} action={<button className="btn btn-outline" onClick={() => nav('/')}>Go home</button>} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={cast.parent ? 'Thread' : 'Cast'} back={<BackBtn />} />
      {parents.map((p) => (
        <div key={p.id} className="relative">
          <span className="absolute left-[35px] top-14 bottom-0 w-0.5 bg-line" />
          <CastCard cast={p} showParentContext={false} />
        </div>
      ))}
      <CastCard cast={cast} detail onDeleted={() => nav(-1)} />
      <div className="border-b border-line px-4 py-3">
        <ComposerBody opts={{ parent: cast }} autoFocus={false} />
      </div>
      {loadingReplies && !cast.local && (
        <>
          <CastSkeleton />
          <CastSkeleton />
        </>
      )}
      {!loadingReplies && allReplies.length === 0 && <Empty title="No replies yet" body="Start the conversation." icon={<MessageIcon />} />}
      {allReplies.map((r) => (
        <CastCard key={r.id} cast={r} showParentContext={false} />
      ))}
    </div>
  )
}
