import { create } from 'zustand'
import type { Cast, PositionEmbed } from '../lib/social'

export type Theme = 'dark' | 'light'

export interface ComposerOptions {
  channel?: string | null
  parent?: Cast | null
  quote?: Cast | null
  position?: PositionEmbed
  text?: string
}

interface UIState {
  theme: Theme
  composer: ComposerOptions | null
  mobileNav: boolean
  setTheme: (t: Theme) => void
  toggleTheme: () => void
  openComposer: (o?: ComposerOptions) => void
  closeComposer: () => void
  setMobileNav: (v: boolean) => void
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('perpcast:theme')
    if (t === 'light' || t === 'dark') return t
  } catch {
    /* ignore */
  }
  return 'dark'
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t
  try {
    localStorage.setItem('perpcast:theme', t)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', t === 'dark' ? '#08060f' : '#fafafb')
}

export const useUI = create<UIState>()((set, get) => ({
  theme: readTheme(),
  composer: null,
  mobileNav: false,
  setTheme: (t) => {
    applyTheme(t)
    set({ theme: t })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  openComposer: (o) => set({ composer: o ?? {} }),
  closeComposer: () => set({ composer: null }),
  setMobileNav: (v) => set({ mobileNav: v }),
}))
