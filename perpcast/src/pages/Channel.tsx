import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Feed, feedLoader } from '../components/Feed'
import { ComposerBody } from '../components/Composer'
import { CategoryBar } from '../components/CategoryBar'
import { PageHeader, Empty, ChannelIcon } from '../components/ui'
import { ArrowLeftIcon, ArrowRightIcon, HashIcon, ShareIcon } from '../components/Icons'
import { channelById, CHANNELS } from '../lib/social'
import { useAuth } from '../store/auth'
import { toast } from '../store/notify'
import { cx } from '../lib/format'

const MARKET_CHANNELS: Record<string, string> = { crypto: 'crypto', memes: 'memes', stocks: 'stocks', rwa: 'rwa', perpcast: 'all', hyperliquid: 'all' }

function readJoined(id: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem('perpcast:channels') ?? '[]') as string[]).includes(id)
  } catch {
    return false
  }
}

export default function Channel() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const channel = channelById(id)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const [joinedState, setJoinedState] = useState<{ id: string; joined: boolean } | null>(null)
  const joined = joinedState?.id === id ? joinedState.joined : readJoined(id)
  const setJoined = (v: boolean) => setJoinedState({ id, joined: v })
  const load = useMemo(() => feedLoader({ kind: 'channel', key: id }), [id])
  const category = MARKET_CHANNELS[id]

  if (!channel) {
    return (
      <div>
        <PageHeader title="Channel" back={<BackBtn />} />
        <Empty title={`/${id} isn't available`} body="Try one of the channels curated on Perpcast." icon={<HashIcon />} action={<Link to="/explore" className="btn btn-outline">Browse channels</Link>} />
      </div>
    )
  }

  const toggleJoin = () => {
    if (!me) return openSignIn('Sign in to join channels.')
    const next = !joined
    setJoined(next)
    try {
      const list: string[] = JSON.parse(localStorage.getItem('perpcast:channels') ?? '[]')
      localStorage.setItem('perpcast:channels', JSON.stringify(next ? Array.from(new Set([...list, id])) : list.filter((x) => x !== id)))
    } catch {
      /* ignore */
    }
    toast({ kind: next ? 'success' : 'info', title: next ? `Joined /${id}` : `Left /${id}` })
  }

  return (
    <div>
      <PageHeader
        title={`/${channel.id}`}
        sub={channel.name}
        back={<BackBtn />}
        right={
          <button
            className="icon-btn"
            title="Share channel"
            onClick={() => {
              void navigator.clipboard.writeText(`${location.origin}/channel/${channel.id}`)
              toast({ kind: 'info', title: 'Channel link copied' })
            }}
          >
            <ShareIcon size={18} />
          </button>
        }
      />
      <div className="relative overflow-hidden border-b border-line px-4 pb-4 pt-5">
        <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `radial-gradient(600px 160px at 20% 0%, ${channel.accent}55, transparent 70%)` }} />
        <div className="relative flex items-start gap-4">
          <ChannelIcon channel={channel} size={64} className="shadow" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-extrabold tracking-tight">{channel.name}</h2>
            <p className="text-sm text-ink-2 mt-0.5">{channel.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={cx('btn !py-1.5', joined ? 'btn-outline' : 'btn-ink')} onClick={toggleJoin}>
                {joined ? 'Joined' : 'Join channel'}
              </button>
              {category && (
                <Link className="btn btn-ghost !py-1.5 text-sm" to={`/trade?cat=${category}`}>
                  Trade {channel.name} <ArrowRightIcon size={14} />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
      <CategoryBar className="border-b border-line" />
      <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-line px-4 py-2.5">
        {CHANNELS.map((c) => (
          <button key={c.id} className={cx('chip shrink-0', c.id === id && 'chip-active')} onClick={() => nav(`/channel/${c.id}`)}>
            {c.icon ? <img src={c.icon} alt="" width={14} height={14} className="rounded-sm" /> : c.emoji} /{c.id}
          </button>
        ))}
      </div>
      <div className="border-b border-line px-4 py-3">
        <ComposerBody opts={{ channel: channel.id }} autoFocus={false} />
      </div>
      <Feed load={load} refreshKey={`${id}:${me?.id ?? ''}`} freshFilter={(c) => !c.parentId && c.channel === channel.id} emptyTitle={`Be the first to cast in /${channel.id}`} emptyBody="Your casts here are visible to everyone browsing this channel on Perpcast." />
    </div>
  )
}

export function BackBtn() {
  const nav = useNavigate()
  return (
    <button className="icon-btn -ml-2" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Back">
      <ArrowLeftIcon size={20} />
    </button>
  )
}
