import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CastCard } from '../components/CastCard'
import { ComposerBody } from '../components/Composer'
import { PageHeader, CastSkeleton, Empty } from '../components/ui'
import { BackBtn } from './Channel'
import { api } from '../lib/api'
import type { Cast } from '../lib/social'
import { useSocial } from '../store/social'
import { useAuth } from '../store/auth'
import { MessageIcon } from '../components/Icons'

export default function CastDetail() {
  const { id: rawId = '' } = useParams()
  const id = decodeURIComponent(rawId)
  const nav = useNavigate()
  const hydrated = useAuth((s) => s.hydrated)
  const cached = useSocial((s) => s.casts)
  const fresh = useSocial((s) => s.fresh)
  const deleted = useSocial((s) => s.deleted)
  const muted = useSocial((s) => s.muted)
  const hidden = useSocial((s) => s.hidden)
  const absorb = useSocial((s) => s.absorb)
  const [state, setState] = useState<{ id: string; cast: Cast | null; parents: Cast[]; replies: Cast[]; loadingReplies: boolean } | null>(null)

  useEffect(() => {
    if (!hydrated) return
    let alive = true
    const run = async () => {
      const c = cached[id] ?? (await api().getCast(id).catch(() => null))
      if (!alive) return
      if (!c) return setState({ id, cast: null, parents: [], replies: [], loadingReplies: false })
      absorb([c])
      setState({ id, cast: c, parents: [], replies: [], loadingReplies: true })

      const chain: Cast[] = []
      let cur: Cast | null = c
      for (let i = 0; i < 6 && cur?.parentId; i++) {
        const pid: string = cur.parentId
        const p: Cast | null = cached[pid] ?? (await api().getCast(pid).catch(() => null))
        if (!p) break
        chain.unshift(p)
        cur = p
      }
      const replies = await api().replies(id).catch(() => [] as Cast[])
      if (!alive) return
      absorb([...chain, ...replies])
      setState({ id, cast: c, parents: chain, replies, loadingReplies: false })
    }
    void run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hydrated])

  const current = state?.id === id ? state : null
  const cast = current ? (deleted[id] ? null : cached[id] ?? current.cast) : undefined

  const allReplies = useMemo(() => {
    if (!current?.cast) return []
    const seen = new Set<string>()
    const merged = [...fresh.filter((c) => c.parentId === id), ...current.replies]
      .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
      .filter((c) => !deleted[c.id] && !muted[c.author.id] && !hidden[c.id])
    merged.sort((a, b) => a.timestamp - b.timestamp)
    return merged
  }, [current, fresh, id, deleted, muted, hidden])

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
        <Empty title="This cast isn't available" body="It may have been deleted, or the server is temporarily unreachable." icon={<MessageIcon />} action={<button className="btn btn-outline" onClick={() => nav('/')}>Go home</button>} />
      </div>
    )
  }

  return (
    <div>
      <PageHeader title={cast.parentId ? 'Thread' : 'Cast'} back={<BackBtn />} />
      {current?.parents.map((p) => (
        <div key={p.id} className="relative">
          <span className="absolute left-[35px] top-14 bottom-0 w-0.5 bg-line" />
          <CastCard cast={p} showParentContext={false} />
        </div>
      ))}
      <CastCard cast={cast} detail onDeleted={() => nav(-1)} />
      <div className="border-b border-line px-4 py-3">
        <ComposerBody opts={{ parent: cast }} autoFocus={false} />
      </div>
      {current?.loadingReplies && (
        <>
          <CastSkeleton />
          <CastSkeleton />
        </>
      )}
      {!current?.loadingReplies && allReplies.length === 0 && <Empty title="No replies yet" body="Start the conversation." icon={<MessageIcon />} />}
      {allReplies.map((r) => (
        <CastCard key={r.id} cast={r} showParentContext={false} />
      ))}
    </div>
  )
}
