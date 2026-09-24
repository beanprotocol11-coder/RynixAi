import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, getToken } from '../lib/api'
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
