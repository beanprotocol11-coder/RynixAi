import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Feed, type Loader } from '../components/Feed'
import { ComposerBody } from '../components/Composer'
import { PageHeader, Empty } from '../components/ui'
import { ArrowLeftIcon, ExternalIcon, HashIcon, ShareIcon } from '../components/Icons'
import { channelById, fetchChannelCasts, CHANNELS } from '../lib/farcaster'
import { useAuth } from '../store/auth'
import { toast } from '../store/notify'
import { cx } from '../lib/format'

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
  const url = channel?.url
  const load = useMemo<Loader>(() => (url && !url.startsWith('perpcast://') ? (t?: string) => fetchChannelCasts(url, 25, t) : async () => ({ casts: [] })), [url])

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
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-3xl shadow" style={{ background: `${channel.accent}26`, border: `1px solid ${channel.accent}55` }}>
            {channel.emoji}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-extrabold tracking-tight">{channel.name}</h2>
            <p className="text-sm text-ink-2 mt-0.5">{channel.description}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button className={cx('btn !py-1.5', joined ? 'btn-outline' : 'btn-ink')} onClick={toggleJoin}>
                {joined ? 'Joined' : 'Join channel'}
              </button>
              {!channel.url.startsWith('perpcast://') && (
                <a className="btn btn-ghost !py-1.5 text-sm" href={`https://warpcast.com/~/channel/${channel.id}`} target="_blank" rel="noreferrer noopener">
                  Warpcast <ExternalIcon size={14} />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar border-b border-line px-4 py-2.5">
        {CHANNELS.map((c) => (
          <button key={c.id} className={cx('chip shrink-0', c.id === id && 'chip-active')} onClick={() => nav(`/channel/${c.id}`)}>
            {c.emoji} /{c.id}
          </button>
        ))}
      </div>
      <div className="border-b border-line px-4 py-3">
        <ComposerBody opts={{ channelUrl: channel.url }} autoFocus={false} />
      </div>
      <Feed load={load} localFilter={(c) => !c.parentId && c.channel === channel.url} emptyTitle={`Be the first to cast in /${channel.id}`} emptyBody="Your casts here are visible to everyone browsing this channel on Perpcast." />
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
