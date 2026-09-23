import { useCallback, useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { createAppClient, viemConnector, type AppClient } from '@farcaster/auth-client'
import { Modal, ModalHeader, Spinner, Logo, Avatar } from './ui'
import { ArrowLeftIcon, ExternalIcon, QrIcon, RefreshIcon, ShieldIcon, WalletIcon, ZapIcon } from './Icons'
import { useAuth, walletFid, type SessionUser } from '../store/auth'
import { toast, notify } from '../store/notify'
import { buildSignInMessage, discoverWallets, randomNonce, toHex, type WalletOption } from '../lib/wallet'
import { fetchUser } from '../lib/farcaster'
import { shortAddr, cx } from '../lib/format'

type Step = 'choose' | 'farcaster' | 'wallet'

let appClient: AppClient | null = null
function getAppClient(): AppClient {
  if (!appClient) appClient = createAppClient({ relay: 'https://relay.farcaster.xyz', ethereum: viemConnector() })
  return appClient
}

const isMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

export function SignInModal() {
  const open = useAuth((s) => s.signInOpen)
  const reason = useAuth((s) => s.signInReason)
  const close = useAuth((s) => s.closeSignIn)
  const [step, setStep] = useState<Step>('choose')

  useEffect(() => {
    if (open) setStep('choose')
  }, [open])

  return (
    <Modal open={open} onClose={close} size="sm" label="Sign in to Perpcast">
      {step === 'choose' && <Choose reason={reason} onPick={setStep} />}
      {step === 'farcaster' && <FarcasterStep onBack={() => setStep('choose')} />}
      {step === 'wallet' && <WalletStep onBack={() => setStep('choose')} />}
    </Modal>
  )
}

function Choose({ reason, onPick }: { reason: string | null; onPick: (s: Step) => void }) {
  const close = useAuth((s) => s.closeSignIn)
  return (
    <div>
      <ModalHeader title={<span className="flex items-center gap-2"><Logo size={26} /> Sign in to Perpcast</span>} onClose={close} sub={reason ?? 'Cast, chat and trade perps with one identity.'} />
      <div className="px-5 pb-5 space-y-2.5">
        <button onClick={() => onPick('farcaster')} className="group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface-2 p-3.5 text-left transition-all hover:border-line-strong hover:bg-surface-hover">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8a63d2] text-white shadow-md">
            <FarcasterGlyph />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">Sign in with Farcaster</span>
            <span className="block text-xs text-ink-3">Scan a QR with Warpcast. Brings your fid, name and avatar.</span>
          </span>
          <span className="chip !bg-accent-soft !text-accent">Recommended</span>
        </button>
        <button onClick={() => onPick('wallet')} className="group flex w-full items-center gap-3.5 rounded-2xl border border-line bg-surface-2 p-3.5 text-left transition-all hover:border-line-strong hover:bg-surface-hover">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-bg">
            <WalletIcon size={22} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">Connect a wallet</span>
            <span className="block text-xs text-ink-3">MetaMask, Rabby, Coinbase Wallet or any injected wallet.</span>
          </span>
        </button>
        <p className="pt-2 text-center text-[11px] leading-relaxed text-ink-3">
          <ShieldIcon size={12} className="inline -mt-0.5 mr-1" />
          Signing in only proves ownership. Perpcast never asks for transactions or spending approvals.
        </p>
      </div>
    </div>
  )
}

function FarcasterGlyph() {
  return (
    <svg width="22" height="22" viewBox="0 0 1000 1000" fill="currentColor" aria-hidden>
      <path d="M257.778 155.556h484.444v688.889h-71.111V528.889h-.697c-7.86-87.212-81.156-155.556-170.414-155.556s-162.554 68.344-170.414 155.556h-.697v315.556h-71.111V155.556z" />
      <path d="M128.889 253.333l28.889 97.778h24.444v395.556c-12.273 0-22.222 9.949-22.222 22.222v26.667h-4.444c-12.273 0-22.222 9.949-22.222 22.222v26.667h248.889v-26.667c0-12.273-9.949-22.222-22.222-22.222h-4.444v-26.667c0-12.273-9.949-22.222-22.222-22.222h-26.667V253.333H128.889z" />
      <path d="M675.556 746.667c-12.273 0-22.222 9.949-22.222 22.222v26.667h-4.444c-12.273 0-22.222 9.949-22.222 22.222v26.667h248.889v-26.667c0-12.273-9.949-22.222-22.222-22.222h-4.444v-26.667c0-12.273-9.949-22.222-22.222-22.222V351.111h24.444l28.889-97.778H702.222v493.333h-26.667z" />
    </svg>
  )
}

function FarcasterStep({ onBack }: { onBack: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const setUser = useAuth((s) => s.setUser)
  const [url, setUrl] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'pending' | 'completed' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ name: string; pfp?: string } | null>(null)
  const cancelled = useRef(false)

  const start = useCallback(async () => {
    cancelled.current = false
    setState('loading')
    setError(null)
    setPreview(null)
    try {
      const client = getAppClient()
      const created = await client.createChannel({ siweUri: location.origin, domain: location.host, acceptAuthAddress: true })
      if (created.isError || !created.data) throw created.error ?? new Error('Could not create channel')
      const { channelToken, url: connectUrl } = created.data
      setUrl(connectUrl)
      setState('pending')
      if (isMobile()) window.location.href = connectUrl
      const status = await client.watchStatus({ channelToken, timeout: 300_000, interval: 1500 })
      if (cancelled.current) return
      if (status.isError || !status.data) throw status.error ?? new Error('Sign in failed')
      const d = status.data
      if (d.state !== 'completed' || !d.fid) throw new Error('Sign in timed out. Try again.')
      setPreview({ name: d.displayName ?? d.username ?? `fid ${d.fid}`, pfp: d.pfpUrl })
      setState('completed')
      const hub = await fetchUser(d.fid).catch(() => null)
      const user: SessionUser = {
        method: 'farcaster',
        fid: d.fid,
        username: d.username ?? hub?.username ?? `fid:${d.fid}`,
        displayName: d.displayName ?? hub?.displayName ?? d.username ?? `fid ${d.fid}`,
        pfp: d.pfpUrl ?? hub?.pfp ?? '',
        bio: d.bio ?? hub?.bio ?? '',
        address: d.custody,
        verifications: d.verifications,
        signedInAt: Date.now(),
      }
      setTimeout(() => {
        setUser(user)
        toast({ kind: 'success', title: `Welcome, ${user.displayName}`, body: 'Signed in with Farcaster.' })
        notify({ kind: 'system', title: `Signed in as @${user.username}`, body: 'Your Farcaster identity is linked to this device.' })
      }, 600)
    } catch (e) {
      if (cancelled.current) return
      setState('error')
      setError((e as Error).message || 'Something went wrong')
    }
  }, [setUser])

  useEffect(() => {
    void start()
    return () => {
      cancelled.current = true
    }
  }, [start])

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <span className="font-display font-bold">Sign in with Farcaster</span>
      </div>
      <div className="px-5 pb-5 pt-2 flex flex-col items-center text-center">
        <div className="relative rounded-2xl bg-white p-3 shadow-card">
          {state === 'pending' && url ? (
            <QRCodeSVG value={url} size={220} level="M" bgColor="#ffffff" fgColor="#0b0c10" imageSettings={{ src: '/logo.svg', height: 44, width: 44, excavate: true }} />
          ) : (
            <div className="flex h-[220px] w-[220px] items-center justify-center">
              {state === 'completed' && preview ? (
                <div className="flex flex-col items-center gap-2 anim-pop">
                  <Avatar src={preview.pfp} name={preview.name} size={72} />
                  <span className="font-semibold text-[#0b0c10]">{preview.name}</span>
                </div>
              ) : state === 'error' ? (
                <span className="text-sm text-[#0b0c10] px-4">{error}</span>
              ) : (
                <Spinner size={28} />
              )}
            </div>
          )}
        </div>
        <p className="mt-4 text-sm text-ink-2">
          {state === 'pending' && 'Scan with your phone camera or the Warpcast app, then approve the sign-in request.'}
          {state === 'loading' && 'Creating a secure sign-in channel…'}
          {state === 'completed' && 'Signed in! Finishing up…'}
          {state === 'error' && 'The sign-in request could not be completed.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {state === 'pending' && url && (
            <a className="btn btn-outline" href={url} target="_blank" rel="noreferrer">
              <ExternalIcon size={16} /> Open in Warpcast
            </a>
          )}
          {state === 'pending' && url && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                void navigator.clipboard.writeText(url)
                toast({ kind: 'info', title: 'Sign-in link copied' })
              }}
            >
              <QrIcon size={16} /> Copy link
            </button>
          )}
          {state === 'error' && (
            <button className="btn btn-primary" onClick={() => void start()}>
              <RefreshIcon size={16} /> Try again
            </button>
          )}
          <button className="btn btn-ghost" onClick={close}>
            Cancel
          </button>
        </div>
        <p className="mt-3 text-[11px] text-ink-3">Powered by the Farcaster Connect relay. Waiting up to 5 minutes for approval.</p>
      </div>
    </div>
  )
}

function WalletStep({ onBack }: { onBack: () => void }) {
  const close = useAuth((s) => s.closeSignIn)
  const setUser = useAuth((s) => s.setUser)
  const [wallets, setWallets] = useState<WalletOption[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => discoverWallets(setWallets), [])

  const connect = async (w: WalletOption) => {
    setBusy(w.id)
    setError(null)
    try {
      const accounts = (await w.provider.request({ method: 'eth_requestAccounts' })) as string[]
      const address = accounts?.[0]
      if (!address) throw new Error('No account returned by wallet')
      const nonce = randomNonce()
      const message = buildSignInMessage(address, nonce)
      const signature = (await w.provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string
      if (!signature || typeof signature !== 'string') throw new Error('Signature rejected')
      const fid = walletFid(address)
      const user: SessionUser = {
        method: 'wallet',
        fid,
        username: shortAddr(address).toLowerCase(),
        displayName: `${w.name} ${shortAddr(address)}`,
        pfp: '',
        bio: `Trading on Perpcast with ${w.name}`,
        address,
        signedInAt: Date.now(),
      }
      setUser(user)
      toast({ kind: 'success', title: 'Wallet connected', body: `${w.name} · ${shortAddr(address)}` })
      notify({ kind: 'system', title: `Signed in with ${w.name}`, body: shortAddr(address) })
    } catch (e) {
      const err = e as { code?: number; message?: string }
      setError(err.code === 4001 ? 'Request rejected in wallet.' : err.message || 'Could not connect')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pt-3">
        <button className="icon-btn" onClick={onBack} aria-label="Back">
          <ArrowLeftIcon size={18} />
        </button>
        <span className="font-display font-bold">Connect a wallet</span>
      </div>
      <div className="px-5 pb-5 pt-2 space-y-2">
        {wallets.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line-strong p-5 text-center">
            <WalletIcon size={26} className="mx-auto text-ink-3" />
            <p className="mt-2 text-sm font-semibold">No wallet detected</p>
            <p className="mt-1 text-xs text-ink-3">Install a browser wallet like MetaMask or Rabby, or use Sign in with Farcaster instead.</p>
            <div className="mt-3 flex justify-center gap-2">
              <a className="btn btn-outline !py-1.5 text-xs" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                Get MetaMask <ExternalIcon size={14} />
              </a>
              <a className="btn btn-outline !py-1.5 text-xs" href="https://rabby.io" target="_blank" rel="noreferrer">
                Get Rabby <ExternalIcon size={14} />
              </a>
            </div>
          </div>
        )}
        {wallets.map((w) => (
          <button key={w.id} disabled={!!busy} onClick={() => void connect(w)} className={cx('flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3 text-left transition-all hover:border-line-strong hover:bg-surface-hover disabled:opacity-60', busy === w.id && 'ring-2 ring-accent/40')}>
            {w.icon ? <img src={w.icon} alt="" className="h-9 w-9 rounded-lg" /> : <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-bg"><WalletIcon size={18} /></span>}
            <span className="flex-1 font-semibold">{w.name}</span>
            {busy === w.id ? <Spinner size={16} /> : <span className="text-xs text-ink-3 flex items-center gap-1"><ZapIcon size={12} /> Detected</span>}
          </button>
        ))}
        {error && <p className="text-sm text-short">{error}</p>}
        <p className="pt-1 text-[11px] text-ink-3 text-center">You will be asked to sign a plain-text message (SIWE). No gas, no approvals.</p>
        <button className="btn btn-ghost w-full" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  )
}
