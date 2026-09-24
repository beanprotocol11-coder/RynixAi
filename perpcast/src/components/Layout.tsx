import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, ChannelIcon, Logo, Menu, MenuItem, Wordmark, LiveNumber } from './ui'
import { BellIcon, BookmarkIcon, ChartIcon, CompassIcon, HomeIcon, LogoutIcon, MessageIcon, MoonIcon, PlusIcon, SearchIcon, SettingsIcon, SunIcon, UserIcon, WalletIcon, MoreIcon, ExternalIcon, HashIcon, TrendUpIcon, TrendDownIcon, SmileIcon, RocketIcon } from './Icons'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { useNotify } from '../store/notify'
import { useMarket, change24h } from '../store/market'
import { useTrading, unrealized } from '../store/trading'
import { useSocial } from '../store/social'
import { CHANNELS, userPath, type User } from '../lib/social'
import { api } from '../lib/api'
import { coinName, displaySymbol } from '../lib/hyperliquid'
import { CoinLogo } from './CoinLogo'
import { cx, px, pct, usd, compact, shortAddr } from '../lib/format'
import { ROBINHOOD_CHAIN, ROBINHOOD_TESTNET } from '../lib/wallet'
import { useDMs } from '../store/dm'
import { useAsync } from '../hooks/useAsync'

const NAV = [
  { to: '/', label: 'Home', icon: HomeIcon, end: true },
  { to: '/trade', label: 'Trade', icon: ChartIcon },
  { to: '/explore', label: 'Explore', icon: CompassIcon },
  { to: '/memes', label: 'Memes', icon: SmileIcon },
  { to: '/launch', label: 'Launch', icon: RocketIcon },
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
  const session = useAuth((s) => s.session)
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
      <Link to="/" className="mb-3 flex items-center gap-3 rounded-xl px-1 py-2 hover:bg-surface-hover xl:px-2">
        <Logo size={56} className="logo-glow xl:h-16 xl:w-16" />
        <span className="hidden min-w-0 flex-col xl:flex">
          <Wordmark size="lg" />
          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-ink-3">
            <img src="/robinhood-chain.png" alt="" width={12} height={12} className="rounded-sm" /> on Robinhood Chain
          </span>
        </span>
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
                <Avatar src={me.pfp} name={me.displayName || me.username} seed={me.id} size={36} />
                <span className="hidden min-w-0 flex-1 text-left xl:block">
                  <span className="block truncate text-sm font-bold">{me.displayName || me.username}</span>
                  <span className="block truncate text-xs text-ink-3">@{me.username} · {shortAddr(me.address)}</span>
                </span>
                <MoreIcon size={18} className="hidden text-ink-3 xl:block" />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<UserIcon />} onClick={() => { nav(userPath(me)); close() }}>
                  View profile
                </MenuItem>
                <MenuItem icon={<SettingsIcon />} onClick={() => { nav('/settings'); close() }}>
                  Settings
                </MenuItem>
                <MenuItem icon={<ExternalIcon />} onClick={() => { window.open(explorerUrl(session?.chainId ?? 1, me.address), '_blank', 'noopener'); close() }}>
                  View wallet on explorer
                </MenuItem>
                <MenuItem icon={<LogoutIcon />} danger onClick={() => { void signOut(); close() }}>
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
  const items = [NAV[0], NAV[1], NAV[3], NAV[5]]
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
          {me ? <Avatar src={me.pfp} name={me.displayName || me.username} seed={me.id} size={22} /> : <UserIcon size={22} />}
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
      <button onClick={() => (me ? nav(userPath(me)) : openSignIn())} aria-label="Profile">
        {me ? <Avatar src={me.pfp} name={me.displayName || me.username} seed={me.id} size={32} /> : <Logo size={44} className="logo-glow" />}
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
            <Link key={m.coin + i} to={`/trade/${encodeURIComponent(m.coin)}`} className="flex items-center gap-2 text-xs hover:text-accent">
              <span className="font-bold">{m.symbol}</span>
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
        <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-1 text-[11px] font-semibold text-ink-2">
          <img src="/robinhood-chain.png" alt="" width={14} height={14} className="rounded-sm" /> Built on Robinhood Chain
        </span>
        <br />
        Perpcast · Sign in with your wallet · Prices via Hyperliquid (crypto, memes, stocks & RWAs). Trading on Perpcast is a paper-trading simulation — no real funds are at risk.
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
        <Link key={m.coin} to={`/trade/${encodeURIComponent(m.coin)}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
          <CoinLogo coin={m.coin} size={32} />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold leading-tight">{m.symbol}</span>
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
          <Link key={p.id} to={`/trade/${encodeURIComponent(p.coin)}`} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
            <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side}</span>
            <span className="text-sm font-bold">{displaySymbol(p.coin)}</span>
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
          <ChannelIcon channel={c} size={32} />
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

const EXPLORERS: Record<number, string> = {
  [ROBINHOOD_CHAIN.id]: ROBINHOOD_CHAIN.explorer,
  [ROBINHOOD_TESTNET.id]: ROBINHOOD_TESTNET.explorer,
  1: 'https://etherscan.io',
  10: 'https://optimistic.etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
  999: 'https://hyperevmscan.io',
}

export function explorerUrl(chainId: number, address: string): string {
  return `${EXPLORERS[chainId] ?? EXPLORERS[1]}/address/${address}`
}

export function WhoToFollow({ limit = 4 }: { limit?: number }) {
  const follows = useSocial((s) => s.follows)
  const toggleFollow = useSocial((s) => s.toggleFollow)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const { data: users, loading } = useAsync<User[]>(() => api().suggestedUsers(limit + 3), [limit, me?.id])
  const shown = (users ?? []).filter((u) => u.id !== me?.id).slice(0, limit)
  if (!loading && shown.length === 0) {
    return (
      <section className="card overflow-hidden">
        <div className="px-4 pt-3.5 pb-2">
          <h3 className="font-display font-extrabold">Who to follow</h3>
        </div>
        <p className="px-4 pb-4 text-sm text-ink-3">No other traders here yet. Invite a friend — anyone with a wallet can join.</p>
      </section>
    )
  }
  return (
    <section className="card overflow-hidden">
      <div className="px-4 pt-3.5 pb-2">
        <h3 className="font-display font-extrabold">Who to follow</h3>
      </div>
      {shown.length === 0 && <div className="px-4 pb-4 space-y-2">{Array.from({ length: limit }).map((_, i) => <div key={i} className="skeleton h-9" />)}</div>}
      {shown.map((u) => {
        const on = !!follows[u.id]
        return (
          <div key={u.id} className="flex items-center gap-3 px-4 py-2 hover:bg-surface-hover transition-colors">
            <Link to={userPath(u)}>
              <Avatar src={u.pfp} name={u.displayName || u.username} seed={u.id} size={36} />
            </Link>
            <Link to={userPath(u)} className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold leading-tight hover:underline">{u.displayName || u.username}</span>
              <span className="block truncate text-xs text-ink-3">@{u.username} · {shortAddr(u.address)}</span>
            </Link>
            <button className={cx('btn !py-1.5 !px-3.5 text-xs', on ? 'btn-outline' : 'btn-ink')} onClick={() => (me ? void toggleFollow(u) : openSignIn('Sign in to follow people.'))}>
              {on ? 'Following' : 'Follow'}
            </button>
          </div>
        )
      })}
      <div className="px-4 py-2 text-[11px] text-ink-3">{compact(Object.keys(follows).length)} following</div>
    </section>
  )
}
