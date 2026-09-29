import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, PageHeader, Empty, Modal, ModalHeader, Spinner, Menu, MenuItem } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { BackBtn } from './Channel'
import { MessageIcon, PlusIcon, MoreIcon, UserIcon, ShieldIcon } from '../components/Icons'
import { useDMs, lastTime } from '../store/dm'
import { useAuth } from '../store/auth'
import { api } from '../lib/api'
import { userPath, type DMThread, type User } from '../lib/social'
import { useAsync } from '../hooks/useAsync'
import { cx, timeAgo, fullDate } from '../lib/format'
import { toast } from '../store/notify'

export default function Messages() {
  const { threadId } = useParams()
  const threads = useDMs((s) => s.threads)
  const loaded = useDMs((s) => s.loaded)
  const loading = useDMs((s) => s.loading)
  const refreshThreads = useDMs((s) => s.refreshThreads)
  const openThread = useDMs((s) => s.open)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const [picker, setPicker] = useState(false)
  const nav = useNavigate()
  const sorted = useMemo(() => [...threads].sort((a, b) => lastTime(b) - lastTime(a)), [threads])
  const active = threadId ? threads.find((t) => t.peer.id === threadId) : undefined

  useEffect(() => {
    if (!me) return
    void refreshThreads()
    const iv = setInterval(() => void refreshThreads(), 15_000)
    return () => clearInterval(iv)
  }, [me, refreshThreads])

  useEffect(() => {
    if (!me || !threadId || active || !loaded) return
    let alive = true
    api()
      .getUser(threadId)
      .then((u) => {
        if (!alive) return
        if (u) openThread(u)
        else nav('/messages', { replace: true })
      })
      .catch(() => alive && nav('/messages', { replace: true }))
    return () => {
      alive = false
    }
  }, [me, threadId, active, loaded, openThread, nav])

  if (!me) {
    return (
      <div>
        <MobileTopBar title={<span className="font-display font-extrabold">Messages</span>} />
        <div className="hidden md:block">
          <PageHeader title="Messages" />
        </div>
        <Empty title="Sign in to message traders" body="Direct messages are end-to-end encrypted — only you and the other person can read them." icon={<MessageIcon />} action={<button className="btn btn-primary" onClick={() => openSignIn('Sign in to send messages.')}>Sign in</button>} />
      </div>
    )
  }

  if (active) return <Chat thread={active} me={me} />
  if (threadId) {
    return (
      <div>
        <PageHeader title="Messages" back={<BackBtn />} />
        <div className="flex justify-center py-16">
          <Spinner size={22} />
        </div>
      </div>
    )
  }

  const local = api().mode === 'local'

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
        <ShieldIcon size={14} /> {local ? 'Offline mode: messages are stored in this browser only.' : 'End-to-end encrypted: messages are sealed on your device and Perpcast only stores ciphertext it cannot read. Keys stay on the device you send from.'}
      </div>
      {sorted.length === 0 && loading && !loaded && (
        <div className="flex justify-center py-16">
          <Spinner size={22} />
        </div>
      )}
      {sorted.length === 0 && (loaded || !loading) && (
        <Empty
          title="No conversations yet"
          body="Start a chat with any Perpcast user by username or wallet address."
          icon={<MessageIcon />}
          action={
            <button className="btn btn-primary" onClick={() => setPicker(true)}>
              New message
            </button>
          }
        />
      )}
      {sorted.map((t) => {
        const last = t.last
        const name = t.peer.displayName || t.peer.username
        return (
          <button key={t.peer.id} className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left transition-colors hover:bg-surface-hover/60" onClick={() => nav(`/messages/${t.peer.id}`)}>
            <Avatar src={t.peer.pfp} name={name} seed={t.peer.id} size={44} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate font-bold">{name}</span>
                <span className="truncate text-xs text-ink-3">@{t.peer.username}</span>
                {last && <span className="ml-auto shrink-0 text-xs text-ink-3">{timeAgo(lastTime(t))}</span>}
              </span>
              <span className={cx('block truncate text-sm', t.unread ? 'font-semibold text-ink' : 'text-ink-3')}>{last ? (last.locked ? '🔒 Encrypted message' : last.from === me.id ? `You: ${last.text}` : last.text) : 'Say hi 👋'}</span>
            </span>
            {t.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">{t.unread}</span>}
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
  const [debounced, setDebounced] = useState('')
  const me = useAuth((s) => s.user)
  const openThread = useDMs((s) => s.open)
  const nav = useNavigate()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim().replace(/^@/, '').toLowerCase()), 300)
    return () => clearTimeout(t)
  }, [q])

  const { data: hits, loading } = useAsync<User[]>(() => (debounced ? api().searchUsers(debounced, 8) : Promise.resolve([])), [debounced])
  const { data: suggested } = useAsync<User[]>(() => api().suggestedUsers(8), [open, me?.id])
  const results = (hits ?? []).filter((u) => u.id !== me?.id)
  const suggestions = (suggested ?? []).filter((u) => u.id !== me?.id)

  const start = (u: User) => {
    openThread(u)
    onClose()
    setQ('')
    nav(`/messages/${u.id}`)
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" label="New message">
      <ModalHeader title="New message" sub="Search by username or wallet address" onClose={onClose} />
      <div className="px-5 pb-5">
        <input className="input" placeholder="@username or 0x…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <div className="mt-3 flex flex-col gap-1">
          {debounced && loading && (
            <div className="flex items-center gap-2 px-2 py-2 text-sm text-ink-3">
              <Spinner /> Searching…
            </div>
          )}
          {debounced && !loading && results.length === 0 && <div className="px-2 py-2 text-sm text-ink-3">No user found for “{q}”.</div>}
          {debounced && results.map((u) => <UserPick key={u.id} u={u} onPick={start} />)}
          {!debounced && suggestions.length > 0 && (
            <>
              <div className="px-2 pt-1 text-xs font-semibold uppercase tracking-wider text-ink-3">Traders on Perpcast</div>
              {suggestions.map((u) => (
                <UserPick key={u.id} u={u} onPick={start} />
              ))}
            </>
          )}
          {!debounced && suggestions.length === 0 && (
            <div className="px-2 py-2 text-sm text-ink-3">
              Tip: find people on <Link to="/explore" className="text-accent" onClick={onClose}>Explore</Link> and message them from their profile.
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function UserPick({ u, onPick }: { u: User; onPick: (u: User) => void }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-hover" onClick={() => onPick(u)}>
      <Avatar src={u.pfp} name={u.displayName || u.username} seed={u.id} size={36} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{u.displayName || u.username}</span>
        <span className="block truncate text-xs text-ink-3">@{u.username}</span>
      </span>
      <MessageIcon size={16} className="text-ink-3" />
    </button>
  )
}

function Chat({ thread, me }: { thread: DMThread; me: User }) {
  const peer = thread.peer
  const messages = useDMs((s) => s.messages[peer.id]) ?? EMPTY
  const send = useDMs((s) => s.send)
  const markRead = useDMs((s) => s.markRead)
  const loadMessages = useDMs((s) => s.loadMessages)
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const bottom = useRef<HTMLDivElement>(null)
  const name = peer.displayName || peer.username

  useEffect(() => {
    void loadMessages(peer.id)
    const iv = setInterval(() => void loadMessages(peer.id), 5_000)
    return () => clearInterval(iv)
  }, [peer.id, loadMessages])

  useEffect(() => {
    if (thread.unread) void markRead(peer.id)
  }, [peer.id, thread.unread, messages.length, markRead])

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  const submit = async () => {
    const t = text.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await send(peer, t)
      setText('')
    } catch (e) {
      toast({ kind: 'error', title: 'Message not sent', body: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  let lastDay = ''
  return (
    <div className="flex h-[calc(100dvh-2rem)] flex-col md:h-[calc(100dvh-2rem)]">
      <PageHeader
        title={
          <Link to={userPath(peer)} className="flex items-center gap-2 hover:underline">
            <Avatar src={peer.pfp} name={name} seed={peer.id} size={28} />
            {name}
          </Link>
        }
        sub={`@${peer.username}`}
        back={<BackBtn />}
        right={
          <Menu trigger={() => <button className="icon-btn" aria-label="Options"><MoreIcon size={18} /></button>}>
            {(close) => (
              <MenuItem
                icon={<UserIcon />}
                onClick={() => {
                  nav(userPath(peer))
                  close()
                }}
              >
                View profile
              </MenuItem>
            )}
          </Menu>
        }
      />
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="mx-auto max-w-xs py-10 text-center">
            <Avatar src={peer.pfp} name={name} seed={peer.id} size={64} className="mx-auto" />
            <div className="mt-3 font-display font-extrabold">{name}</div>
            <div className="text-sm text-ink-3">@{peer.username}</div>
            {peer.bio && <p className="mt-2 text-sm text-ink-2">{peer.bio}</p>}
            <p className="mt-4 text-xs text-ink-3">This is the beginning of your conversation.</p>
          </div>
        )}
        {messages.map((m) => {
          const day = new Date(m.time).toDateString()
          const showDay = day !== lastDay
          lastDay = day
          const mine = m.from === me.id
          return (
            <div key={m.id}>
              {showDay && <div className="my-3 text-center text-[11px] font-semibold uppercase tracking-wider text-ink-3">{new Date(m.time).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
              <div className={cx('mb-1.5 flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug break-words', mine ? 'bg-accent text-white rounded-br-md' : 'bg-surface-2 rounded-bl-md')} title={fullDate(m.time)}>
                  {m.locked ? (
                    <span className={cx('inline-flex items-center gap-1 italic', mine ? 'text-white/80' : 'text-ink-3')}>
                      <ShieldIcon size={12} /> {m.locked === 'other-device' ? 'Encrypted for another device' : 'Unreadable message'}
                    </span>
                  ) : (
                    m.text
                  )}
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
          void submit()
        }}
      >
        <textarea
          className="input max-h-32 min-h-[42px] flex-1 resize-none !py-2.5"
          rows={1}
          placeholder={`Message @${peer.username}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void submit()
            }
          }}
        />
        <button type="submit" className="btn btn-primary !py-2.5" disabled={!text.trim() || busy}>
          {busy ? <Spinner /> : 'Send'}
        </button>
      </form>
    </div>
  )
}

const EMPTY: never[] = []
