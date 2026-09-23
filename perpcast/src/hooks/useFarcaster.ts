import { useEffect, useMemo, useState } from 'react'
import { cachedUser, fetchCast, fetchCastStats, fetchUser, fetchUsers, renderMentions, type Cast, type CastStats, type FcUser } from '../lib/farcaster'
import type { LocalCast } from '../store/social'

export function useUser(fid: number | undefined, seed?: FcUser): FcUser | undefined {
  const [user, setUser] = useState<FcUser | undefined>(() => seed ?? (fid !== undefined ? cachedUser(fid) : undefined))
  useEffect(() => {
    if (fid === undefined) return
    const c = seed ?? cachedUser(fid)
    if (c) {
      setUser(c)
      return
    }
    let alive = true
    fetchUser(fid).then((u) => alive && setUser(u))
    return () => {
      alive = false
    }
  }, [fid, seed])
  return user
}

export function useCastText(cast: Cast): string {
  const [text, setText] = useState(() => (cast.mentions.length ? renderMentions(cast.text, cast.mentions, cast.mentionsPositions, new Map()) : cast.text))
  useEffect(() => {
    if (!cast.mentions.length) {
      setText(cast.text)
      return
    }
    let alive = true
    fetchUsers(cast.mentions).then((users) => alive && setText(renderMentions(cast.text, cast.mentions, cast.mentionsPositions, users)))
    return () => {
      alive = false
    }
  }, [cast])
  return text
}

export function useCastStats(cast: Cast): CastStats | null {
  const [stats, setStats] = useState<CastStats | null>(null)
  useEffect(() => {
    if (cast.local) {
      setStats({ likes: 0, recasts: 0, replies: 0, capped: false })
      return
    }
    let alive = true
    fetchCastStats(cast.fid, cast.hash).then((s) => alive && setStats(s))
    return () => {
      alive = false
    }
  }, [cast])
  return stats
}

export function useQuotedCast(cast: Cast, localCasts: LocalCast[]): Cast | null | undefined {
  const embed = useMemo(() => cast.embeds.find((e) => e.castId), [cast])
  const local = (cast as LocalCast).quoteId ? localCasts.find((c) => c.id === (cast as LocalCast).quoteId) : undefined
  const [quoted, setQuoted] = useState<Cast | null | undefined>(local ?? (embed ? undefined : null))
  useEffect(() => {
    if (local) {
      setQuoted(local)
      return
    }
    if (!embed?.castId) {
      setQuoted(null)
      return
    }
    let alive = true
    fetchCast(embed.castId.fid, embed.castId.hash).then((c) => alive && setQuoted(c))
    return () => {
      alive = false
    }
  }, [embed, local])
  return quoted
}

export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void } {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn()
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e: Error) => alive && setState({ data: null, loading: false, error: e.message || 'Failed to load' }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])
  return { ...state, reload: () => setTick((t) => t + 1) }
}
