import { useCallback, useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useAuth } from '../store/auth'
import { toast } from '../store/notify'
import { Modal, ModalHeader } from './ui'
import { CoinLogo } from './CoinLogo'
import { USDG_LOGO } from '../lib/pons'
import { CopyIcon, ExternalIcon, RefreshIcon, WalletIcon } from './Icons'
import { ARBITRUM, depositToHyperliquid, fetchBalances, HL_APP, HL_BRIDGE, HL_MIN_DEPOSIT, type WalletBalances } from '../lib/balances'
import { findWallet, ROBINHOOD_CHAIN } from '../lib/wallet'
import { cx, usd, shortAddr } from '../lib/format'

const REFRESH_MS = 15_000

export function useWalletBalances() {
  const me = useAuth((s) => s.user)
  const [data, setData] = useState<WalletBalances | null>(null)
  const [loading, setLoading] = useState(false)
  const address = me?.address as Address | undefined

  const refresh = useCallback(async () => {
    if (!address) return
    setLoading(true)
    try {
      setData(await fetchBalances(address))
    } finally {
      setLoading(false)
    }
  }, [address])

  useEffect(() => {
    if (!address) {
      setData(null)
      return
    }
    void refresh()
    const t = setInterval(() => void refresh(), REFRESH_MS)
    const vis = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [address, refresh])

  return { data, loading, refresh }
}

/** Real wallet funds — read live from Robinhood Chain, Arbitrum and Hyperliquid. Non-custodial: Perpcast never holds keys or funds. */
export function WalletFunds({ className }: { className?: string }) {
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const openSignIn = useAuth((s) => s.openSignIn)
  const { data, loading, refresh } = useWalletBalances()
  const [depositOpen, setDepositOpen] = useState(false)

  if (!me) {
    return (
      <div className={cx('card flex items-center gap-3 p-4 text-sm', className)}>
        <WalletIcon className="shrink-0 text-accent" />
        <span className="flex-1">Sign in with your wallet to see your real balances on Robinhood Chain and Hyperliquid.</span>
        <button className="btn btn-primary !py-2" onClick={() => openSignIn()}>
          Sign in
        </button>
      </div>
    )
  }

  const hlTotal = (data?.hlAccountValue ?? 0) + (data?.hlSpotUsdc ?? 0)

  return (
    <div className={cx('card relative overflow-hidden p-5', className)}>
      <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-ink-3">
            <span className="inline-block h-2 w-2 rounded-full bg-long" /> Your wallet · live
          </div>
          <div className="mono mt-1 text-4xl font-bold tabular-nums">{data ? usd(hlTotal) : '—'}</div>
          <div className="mt-1 text-sm text-ink-3">
            Hyperliquid account · {shortAddr(me.address)} · {session?.walletName}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-ghost !py-2 gap-1.5" onClick={() => void refresh()} disabled={loading} aria-label="Refresh balances">
            <RefreshIcon size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button className="btn btn-primary !py-2" onClick={() => setDepositOpen(true)}>
            Deposit
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Row logo="USDC" label="Hyperliquid perps" value={data ? usd(data.hlAccountValue) : '—'} sub={data ? `${usd(data.hlWithdrawable)} withdrawable · ${data.hlPositions} open` : undefined} />
        <Row logo="USDC" label="Hyperliquid spot" value={data ? usd(data.hlSpotUsdc) : '—'} sub="USDC" />
        <Row logo="/robinhood-chain.png" label="Robinhood Chain ETH" value={data ? `${data.rhEth.toFixed(5)} ETH` : '—'} sub="gas + Pons launch fee" />
        <Row logo={USDG_LOGO} label="Robinhood Chain USDG" value={data ? usd(data.rhUsdg) : '—'} sub={data ? `${usd(data.arbUsdc)} USDC on Arbitrum` : undefined} />
      </div>
      {data?.errors.length ? <div className="mt-3 text-xs text-ink-3">Could not load: {data.errors.join(', ')}. Retrying…</div> : null}

      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} balances={data} onDone={refresh} />
    </div>
  )
}

function Row({ logo, label, value, sub }: { logo: string; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2">
      {logo.includes('/') ? <img src={logo} alt="" width={22} height={22} className="shrink-0 rounded-full object-cover" style={{ width: 22, height: 22 }} /> : <CoinLogo coin={logo} size={22} />}
      <div className="min-w-0">
        <div className="text-[11px] text-ink-3">{label}</div>
        <div className="mono truncate font-semibold tabular-nums">{value}</div>
        {sub && <div className="text-[11px] text-ink-3">{sub}</div>}
      </div>
    </div>
  )
}

function DepositModal({ open, onClose, balances, onDone }: { open: boolean; onClose: () => void; balances: WalletBalances | null; onDone: () => Promise<void> }) {
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const [tab, setTab] = useState<'hl' | 'rh'>('hl')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [tx, setTx] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const wallet = session ? findWallet(session.walletId) : undefined
  const amt = Number(amount)
  const max = balances?.arbUsdc ?? 0

  const send = async () => {
    if (!me || !wallet) {
      setErr(`Open ${session?.walletName ?? 'your wallet'} in this browser so it can sign the transfer.`)
      return
    }
    setErr(null)
    setBusy(true)
    try {
      const hash = await depositToHyperliquid(wallet.provider, me.address as Address, amt)
      setTx(hash)
      toast({ kind: 'success', title: 'Deposit sent', body: 'USDC is on its way to Hyperliquid — usually credited within a minute.' })
      setTimeout(() => void onDone(), 20_000)
    } catch (e) {
      const m = (e as Error).message ?? String(e)
      setErr(/reject|denied/i.test(m) ? 'Transaction rejected in wallet.' : m)
    } finally {
      setBusy(false)
    }
  }

  const copy = (s: string) => void navigator.clipboard?.writeText(s).then(() => toast({ kind: 'success', title: 'Copied' }))

  return (
    <Modal open={open} onClose={onClose} size="sm" label="Deposit">
      <ModalHeader title="Deposit" sub="Non-custodial — funds move from your wallet to your own account. Perpcast never holds them." onClose={onClose} />
      <div className="px-5 pb-5">
        <div className="mb-4 flex gap-1 rounded-xl bg-surface-2 p-1 text-sm">
          <button className={cx('flex-1 rounded-lg py-1.5 font-semibold', tab === 'hl' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3')} onClick={() => setTab('hl')}>
            Hyperliquid (perps)
          </button>
          <button className={cx('flex-1 rounded-lg py-1.5 font-semibold', tab === 'rh' ? 'bg-surface text-ink shadow-sm' : 'text-ink-3')} onClick={() => setTab('rh')}>
            Robinhood Chain (launch)
          </button>
        </div>

        {tab === 'hl' ? (
          tx ? (
            <div className="text-sm">
              <div className="font-semibold">Transaction submitted</div>
              <a className="mt-1 flex items-center gap-1 text-accent" href={`${ARBITRUM.explorer}/tx/${tx}`} target="_blank" rel="noreferrer">
                View on Arbiscan <ExternalIcon size={14} />
              </a>
              <p className="mt-2 text-ink-3">Your Hyperliquid balance updates automatically once the bridge credits it.</p>
              <button className="btn btn-ghost mt-4 w-full" onClick={() => { setTx(null); setAmount(''); onClose() }}>
                Done
              </button>
            </div>
          ) : (
            <div className="text-sm">
              <p className="text-ink-3">Sends USDC from your wallet on {ARBITRUM.name} to the Hyperliquid bridge; it lands in your Hyperliquid account (same address). Minimum {HL_MIN_DEPOSIT} USDC.</p>
              <div className="mt-3 flex items-center gap-2">
                <input className="input mono flex-1" inputMode="decimal" placeholder="Amount (USDC)" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, '')); setErr(null) }} />
                <button className="chip" onClick={() => setAmount(max > 0 ? String(Math.floor(max * 100) / 100) : '')} disabled={!max}>
                  Max
                </button>
              </div>
              <div className="mt-1 text-xs text-ink-3">Available: {usd(max)} USDC on Arbitrum</div>
              {err && <p className="mt-2 text-xs text-short" role="alert">{err}</p>}
              <button className="btn btn-primary mt-4 w-full" disabled={busy || !(amt >= HL_MIN_DEPOSIT) || (max > 0 && amt > max)} onClick={() => void send()}>
                {busy ? 'Confirm in wallet…' : `Deposit ${amt ? usd(amt) : ''} to Hyperliquid`}
              </button>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-3">
                <span>Bridge: <button className="mono underline decoration-dotted" onClick={() => copy(HL_BRIDGE)}>{shortAddr(HL_BRIDGE)}</button></span>
                <a className="flex items-center gap-1 text-accent" href={HL_APP} target="_blank" rel="noreferrer">
                  Other routes on Hyperliquid <ExternalIcon size={12} />
                </a>
              </div>
            </div>
          )
        ) : (
          <div className="text-sm">
            <p className="text-ink-3">Launching a token on Pons costs a small ETH fee plus gas on {ROBINHOOD_CHAIN.name}. Send ETH to your own address on Robinhood Chain, or bridge in.</p>
            <div className="mt-3 rounded-xl border border-line bg-surface-2/60 p-3">
              <div className="text-[11px] text-ink-3">Your address (chain ID {ROBINHOOD_CHAIN.id})</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="mono flex-1 truncate text-xs">{me?.address}</span>
                <button className="icon-btn !h-8 !w-8" onClick={() => me && copy(me.address)} aria-label="Copy address">
                  <CopyIcon size={14} />
                </button>
              </div>
            </div>
            <div className="mt-2 text-xs text-ink-3">Balance: {balances ? `${balances.rhEth.toFixed(5)} ETH · ${usd(balances.rhUsdg)} USDG` : '—'}</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <a className="btn btn-primary flex items-center justify-center gap-1.5" href="https://relay.link/bridge/robinhood" target="_blank" rel="noreferrer">
                Bridge via Relay <ExternalIcon size={14} />
              </a>
              <a className="btn btn-ghost flex items-center justify-center gap-1.5" href="https://bridge.arbitrum.io" target="_blank" rel="noreferrer">
                Canonical bridge <ExternalIcon size={14} />
              </a>
            </div>
            <p className="mt-2 text-[11px] text-ink-3">Routes listed in the official Robinhood Chain docs (docs.robinhood.com/chain/bridging).</p>
          </div>
        )}
      </div>
    </Modal>
  )
}
