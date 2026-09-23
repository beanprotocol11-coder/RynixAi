import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Feed, type Loader } from '../components/Feed'
import { CastCard } from '../components/CastCard'
import { Avatar, PageHeader, Tabs, Empty, Skeleton } from '../components/ui'
import { BackBtn } from './Channel'
import { CastText } from '../components/CastText'
import { ExternalIcon, MessageIcon, ShareIcon, UserIcon, VerifiedIcon, WalletIcon, ShieldIcon, BookmarkIcon } from '../components/Icons'
import { cachedUser, fetchCast, fetchFollowCounts, fetchUser, fetchUserCasts, fidByUsername, type Cast, type FcUser, type FollowCounts } from '../lib/farcaster'
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
  const openSignIn = useAuth((s) => s.openSignIn)
  const [user, setUser] = useState<FcUser | null | undefined>(undefined)
  const [counts, setCounts] = useState<FollowCounts | null>(null)
  const [tab, setTab] = useState<Tab>('casts')
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const toggleMute = useSocial((s) => s.toggleMute)
  const mutedFids = useSocial((s) => s.mutedFids)
  const localCasts = useSocial((s) => s.casts)
  const likes = useSocial((s) => s.likes)
  const openDm = useDMs((s) => s.open)

  const target = handle ?? me?.username

  useEffect(() => {
    let alive = true
    setUser(undefined)
    setCounts(null)
    setTab('casts')
    const run = async () => {
      if (!target) return setUser(null)
      if (me && (target === me.username || target === String(me.fid))) {
        setUser(me)
        if (me.method === 'farcaster') fetchFollowCounts(me.fid).then((c) => alive && setCounts(c))
        return
      }
      let fid: number | null = /^\d+$/.test(target) ? Number(target) : null
      if (fid === null && target.startsWith('fid:')) fid = Number(target.slice(4))
      if (fid === null) fid = await fidByUsername(target)
      if (!alive) return
      if (fid === null) {
        const local = localCasts.find((c) => c.author.username === target)?.author
        setUser(local ?? null)
        return
      }
      const u = cachedUser(fid) ?? (await fetchUser(fid))
      if (!alive) return
      setUser(u)
      if (fid > 0) fetchFollowCounts(fid).then((c) => alive && setCounts(c))
    }
    void run()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, me?.fid])

  const fid = user?.fid
  const isMe = !!me && !!user && me.fid === user.fid
  const isFarcaster = (fid ?? 0) > 0
  const following = !!fid && !!follows[fid]
  const localFollowing = Object.keys(follows).length

  const castsLoader = useMemo<Loader>(() => (isFarcaster && fid ? (t?: string) => fetchUserCasts(fid, 25, t).then((p) => ({ ...p, casts: p.casts.filter((c) => !c.parent) })) : async () => ({ casts: [] })), [fid, isFarcaster])
  const repliesLoader = useMemo<Loader>(() => (isFarcaster && fid ? (t?: string) => fetchUserCasts(fid, 40, t).then((p) => ({ ...p, casts: p.casts.filter((c) => !!c.parent) })) : async () => ({ casts: [] })), [fid, isFarcaster])

  if (!target && !me) {
    return (
      <div>
        <PageHeader title="Profile" back={<BackBtn />} />
        <Empty title="Sign in to see your profile" body="Connect with Farcaster or a wallet to cast, follow and trade." icon={<UserIcon />} action={<button className="btn btn-primary" onClick={() => openSignIn()}>Sign in</button>} />
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
        <Empty title={`@${target} not found`} body="Double-check the username or try searching." icon={<UserIcon />} action={<Link className="btn btn-outline" to="/explore">Search</Link>} />
      </div>
    )
  }

  const sessionUser = isMe ? me : null
  const address = sessionUser?.address ?? sessionUser?.verifications?.[0]

  return (
    <div>
      <PageHeader title={user.displayName} sub={isFarcaster ? `@${user.username}` : 'Wallet account'} back={<BackBtn />} />
      <div className="relative h-32 overflow-hidden">
        <div className="absolute inset-0 dot-grid opacity-70" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, hsl(${Math.abs((fid ?? 1) * 47) % 360} 70% 50% / .45), var(--accent-soft), transparent)` }} />
      </div>
      <div className="px-4">
        <div className="-mt-11 flex items-end justify-between">
          <Avatar src={user.pfp} name={user.displayName} fid={user.fid} size={88} className="border-4 border-bg shadow-lg" />
          <div className="mb-1 flex items-center gap-2">
            <button
              className="icon-btn border border-line"
              title="Share profile"
              onClick={() => {
                void navigator.clipboard.writeText(`${location.origin}/u/${user.username}`)
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
                  const t = openDm(user)
                  nav(`/messages/${t.id}`)
                }}
              >
                <MessageIcon size={18} />
              </button>
            )}
            {isFarcaster && (
              <a className="icon-btn border border-line" title="Open on Warpcast" href={`https://warpcast.com/${user.username}`} target="_blank" rel="noreferrer noopener">
                <ExternalIcon size={18} />
              </a>
            )}
            {isMe ? (
              <Link to="/settings" className="btn btn-outline !py-2">
                Edit profile
              </Link>
            ) : (
              <button
                className={cx('btn !py-2', following ? 'btn-outline' : 'btn-ink')}
                onClick={() => {
                  if (!me) return openSignIn('Sign in to follow people.')
                  const on = toggleFollow(user.fid, user)
                  toast({ kind: on ? 'success' : 'info', title: on ? `Following @${user.username}` : `Unfollowed @${user.username}` })
                }}
              >
                {following ? 'Following' : 'Follow'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <h2 className="font-display text-xl font-extrabold tracking-tight flex items-center gap-1.5">
            {user.displayName}
            {isFarcaster && <VerifiedIcon size={18} className="text-accent" />}
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-3">
            <span>{isFarcaster ? `@${user.username}` : shortAddr(user.username)}</span>
            {isFarcaster && <span className="chip !py-0 !text-[11px]">fid {user.fid}</span>}
            {!isFarcaster && <span className="chip !py-0 !text-[11px] gap-1"><WalletIcon size={11} /> wallet</span>}
          </div>
          {user.bio && <div className="mt-2"><CastText text={user.bio} className="!text-[15px] text-ink-2" /></div>}
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <span>
              <b className="mono">{counts ? `${compact(counts.following)}${counts.followingCapped ? '+' : ''}` : isMe ? localFollowing : '—'}</b> <span className="text-ink-3">following</span>
            </span>
            <span>
              <b className="mono">{counts ? `${compact(counts.followers)}${counts.followersCapped ? '+' : ''}` : '—'}</b> <span className="text-ink-3">followers</span>
            </span>
            {sessionUser && (
              <span className="text-ink-3 flex items-center gap-1">
                <ShieldIcon size={14} /> Signed in via {sessionUser.method === 'farcaster' ? 'Farcaster' : 'wallet'} · {fullDate(sessionUser.signedInAt)}
              </span>
            )}
          </div>
          {address && <div className="mt-2 mono text-xs text-ink-3">{address}</div>}
        </div>
        {!isMe && (
          <div className="mt-3 flex gap-2">
            <button className="chip" onClick={() => { const on = toggleMute(user.fid); toast({ kind: 'info', title: on ? `Muted @${user.username}` : `Unmuted @${user.username}` }) }}>
              {mutedFids[user.fid] ? 'Unmute' : 'Mute'}
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
          ...(isMe ? [{ id: 'likes' as const, label: 'Likes' }] : []),
        ]}
      />

      {tab === 'casts' && <Feed load={castsLoader} localFilter={(c) => c.fid === user.fid && !c.parentId} emptyTitle={isMe ? "You haven't cast yet" : 'No casts yet'} emptyBody={isMe ? 'Share a market take or a position from the Trade tab.' : undefined} />}
      {tab === 'replies' && <Feed load={repliesLoader} localFilter={(c) => c.fid === user.fid && !!c.parentId} emptyTitle="No replies yet" />}
      {tab === 'likes' && <LikesTab likeIds={Object.keys(likes)} />}
      {tab === 'positions' && <PositionsTab isMe={isMe} fid={user.fid} />}
    </div>
  )
}

function LikesTab({ likeIds }: { likeIds: string[] }) {
  const localCasts = useSocial((s) => s.casts)
  const [remote, setRemote] = useState<Cast[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(
      likeIds
        .filter((id) => !id.startsWith('local:'))
        .slice(0, 40)
        .map((id) => {
          const [fid, hash] = id.split(':')
          return fetchCast(Number(fid), hash)
        }),
    ).then((cs) => alive && setRemote(cs.filter((c): c is Cast => !!c)))
    return () => {
      alive = false
    }
  }, [likeIds])
  const items = useMemo(() => {
    const locals = localCasts.filter((c) => likeIds.includes(c.id))
    return [...locals, ...remote].sort((a, b) => b.timestamp - a.timestamp)
  }, [localCasts, remote, likeIds])
  if (!likeIds.length) return <Empty title="No likes yet" body="Casts you like will appear here." icon={<BookmarkIcon />} />
  return (
    <div>
      {items.map((c) => (
        <CastCard key={c.id} cast={c} />
      ))}
    </div>
  )
}

function PositionsTab({ isMe, fid }: { isMe: boolean; fid: number }) {
  const positions = useTrading((s) => s.positions)
  const mids = useMarket((s) => s.mids)
  const localCasts = useSocial((s) => s.casts)
  const shared = localCasts.filter((c) => c.fid === fid && c.position)
  return (
    <div>
      {isMe && positions.length > 0 && (
        <div className="border-b border-line px-4 py-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-3">Open positions</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {positions.map((p) => {
              const pnl = unrealized(p, mids[p.coin] ?? p.entry)
              return (
                <Link key={p.id} to={`/trade/${p.coin}`} className="card flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover">
                  <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side}</span>
                  <span className="font-bold">{p.coin}</span>
                  <span className="mono text-xs text-ink-3">{p.leverage}x</span>
                  <span className={cx('ml-auto mono text-sm font-semibold', pnl >= 0 ? 'text-long' : 'text-short')}>{usd(pnl, { sign: true })}</span>
                </Link>
              )
            })}
          </div>
        </div>
      )}
      {shared.length === 0 && (!isMe || positions.length === 0) && (
        <Empty title="No positions shared" body={isMe ? 'Open a position in the trading terminal, then share it as a cast.' : "This user hasn't shared any positions on Perpcast."} icon={<WalletIcon />} action={isMe ? <Link to="/trade" className="btn btn-primary">Open terminal</Link> : undefined} />
      )}
      {shared.map((c) => (
        <CastCard key={c.id} cast={c} />
      ))}
    </div>
  )
}
