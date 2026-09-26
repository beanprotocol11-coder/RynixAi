import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Empty, Tabs } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { BellIcon, HeartIcon, RecastIcon, ReplyIcon, UserIcon, ZapIcon, ShieldIcon, TrendUpIcon, TrendDownIcon, CheckIcon, TrashIcon, SparkIcon } from '../components/Icons'
import { useNotify, type AppNotification, type NotificationKind } from '../store/notify'
import { cx, timeAgo } from '../lib/format'

type Tab = 'all' | 'trading' | 'social'
const TRADING: NotificationKind[] = ['fill', 'close', 'liquidation', 'tp', 'sl']

const ICON: Record<NotificationKind, { icon: React.ReactNode; cls: string }> = {
  fill: { icon: <ZapIcon size={16} />, cls: 'bg-accent-soft text-accent' },
  close: { icon: <CheckIcon size={16} />, cls: 'bg-long-soft text-long' },
  liquidation: { icon: <TrendDownIcon size={16} />, cls: 'bg-short-soft text-short' },
  tp: { icon: <TrendUpIcon size={16} />, cls: 'bg-long-soft text-long' },
  sl: { icon: <ShieldIcon size={16} />, cls: 'bg-short-soft text-short' },
  system: { icon: <BellIcon size={16} />, cls: 'bg-surface-2 text-ink-2' },
  cast: { icon: <ZapIcon size={16} />, cls: 'bg-accent-soft text-accent' },
  reply: { icon: <ReplyIcon size={16} />, cls: 'bg-surface-2 text-info' },
  like: { icon: <HeartIcon size={16} filled />, cls: 'bg-short-soft text-short' },
  recast: { icon: <RecastIcon size={16} />, cls: 'bg-long-soft text-long' },
  follow: { icon: <UserIcon size={16} />, cls: 'bg-accent-soft text-accent' },
  joined: { icon: <SparkIcon size={16} />, cls: 'bg-accent-soft text-accent' },
}

export default function Notifications() {
  const all = useNotify((s) => s.notifications)
  const markAllRead = useNotify((s) => s.markAllRead)
  const markRead = useNotify((s) => s.markRead)
  const clear = useNotify((s) => s.clear)
  const [tab, setTab] = useState<Tab>('all')
  const unread = all.filter((n) => !n.read).length

  useEffect(() => {
    const t = setTimeout(markAllRead, 1500)
    return () => clearTimeout(t)
  }, [markAllRead, all.length])

  const list = useMemo(() => all.filter((n) => (tab === 'all' ? true : tab === 'trading' ? TRADING.includes(n.kind) : !TRADING.includes(n.kind))), [all, tab])

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Notifications</span>} />
      <div className="hidden md:block">
        <PageHeader
          title="Notifications"
          sub={unread ? `${unread} unread` : 'All caught up'}
          right={
            all.length > 0 && (
              <div className="flex gap-1">
                <button className="btn btn-ghost !py-1.5 text-xs" onClick={markAllRead}>
                  Mark all read
                </button>
                <button className="icon-btn" title="Clear all" onClick={clear}>
                  <TrashIcon size={16} />
                </button>
              </div>
            )
          }
        />
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'trading', label: 'Trading' },
          { id: 'social', label: 'Social' },
        ]}
      />
      {list.length === 0 && <Empty title="No notifications yet" body="Fills, liquidations, TP/SL triggers and social activity will land here." icon={<BellIcon />} />}
      {list.map((n) => (
        <Row key={n.id} n={n} onRead={() => markRead(n.id)} />
      ))}
    </div>
  )
}

function Row({ n, onRead }: { n: AppNotification; onRead: () => void }) {
  const meta = ICON[n.kind]
  const inner = (
    <div className={cx('flex items-start gap-3 border-b border-line px-4 py-3 transition-colors hover:bg-surface-hover/50', !n.read && 'bg-accent-soft/30')} onClick={onRead}>
      <span className={cx('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', meta.cls)}>{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{n.title}</div>
        {n.body && <div className="text-sm text-ink-2 break-words">{n.body}</div>}
        <div className="mt-0.5 text-xs text-ink-3">{timeAgo(n.time)}</div>
      </div>
      {!n.read && <span className="mt-2 h-2 w-2 rounded-full bg-accent" />}
    </div>
  )
  return n.href ? <Link to={n.href}>{inner}</Link> : inner
}
