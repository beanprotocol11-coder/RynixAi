import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { initBackend } from './lib/api'
import { useAuth } from './store/auth'

const root = createRoot(document.getElementById('root')!)

const SPLASH_MIN_MS = 1500

async function boot() {
  const started = Date.now()
  await initBackend()
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
