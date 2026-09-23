import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Logo, Menu, MenuItem, Wordmark, LiveNumber } from './ui'
import { BellIcon, BookmarkIcon, ChartIcon, CompassIcon, HomeIcon, LogoutIcon, MessageIcon, MoonIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon, UserIcon, WalletIcon, MoreIcon, ExternalIcon, HashIcon, TrendUpIcon, TrendDownIcon } from './Icons'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { useNotify } from '../store/notify'
import { useMarket, change24h } from '../store/market'
import { useTrading, unrealized } from '../store/trading'
import { useSocial } from '../store/social'
import { CHANNELS, fetchUser, type FcUser } from '../lib/farcaster'
import { coinColor, coinName } from '../lib/hyperliquid'
import { cx, px, pct, usd, compact } from '../lib/format'
import { useDMs } from '../store/dm'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/trade', label: 'Trade', icon: ChartIcon },
  { to: '/explore', label: 'Explore', icon: CompassIcon },
  { to: '/notifications', label: 'Notifications', icon: BellIcon },
  { to: '/messages', label: 'Messages', icon: MessageIcon },
  { to: '/bookmarks', label: 'Bookmarks', icon: BookmarkIcon },
  { to: '/portfolio', label: 'Portfolio', icon: WalletIcon },
]

export function Layout() {
  const { pathname } = useLocation()
  const wide = pathname.startsWith('/trade')
  const start = useMarket((s) => s.start)
  useEffect(() => start(), [start])
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-dvh">
      <MarketTape />
      <div className={cx('mx-auto flex w-full', wide ? 'max-w-[1600px]' : 'max-w-[1280px]')}>
        <Sidebar />
        <main className={cx('min-w-0 flex-1 border-x border-line min-h-[calc(100dvh-2rem)] pb-20 md:pb-0', wide ? 'max-w-none' : 'max-w-[640px]')}>
          <Outlet />
        </main>
        {!wide && <RightRail />}
      </div>
      <MobileNav />
    </div>
  )
}

function Sidebar() {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const signOut = useAuth((s) => s.signOut)
  const openComposer = useUI((s) => s.openComposer)
  const theme = useUI((s) => s.theme)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const unread = useNotify((s) => s.notifications.filter((n) => !n.read).length)
  const unreadDm = useDMs((s) => s.unreadCount())
  const nav = useNavigate()

  return (
    <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-[72px] shrink-0 flex-col px-2 py-3 md:flex xl:w-[260px] xl:px-4">
      <Link to="/" className="mb-3 flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-surface-hover xl:px-3">
        <Logo size={36} />
        <Wordmark className="hidden xl:inline" size="lg" />
      </Link>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const badge = n.to === '/notifications' ? unread : n.to === '/messages' ? unreadDm : 0
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-item justify-center xl:justify-start" title={n.label}>
              <span className="relative">
                <n.icon size={24} />
                {badge > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{badge > 99 ? '99+' : badge}</span>}
              </span>
              <span className="hidden xl:inline">{n.label}</span>
            </NavLink>
          )
        })}
        <NavLink to={me ? `/u/${me.username}` : '/profile'} className="nav-item justify-center xl:justify-start" title="Profile">
          <UserIcon size={24} />
          <span className="hidden xl:inline">Profile</span>
        </NavLink>
        <NavLink to="/settings" className="nav-item justify-center xl:justify-start" title="Settings">
          <SettingsIcon size={24} />
          <span className="hidden xl:inline">Settings</span>
        </NavLink>
      </nav>
      <button className="btn btn-primary mt-4 h-11 w-11 self-center !p-0 xl:h-12 xl:w-full xl:self-auto" onClick={() => (me ? openComposer() : openSignIn('Sign in to cast.'))} aria-label="New cast">
        <PlusIcon size={22} className="xl:hidden" />
        <span className="hidden xl:inline text-[15px]">Cast</span>
      </button>

      <div className="mt-auto flex flex-col gap-1">
        <button className="nav-item justify-center xl:justify-start" onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <SunIcon size={22} /> : <MoonIcon size={22} />}
          <span className="hidden xl:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        {me ? (
          <Menu
            align="left"
            className="w-full"
            trigger={() => (
              <button className="flex w-full items-center gap-3 rounded-xl p-2 hover:bg-surface-hover xl:px-3">
                <Avatar src={me.pfp} name={me.displayName} fid={me.fid} size={36} />
                <span className="hidden min-w-0 flex-1 text-left xl:block">
                  <span className="block truncate text-sm font-bold">{me.displayName}</span>
                  <span className="block truncate text-xs text-ink-3">{me.method === 'farcaster' ? `@${me.username}` : me.username}</span>
                </span>
                <MoreIcon size={18} className="hidden text-ink-3 xl:block" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<UserIcon />} onClick={() => { nav(`/u/${me.username}`); close() }}>
                  View profile
                </MenuItem>
                <MenuItem icon={<SettingsIcon />} onClick={() => { nav('/settings'); close() }}>
                  Settings
                </MenuItem>
                {me.method === 'farcaster' && (
                  <MenuItem icon={<ExternalIcon />} onClick={() => { window.open(`https://warpcast.com/${me.username}`, '_blank', 'noopener'); close() }}>
                    Open on Warpcast
                  </MenuItem>
                )}
                <MenuItem icon={<LogoutIcon />} danger onClick={() => { signOut(); close() }}>
                  Sign out
                </MenuItem>
              </>
            )}
          </Menu>
        ) : (
          <button className="btn btn-ink h-11 w-11 self-center !p-0 xl:w-full xl:self-auto" onClick={() => openSignIn()}>
            <UserIcon size={20} className="xl:hidden" />
            <span className="hidden xl:inline">Sign in</span>
          </button>
        )}
      </div>
    </aside>
  )
}

function MobileNav() {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const openComposer = useUI((s) => s.openComposer)
  const unread = useNotify((s) => s.notifications.filter((n) => !n.read).length)
  const items = [NAV[0], NAV[1], NAV[2], NAV[3]]
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 glass border-t border-line md:hidden">
      <div className="mx-auto flex h-16 max-w-md items-center justify-around px-2 pb-[env(safe-area-inset-bottom)]">
        {items.slice(0, 2).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>
            <n.icon size={22} />
            {n.label}
          </NavLink>
        ))}
        <button className="btn btn-primary -mt-6 h-12 w-12 !p-0 shadow-pop" onClick={() => (me ? openComposer() : openSignIn('Sign in to cast.'))} aria-label="New cast">
          <PlusIcon size={22} />
        </button>
        {items.slice(2).map((n) => (
          <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('relative flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>
            <n.icon size={22} />
            {n.label}
            {n.to === '/notifications' && unread > 0 && <span className="absolute right-2 top-0 h-2 w-2 rounded-full bg-accent" />}
          </NavLink>
        ))}
        <NavLink to={me ? '/portfolio' : '/profile'} className={({ isActive }) => cx('flex flex-col items-center gap-0.5 px-3 py-1 text-[10px] font-semibold', isActive ? 'text-accent' : 'text-ink-3')}>
          {me ? <Avatar src={me.pfp} name={me.displayName} fid={me.fid} size={22} /> : <UserIcon size={22} />}
          {me ? 'Portfolio' : 'Sign in'}
        </NavLink>
      </div>
    </nav>
  )
}

export function MobileTopBar({ title }: { title?: React.ReactNode }) {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const theme = useUI((s) => s.theme)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const nav = useNavigate()
  return (
    <div className="flex h-14 items-center gap-3 px-4 md:hidden">
      <button onClick={() => (me ? nav(`/u/${me.username}`) : openSignIn())} aria-label="Profile">
        {me ? <Avatar src={me.pfp} name={me.displayName} fid={me.fid} size={32} /> : <Logo size={32} />}
      </button>
      <div className="flex-1 text-center">{title ?? <Wordmark />}</div>
      <button className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
        {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
      </button>
    </div>
  )
}

/** Scrolling live price tape at the very top of the app. */
function MarketTape() {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const ws = useMarket((s) => s.wsStatus)
  const top = useMemo(() => markets.slice(0, 18), [markets])
  if (!top.length) return <div className="h-8 border-b border-line bg-elev" />
  const items = [...top, ...top]
  return (
    <div className="relative h-8 overflow-hidden border-b border-line bg-elev">
      <div className="absolute left-0 top-0 z-10 flex h-8 items-center gap-2 bg-elev pl-3 pr-4 text-[11px] font-semibold text-ink-3">
        <span className={cx('h-1.5 w-1.5 rounded-full', ws === 'open' ? 'bg-long' : ws === 'connecting' ? 'bg-accent-3' : 'bg-short')} />
        LIVE
      </div>
      <div className="tape flex h-8 items-center gap-6 whitespace-nowrap pl-24">
        {items.map((m, i) => {
          const p = mids[m.coin] ?? m.midPx
          const ch = change24h(m, p)
          return (
            <Link key={m.coin + i} to={`/trade/${m.coin}`} className="flex items-center gap-2 text-xs hover:text-accent">
              <span className="font-bold">{m.coin}</span>
              <LiveNumber value={p} format={(n) => px(n, m.szDecimals)} className="text-ink-2" />
              <span className={cx('mono', ch >= 0 ? 'text-long' : 'text-short')}>{pct(ch)}</span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function RightRail() {
  return (
    <aside className="sticky top-8 hidden h-[calc(100dvh-2rem)] w-[340px] shrink-0 flex-col gap-4 overflow-y-auto no-scrollbar px-5 py-3 lg:flex">
      <SearchBox />
      <MarketsWidget />
      <PositionsWidget />
      <ChannelsWidget />
      <WhoToFollow />
      <footer className="px-1 pb-4 text-[11px] leading-relaxed text-ink-3">
        Perpcast · Casts via Farcaster Hubs · Prices via Hyperliquid. Trading on Perpcast is a paper-trading simulation — no real funds are at risk.
      </footer>
    </aside>
  )
}

export function SearchBox({ autoFocus, className }: { autoFocus?: boolean; className?: string }) {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  return (
    <form
      className={cx('relative', className)}
      onSubmit={(e) => {
        e.preventDefault()
        const v = q.trim()
        if (!v) return
        nav(`/explore?q=${encodeURIComponent(v)}`)
        setQ('')
      }}
    >
      <SearchIcon size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
      <input className="input !rounded-full !pl-10" placeholder="Search users, channels, markets" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus} />
    </form>
  )
}

function MarketsWidget() {
  const markets = useMarket((s) => s.markets)
  const mids = useMarket((s) => s.mids)
  const [tab, setTab] = useState<'top' | 'gainers' | 'losers'>('top')
  const list = useMemo(() => {
    const withCh = markets.map((m) => ({ m, p: mids[m.coin] ?? m.midPx, ch: change24h(m, mids[m.coin]) }))
    if (tab === 'gainers') return withCh.sort((a, b) => b.ch - a.ch).slice(0, 6)
    if (tab === 'losers') return withCh.sort((a, b) => a.ch - b.ch).slice(0, 6)
    return withCh.slice(0, 6)
  }, [markets, mids, tab])
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h3 className="font-display font-extrabold">Markets</h3>
        <div className="flex gap-1 text-[11px] font-semibold">
          {(['top', 'gainers', 'losers'] as const).map((t) => (
            <button key={t} className={cx('rounded-full px-2 py-0.5 capitalize', tab === t ? 'bg-surface-2 text-ink' : 'text-ink-3 hover:text-ink')} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 && <div className="px-4 pb-4 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>}
      {list.map(({ m, p, ch }) => (
        <Link key={m.coin} to={`/trade/${m.coin}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
          <span className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: coinColor(m.coin) }}>
            {m.coin.slice(0, 3)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">{m.coin}</span>
            <span className="block truncate text-[11px] text-ink-3">{coinName(m.coin)} · Vol {usd(m.dayNtlVlm, { compact: true })}</span>
          </span>
          <span className="text-right">
            <LiveNumber value={p} format={(n) => px(n, m.szDecimals)} className="block text-sm font-semibold" />
            <span className={cx('mono flex items-center justify-end gap-0.5 text-[11px]', ch >= 0 ? 'text-long' : 'text-short')}>
              {ch >= 0 ? <TrendUpIcon size={11} /> : <TrendDownIcon size={11} />}
              {pct(ch)}
            </span>
          </span>
        </Link>
      ))}
      <Link to="/trade" className="block border-t border-line px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface-hover">
        Open trading terminal →
      </Link>
    </section>
  )
}

function PositionsWidget() {
  const positions = useTrading((s) => s.positions)
  const mids = useMarket((s) => s.mids)
  if (!positions.length) return null
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h3 className="font-display font-extrabold">Your positions</h3>
        <span className="text-xs text-ink-3">{positions.length}</span>
      </div>
      {positions.slice(0, 4).map((p) => {
        const mark = mids[p.coin] ?? p.entry
        const pnl = unrealized(p, mark)
        return (
          <Link key={p.id} to={`/trade/${p.coin}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
            <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side}</span>
            <span className="text-sm font-bold">{p.coin}</span>
            <span className="mono text-xs text-ink-3">{p.leverage}x</span>
            <span className={cx('ml-auto mono text-sm font-semibold', pnl >= 0 ? 'text-long' : 'text-short')}>{usd(pnl, { sign: true })}</span>
          </Link>
        )
      })}
      <Link to="/portfolio" className="block border-t border-line px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface-hover">
        View portfolio →
      </Link>
    </section>
  )
}

function ChannelsWidget() {
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pt-3.5 pb-2">
        <h3 className="font-display font-extrabold">Channels</h3>
      </div>
      {CHANNELS.slice(0, 5).map((c) => (
        <Link key={c.id} to={`/channel/${c.id}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg text-base" style={{ background: `${c.accent}22` }}>
            {c.emoji}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">/{c.id}</span>
            <span className="block truncate text-[11px] text-ink-3">{c.description}</span>
          </span>
          <HashIcon size={14} className="text-ink-3" />
        </Link>
      ))}
      <Link to="/explore" className="block border-t border-line px-4 py-2.5 text-sm font-semibold text-accent hover:bg-surface-hover">
        Browse all channels →
      </Link>
    </section>
  )
}

export const SUGGESTED_FIDS = [3, 2, 5650, 99, 12, 1317, 239, 194, 8152, 20591]

export function WhoToFollow({ limit = 4 }: { limit?: number }) {
  const [users, setUsers] = useState<FcUser[]>([])
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  useEffect(() => {
    let alive = true
    Promise.all(SUGGESTED_FIDS.slice(0, limit + 3).map((f) => fetchUser(f))).then((u) => alive && setUsers(u))
    return () => {
      alive = false
    }
  }, [limit])
  const shown = users.filter((u) => u.fid !== me?.fid).slice(0, limit)
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pt-3.5 pb-2">
        <h3 className="font-display font-extrabold">Who to follow</h3>
      </div>
      {shown.length === 0 && <div className="px-4 pb-4 space-y-2">{Array.from({ length: limit }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>}
      {shown.map((u) => {
        const on = !!follows[u.fid]
        return (
          <div key={u.fid} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
            <Link to={`/u/${u.username}`}>
              <Avatar src={u.pfp} name={u.displayName} fid={u.fid} size={36} />
            </Link>
            <Link to={`/u/${u.username}`} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-tight hover:underline">{u.displayName}</span>
              <span className="block truncate text-xs text-ink-3">@{u.username}</span>
            </Link>
            <button className={cx('btn !py-1.5 !px-3.5 text-xs', on ? 'btn-outline' : 'btn-ink')} onClick={() => (me ? toggleFollow(u.fid, u) : openSignIn('Sign in to follow people.'))}>
              {on ? 'Following' : 'Follow'}
            </button>
          </div>
        )
      })}
      <div className="px-4 py-2 text-[11px] text-ink-3">{compact(follows ? Object.keys(follows).length : 0)} following</div>
    </section>
  )
}
