import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'
import { useNotify } from '../store/notify'

const KEY = 'perpcast:joined-since'
const POLL = 30_000

function since(): number {
  const v = Number(localStorage.getItem(KEY))
  return v > 0 ? v : Date.now()
}

/** Announces new Perpcast accounts (from any device) as in-app + system notifications. */
export function JoinWatcher() {
  const me = useAuth((s) => s.session?.user.id)
  const nav = useNavigate()

  useEffect(() => {
    if (!me) return
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission().catch(() => undefined)
  }, [me])

  useEffect(() => {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, String(Date.now()))
    let stop = false
    const tick = async () => {
      try {
        const users = (await api().recentUsers(since())).filter((u) => u.id !== me)
        if (stop || users.length === 0) return
        localStorage.setItem(KEY, String(Math.max(...users.map((u) => u.createdAt))))
        const push = useNotify.getState().push
        const toast = useNotify.getState().toast
        for (const u of users.slice(0, 5).reverse()) {
          const name = u.displayName || u.username
          push({ kind: 'joined', title: `${name} joined Perpcast`, body: `@${u.username} just created an account · say gm`, href: `/u/${u.username}` })
          if (!document.hidden) toast({ kind: 'info', title: `${name} joined Perpcast`, body: `@${u.username}`, ttl: 6000, action: { label: 'View', onClick: () => nav(`/u/${u.username}`) } })
          if ('Notification' in window && Notification.permission === 'granted' && (document.hidden || !document.hasFocus())) {
            const n = new Notification(`${name} joined Perpcast`, { body: `@${u.username} just created an account`, icon: u.pfp || '/logo.svg', tag: `joined-${u.id}` })
            n.onclick = () => {
              window.focus()
              nav(`/u/${u.username}`)
            }
          }
        }
        if (users.length > 5) push({ kind: 'joined', title: `${users.length - 5} more people joined Perpcast`, href: '/explore' })
      } catch {
        /* offline */
      }
    }
    void tick()
    const id = setInterval(() => void tick(), POLL)
    const onVis = () => void tick()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      stop = true
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [me, nav])
  return null
}
