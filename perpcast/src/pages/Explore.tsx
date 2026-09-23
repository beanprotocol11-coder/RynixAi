import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader, Avatar, ChannelIcon, LiveNumber, Empty, Spinner, Tabs } from '../components/ui'
import { SearchBox, WhoToFollow } from '../components/Layout'
import { HashIcon, SearchIcon, TrendDownIcon, TrendUpIcon, ChartIcon } from '../components/Icons'
import { CHANNELS, userPath, type User } from '../lib/social'
import { api } from '../lib/api'
import { CATEGORIES, coinName, type MarketCategory } from '../lib/hyperliquid'
import { CoinLogo } from '../components/CoinLogo'
import { useMarket, change24h } from '../store/market'
import { useSocial } from '../store/social'
import { useAuth } from '../store/auth'
import { useAsync } from '../hooks/useAsync'
import { cx, px, pct, usd, shortAddr } from '../lib/format'
import { MobileTopBar } from '../components/Layout'
import { Feed, feedLoader } from '../components/Feed'

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

type Cat = 'all' | MarketCategory

function Discover() {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const [cat, setCat] = useState<Cat>('all')
  const movers = useMemo(
    () =>
      markets
        .filter((m) => cat === 'all' || m.category === cat)
        .map((m) => ({ m, ch: change24h(m, mids[m.coin]) }))
        .sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch))
        .slice(0, 6),
    [markets, mids, cat],
  )
  const trending = useMemo(() => feedLoader({ kind: 'trending' }), [])
  return (
    <div className="flex flex-col gap-6 py-4">
      <section className="px-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="font-display font-extrabold">Top movers</h3>
          <div className="flex gap-1 overflow-x-auto no-scrollbar text-[11px] font-semibold">
            {CATEGORIES.filter((c) => c.id !== 'favs').map((c) => (
              <button key={c.id} className={cx('rounded-full px-2.5 py-1 whitespace-nowrap', cat === c.id ? 'bg-ink text-bg' : 'bg-surface-2 text-ink-3 hover:text-ink')} onClick={() => setCat(c.id as Cat)}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {movers.length === 0 && markets.length === 0 && Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-20" />)}
          {movers.length === 0 && markets.length > 0 && <div className="col-span-full text-sm text-ink-3">No markets in this category right now.</div>}
          {movers.map(({ m, ch }) => (
            <Link key={m.coin} to={`/trade/${encodeURIComponent(m.coin)}`} className="card p-3 hover:bg-surface-hover transition-colors">
              <div className="flex items-center gap-2">
                <CoinLogo coin={m.coin} size={28} />
                <span className="font-bold text-sm">{m.symbol}</span>
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
      <section className="px-4">
        <h3 className="mb-2 font-display font-extrabold">Channels</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {CHANNELS.map((c) => (
            <Link key={c.id} to={`/channel/${c.id}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover transition-colors">
              <ChannelIcon channel={c} size={40} />
              <span className="min-w-0">
                <span className="block font-bold text-sm">/{c.id}</span>
                <span className="block truncate text-xs text-ink-3">{c.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="px-4 lg:hidden">
        <WhoToFollow limit={6} />
      </section>
      <section className="hidden px-4 lg:block">
        <h3 className="mb-2 font-display font-extrabold">People to follow</h3>
        <PeopleGrid />
      </section>
      <section>
        <h3 className="mb-1 px-4 font-display font-extrabold">Trending casts</h3>
        <Feed load={trending} pollMs={0} emptyTitle="Nothing trending yet" emptyBody="Casts with the most likes, recasts and replies will surface here." />
      </section>
    </div>
  )
}

function PeopleGrid() {
  const me = useAuth((s) => s.user)
  const { data, loading } = useAsync<User[]>(() => api().suggestedUsers(8), [me?.id])
  const users = (data ?? []).filter((u) => u.id !== me?.id)
  if (!loading && users.length === 0) return <p className="text-sm text-ink-3">No other traders here yet — invite a friend, anyone with a wallet can join.</p>
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {loading && users.length === 0 && Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-16" />)}
      {users.map((u) => (
        <UserRow key={u.id} u={u} />
      ))}
    </div>
  )
}

export function UserRow({ u }: { u: User }) {
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const on = !!follows[u.id]
  return (
    <div className="card flex items-center gap-3 p-3">
      <Link to={userPath(u)}>
        <Avatar src={u.pfp} name={u.displayName || u.username} seed={u.id} size={40} />
      </Link>
      <Link to={userPath(u)} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold hover:underline">{u.displayName || u.username}</span>
        <span className="block truncate text-xs text-ink-3">@{u.username} · {shortAddr(u.address)}</span>
        {u.bio && <span className="mt-0.5 block truncate text-xs text-ink-2">{u.bio}</span>}
      </Link>
      {me?.id !== u.id && (
        <button className={cx('btn !py-1.5 !px-3.5 text-xs', on ? 'btn-outline' : 'btn-ink')} onClick={() => (me ? void toggleFollow(u) : openSignIn('Sign in to follow people.'))}>
          {on ? 'Following' : 'Follow'}
        </button>
      )}
    </div>
  )
}

type SearchTab = 'top' | 'casts'

function SearchResults({ q }: { q: string }) {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const [tab, setTab] = useState<SearchTab>('top')
  const lower = q.toLowerCase().replace(/^[@$/]/, '')
  const { data: users, loading } = useAsync<User[]>(() => api().searchUsers(lower, 8), [lower])
  const castLoader = useMemo(() => feedLoader({ kind: 'search', key: q }), [q])

  const channels = CHANNELS.filter((c) => c.id.includes(lower) || c.name.toLowerCase().includes(lower) || c.description.toLowerCase().includes(lower))
  const coins = markets.filter((m) => m.symbol.toLowerCase().includes(lower) || coinName(m.coin).toLowerCase().includes(lower)).slice(0, 8)
  const people = users ?? []
  const nothing = !loading && people.length === 0 && channels.length === 0 && coins.length === 0

  return (
    <div>
      <Tabs<SearchTab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'top', label: 'Top' },
          { id: 'casts', label: 'Casts' },
        ]}
      />
      {tab === 'casts' && <Feed load={castLoader} pollMs={0} emptyTitle="No casts match" emptyBody={`Nobody has cast about “${q}” yet.`} />}
      {tab === 'top' && (
        <div className="flex flex-col gap-6 px-4 py-4">
          <div className="text-sm text-ink-3">
            Results for <b className="text-ink">“{q}”</b>
          </div>
          <section>
            <h3 className="mb-2 font-display font-extrabold flex items-center gap-2">People</h3>
            {loading && people.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-ink-3">
                <Spinner /> Searching…
              </div>
            )}
            {!loading && people.length === 0 && <div className="text-sm text-ink-3">No Perpcast user matches “{lower}”. Search by username, display name or wallet address.</div>}
            <div className="grid gap-2 sm:grid-cols-2">
              {people.map((u) => (
                <UserRow key={u.id} u={u} />
              ))}
            </div>
          </section>
          {channels.length > 0 && (
            <section>
              <h3 className="mb-2 font-display font-extrabold">Channels</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {channels.map((c) => (
                  <Link key={c.id} to={`/channel/${c.id}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover">
                    <ChannelIcon channel={c} size={36} />
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
                    <Link key={m.coin} to={`/trade/${encodeURIComponent(m.coin)}`} className="card flex items-center gap-3 p-3 hover:bg-surface-hover">
                      <CoinLogo coin={m.coin} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-sm">{m.symbol}-PERP</span>
                        <span className="block text-xs text-ink-3">{coinName(m.coin)} · {CATEGORIES.find((c) => c.id === m.category)?.label}</span>
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
          {nothing && <Empty title="Nothing found" body="Try a username, a wallet address, a channel like /stocks or a market like TSLA." icon={<SearchIcon />} />}
        </div>
      )}
    </div>
  )
}
