import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, PageHeader, Empty, Modal, ModalHeader, Spinner, Menu, MenuItem } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { BackBtn } from './Channel'
import { MessageIcon, PlusIcon, TrashIcon, MoreIcon, UserIcon, ShieldIcon } from '../components/Icons'
import { useDMs, lastTime, type DMThread } from '../store/dm'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { fetchUser, fidByUsername, cachedUser, type FcUser } from '../lib/farcaster'
import { cx, timeAgo, fullDate } from '../lib/format'
import { toast } from '../store/notify'

export default function Messages() {
  const { threadId } = useParams()
  const threads = useDMs((s) => s.threads)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const [picker, setPicker] = useState(false)
  const nav = useNavigate()
  const sorted = useMemo(() => [...threads].sort((a, b) => lastTime(b) - lastTime(a)), [threads])
  const active = threadId ? threads.find((t) => t.id === threadId) : undefined

  if (!me) {
    return (
      <div>
        <MobileTopBar title={<span className="font-display font-extrabold">Messages</span>} />
        <div className="hidden md:block">
          <PageHeader title="Messages" />
        </div>
        <Empty title="Sign in to message traders" body="Direct messages on Perpcast are private and stored on this device." icon={<MessageIcon />} action={<button className="btn btn-primary" onClick={() => openSignIn('Sign in to send messages.')}>Sign in</button>} />
      </div>
    )
  }

  if (active) return <Chat thread={active} meFid={me.fid} />

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Messages</span>} />
      <div className="hidden md:block">
        <PageHeader
          title="Messages"
          sub="Private chats with traders"
          right={
            <button className="btn btn-primary !py-2 gap-1.5" onClick={() => setPicker(true)}>
              <PlusIcon size={16} /> New
            </button>
          }
        />
      </div>
      <div className="flex items-center gap-2 border-b border-line px-4 py-2 text-xs text-ink-3">
        <ShieldIcon size={14} /> Messages are stored locally in your browser. Nothing is sent to a server.
      </div>
      {sorted.length === 0 && (
        <Empty
          title="No conversations yet"
          body="Start a chat with any Farcaster user by username."
          icon={<MessageIcon />}
          action={
            <button className="btn btn-primary" onClick={() => setPicker(true)}>
              New message
            </button>
          }
        />
      )}
      {sorted.map((t) => {
        const last = t.messages[t.messages.length - 1]
        const unread = t.messages.filter((m) => m.time > t.lastRead && m.from === t.peer.fid).length
        return (
          <button key={t.id} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-hover/60" onClick={() => nav(`/messages/${t.id}`)}>
            <Avatar src={t.peer.pfp} name={t.peer.displayName} fid={t.peer.fid} size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-bold">{t.peer.displayName}</span>
                <span className="truncate text-xs text-ink-3">@{t.peer.username}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-3">{timeAgo(lastTime(t))}</span>
              </span>
              <span className={cx('block truncate text-sm', unread ? 'font-semibold text-ink' : 'text-ink-3')}>{last ? (last.from === me.fid ? `You: ${last.text}` : last.text) : 'Say hi 👋'}</span>
            </span>
            {unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{unread}</span>}
          </button>
        )
      })}
      <button className="btn btn-primary fixed bottom-20 right-4 h-12 w-12 !p-0 shadow-pop md:hidden" onClick={() => setPicker(true)} aria-label="New message">
        <PlusIcon size={22} />
      </button>
      <NewMessageModal open={picker} onClose={() => setPicker(false)} />
    </div>
  )
}

function NewMessageModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [hit, setHit] = useState<FcUser | null | undefined>(undefined)
  const follows = useSocial((s) => s.follows)
  const openThread = useDMs((s) => s.open)
  const nav = useNavigate()
  const suggestions = useMemo(() => Object.keys(follows).map((f) => cachedUser(Number(f))).filter((u): u is FcUser => !!u).slice(0, 8), [follows])

  useEffect(() => {
    const handle = q.trim().replace(/^@/, '').toLowerCase()
    setHit(undefined)
    if (!handle) return
    let alive = true
    setBusy(true)
    const t = setTimeout(async () => {
      const fid = /^\d+$/.test(handle) ? Number(handle) : await fidByUsername(handle)
      if (!alive) return
      if (!fid) {
        setHit(null)
        setBusy(false)
        return
      }
      const u = await fetchUser(fid)
      if (!alive) return
      setHit(u)
      setBusy(false)
    }, 350)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const start = (u: FcUser) => {
    const t = openThread(u)
    onClose()
    setQ('')
    nav(`/messages/${t.id}`)
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" label="New message">
      <ModalHeader title="New message" sub="Search any Farcaster username" onClose={onClose} />
      <div className="px-5 pb-5">
        <input className="input" placeholder="@username or fid" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="mt-3 flex flex-col gap-1">
          {busy && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-ink-3">
              <Spinner /> Searching…
            </div>
          )}
          {hit === null && !busy && <div className="px-2 py-2 text-sm text-ink-3">No user found for “{q}”.</div>}
          {hit && !busy && <UserPick u={hit} onPick={start} />}
          {!q && suggestions.length > 0 && (
            <>
              <div className="px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-ink-3">People you follow</div>
              {suggestions.map((u) => (
                <UserPick key={u.fid} u={u} onPick={start} />
              ))}
            </>
          )}
          {!q && suggestions.length === 0 && (
            <div className="px-2 py-2 text-sm text-ink-3">
              Tip: follow people from <Link to="/explore" className="text-accent" onClick={onClose}>Explore</Link> to see them here.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function UserPick({ u, onPick }: { u: FcUser; onPick: (u: FcUser) => void }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-hover" onClick={() => onPick(u)}>
      <Avatar src={u.pfp} name={u.displayName} fid={u.fid} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{u.displayName}</span>
        <span className="block truncate text-xs text-ink-3">@{u.username}</span>
      </span>
      <MessageIcon size={16} className="text-ink-3" />
    </button>
  )
}

function Chat({ thread, meFid }: { thread: DMThread; meFid: number }) {
  const send = useDMs((s) => s.send)
  const markRead = useDMs((s) => s.markRead)
  const remove = useDMs((s) => s.remove)
  const nav = useNavigate()
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)

  useEffect(() => {
    markRead(thread.id)
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [thread.id, thread.messages.length, markRead])

  const submit = () => {
    const t = text.trim()
    if (!t) return
    send(thread.id, meFid, t)
    setText('')
  }

  let lastDay = ''
  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col md:h-[calc(100dvh-2rem)]">
      <PageHeader
        title={
          <Link to={`/u/${thread.peer.username}`} className="flex items-center gap-2 hover:underline">
            <Avatar src={thread.peer.pfp} name={thread.peer.displayName} fid={thread.peer.fid} size={28} />
            {thread.peer.displayName}
          </Link>
        }
        sub={`@${thread.peer.username}`}
        back={<BackBtn />}
        right={
          <Menu trigger={() => <button className="icon-btn" aria-label="Options"><MoreIcon size={18} /></button>}>
            {(close) => (
              <>
                <MenuItem icon={<UserIcon />} onClick={() => { nav(`/u/${thread.peer.username}`); close() }}>
                  View profile
                </MenuItem>
                <MenuItem icon={<TrashIcon />} danger onClick={() => { remove(thread.id); toast({ kind: 'info', title: 'Conversation deleted' }); nav('/messages') }}>
                  Delete conversation
                </MenuItem>
              </>
            )}
          </Menu>
        }
      />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {thread.messages.length === 0 && (
          <div className="mx-auto max-w-xs py-10 text-center">
            <Avatar src={thread.peer.pfp} name={thread.peer.displayName} fid={thread.peer.fid} size={64} className="mx-auto" />
            <div className="mt-3 font-display font-extrabold">{thread.peer.displayName}</div>
            <div className="text-sm text-ink-3">@{thread.peer.username}</div>
            {thread.peer.bio && <p className="mt-2 text-sm text-ink-2">{thread.peer.bio}</p>}
            <p className="mt-4 text-xs text-ink-3">This is the beginning of your conversation. Messages live only on this device.</p>
          </div>
        )}
        {thread.messages.map((m) => {
          const day = new Date(m.time).toDateString()
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.from === meFid
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">{new Date(m.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
              <div className={cx('mb-1.5 flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words', mine ? 'bg-accent text-white rounded-br-md' : 'bg-surface-2 rounded-bl-md')} title={fullDate(m.time)}>
                  {m.text}
                  <span className={cx('ml-2 align-baseline text-[10px]', mine ? 'text-white/70' : 'text-ink-3')}>{new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] mb-16 md:mb-0"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <textarea
          className="input max-h-32 min-h-[42px] flex-1 resize-none !py-2.5"
          rows={1}
          placeholder={`Message @${thread.peer.username}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <button type="submit" className="btn btn-primary !py-2.5" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  )
}
