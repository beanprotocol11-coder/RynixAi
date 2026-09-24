import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Feed, feedLoader } from '../components/Feed'
import { Avatar, PageHeader, Tabs, Empty, Skeleton } from '../components/ui'
import { BackBtn } from './Channel'
import { CastText } from '../components/CastText'
import { explorerUrl } from '../components/Layout'
import { ExternalIcon, MessageIcon, ShareIcon, UserIcon, WalletIcon, ShieldIcon, CopyIcon, XIcon, GlobeIcon } from '../components/Icons'
import { api } from '../lib/api'
import { userPath, type User } from '../lib/social'
import { displaySymbol } from '../lib/hyperliquid'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { useDMs } from '../store/dm'
import { useTrading, unrealized } from '../store/trading'
import { useMarket } from '../store/market'
import { toast } from '../store/notify'
import { cx, compact, usd, shortAddr, fullDate } from '../lib/format'

type Tab = 'casts' | 'replies' | 'likes' | 'positions'

export default function Profile() {
  const { handle } = useParams()
  const nav = useNavigate()
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const hydrated = useAuth((s) => s.hydrated)
  const openSignIn = useAuth((s) => s.openSignIn)
  const [state, setState] = useState<{ target: string; user: User | null } | null>(null)
  const [tab, setTab] = useState<Tab>('casts')
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const toggleMute = useSocial((s) => s.toggleMute)
  const muted = useSocial((s) => s.muted)
  const tick = useSocial((s) => s.tick)
  const openDm = useDMs((s) => s.open)

  const target = handle ?? me?.username ?? ''

  useEffect(() => setTab('casts'), [target])

  useEffect(() => {
    if (!hydrated || !target) return
    let alive = true
    const run = async () => {
      if (me && (target === me.username || target.toLowerCase() === me.id)) return setState({ target, user: me })
      const u = await api().getUser(target).catch(() => null)
      if (alive) setState({ target, user: u })
    }
    void run()
    return () => {
      alive = false
    }
  }, [target, me, hydrated, tick])

  const user = state?.target === target ? state.user : undefined
  const isMe = !!me && !!user && me.id === user.id
  const following = !!user && !!follows[user.id]

  const castsLoader = useMemo(() => feedLoader({ kind: 'user', key: target }), [target])
  const repliesLoader = useMemo(() => feedLoader({ kind: 'user-replies', key: target }), [target])
  const likesLoader = useMemo(() => feedLoader({ kind: 'user-likes', key: target }), [target])

  if (!target) {
    return (
      <div>
        <PageHeader title="Profile" back={<BackBtn />} />
        <Empty title="Sign in to see your profile" body="Connect your wallet to cast, follow and trade." icon={<UserIcon />} action={<button className="btn btn-primary" onClick={() => openSignIn()}>Sign in</button>} />
      </div>
    )
  }

  if (user === undefined) {
    return (
      <div>
        <PageHeader title="Profile" back={<BackBtn />} />
        <div className="h-32 skeleton !rounded-none" />
        <div className="px-4 -mt-10 flex flex-col gap-3">
          <Skeleton className="h-20 w-20 rounded-full border-4 border-bg" />
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    )
  }
  if (user === null) {
    return (
      <div>
        <PageHeader title="Profile" back={<BackBtn />} />
        <Empty title={`@${target} not found`} body="Double-check the username or wallet address, or try searching." icon={<UserIcon />} action={<Link className="btn btn-outline" to="/explore">Search</Link>} />
      </div>
    )
  }

  const hue = parseInt(user.id.slice(2, 8), 16) % 360
  const name = user.displayName || user.username

  return (
    <div>
      <PageHeader title={name} sub={`@${user.username}`} back={<BackBtn />} />
      <div className="relative h-32 overflow-hidden sm:h-40">
        {user.banner ? (
          <img src={user.banner} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 dot-grid opacity-70" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, hsl(${hue} 45% 45% / .45), var(--accent-soft), transparent)` }} />
          </>
        )}
      </div>
      <div className="px-4">
        <div className="-mt-11 flex items-end justify-between">
          <Avatar src={user.pfp} name={name} seed={user.id} size={88} className="border-4 border-bg shadow-lg" />
          <div className="mb-1 flex items-center gap-2">
            <button
              className="icon-btn border border-line"
              title="Share profile"
              onClick={() => {
                void navigator.clipboard.writeText(`${location.origin}${userPath(user)}`)
                toast({ kind: 'info', title: 'Profile link copied' })
              }}
            >
              <ShareIcon size={18} />
            </button>
            {!isMe && (
              <button
                className="icon-btn border border-line"
                title="Message"
                onClick={() => {
                  if (!me) return openSignIn('Sign in to send messages.')
                  openDm(user)
                  nav(`/messages/${user.id}`)
                }}
              >
                <MessageIcon size={18} />
              </button>
            )}
            <a className="icon-btn border border-line" title="View wallet on explorer" href={explorerUrl(session?.chainId ?? 1, user.address)} target="_blank" rel="noreferrer noopener">
              <ExternalIcon size={18} />
            </a>
            {isMe ? (
              <Link to="/settings" className="btn btn-outline !py-2">
                Edit profile
              </Link>
            ) : (
              <button
                className={cx('btn !py-2', following ? 'btn-outline' : 'btn-ink')}
                onClick={async () => {
                  if (!me) return openSignIn('Sign in to follow people.')
                  try {
                    const on = await toggleFollow(user)
                    toast({ kind: on ? 'success' : 'info', title: on ? `Following @${user.username}` : `Unfollowed @${user.username}` })
                  } catch (e) {
                    toast({ kind: 'error', title: (e as Error).message })
                  }
                }}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <h2 className="font-display text-xl font-extrabold tracking-tight flex items-center gap-1.5">{name}</h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <span>@{user.username}</span>
            <button
              className="chip !py-0 !text-[11px] gap-1 mono"
              title="Copy wallet address"
              onClick={() => {
                void navigator.clipboard.writeText(user.address)
                toast({ kind: 'info', title: 'Address copied' })
              }}
            >
              <WalletIcon size={11} /> {shortAddr(user.address)} <CopyIcon size={10} />
            </button>
          </div>
          {user.bio && (
            <div className="mt-2">
              <CastText text={user.bio} className="!text-[15px] text-ink-2" />
            </div>
          )}
          {(user.twitter || user.website) && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {user.twitter && (
                <a href={`https://x.com/${user.twitter}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-accent hover:underline">
                  <XIcon size={14} /> @{user.twitter}
                </a>
              )}
              {user.website && (
                <a href={user.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-accent hover:underline">
                  <GlobeIcon size={14} /> {user.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                </a>
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>
              <b className="mono">{compact(user.following)}</b> <span className="text-ink-3">following</span>
            </span>
            <span>
              <b className="mono">{compact(user.followers)}</b> <span className="text-ink-3">followers</span>
            </span>
            <span>
              <b className="mono">{compact(user.castCount)}</b> <span className="text-ink-3">casts</span>
            </span>
            <span className="text-ink-3">Joined {fullDate(user.createdAt)}</span>
            {isMe && session && (
              <span className="text-ink-3 flex items-center gap-1">
                <ShieldIcon size={14} /> Signed in with {session.walletName} · {fullDate(session.signedInAt)}
              </span>
            )}
          </div>
        </div>
        {!isMe && (
          <div className="mt-3 flex gap-2">
            <button
              className="chip"
              onClick={() => {
                const on = toggleMute(user.id)
                toast({ kind: 'info', title: on ? `Muted @${user.username}` : `Unmuted @${user.username}` })
              }}
            >
              {muted[user.id] ? 'Unmute' : 'Mute'}
            </button>
          </div>
        )}
      </div>

      <Tabs<Tab>
        className="mt-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'casts', label: 'Casts' },
          { id: 'replies', label: 'Replies' },
          { id: 'positions', label: 'Positions' },
          { id: 'likes', label: 'Likes' },
        ]}
      />

      {tab === 'casts' && (
        <Feed
          load={castsLoader}
          refreshKey={`${user.id}:${tick}`}
          freshFilter={(c) => c.author.id === user.id && !c.parentId}
          emptyTitle={isMe ? "You haven't cast yet" : 'No casts yet'}
          emptyBody={isMe ? 'Share a market take or a position from the Trade tab.' : undefined}
        />
      )}
      {tab === 'replies' && <Feed load={repliesLoader} refreshKey={user.id} freshFilter={(c) => c.author.id === user.id && !!c.parentId} emptyTitle="No replies yet" showParentContext />}
      {tab === 'likes' && <Feed load={likesLoader} refreshKey={`${user.id}:${tick}`} freshFilter={() => false} emptyTitle="No likes yet" emptyBody="Casts this account likes will appear here." />}
      {tab === 'positions' && <PositionsTab isMe={isMe} user={user} />}
    </div>
  )
}

function PositionsTab({ isMe, user }: { isMe: boolean; user: User }) {
  const positions = useTrading((s) => s.positions)
  const mids = useMarket((s) => s.mids)
  const loader = useMemo(() => feedLoader({ kind: 'user', key: user.username }), [user.username])
  const sharedLoader = useMemo(() => async (cursor?: string) => {
    const page = await loader(cursor)
    return { ...page, casts: page.casts.filter((c) => !!c.position && c.author.id === user.id) }
  }, [loader, user.id])
  return (
    <div>
      {isMe && positions.length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Open positions</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {positions.map((p) => {
              const pnl = unrealized(p, mids[p.coin] ?? p.entry)
              return (
                <Link key={p.id} to={`/trade/${encodeURIComponent(p.coin)}`} className="card flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover">
                  <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side}</span>
                  <span className="font-bold">{displaySymbol(p.coin)}</span>
                  <span className="mono text-xs text-ink-3">{p.leverage}x</span>
                  <span className={cx('ml-auto mono text-sm font-semibold', pnl >= 0 ? 'text-long' : 'text-short')}>{usd(pnl, { sign: true })}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
      <Feed
        load={sharedLoader}
        refreshKey={user.id}
        freshFilter={(c) => c.author.id === user.id && !!c.position}
        emptyTitle="No positions shared"
        emptyBody={isMe ? 'Open a position in the trading terminal, then share it as a cast.' : "This user hasn't shared any positions on Perpcast."}
        emptyAction={isMe ? <Link to="/trade" className="btn btn-primary">Open terminal</Link> : undefined}
      />
    </div>
  )
}
