import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Address } from 'viem'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { toast } from '../store/notify'
import { PageHeader, Spinner, Empty } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { CategoryBar } from '../components/CategoryBar'
import { CheckIcon, ExternalIcon, RefreshIcon, RocketIcon, ShieldIcon, WalletIcon, ZapIcon, MessageIcon } from '../components/Icons'
import { CoinLogo } from '../components/CoinLogo'
import { canLaunch, explorerAddress, explorerTx, fmtEth, fmtPair, launchToken, PAIR_KIND_LABEL, PONS_APP, PONS_DOCS, PONS_V2_FACTORY, readFactoryState, readPairEconomics, validAddress, validSymbol, type FactoryState, type LaunchProgress, type LaunchResult, type PairAsset, type PairEconomics, type PairKind } from '../lib/pons'
import { currentChainId, findWallet, ROBINHOOD_CHAIN, switchToRobinhoodChain } from '../lib/wallet'
import { cx, shortAddr } from '../lib/format'
import { useWalletBalances } from '../components/WalletFunds'

const KIND_ORDER: PairKind[] = ['native', 'stable', 'stock', 'etf', 'rwa']

interface Form {
  name: string
  symbol: string
  description: string
  logo: string
  website: string
  twitter: string
  telegram: string
  discord: string
  creatorTaxBps: number
  buybackEnabled: boolean
  feeRecipient: string
}

const EMPTY: Form = { name: '', symbol: '', description: '', logo: '', website: '', twitter: '', telegram: '', discord: '', creatorTaxBps: 0, buybackEnabled: false, feeRecipient: '' }

function useFactory() {
  const [state, setState] = useState<FactoryState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    readFactoryState()
      .then((s) => {
        setState(s)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])
  return { state, error, loading, reload: load }
}

export default function Launch() {
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const openSignIn = useAuth((s) => s.openSignIn)
  const openComposer = useUI((s) => s.openComposer)
  const factory = useFactory()

  const [form, setForm] = useState<Form>(EMPTY)
  const [pairAddr, setPairAddr] = useState<Address | null>(null)
  const [configId, setConfigId] = useState(0)
  const [econ, setEcon] = useState<PairEconomics | null>(null)
  const [eligible, setEligible] = useState<boolean | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [progress, setProgress] = useState<LaunchProgress | null>(null)
  const [result, setResult] = useState<LaunchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pairs = useMemo(() => factory.state?.pairs ?? [], [factory.state])
  const pair = useMemo(() => pairs.find((p) => p.address === pairAddr) ?? pairs[0] ?? null, [pairs, pairAddr])
  const wallet = session ? findWallet(session.walletId) : undefined
  const wallet$ = useWalletBalances().data
  const feeRecipient = form.feeRecipient.trim() || me?.address || ''

  useEffect(() => {
    if (!pair) return
    let alive = true
    setEcon(null)
    readPairEconomics(pair, configId)
      .then((e) => alive && setEcon(e))
      .catch(() => alive && setEcon(null))
    return () => {
      alive = false
    }
  }, [pair, configId])

  useEffect(() => {
    if (!me) return
    let alive = true
    canLaunch(me.address as Address)
      .then((ok) => alive && setEligible(ok))
      .catch(() => alive && setEligible(null))
    return () => {
      alive = false
    }
  }, [me])

  useEffect(() => {
    if (!wallet) {
      setChainId(null)
      return
    }
    let alive = true
    currentChainId(wallet.provider)
      .then((id) => alive && setChainId(id))
      .catch(() => alive && setChainId(session?.chainId ?? null))
    const cb = (...args: unknown[]) => {
      const id = args[0]
      if (alive && typeof id === 'string') setChainId(parseInt(id, 16))
    }
    wallet.provider.on?.('chainChanged', cb)
    return () => {
      alive = false
      wallet.provider.removeListener?.('chainChanged', cb)
    }
  }, [wallet, session?.chainId])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))

  const problems = useMemo(() => {
    const p: string[] = []
    if (form.name.trim().length < 2 || form.name.trim().length > 32) p.push('Name must be 2–32 characters.')
    if (!validSymbol(form.symbol)) p.push('Ticker must be 2–10 letters/numbers.')
    if (form.description.length > 400) p.push('Description is too long (400 max).')
    if (form.logo && !/^https?:\/\/.+\..+/i.test(form.logo.trim())) p.push('Logo must be an http(s) URL.')
    if (!validAddress(feeRecipient)) p.push('Fee recipient must be a valid address.')
    if (factory.state && (form.creatorTaxBps < 0 || form.creatorTaxBps > factory.state.maxCreatorTaxBps)) p.push(`Creator tax must be between 0 and ${factory.state.maxCreatorTaxBps / 100}%.`)
    if (!pair) p.push('Pick a pair asset.')
    return p
  }, [form, feeRecipient, factory.state, pair])

  const onRobinhood = chainId === ROBINHOOD_CHAIN.id
  const busy = progress !== null && progress.step !== 'confirmed'

  const switchChain = async () => {
    if (!wallet) return
    try {
      await switchToRobinhoodChain(wallet.provider)
      setChainId(await currentChainId(wallet.provider))
    } catch (e) {
      toast({ kind: 'error', title: 'Could not switch network', body: e instanceof Error ? e.message : 'Rejected in wallet' })
    }
  }

  const submit = async () => {
    if (!me || !wallet || !pair || !factory.state || !validAddress(feeRecipient)) return
    setError(null)
    setResult(null)
    try {
      const res = await launchToken(
        wallet.provider,
        me.address as Address,
        {
          name: form.name.trim(),
          symbol: form.symbol.trim().toUpperCase(),
          logo: form.logo.trim(),
          description: form.description.trim(),
          socials: { twitter: form.twitter.trim(), telegram: form.telegram.trim(), discord: form.discord.trim(), website: form.website.trim() },
          creatorFeeRecipient: feeRecipient,
          creatorTaxBps: Math.round(form.creatorTaxBps),
          buybackEnabled: form.buybackEnabled,
          launchConfigId: configId,
          pairToken: pair.address,
        },
        setProgress
      )
      setResult(res)
      setConfirm(false)
      toast({ kind: 'success', title: `${form.symbol.toUpperCase()} launched on Pons`, body: 'Transaction confirmed on Robinhood Chain.' })
    } catch (e) {
      setProgress(null)
      setError(e instanceof Error ? e.message : 'Launch failed')
    }
  }

  const castIt = () => {
    if (!result) return
    const sym = form.symbol.toUpperCase()
    const link = result.token ? explorerAddress(result.token) : explorerTx(result.hash)
    openComposer({ channel: 'memes', text: `Just launched $${sym} on Robinhood Chain via Pons 🚀 paired with ${pair?.symbol ?? 'ETH'}\n${link}\n` })
  }

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Launch token</span>} />
      <div className="hidden md:block">
        <PageHeader title="Launch a token" sub="Deploy on Robinhood Chain through the Pons V2 factory" />
      </div>
      <CategoryBar />

      <div className="dreamy-card mx-4 mb-4 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
            <RocketIcon size={22} />
          </span>
          <div className="min-w-0 text-sm">
            <div className="font-display text-base font-extrabold">Bonding curve → Uniswap V4, no code needed</div>
            <p className="mt-1 text-ink-2">
              Your token starts on a Pons bonding curve paired with ETH, USDG or a Robinhood tokenized stock / ETF / RWA. Once the curve raises its graduation threshold, liquidity moves to a permanently locked Uniswap V4 pool. Pons never custodies funds.
            </p>
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
              <ShieldIcon size={12} /> Factory{' '}
              <a href={explorerAddress(PONS_V2_FACTORY)} target="_blank" rel="noreferrer" className="mono underline decoration-dotted hover:text-ink">
                {shortAddr(PONS_V2_FACTORY)}
              </a>
              <a href={PONS_DOCS} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-ink">
                Pons docs <ExternalIcon size={11} />
              </a>
              <a href={PONS_APP} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-dotted hover:text-ink">
                pons.family <ExternalIcon size={11} />
              </a>
            </p>
          </div>
        </div>
      </div>

      {factory.error && !factory.state && (
        <Empty
          title="Couldn’t reach the Pons factory"
          body={factory.error}
          action={
            <button className="btn btn-outline" onClick={factory.reload}>
              <RefreshIcon size={16} /> Retry
            </button>
          }
        />
      )}
      {!factory.state && !factory.error && (
        <div className="flex justify-center py-10">
          <Spinner size={22} />
        </div>
      )}

      {factory.state && (
        <div className="grid gap-4 px-4 pb-8 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-4">
            <Section title="1 · Token">
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <Field label="Name">
                  <input className="input" placeholder="Robin Cat" value={form.name} maxLength={32} onChange={(e) => set('name', e.target.value)} />
                </Field>
                <Field label="Ticker">
                  <input className="input mono uppercase" placeholder="RCAT" value={form.symbol} maxLength={10} onChange={(e) => set('symbol', e.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase())} />
                </Field>
              </div>
              <Field label="Description" hint={`${form.description.length}/400`}>
                <textarea className="input min-h-20 resize-y py-2" placeholder="What is this token about?" value={form.description} maxLength={400} onChange={(e) => set('description', e.target.value)} />
              </Field>
              <Field label="Logo URL" hint="optional · https://…png">
                <div className="flex items-center gap-2">
                  <LogoPreview url={form.logo} symbol={form.symbol} />
                  <input className="input flex-1" placeholder="https://…/logo.png" value={form.logo} onChange={(e) => set('logo', e.target.value)} />
                </div>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Website" hint="optional">
                  <input className="input" placeholder="https://" value={form.website} onChange={(e) => set('website', e.target.value)} />
                </Field>
                <Field label="X / Twitter" hint="optional">
                  <input className="input" placeholder="https://x.com/…" value={form.twitter} onChange={(e) => set('twitter', e.target.value)} />
                </Field>
                <Field label="Telegram" hint="optional">
                  <input className="input" placeholder="https://t.me/…" value={form.telegram} onChange={(e) => set('telegram', e.target.value)} />
                </Field>
                <Field label="Discord" hint="optional">
                  <input className="input" placeholder="https://discord.gg/…" value={form.discord} onChange={(e) => set('discord', e.target.value)} />
                </Field>
              </div>
            </Section>

            <Section title="2 · Pair asset" sub="Only assets the Pons factory currently approves are shown — checked live on-chain.">
              {KIND_ORDER.filter((k) => pairs.some((p) => p.kind === k)).map((k) => (
                <div key={k}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{PAIR_KIND_LABEL[k]}</div>
                  <div className="flex flex-wrap gap-2">
                    {pairs
                      .filter((p) => p.kind === k)
                      .map((p) => (
                        <PairChip key={p.address} p={p} active={pair?.address === p.address} onClick={() => setPairAddr(p.address)} />
                      ))}
                  </div>
                </div>
              ))}
              {pairs.length === 0 && <p className="text-sm text-ink-3">No approved pair assets right now.</p>}
            </Section>

            <Section title="3 · Creator settings">
              {factory.state.configs.length > 1 && (
                <Field label="Launch config">
                  <div className="flex flex-wrap gap-2">
                    {factory.state.configs.map((c) => (
                      <button key={c.id} className={cx('chip', configId === c.id && 'chip-active')} disabled={!c.enabled} onClick={() => setConfigId(c.id)}>
                        #{c.id} · fee {Number(c.curveFeeBps) / 100}%{!c.enabled && ' · disabled'}
                      </button>
                    ))}
                  </div>
                </Field>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Creator tax" hint={`0–${factory.state.maxCreatorTaxBps / 100}% of every trade goes to you`}>
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={factory.state.maxCreatorTaxBps} step={25} value={form.creatorTaxBps} onChange={(e) => set('creatorTaxBps', Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
                    <span className="mono w-14 text-right text-sm font-semibold">{(form.creatorTaxBps / 100).toFixed(2)}%</span>
                  </div>
                </Field>
                <Field label="Buyback">
                  <button type="button" role="switch" aria-checked={form.buybackEnabled} className={cx('btn w-full justify-between', form.buybackEnabled ? 'btn-primary' : 'btn-outline')} onClick={() => set('buybackEnabled', !form.buybackEnabled)}>
                    <span className="flex items-center gap-2">
                      <ZapIcon size={16} /> Auto-buyback {form.buybackEnabled ? 'on' : 'off'}
                    </span>
                    {form.buybackEnabled && <CheckIcon size={16} />}
                  </button>
                </Field>
              </div>
              <Field label="Fee recipient" hint={me ? 'defaults to your signed-in wallet' : 'sign in to prefill'}>
                <input className="input mono" placeholder={me?.address ?? '0x…'} value={form.feeRecipient} onChange={(e) => set('feeRecipient', e.target.value.trim())} />
              </Field>
            </Section>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-12 lg:self-start">
            <div className="card p-4">
              <div className="flex items-center gap-3">
                <LogoPreview url={form.logo} symbol={form.symbol} size={48} />
                <div className="min-w-0">
                  <div className="truncate font-display text-lg font-extrabold">{form.name.trim() || 'Your token'}</div>
                  <div className="mono text-xs text-ink-3">${form.symbol || 'TICKER'} / {pair?.symbol ?? '—'}</div>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                <dt className="text-ink-3">Launch fee</dt>
                <dd className="mono text-right font-semibold">{fmtEth(factory.state.launchFee)}</dd>
                {me && (
                  <>
                    <dt className="text-ink-3">Your ETH (Robinhood Chain)</dt>
                    <dd className={cx('mono text-right', wallet$ && Number(factory.state.launchFee) / 1e18 > wallet$.rhEth && 'text-short')}>
                      {wallet$ ? `${wallet$.rhEth.toFixed(5)} ETH` : '…'}
                    </dd>
                  </>
                )}
                <dt className="text-ink-3">Supply</dt>
                <dd className="mono text-right">{Number(factory.state.configs[configId]?.supply ?? 0n) / 1e18 >= 1e9 ? '1B' : (Number(factory.state.configs[configId]?.supply ?? 0n) / 1e18).toLocaleString()}</dd>
                <dt className="text-ink-3">Curve fee</dt>
                <dd className="mono text-right">{Number(factory.state.configs[configId]?.curveFeeBps ?? 0n) / 100}%</dd>
                <dt className="text-ink-3">Graduates at</dt>
                <dd className="mono text-right">{econ && pair ? fmtPair(econ.graduationThreshold, pair, econ.decimals) : <Spinner size={12} className="ml-auto" />}</dd>
                <dt className="text-ink-3">Virtual liquidity</dt>
                <dd className="mono text-right">{econ && pair ? fmtPair(econ.phantomQuote, pair, econ.decimals) : '—'}</dd>
                <dt className="text-ink-3">Creator tax</dt>
                <dd className="mono text-right">{(form.creatorTaxBps / 100).toFixed(2)}%</dd>
              </dl>
              <p className="mt-3 flex items-start gap-1.5 text-[11px] text-ink-3">
                <ShieldIcon size={12} className="mt-0.5 shrink-0" />
                This is a real on-chain transaction: you pay the launch fee plus gas in ETH on Robinhood Chain. Nothing is sent until you confirm in your wallet.
              </p>
            </div>

            {result ? (
              <div className="card border-long/40 p-4">
                <div className="flex items-center gap-2 font-display font-extrabold text-long">
                  <CheckIcon size={18} /> Launched!
                </div>
                <dl className="mt-3 grid gap-2 text-xs">
                  {result.token && (
                    <Row label="Token">
                      <a className="mono underline decoration-dotted" href={explorerAddress(result.token)} target="_blank" rel="noreferrer">
                        {shortAddr(result.token)}
                      </a>
                    </Row>
                  )}
                  {result.curve && (
                    <Row label="Curve">
                      <a className="mono underline decoration-dotted" href={explorerAddress(result.curve)} target="_blank" rel="noreferrer">
                        {shortAddr(result.curve)}
                      </a>
                    </Row>
                  )}
                  <Row label="Tx">
                    <a className="mono underline decoration-dotted" href={explorerTx(result.hash)} target="_blank" rel="noreferrer">
                      {shortAddr(result.hash)}
                    </a>
                  </Row>
                </dl>
                <div className="mt-3 flex flex-col gap-2">
                  <button className="btn btn-primary w-full" onClick={castIt}>
                    <MessageIcon size={16} /> Cast the launch
                  </button>
                  {result.token && (
                    <Link to={`/memes/${result.token}`} className="btn btn-outline w-full">
                      View on Memes
                    </Link>
                  )}
                  <a className="btn btn-ghost w-full" href={PONS_APP} target="_blank" rel="noreferrer">
                    Trade on Pons <ExternalIcon size={14} />
                  </a>
                </div>
              </div>
            ) : !me ? (
              <button className="btn btn-primary w-full" onClick={() => openSignIn('Sign in with your wallet to launch a token.')}>
                <WalletIcon size={18} /> Sign in to launch
              </button>
            ) : !wallet ? (
              <div className="card p-4 text-sm">
                <div className="font-semibold">Wallet not detected</div>
                <p className="mt-1 text-ink-3">
                  Open {session?.walletName} in this browser and reload — the launch has to be signed from the wallet you signed in with ({shortAddr(me.address)}).
                </p>
              </div>
            ) : !onRobinhood ? (
              <div className="card p-4">
                <div className="text-sm font-semibold">Switch to Robinhood Chain</div>
                <p className="mt-1 text-xs text-ink-3">Pons lives on Robinhood Chain (ID {ROBINHOOD_CHAIN.id}). Your wallet is on {chainId ? `chain ${chainId}` : 'another network'}.</p>
                <button className="btn btn-primary mt-3 w-full" onClick={switchChain}>
                  <img src="/robinhood-chain.png" alt="" width={16} height={16} className="rounded-sm" /> Switch network
                </button>
              </div>
            ) : eligible === false ? (
              <div className="card p-4 text-sm">
                <div className="font-semibold">Not eligible right now</div>
                <p className="mt-1 text-ink-3">The Pons factory reports this wallet can’t launch at the moment (rate limit or restriction). Try again later.</p>
              </div>
            ) : (
              <>
                {problems.length > 0 && (
                  <ul className="card space-y-1 p-3 text-xs text-ink-3">
                    {problems.map((p) => (
                      <li key={p}>• {p}</li>
                    ))}
                  </ul>
                )}
                {!confirm ? (
                  <button className="btn btn-primary w-full" disabled={problems.length > 0} onClick={() => setConfirm(true)}>
                    <RocketIcon size={18} /> Review launch
                  </button>
                ) : (
                  <div className="card border-accent/40 p-4">
                    <div className="font-display font-extrabold">Confirm launch</div>
                    <p className="mt-1 text-xs text-ink-2">
                      You are about to deploy <b>${form.symbol}</b> paired with <b>{pair?.symbol}</b> on Robinhood Chain and pay <b className="mono">{fmtEth(factory.state.launchFee)}</b> + gas. Your wallet will ask you to approve the transaction — this can’t be undone.
                    </p>
                    {error && (
                      <p role="alert" className="mt-2 rounded-lg bg-short-soft px-2.5 py-1.5 text-xs text-short">
                        {error}
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setConfirm(false)}>
                        Back
                      </button>
                      <button className="btn btn-primary flex-1" disabled={busy} onClick={submit}>
                        {busy ? (
                          <>
                            <Spinner size={16} /> {progress?.step === 'preview' ? 'Preparing…' : progress?.step === 'wallet' ? 'Confirm in wallet…' : 'Confirming…'}
                          </>
                        ) : (
                          <>
                            <RocketIcon size={16} /> Launch now
                          </>
                        )}
                      </button>
                    </div>
                    {progress?.hash && (
                      <a className="mt-2 block text-center text-xs underline decoration-dotted" href={explorerTx(progress.hash)} target="_blank" rel="noreferrer">
                        View pending tx {shortAddr(progress.hash)}
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="font-display font-extrabold">{title}</h2>
        {sub && <p className="text-xs text-ink-3">{sub}</p>}
      </div>
      {children}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between text-xs font-semibold text-ink-2">
        {label}
        {hint && <span className="font-normal text-ink-3">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function PairChip({ p, active, onClick }: { p: PairAsset; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={cx('chip !py-1.5 gap-2', active && 'chip-active')} onClick={onClick} aria-pressed={active}>
      <CoinLogo coin={p.symbol} size={18} />
      <span className="font-semibold">{p.symbol}</span>
    </button>
  )
}

function LogoPreview({ url, symbol, size = 40 }: { url: string; symbol: string; size?: number }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [url])
  const ok = url && /^https?:\/\//i.test(url) && !broken
  return ok ? (
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full bg-surface-2 object-cover" style={{ width: size, height: size }} onError={() => setBroken(true)} />
  ) : (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface-2 font-display font-extrabold text-ink-3" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {(symbol || '?').slice(0, 2)}
    </span>
  )
}
