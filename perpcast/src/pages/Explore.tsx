import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader, Avatar, LiveNumber, Empty, Spinner } from '../components/ui'
import { SearchBox, WhoToFollow, SUGGESTED_FIDS } from '../components/Layout'
import { HashIcon, SearchIcon, TrendDownIcon, TrendUpIcon, ChartIcon } from '../components/Icons'
import { CHANNELS, fetchUser, fidByUsername, type FcUser } from '../lib/farcaster'
import { coinColor, coinName } from '../lib/hyperliquid'
import { useMarket, change24h } from '../store/market'
import { useSocial } from '../store/social'
import { useAuth } from '../store/auth'
import { cx, px, pct, usd } from '../lib/format'
import { MobileTopBar } from '../components/Layout'

export default function Explore() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Explore</span>} />
      <div className="hidden md:block">
        <PageHeader title="Explore" sub="Channels, people and markets" />
      </div>
      <div className="px-4 py-3 lg:hidden">
        <SearchBox />
      </div>
      {q ? <SearchResults q={q} /> : <Discover />}
    </div>
  )
}

function Discover() {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const movers = useMemo(() => markets.map((m) => ({ m, ch: change24h(m, mids[m.coin]) })).sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 6), [markets, mids])
  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <section>
        <h3 className="mb-2 font-display font-extrabold">Top movers</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {movers.length === 0 && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
          {movers.map(({ m, ch }) => (
            <Link key={m.coin} to={`/trade/${m.coin}`} className="card p-3 hover:bg-surface-hover transition-colors">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: coinColor(m.coin) }}>
                  {m.coin.slice(0, 3)}
                </span>
                <span className="font-bold text-sm">{m.coin}</span>
                <span className={cx('ml-auto mono text-xs flex items-center gap-0.5', ch >= 0 ? 'text-long' : 'text-short')}>
                  {ch >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
                  {pct(ch)}
                </span>
              </div>
              <LiveNumber value={mids[m.coin] ?? m.midPx} format={(n) => px(n, m.szDecimals)} className="mt-2 block text-base font-semibold" />
              <div className="text-[11px] text-ink-3">Vol {usd(m.dayNtlVlm, { compact: true })}</div>
            </Link>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-2 font-display font-extrabold">Channels</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <Link key={c.id} to={`/channel/${c.id}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover transition-colors">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ background: `${c.accent}22` }}>
                {c.emoji}
              </span>
              <span className="min-w-0">
                <span className="block font-bold text-sm">/{c.id}</span>
                <span className="block truncate text-xs text-ink-3">{c.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="lg:hidden">
        <WhoToFollow limit={6} />
      </section>
      <section className="hidden lg:block">
        <h3 className="mb-2 font-display font-extrabold">People to follow</h3>
        <PeopleGrid fids={SUGGESTED_FIDS} />
      </section>
    </div>
  )
}

function PeopleGrid({ fids }: { fids: number[] }) {
  const [users, setUsers] = useState<FcUser[]>([])
  useEffect(() => {
    let alive = true
    Promise.all(fids.map((f) => fetchUser(f))).then((u) => alive && setUsers(u))
    return () => {
      alive = false
    }
  }, [fids])
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {users.map((u) => (
        <UserRow key={u.fid} u={u} />
      ))}
    </div>
  )
}

export function UserRow({ u }: { u: FcUser }) {
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const on = !!follows[u.fid]
  return (
    <div className="card flex items-center gap-3 p-3">
      <Link to={`/u/${u.username}`}>
        <Avatar src={u.pfp} name={u.displayName} fid={u.fid} size={40} />
      </Link>
      <Link to={`/u/${u.username}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold hover:underline">{u.displayName}</span>
        <span className="block truncate text-xs text-ink-3">@{u.username}</span>
        {u.bio && <span className="mt-0.5 block truncate text-xs text-ink-2">{u.bio}</span>}
      </Link>
      {me?.fid !== u.fid && (
        <button className={cx('btn !py-1.5 !px-3.5 text-xs', on ? 'btn-outline' : 'btn-ink')} onClick={() => (me ? toggleFollow(u.fid, u) : openSignIn('Sign in to follow people.'))}>
          {on ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

function SearchResults({ q }: { q: string }) {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const [user, setUser] = useState<FcUser | null | undefined>(undefined)
  const lower = q.toLowerCase().replace(/^[@$/]/, '')

  useEffect(() => {
    let alive = true
    setUser(undefined)
    const handle = lower.replace(/\s.*/, '')
    if (!/^[a-z0-9][a-z0-9\-_.]{0,30}$/.test(handle)) {
      setUser(null)
      return
    }
    ;(async () => {
      const fid = /^\d+$/.test(handle) ? Number(handle) : await fidByUsername(handle)
      if (!alive) return
      if (!fid) return setUser(null)
      const u = await fetchUser(fid)
      if (alive) setUser(u.username.startsWith('fid:') && !/^\d+$/.test(handle) ? null : u)
    })()
    return () => {
      alive = false
    }
  }, [lower])

  const channels = CHANNELS.filter((c) => c.id.includes(lower) || c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower))
  const coins = markets.filter((m) => m.coin.toLowerCase().includes(lower) || coinName(m.coin).toLowerCase().includes(lower)).slice(0, 8)
  const nothing = user === null && channels.length === 0 && coins.length === 0

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <div className="text-sm text-ink-3">
        Results for <b className="text-ink">“{q}”</b>
      </div>
      <section>
        <h3 className="mb-2 font-display font-extrabold flex items-center gap-2">People</h3>
        {user === undefined && (
          <div className="flex items-center gap-2 text-sm text-ink-3">
            <Spinner /> Looking up @{lower}…
          </div>
        )}
        {user === null && <div className="text-sm text-ink-3">No Farcaster user named @{lower}.</div>}
        {user && <UserRow u={user} />}
      </section>
      {channels.length > 0 && (
        <section>
          <h3 className="mb-2 font-display font-extrabold">Channels</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {channels.map((c) => (
              <Link key={c.id} to={`/channel/${c.id}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover">
                <span className="text-xl">{c.emoji}</span>
                <span className="min-w-0">
                  <span className="block font-bold text-sm">/{c.id}</span>
                  <span className="block truncate text-xs text-ink-3">{c.description}</span>
                </span>
                <HashIcon size={14} className="ml-auto text-ink-3" />
              </Link>
            ))}
          </div>
        </section>
      )}
      {coins.length > 0 && (
        <section>
          <h3 className="mb-2 font-display font-extrabold">Markets</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {coins.map((m) => {
              const ch = change24h(m, mids[m.coin])
              return (
                <Link key={m.coin} to={`/trade/${m.coin}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: coinColor(m.coin) }}>
                    {m.coin.slice(0, 3)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-sm">{m.coin}-PERP</span>
                    <span className="block text-xs text-ink-3">{coinName(m.coin)}</span>
                  </span>
                  <span className="text-right">
                    <LiveNumber value={mids[m.coin] ?? m.midPx} format={(n) => px(n, m.szDecimals)} className="block text-sm font-semibold" />
                    <span className={cx('mono text-xs', ch >= 0 ? 'text-long' : 'text-short')}>{pct(ch)}</span>
                  </span>
                  <ChartIcon size={14} className="text-ink-3" />
                </Link>
              )
            })}
          </div>
        </section>
      )}
      {nothing && <Empty title="Nothing found" body="Try a Farcaster username, a channel like /degen or a market like BTC." icon={<SearchIcon />} />}
    </div>
  )
}
