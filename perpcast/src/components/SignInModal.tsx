import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal, ModalHeader, Spinner, Logo } from './ui'
import { ArrowLeftIcon, ExternalIcon, QrIcon, RefreshIcon, ShieldIcon, WalletIcon, ZapIcon } from './Icons'
import { useAuth } from '../store/auth'
import { toast, notify } from '../store/notify'
import { api } from '../lib/api'
import { chainName, currentChainId, discoverWallets, isMobile, MOBILE_WALLETS, onAccountsChanged, onChainChanged, requestAccounts, signMessage, walletIcon, type WalletOption } from '../lib/wallet'
import { shortAddr, cx } from '../lib/format'

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
  const [showQr, setShowQr] = useState(false)

  useEffect(() => {
    if (open) setShowQr(false)
  }, [open])

  return (
    <Modal open={open} onClose={close} size="sm" label="Sign in to Perpcast">
      {showQr ? <QrStep onBack={() => setShowQr(false)} /> : <WalletStep reason={reason} onQr={() => setShowQr(true)} />}
    </Modal>
  )
}

function WalletStep({ reason, onQr }: { reason: string | null; onQr: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const setSession = useAuth((s) => s.setSession)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [scanned, setScanned] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    const off = discoverWallets(setWallets)
    const t = setTimeout(() => setScanned(true), 400)
    return () => {
      alive.current = false
      off()
      clearTimeout(t)
    }
  }, [])

  const connect = async (w: WalletOption) => {
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
      toast({ kind: 'success', title: `Welcome, ${user.displayName || user.username}`, body: `${w.name} · ${shortAddr(address)} · ${chainName(chainId)}` })
      notify({ kind: 'system', title: `Signed in with ${w.name}`, body: `${shortAddr(address)} on ${chainName(chainId)}` })
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
      <ModalHeader
        title={
          <span className="flex items-center gap-2.5">
            <Logo size={34} /> Sign in to Perpcast
          </span>
        }
        onClose={close}
        sub={reason ?? 'Connect a wallet and sign a message. Your address is your identity — no email, no password.'}
      />
      <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-ink-2">
        <img src="/robinhood-chain.png" alt="" width={18} height={18} className="rounded-md" />
        <span>
          Perpcast is built on <b className="text-ink">Robinhood Chain</b>. Any EVM wallet works — you can switch networks later in Settings.
        </span>
      </div>
      <div className="px-5 pb-5 space-y-2">
        {wallets.map((w) => {
          const icon = walletIcon(w)
          return (
            <button key={w.id} disabled={!!busy} onClick={() => void connect(w)} className={cx('flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-all hover:border-line-strong hover:bg-surface-hover disabled:opacity-60', busy === w.id && 'ring-2 ring-accent/40')}>
              {icon ? <img src={icon} alt="" className="h-10 w-10 rounded-xl" /> : <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-bg"><WalletIcon size={18} /></span>}
              <span className="flex-1 min-w-0">
                <span className="block font-semibold">{w.name}</span>
                <span className="block text-xs text-ink-3">{busy === w.id ? PHASE_LABEL[phase] : w.rdns ?? 'Injected wallet'}</span>
              </span>
              {busy === w.id ? <Spinner size={16} /> : <span className="text-xs text-ink-3 flex items-center gap-1"><ZapIcon size={12} /> Detected</span>}
            </button>
          )
        })}

        {wallets.length === 0 && !scanned && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-3">
            <Spinner size={16} /> Looking for wallets…
          </div>
        )}

        {wallets.length === 0 && scanned && mobile && (
          <div className="space-y-2">
            <p className="px-1 text-xs text-ink-3">No wallet detected in this browser. Open Perpcast inside your wallet app:</p>
            {MOBILE_WALLETS.map((m) => (
              <a key={m.id} href={m.link(here)} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-all hover:border-line-strong hover:bg-surface-hover">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-bg"><WalletIcon size={18} /></span>
                <span className="flex-1 font-semibold">{m.name}</span>
                <ExternalIcon size={16} className="text-ink-3" />
              </a>
            ))}
          </div>
        )}

        {wallets.length === 0 && scanned && !mobile && (
          <div className="rounded-2xl border border-dashed border-line-strong p-5 text-center">
            <WalletIcon size={26} className="mx-auto text-ink-3" />
            <p className="mt-2 text-sm font-semibold">No wallet detected</p>
            <p className="mt-1 text-xs text-ink-3">Install a browser wallet like MetaMask or Rabby, or open Perpcast on your phone in a wallet app.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <a className="btn btn-outline !py-1.5 text-xs" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Get MetaMask <ExternalIcon size={14} />
              </a>
              <a className="btn btn-outline !py-1.5 text-xs" href="https://rabby.io" target="_blank" rel="noreferrer">
                Get Rabby <ExternalIcon size={14} />
              </a>
              <button className="btn btn-outline !py-1.5 text-xs" onClick={onQr}>
                <QrIcon size={14} /> Open on phone
              </button>
            </div>
          </div>
        )}

        {wallets.length > 0 && !mobile && (
          <button className="btn btn-ghost w-full text-sm" onClick={onQr}>
            <QrIcon size={16} /> Use a mobile wallet instead
          </button>
        )}

        {error && (
          <p className="flex items-center justify-between gap-2 rounded-xl bg-short/10 px-3 py-2 text-sm text-short">
            <span>{error}</span>
            <button className="icon-btn !h-7 !w-7" onClick={() => setError(null)} aria-label="Dismiss">
              <RefreshIcon size={14} />
            </button>
          </p>
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
        <div className="rounded-2xl bg-[#fbf5ea] p-3 shadow-card">
          <QRCodeSVG value={url} size={200} level="M" bgColor="#fbf5ea" fgColor="#2b1d14" imageSettings={{ src: '/logo.svg', height: 44, width: 44, excavate: true }} />
        </div>
        <p className="mt-4 text-sm text-ink-2">Scan with your phone, then open the link inside MetaMask, Trust, Coinbase Wallet, Rainbow, Phantom or OKX to sign in.</p>
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
      const w = ws.find((x) => x.id === session.walletId)
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
