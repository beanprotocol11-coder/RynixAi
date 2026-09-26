import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, getToken } from '../lib/api'
import { deviceKey } from '../lib/e2e'
import type { User } from '../lib/social'
import { disconnectWalletConnect, WALLETCONNECT_ID } from '../lib/wallet'

export interface Session {
  user: User
  walletId: string // discovered wallet id (EIP-6963 rdns or injected:*)
  walletName: string
  chainId: number
  signedInAt: number
}

interface AuthState {
  session: Session | null
  user: User | null
  signInOpen: boolean
  signInReason: string | null
  hydrated: boolean
  setSession: (s: Session | null) => void
  setUser: (u: User) => void
  openSignIn: (reason?: string) => void
  closeSignIn: () => void
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

/** Publishes this device's DM public key once per account so peers can encrypt to it. */
const published = new Set<string>()
async function ensureDmKey(u: User) {
  const key = deviceKey(u.id)
  if (published.has(u.id) || u.dmKey === key.pub) return
  published.add(u.id)
  try {
    await api().publishDmKey(key.pub)
    const cur = useAuth.getState()
    if (cur.user?.id === u.id) cur.setUser({ ...cur.user, dmKey: key.pub })
  } catch {
    published.delete(u.id)
  }
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      session: null,
      user: null,
      signInOpen: false,
      signInReason: null,
      hydrated: false,
      setSession: (s) => set({ session: s, user: s?.user ?? null, signInOpen: false, signInReason: null }),
      setUser: (u) => {
        const s = get().session
        set({ user: u, session: s ? { ...s, user: u } : s })
      },
      openSignIn: (reason) => set({ signInOpen: true, signInReason: reason ?? null }),
      closeSignIn: () => set({ signInOpen: false, signInReason: null }),
      signOut: async () => {
        const wasWc = get().session?.walletId === WALLETCONNECT_ID
        set({ session: null, user: null })
        await api().signOut()
        if (wasWc) await disconnectWalletConnect()
      },
      /** Re-validate the stored token against the backend; drops the session if it expired. */
      refresh: async () => {
        const s = get().session
        if (!s || !getToken()) {
          set({ session: null, user: null, hydrated: true })
          return
        }
        try {
          const u = await api().me()
          if (!u) set({ session: null, user: null, hydrated: true })
          else set({ user: u, session: { ...s, user: u }, hydrated: true })
        } catch {
          set({ hydrated: true })
        }
      },
    }),
    {
      name: 'perpcast:auth',
      version: 2,
      partialize: (s) => ({ session: s.session, user: s.user }),
      migrate: () => ({ session: null, user: null }),
    },
  ),
)

useAuth.subscribe((s, prev) => {
  if (s.hydrated && s.user && getToken() && (s.user.id !== prev.user?.id || !prev.hydrated)) void ensureDmKey(s.user)
})
