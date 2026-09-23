import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { primeUser, type FcUser } from '../lib/farcaster'

export type AuthMethod = 'farcaster' | 'wallet'

export interface SessionUser extends FcUser {
  method: AuthMethod
  address?: string
  signedInAt: number
  verifications?: string[]
}

interface AuthState {
  user: SessionUser | null
  signInOpen: boolean
  signInReason: string | null
  setUser: (u: SessionUser | null) => void
  openSignIn: (reason?: string) => void
  closeSignIn: () => void
  signOut: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      signInOpen: false,
      signInReason: null,
      setUser: (u) => {
        if (u) primeUser(u)
        set({ user: u, signInOpen: false, signInReason: null })
      },
      openSignIn: (reason) => set({ signInOpen: true, signInReason: reason ?? null }),
      closeSignIn: () => set({ signInOpen: false, signInReason: null }),
      signOut: () => set({ user: null }),
    }),
    {
      name: 'perpcast:auth',
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => {
        if (state?.user) primeUser(state.user)
      },
    },
  ),
)

/** Local pseudo-fid for wallet-only users (negative so it never collides with Farcaster fids). */
export function walletFid(address: string): number {
  let h = 0
  const a = address.toLowerCase()
  for (let i = 2; i < a.length; i++) h = (h * 33 + a.charCodeAt(i)) >>> 0
  return -(h % 2_000_000_000) - 1
}
