import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Modal, ModalHeader, Spinner, Logo } from './ui'
import { ArrowLeftIcon, ExternalIcon, QrIcon, RefreshIcon, ShieldIcon, WalletIcon, ZapIcon, ArrowUpRightIcon } from './Icons'
import { useAuth } from '../store/auth'
import { toast } from '../store/notify'
import { api } from '../lib/api'
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
      <div className="px-5 pb-5 space-y-3">
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
