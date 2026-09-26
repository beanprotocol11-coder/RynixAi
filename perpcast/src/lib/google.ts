/** Google Identity Services (One Tap / button) loader. Returns an ID token (JWT) that the server verifies. */

interface GsiCredentialResponse {
  credential?: string
}

interface GsiPromptNotification {
  isNotDisplayed(): boolean
  isSkippedMoment(): boolean
  isDismissedMoment(): boolean
  getNotDisplayedReason(): string
  getSkippedReason(): string
  getDismissedReason(): string
}

interface GsiId {
  initialize(cfg: { client_id: string; callback: (r: GsiCredentialResponse) => void; ux_mode?: 'popup' | 'redirect'; auto_select?: boolean; cancel_on_tap_outside?: boolean; itp_support?: boolean; use_fedcm_for_prompt?: boolean }): void
  prompt(cb?: (n: GsiPromptNotification) => void): void
  renderButton(el: HTMLElement, opts: { type?: 'standard' | 'icon'; theme?: 'outline' | 'filled_blue' | 'filled_black'; size?: 'large' | 'medium' | 'small'; text?: 'signin_with' | 'continue_with'; shape?: 'rectangular' | 'pill'; width?: number; logo_alignment?: 'left' | 'center' }): void
  cancel(): void
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GsiId } }
  }
}

let loading: Promise<GsiId> | null = null

export function loadGoogle(): Promise<GsiId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (loading) return loading
  loading = new Promise<GsiId>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.onload = () => {
      const id = window.google?.accounts?.id
      if (id) resolve(id)
      else reject(new Error('Google sign-in failed to load'))
    }
    s.onerror = () => {
      loading = null
      reject(new Error('Could not load Google sign-in — check your connection or ad blocker'))
    }
    document.head.appendChild(s)
  })
  return loading
}

/**
 * Renders the official Google button into `host` and resolves with the ID token when the user finishes.
 * Rejects if Google reports it cannot show the flow.
 */
export async function mountGoogleButton(host: HTMLElement, clientId: string, onCredential: (credential: string) => void, onError: (msg: string) => void): Promise<() => void> {
  const id = await loadGoogle()
  id.initialize({
    client_id: clientId,
    callback: (r) => {
      if (r.credential) onCredential(r.credential)
      else onError('Google did not return a credential')
    },
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
    itp_support: true,
    use_fedcm_for_prompt: true,
  })
  host.innerHTML = ''
  const width = Math.max(200, Math.min(400, Math.floor(host.getBoundingClientRect().width) || 320))
  id.renderButton(host, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'pill', width, logo_alignment: 'left' })
  return () => {
    try {
      id.cancel()
    } catch {
      /* ignore */
    }
  }
}
