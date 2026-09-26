import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal, Spinner, Logo } from './ui'
import { ArrowLeftIcon, ExternalIcon, QrIcon, RefreshIcon, ShieldIcon, WalletIcon, ZapIcon, ArrowUpRightIcon, MessageIcon, CheckIcon, XIcon } from './Icons'
import { useAuth } from '../store/auth'
import { toast } from '../store/notify'
import { api, googleClientId, xSignInEnabled } from '../lib/api'
import { mountGoogleButton } from '../lib/google'
import { Link } from 'react-router-dom'
import { brandWallet, chainName, currentChainId, discoverWallets, isMobile, onAccountsChanged, onChainChanged, requestAccounts, signMessage, unbrandedWallets, WALLET_BRANDS, WALLETCONNECT_ID, walletIcon, type WalletOption } from '../lib/wallet'
import { cx } from '../lib/format'

type Phase = 'idle' | 'connecting' | 'signing' | 'verifying' | 'done'

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  connecting: 'Waiting for your wallet to connect…',
  signing: 'Sign the message in your wallet to prove ownership…',
  verifying: 'Verifying signature…',
  done: 'Signed in!',
}

export function SignInModal() {
  const open = useAuth((s) => s.signInOpen)
  const reason = useAuth((s) => s.signInReason)
  const close = useAuth((s) => s.closeSignIn)
  const [step, setStep] = useState<'main' | 'wallet' | 'qr' | 'email'>('main')

  useEffect(() => {
    if (open) setStep('main')
  }, [open])

  return (
    <Modal open={open} onClose={close} size="sm" label="Get started with Perpcast">
      {step === 'qr' ? (
        <QrStep onBack={() => setStep('wallet')} />
      ) : step === 'email' ? (
        <EmailStep onBack={() => setStep('main')} />
      ) : step === 'wallet' ? (
        <WalletStep onBack={() => setStep('main')} onQr={() => setStep('qr')} />
      ) : (
        <StartStep reason={reason} onEmail={() => setStep('email')} onWallet={() => setStep('wallet')} />
      )}
    </Modal>
  )
}

function GoogleMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

/** Landing step: one "Get started" surface with every way in — Google, email code, or any EVM wallet. */
function StartStep({ reason, onEmail, onWallet }: { reason: string | null; onEmail: () => void; onWallet: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const setSession = useAuth((s) => s.setSession)
  const gHost = useRef<HTMLDivElement>(null)
  const [gBusy, setGBusy] = useState(false)
  const [gReady, setGReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const clientId = googleClientId()
  const xOn = xSignInEnabled()
  const [xBusy, setXBusy] = useState(false)

  const startX = () => {
    if (!xOn) {
      setError('X sign-in is being set up — use a wallet or email for now')
      return
    }
    setXBusy(true)
    location.assign('/api/auth/x/start')
  }

  useEffect(() => {
    if (!clientId || !gHost.current) return
    let cancel = () => {}
    let alive = true
    mountGoogleButton(
      gHost.current,
      clientId,
      (credential) => {
        setGBusy(true)
        setError(null)
        api()
          .googleVerify(credential)
          .then(({ user }) => {
            if (!alive) return
            setSession({ user, walletId: 'google', walletName: 'Google', chainId: 0, signedInAt: Date.now() })
            toast({ kind: 'success', title: `Welcome, ${user.displayName || user.username}`, body: 'Signed in with Google · connect a wallet any time in Settings' })
          })
          .catch((e: Error) => alive && setError(e.message))
          .finally(() => alive && setGBusy(false))
      },
      (msg) => alive && setError(msg),
    )
      .then((c) => {
        cancel = c
        if (alive) setGReady(true)
      })
      .catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
      cancel()
    }
  }, [clientId, setSession])

  return (
    <div>
      <div className="start-hero">
        <button className="icon-btn absolute right-3 top-3" onClick={close} aria-label="Close">
          ✕
        </button>
        <Logo size={56} />
        <h2 className="mt-3 font-display text-2xl font-extrabold tracking-tight">Get started</h2>
        <p className="mt-1 max-w-[280px] text-center text-sm text-ink-2">{reason ?? 'Cast, chat and trade perps in one feed. Pick any way in — no password, ever.'}</p>
      </div>
      <div className="px-5 pb-5 pt-4 space-y-2.5">
        <div className="relative">
          <button type="button" className="start-opt" disabled={gBusy || !clientId} onClick={() => !clientId && setError('Google sign-in is being set up — use email or a wallet for now')}>
            <span className="start-opt-ic bg-white">{gBusy ? <Spinner size={18} /> : <GoogleMark size={22} />}</span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block text-sm font-bold">Continue with Google</span>
              <span className="block text-xs text-ink-3">{clientId ? 'One tap with your Google account' : 'Coming soon'}</span>
            </span>
            <ArrowUpRightIcon size={16} className="text-ink-3" />
          </button>
          {clientId && <div ref={gHost} className={cx('absolute inset-0 overflow-hidden rounded-2xl opacity-0 [&>div]:h-full [&>div]:w-full [&_iframe]:!h-full', (!gReady || gBusy) && 'pointer-events-none')} aria-label="Continue with Google" />}
        </div>
        <button type="button" className="start-opt" disabled={xBusy} onClick={startX}>
          <span className="start-opt-ic bg-black text-white">{xBusy ? <Spinner size={18} /> : <XIcon size={20} />}</span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold">Continue with X</span>
            <span className="block text-xs text-ink-3">{xOn ? 'Your X handle shows on your profile' : 'Coming soon'}</span>
          </span>
          <ArrowUpRightIcon size={16} className="text-ink-3" />
        </button>
        <button type="button" className="start-opt" onClick={onWallet}>
          <span className="start-opt-ic bg-ink text-bg">
            <WalletIcon size={20} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-bold">Connect wallet</span>
            <span className="block text-xs text-ink-3">MetaMask, Rabby, Bitget, Phantom, OKX, 550+ via WalletConnect</span>
          </span>
          <span className="flex -space-x-1.5">
            {WALLET_BRANDS.slice(0, 4).map((b) => (
              <img key={b.id} src={b.icon} alt="" className="h-5 w-5 rounded-md ring-2 ring-surface" />
            ))}
          </span>
        </button>
        <button type="button" className="link mx-auto flex items-center gap-1.5 pt-1 text-xs text-ink-2" onClick={onEmail}>
          <MessageIcon size={13} /> Continue with email instead
        </button>
        {error && <div className="rounded-xl bg-short/10 px-3 py-2 text-sm text-short">{error}</div>}
        <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-3">
          <ShieldIcon size={12} className="inline -mt-0.5 mr-1" />
          Your email and wallet address are never shown publicly. DMs are end-to-end encrypted. By continuing you agree to the{' '}
          <Link to="/terms" className="link" onClick={close}>
            Terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy" className="link" onClick={close}>
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

function EmailStep({ onBack }: { onBack: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const setSession = useAuth((s) => s.setSession)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await api().emailStart(email.trim())
      setSent(true)
      setCooldown(30)
      setTimeout(() => codeRef.current?.focus(), 50)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const verify = async (c = code) => {
    if (c.length !== 6) return
    setBusy(true)
    setError(null)
    try {
      const { user } = await api().emailVerify(email.trim(), c)
      setSession({ user, walletId: 'email', walletName: 'Email', chainId: 0, signedInAt: Date.now() })
      toast({ kind: 'success', title: `Welcome, ${user.displayName || user.username}`, body: 'Signed in with email · connect a wallet any time in Settings' })
    } catch (e) {
      setError((e as Error).message)
      setCode('')
      codeRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <span className="font-display font-bold">Continue with email</span>
      </div>
      <form
        className="px-5 pb-5 pt-2 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          void (sent ? verify() : send())
        }}
      >
        {!sent ? (
          <>
            <p className="text-sm text-ink-2">We'll email you a 6-digit code. No password to remember.</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoFocus
              className="input w-full !h-12 text-base"
              placeholder="you@gmail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="btn btn-primary w-full !h-12 text-base" disabled={!valid || busy}>
              {busy ? <Spinner size={16} /> : <MessageIcon size={16} />} Send code
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
              <CheckIcon size={14} className="text-long" />
              <span>
                Code sent to <b className="text-ink">{email.trim()}</b>. Check Gmail (and spam).
              </span>
            </div>
            <input
              ref={codeRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              className="input w-full !h-14 text-center font-mono text-2xl tracking-[0.5em]"
              placeholder="••••••"
              value={code}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6)
                setCode(v)
                if (v.length === 6) void verify(v)
              }}
            />
            <button type="submit" className="btn btn-primary w-full !h-12 text-base" disabled={code.length !== 6 || busy}>
              {busy ? <Spinner size={16} /> : <ZapIcon size={16} />} Sign in
            </button>
            <div className="flex items-center justify-between text-xs text-ink-3">
              <button type="button" className="link" onClick={() => setSent(false)}>
                Use another email
              </button>
              <button type="button" className="link" disabled={cooldown > 0 || busy} onClick={() => void send()}>
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
        {error && <div className="rounded-xl bg-short/10 px-3 py-2 text-sm text-short">{error}</div>}
        <p className="pt-1 text-center text-[11px] leading-relaxed text-ink-3">
          <ShieldIcon size={12} className="inline -mt-0.5 mr-1" />
          Your email stays private and is never shown on your profile.
        </p>
        <button type="button" className="btn btn-ghost w-full text-sm" onClick={close}>
          Cancel
        </button>
      </form>
    </div>
  )
}

function WalletStep({ onBack, onQr }: { onBack: () => void; onQr: () => void }) {
  const setSession = useAuth((s) => s.setSession)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [scanned, setScanned] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)
  const lastWallet = useRef<WalletOption | null>(null)

  useEffect(() => {
    alive.current = true
    const off = discoverWallets(setWallets)
    const t = setTimeout(() => setScanned(true), 600)
    return () => {
      alive.current = false
      off()
      clearTimeout(t)
    }
  }, [])

  const connect = async (w: WalletOption) => {
    lastWallet.current = w
    setBusy(w.id)
    setError(null)
    try {
      setPhase('connecting')
      const [address] = await requestAccounts(w.provider)
      const chainId = await currentChainId(w.provider)
      const { message } = await api().nonce(address, chainId)
      setPhase('signing')
      const signature = await signMessage(w.provider, address, message)
      if (!signature || typeof signature !== 'string') throw new Error('Signature rejected')
      setPhase('verifying')
      const { user } = await api().verify(address, message, signature)
      if (!alive.current) return
      setPhase('done')
      setSession({ user, walletId: w.id, walletName: w.name, chainId, signedInAt: Date.now() })
      toast({ kind: 'success', title: `Welcome, ${user.displayName || user.username}`, body: `${w.name} · ${chainName(chainId)}` })
    } catch (e) {
      if (!alive.current) return
      setPhase('idle')
      setError((e as Error).message || 'Could not connect')
    } finally {
      if (alive.current) setBusy(null)
    }
  }

  const mobile = isMobile()
  const here = location.href

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <span className="font-display font-bold">Connect a wallet</span>
      </div>
      <div className="px-5 pb-5 pt-2 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
          <img src="/robinhood-chain.png" alt="" width={18} height={18} className="rounded-md" />
          <span>
            Built on <b className="text-ink">Robinhood Chain</b>. Any EVM wallet works — needed for trading & launching.
          </span>
        </div>
        {!scanned && wallets.length === 0 && (
          <div className="flex items-center justify-center gap-2 py-2 text-xs text-ink-3">
            <Spinner size={14} /> Looking for wallets…
          </div>
        )}

        <WalletGrid wallets={wallets} busy={busy} phase={phase} mobile={mobile} url={here} onConnect={(w) => void connect(w)} />

        {scanned && wallets.every((w) => w.id === WALLETCONNECT_ID) && (
          <p className="px-1 text-center text-xs text-ink-3">
            {mobile ? 'No wallet detected in this browser — use WalletConnect, or tap a wallet to open Perpcast inside its app.' : 'No browser wallet detected — use WalletConnect to scan with your phone, or install one above.'}
          </p>
        )}

        {!mobile && (
          <button className="btn btn-ghost w-full text-sm" onClick={onQr}>
            <QrIcon size={16} /> Use a mobile wallet instead
          </button>
        )}

        {error && (
          <div className="flex items-center justify-between gap-2 rounded-xl bg-short/10 px-3 py-2 text-sm text-short">
            <span>{error}</span>
            {lastWallet.current && (
              <button className="btn btn-outline !py-1 text-xs shrink-0" disabled={!!busy} onClick={() => lastWallet.current && void connect(lastWallet.current)}>
                <RefreshIcon size={12} /> Try again
              </button>
            )}
          </div>
        )}

        <p className="pt-1 text-center text-[11px] leading-relaxed text-ink-3">
          <ShieldIcon size={12} className="inline -mt-0.5 mr-1" />
          You only sign a plain-text message (SIWE). No transaction, no approvals, no gas.
        </p>
      </div>
    </div>
  )
}

function QrStep({ onBack }: { onBack: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const url = location.href
  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <span className="font-display font-bold">Open on your phone</span>
      </div>
      <div className="px-5 pb-5 pt-2 flex flex-col items-center text-center">
        <div className="rounded-2xl bg-white p-3 shadow-card">
          <QRCodeSVG value={url} size={200} level="M" bgColor="#ffffff" fgColor="#0f1014" imageSettings={{ src: '/logo.svg', height: 44, width: 44, excavate: true }} />
        </div>
        <p className="mt-4 text-sm text-ink-2">Scan with your phone, then open the link inside your wallet app's browser to sign in.</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          {WALLET_BRANDS.filter((b) => b.mobile).map((m) => (
            <img key={m.id} src={m.icon} alt={m.name} title={m.name} className="h-7 w-7 rounded-lg" />
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <button
            className="btn btn-outline"
            onClick={() => {
              void navigator.clipboard.writeText(url)
              toast({ kind: 'info', title: 'Link copied' })
            }}
          >
            <QrIcon size={16} /> Copy link
          </button>
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function WalletGrid({ wallets, busy, phase, mobile, url, onConnect }: { wallets: WalletOption[]; busy: string | null; phase: Phase; mobile: boolean; url: string; onConnect: (w: WalletOption) => void }) {
  const extra = unbrandedWallets(wallets)
  const cards = [
    ...WALLET_BRANDS.map((b) => ({ brand: b, wallet: brandWallet(b, wallets) })),
    ...extra.map((w) => ({ brand: null, wallet: w })),
  ].sort((a, b) => Number(!!b.wallet) - Number(!!a.wallet))
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {cards.map(({ brand, wallet }) => {
        const key = brand?.id ?? wallet!.id
        const name = brand?.name ?? wallet!.name
        const icon = brand?.icon ?? (wallet ? walletIcon(wallet) : '')
        const isBusy = !!wallet && busy === wallet.id
        const inner = (
          <>
            {icon ? <img src={icon} alt="" className="h-10 w-10 rounded-xl" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-bg"><WalletIcon size={18} /></span>}
            <span className="mt-2 block w-full truncate text-sm font-semibold">{name}</span>
            <span className="mt-0.5 flex items-center justify-center gap-1 text-[11px] text-ink-3">
              {isBusy ? (
                <Spinner size={11} />
              ) : wallet?.id === WALLETCONNECT_ID ? (
                <>
                  <QrIcon size={11} /> Scan QR
                </>
              ) : wallet ? (
                <>
                  <ZapIcon size={11} className="text-long" /> Detected
                </>
              ) : mobile && brand?.mobile ? (
                <>
                  Open app <ArrowUpRightIcon size={11} />
                </>
              ) : (
                <>
                  Install <ExternalIcon size={11} />
                </>
              )}
            </span>
          </>
        )
        const cls = cx('wallet-card', wallet && 'wallet-card-live', isBusy && 'ring-2 ring-accent/40')
        if (wallet) {
          return (
            <button key={key} disabled={!!busy} onClick={() => onConnect(wallet)} className={cls} title={isBusy ? PHASE_LABEL[phase] : `Connect ${name}`}>
              {inner}
            </button>
          )
        }
        const href = mobile && brand?.mobile ? brand.mobile(url) : brand?.install
        return (
          <a key={key} href={href} target={mobile && brand?.mobile ? undefined : '_blank'} rel="noreferrer" className={cls}>
            {inner}
          </a>
        )
      })}
    </div>
  )
}

/** Keeps the session in sync with the wallet: signs out when the account changes, tracks chain switches. */
export function WalletSessionWatcher() {
  const session = useAuth((s) => s.session)
  const setSession = useAuth((s) => s.setSession)
  const signOut = useAuth((s) => s.signOut)

  useEffect(() => {
    if (!session) return
    let offA = () => {}
    let offC = () => {}
    const stop = discoverWallets((ws) => {
      const w = ws.find((x) => x.id === session.walletId) ?? ws.find((x) => x.name === session.walletName)
      if (!w) return
      offA()
      offC()
      offA = onAccountsChanged(w.provider, (accounts) => {
        const cur = accounts[0]?.toLowerCase()
        if (!cur || cur !== session.user.id) {
          void signOut()
          toast({ kind: 'info', title: 'Wallet account changed', body: 'You were signed out. Sign in again with the new account.' })
        }
      })
      offC = onChainChanged(w.provider, (chainId) => {
        if (chainId !== session.chainId) setSession({ ...session, chainId })
      })
    })
    return () => {
      stop()
      offA()
      offC()
    }
  }, [session, setSession, signOut])
  return null
}
