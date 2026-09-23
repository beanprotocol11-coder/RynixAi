import { useCallback, useMemo, useState } from 'react'
import { Feed, mergeLoaders, type Loader } from '../components/Feed'
import { ComposerBody } from '../components/Composer'
import { MobileTopBar } from '../components/Layout'
import { Tabs } from '../components/ui'
import { CHANNELS, fetchChannelCasts, fetchFollowingFeed, fetchUserCasts, PERPCAST_CHANNEL_URL, type CastPage } from '../lib/farcaster'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { RefreshIcon } from '../components/Icons'

type Tab = 'foryou' | 'following' | 'perpcast'
const FOR_YOU = ['farcaster', 'base', 'degen', 'ethereum', 'bitcoin', 'dev', 'founders']

export default function Home() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('perpcast:homeTab') as Tab) || 'foryou')
  const [refreshKey, setRefreshKey] = useState('0')
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const follows = useSocial((s) => s.follows)
  const followFids = useMemo(() => Object.keys(follows).map(Number), [follows])

  const forYou = useMemo<Loader>(() => mergeLoaders(CHANNELS.filter((c) => FOR_YOU.includes(c.id)).map((c) => (t?: string) => fetchChannelCasts(c.url, 12, t))), [])

  const following = useCallback<Loader>(async (): Promise<CastPage> => {
    const [hub, local] = await Promise.all([
      me && me.method === 'farcaster' ? fetchFollowingFeed(me.fid).catch(() => []) : Promise.resolve([]),
      Promise.all(followFids.map((f) => fetchUserCasts(f, 8).catch(() => ({ casts: [] })))).then((ps) => ps.flatMap((p) => p.casts).filter((c) => !c.parent)),
    ])
    const seen = new Set<string>()
    const casts = [...hub, ...local].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    casts.sort((a, b) => b.timestamp - a.timestamp)
    return { casts }
  }, [me, followFids])

  const perpcast = useMemo<Loader>(() => mergeLoaders([(t?: string) => fetchChannelCasts(CHANNELS.find((c) => c.id === 'hyperliquid')!.url, 20, t)]), [])

  const pick = (t: Tab) => {
    setTab(t)
    localStorage.setItem('perpcast:homeTab', t)
  }

  return (
    <div>
      <MobileTopBar />
      <div className="sticky top-0 z-30 glass border-b border-line md:top-8">
        <div className="hidden h-14 items-center justify-between px-4 md:flex">
          <h1 className="font-display text-lg font-extrabold tracking-tight">Home</h1>
          <button className="icon-btn" title="Refresh" onClick={() => setRefreshKey(String(Date.now()))}>
            <RefreshIcon size={18} />
          </button>
        </div>
        <Tabs<Tab>
          value={tab}
          onChange={pick}
          tabs={[
            { id: 'foryou', label: 'For you' },
            { id: 'following', label: 'Following' },
            { id: 'perpcast', label: 'Traders' },
          ]}
        />
      </div>

      <div className="hidden border-b border-line px-4 py-3 md:block">
        <ComposerBody opts={{ channelUrl: tab === 'perpcast' ? PERPCAST_CHANNEL_URL : null }} autoFocus={false} />
      </div>

      {tab === 'foryou' && <Feed load={forYou} refreshKey={refreshKey} localFilter={(c) => !c.parentId} />}
      {tab === 'following' &&
        (me || followFids.length ? (
          <Feed
            load={following}
            refreshKey={refreshKey}
            localFilter={(c) => !c.parentId && (c.fid === me?.fid || !!follows[c.fid])}
            emptyTitle="Your following feed is quiet"
            emptyBody="Follow a few people from Explore and their casts will show up here."
          />
        ) : (
          <div className="px-6 py-16 text-center">
            <h3 className="font-display text-lg font-extrabold">See casts from people you follow</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-3">Sign in with Farcaster to pull in your real following graph, or follow people here on Perpcast.</p>
            <button className="btn btn-primary mt-4" onClick={() => openSignIn()}>
              Sign in
            </button>
          </div>
        ))}
      {tab === 'perpcast' && (
        <Feed
          load={perpcast}
          refreshKey={refreshKey}
          localFilter={(c) => !c.parentId && (c.channel === PERPCAST_CHANNEL_URL || !!c.position)}
          emptyTitle="No trader casts yet"
          emptyBody="Open a position on the Trade tab and share it with the community."
        />
      )}
    </div>
  )
}
