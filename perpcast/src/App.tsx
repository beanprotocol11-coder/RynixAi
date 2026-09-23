import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Toasts, Spinner, Empty } from './components/ui'
import { SignInModal, WalletSessionWatcher } from './components/SignInModal'
import { ComposerModal } from './components/Composer'
import { useUI } from './store/ui'
import { useAuth } from './store/auth'
import Home from './pages/Home'

const Trade = lazy(() => import('./pages/Trade'))
const Explore = lazy(() => import('./pages/Explore'))
const Channel = lazy(() => import('./pages/Channel'))
const CastDetail = lazy(() => import('./pages/CastDetail'))
const Profile = lazy(() => import('./pages/Profile'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Messages = lazy(() => import('./pages/Messages'))
const Bookmarks = lazy(() => import('./pages/Bookmarks'))
const Portfolio = lazy(() => import('./pages/Portfolio'))
const Settings = lazy(() => import('./pages/Settings'))

function PageFallback() {
  return (
    <div className="flex h-[50dvh] items-center justify-center">
      <Spinner size={22} />
    </div>
  )
}

function NotFound() {
  return <Empty title="Page not found" body="That link doesn’t go anywhere on Perpcast." action={<Link to="/" className="btn btn-primary">Back home</Link>} />
}

function Shortcuts() {
  const openComposer = useUI((s) => s.openComposer)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const { pathname } = useLocation()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'n' || e.key === 'c') {
        e.preventDefault()
        if (me) openComposer()
        else openSignIn('Sign in to cast.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [me, openComposer, openSignIn, pathname])
  return null
}

export default function App() {
  const theme = useUI((s) => s.theme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return (
    <BrowserRouter>
      <Shortcuts />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route
            path="*"
            element={
              <Suspense fallback={<PageFallback />}>
                <Routes>
                  <Route path="trade" element={<Trade />} />
                  <Route path="trade/:coin" element={<Trade />} />
                  <Route path="explore" element={<Explore />} />
                  <Route path="search" element={<Navigate to="/explore" replace />} />
                  <Route path="channel/:id" element={<Channel />} />
                  <Route path="cast/:id" element={<CastDetail />} />
                  <Route path="u/:handle" element={<Profile />} />
                  <Route path="profile" element={<Profile />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="messages" element={<Messages />} />
                  <Route path="messages/:threadId" element={<Messages />} />
                  <Route path="bookmarks" element={<Bookmarks />} />
                  <Route path="portfolio" element={<Portfolio />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            }
          />
        </Route>
      </Routes>
      <Toasts />
      <SignInModal />
      <WalletSessionWatcher />
      <ComposerModal />
    </BrowserRouter>
  )
}
