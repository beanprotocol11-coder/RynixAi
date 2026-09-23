import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Feed, feedLoader } from '../components/Feed'
import { ComposerBody } from '../components/Composer'
import { MobileTopBar } from '../components/Layout'
import { Tabs } from '../components/ui'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { RefreshIcon } from '../components/Icons'

type Tab = 'foryou' | 'following' | 'traders'

export default function Home() {
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('perpcast:homeTab') as Tab) || 'foryou')
  const [refreshKey, setRefreshKey] = useState('0')
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const follows = useSocial((s) => s.follows)

  const forYou = useMemo(() => feedLoader({ kind: 'home' }), [])
  const following = useMemo(() => feedLoader({ kind: 'following' }), [])
  const traders = useMemo(() => feedLoader({ kind: 'channel', key: 'perpcast' }), [])

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
            { id: 'traders', label: 'Traders' },
          ]}
        />
      </div>

      <div className="hidden border-b border-line px-4 py-3 md:block">
        <ComposerBody opts={{ channel: tab === 'traders' ? 'perpcast' : null }} autoFocus={false} />
      </div>

      {tab === 'foryou' && (
        <Feed
          load={forYou}
          refreshKey={`${refreshKey}:${me?.id ?? ''}`}
          emptyTitle="Be the first to cast"
          emptyBody="Perpcast is brand new. Share a market take, a chart or a position and start the conversation."
          emptyAction={
            <Link to="/trade" className="btn btn-primary">
              Open the terminal
            </Link>
          }
        />
      )}
      {tab === 'following' &&
        (me ? (
          <Feed
            load={following}
            refreshKey={`${refreshKey}:${Object.keys(follows).length}`}
            freshFilter={(c) => !c.parentId && (c.author.id === me.id || !!follows[c.author.id])}
            emptyTitle="Your following feed is quiet"
            emptyBody="Follow a few traders from Explore and their casts will show up here."
            emptyAction={
              <Link to="/explore" className="btn btn-outline">
                Find people
              </Link>
            }
          />
        ) : (
          <div className="px-6 py-16 text-center">
            <h3 className="font-display text-lg font-extrabold">See casts from people you follow</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-3">Sign in with your wallet to follow traders and build your own feed.</p>
            <button className="btn btn-primary mt-4" onClick={() => openSignIn()}>
              Sign in
            </button>
          </div>
        ))}
      {tab === 'traders' && (
        <Feed
          load={traders}
          refreshKey={`${refreshKey}:${me?.id ?? ''}`}
          freshFilter={(c) => !c.parentId && (c.channel === 'perpcast' || !!c.position)}
          emptyTitle="No trader casts yet"
          emptyBody="Open a position on the Trade tab and share it with the community."
          emptyAction={
            <Link to="/trade" className="btn btn-primary">
              Go to Trade
            </Link>
          }
        />
      )}
    </div>
  )
}
