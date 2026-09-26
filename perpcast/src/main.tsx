import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { api, initBackend, setToken } from './lib/api'
import { useAuth } from './store/auth'
import { toast } from './store/notify'

/** Completes "Continue with X": the OAuth callback lands on /#x=<session> (or /#xerr=<msg>). */
async function consumeXRedirect() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''))
  const token = h.get('x')
  const err = h.get('xerr')
  if (!token && !err) return
  history.replaceState(null, '', location.pathname + location.search)
  if (err) {
    toast({ kind: 'error', title: 'X sign-in failed', body: err })
    return
  }
  setToken(token)
  try {
    const user = await api().me()
    if (!user) throw new Error('Session not found')
    useAuth.getState().setSession({ user, walletId: 'x', walletName: 'X', chainId: 0, signedInAt: Date.now() })
    toast({ kind: 'success', title: `Welcome, ${user.displayName || user.username}`, body: 'Signed in with X · connect a wallet any time in Settings' })
  } catch (e) {
    setToken(null)
    toast({ kind: 'error', title: 'X sign-in failed', body: (e as Error).message })
  }
}

const root = createRoot(document.getElementById('root')!)

const SPLASH_MIN_MS = 1500

async function boot() {
  const started = Date.now()
  await initBackend()
  await consumeXRedirect()
  await useAuth.getState().refresh()
  await new Promise((r) => setTimeout(r, Math.max(0, SPLASH_MIN_MS - (Date.now() - started))))
  const splash = document.getElementById('splash')
  if (splash) {
    splash.classList.add('out')
    await new Promise((r) => setTimeout(r, 350))
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
