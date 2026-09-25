import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Address } from 'viem'
import { PageHeader, Spinner, Empty } from '../components/ui'
import { ArrowLeftIcon, CheckIcon, CopyIcon, ExternalIcon, ShareIcon, SparkIcon } from '../components/Icons'
import {
  MASCOTS_CONTRACT,
  MASCOT_SUPPLY,
  SITE,
  deployMascots,
  explorerContractUrl,
  fetchMascotIndex,
  mascotImage,
  mintMascot,
  openSeaAssetUrl,
  openSeaCollectionUrl,
  readMascotsState,
  reserveMascots,
  type MascotCollection,
  type MascotIndexItem,
  type MascotsState,
} from '../lib/mascots'
import { ROBINHOOD_CHAIN, currentChainId, findWallet, switchToRobinhoodChain } from '../lib/wallet'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { toast } from '../store/notify'
import { cx } from '../lib/format'

const OpenSeaMark = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 90 90" fill="none" aria-hidden>
    <circle cx="45" cy="45" r="45" fill="#2081E2" />
    <path
      fill="#fff"
      d="M22.2 46.4 22.4 46.1 34.1 27.8c.2-.3.6-.2.7 0 2 4.4 3.7 9.8 2.9 13.2-.3 1.4-1.3 3.3-2.3 5-.1.3-.3.5-.5.8-.1.1-.2.2-.4.2H22.6c-.4 0-.6-.4-.4-.7ZM74.4 49.8v2.8c0 .2-.1.3-.2.4-.9.4-3.9 1.8-5.2 3.5-3.2 4.4-5.6 10.8-11.1 10.8H35.1c-8.1 0-14.6-6.6-14.6-14.7v-.3c0-.2.2-.4.4-.4h12.8c.3 0 .4.2.4.5-.1.8.1 1.7.5 2.5.7 1.5 2.3 2.5 4 2.5h6.3v-4.9h-6.2c-.3 0-.5-.4-.3-.7l.3-.4c.6-.8 1.4-2.1 2.2-3.5.6-1 1.1-2 1.5-3.1.1-.2.2-.4.2-.6.1-.4.3-.8.4-1.1.1-.3.2-.7.2-1 .2-1.1.3-2.3.3-3.6 0-.5 0-1-.1-1.5 0-.5-.1-1.1-.2-1.6 0-.5-.1-1-.2-1.5-.1-.7-.3-1.4-.5-2.1l-.1-.3c-.1-.5-.3-1-.4-1.5-.5-1.6-1-3.1-1.6-4.5-.2-.6-.4-1.1-.7-1.7-.4-.8-.7-1.6-1.1-2.3-.2-.3-.3-.6-.5-1l-.5-1c-.1-.3-.3-.5-.4-.8l-1.2-2.2c-.2-.3.1-.7.4-.6l7.4 2h.1l1 .3 1.1.3.4.1V17c0-2.1 1.7-3.8 3.8-3.8 1 0 2 .4 2.7 1.1.7.7 1.1 1.7 1.1 2.7v6.7l.8.2c.1 0 .1.1.2.1.2.2.5.4.9.7.3.2.6.5 1 .8.8.6 1.7 1.4 2.7 2.4.3.2.5.5.8.7.7.7 1.4 1.5 2.1 2.4.2.2.4.5.6.8.2.3.4.6.6.8.3.4.6.8.8 1.2.1.2.3.4.4.6.3.6.6 1.1.9 1.7.1.3.2.5.3.8.3.7.6 1.4.7 2.2.1.2.1.3.1.5v.1c.1.2.1.5.1.7.1.8 0 1.6-.1 2.4-.1.3-.2.7-.3 1-.1.3-.2.7-.4 1-.3.7-.6 1.3-1 2-.1.2-.3.5-.4.7-.2.3-.3.5-.5.7-.2.3-.4.6-.7.9-.2.3-.4.6-.7.8-.3.4-.7.8-1 1.1-.2.2-.4.5-.7.7-.2.2-.5.5-.7.6-.4.3-.7.6-1.1.9l-.7.5c-.1.1-.2.1-.3.1H51v4.9h5.9c1.3 0 2.6-.5 3.6-1.3.3-.3 1.8-1.6 3.6-3.5.1-.1.1-.1.2-.1l9.7-2.8c.3-.1.4.1.4.3Z"
    />
  </svg>
)

export function MascotsGallery({ id }: { id?: string }) {
  const [col, setCol] = useState<MascotCollection | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetchMascotIndex().then(setCol).catch((e: Error) => setError(e.message))
  }, [])
  if (error) return <Empty title="Couldn’t load the collection" body={error} />
  if (!col) {
    return (
      <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-2xl" />
        ))}
      </div>
    )
  }
  const n = id ? Number(id) : NaN
  const item = Number.isInteger(n) ? col.items.find((x) => x.id === n) : undefined
  return item ? <MascotDetail item={item} col={col} /> : <MascotGrid col={col} />
}

function useMascotsChain(account: string | undefined) {
  const [state, setState] = useState<MascotsState | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!MASCOTS_CONTRACT) return
    let alive = true
    readMascotsState(MASCOTS_CONTRACT, (account as Address | undefined) ?? null)
      .then((s) => alive && setState(s))
      .catch(() => alive && setState(null))
    return () => {
      alive = false
    }
  }, [account, tick])
  return { state, refresh: () => setTick((t) => t + 1) }
}

function MascotGrid({ col }: { col: MascotCollection }) {
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const openSignIn = useAuth((s) => s.openSignIn)
  const wallet = session ? findWallet(session.walletId) : undefined
  const { state, refresh } = useMascotsChain(me?.address)
  const [busy, setBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'mine'>('all')
  const [deployed, setDeployed] = useState<Address | null>(null)
  const isOwner = !!state && !!me && state.owner.toLowerCase() === me.address.toLowerCase()

  const shown = useMemo(() => (filter === 'mine' && state ? col.items.filter((i) => state.ownedIds.includes(i.id)) : col.items), [col, filter, state])

  const ensureChain = async () => {
    if (!wallet) throw new Error('Wallet not connected')
    if ((await currentChainId(wallet.provider)) !== ROBINHOOD_CHAIN.id) await switchToRobinhoodChain(wallet.provider)
  }

  const run = async (label: string, fn: () => Promise<unknown>, ok: string) => {
    if (!me || !wallet) return openSignIn('Sign in with your wallet to continue.')
    setBusy(label)
    try {
      await ensureChain()
      await fn()
      toast({ kind: 'success', title: ok })
      refresh()
    } catch (e) {
      toast({ kind: 'error', title: `${label} failed`, body: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const mint = () => run('Mint', () => mintMascot(wallet!.provider, me!.address as Address, MASCOTS_CONTRACT!), 'Mascot minted — welcome to the family')
  const reserve = () => run('Reserve', () => reserveMascots(wallet!.provider, me!.address as Address, MASCOTS_CONTRACT!, 10), '10 mascots reserved to your wallet')
  const deploy = () =>
    run(
      'Deploy',
      async () => {
        const r = await deployMascots(wallet!.provider, me!.address as Address)
        setDeployed(r.address)
      },
      'Collection deployed on Robinhood Chain',
    )

  const minted = state?.totalSupply ?? 0
  const soldOut = minted >= MASCOT_SUPPLY

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          title="Perpcast Mascots"
          sub={`${MASCOT_SUPPLY} generative mascots · Robinhood Chain`}
          back={
            <Link to="/nfts" className="icon-btn" aria-label="Back">
              <ArrowLeftIcon size={18} />
            </Link>
          }
          right={
            <a className="btn btn-outline !h-9 !px-3 !text-xs" href={openSeaCollectionUrl(MASCOTS_CONTRACT)} target="_blank" rel="noreferrer">
              <OpenSeaMark /> OpenSea
            </a>
          }
        />
      </div>
      <div className="flex items-center gap-3 px-4 py-3 md:hidden">
        <Link to="/nfts" className="icon-btn" aria-label="Back">
          <ArrowLeftIcon size={18} />
        </Link>
        <div className="min-w-0 flex-1 font-display text-lg font-extrabold">Perpcast Mascots</div>
        <a className="btn btn-outline !h-9 !px-3 !text-xs" href={openSeaCollectionUrl(MASCOTS_CONTRACT)} target="_blank" rel="noreferrer">
          <OpenSeaMark /> OpenSea
        </a>
      </div>

      <div className="mascot-hero mx-4 mb-4 overflow-hidden rounded-3xl p-5">
        <div className="mascot-hero-strip" aria-hidden>
          {[...col.items.slice(0, 12), ...col.items.slice(0, 12)].map((it, i) => (
            <img key={`${it.id}-${i}`} src={mascotImage(it.id)} alt="" width={72} height={72} loading="lazy" />
          ))}
        </div>
        <div className="relative mt-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="" width={36} height={36} className="rounded-xl" />
              <h2 className="font-display text-2xl font-extrabold tracking-tight">Perpcast Mascots</h2>
            </div>
            <p className="mt-1 max-w-md text-sm text-ink-3">{col.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="chip">{MASCOT_SUPPLY} items</span>
              <span className="chip">Free mint · 1 per wallet</span>
              <span className="chip">Robinhood Chain</span>
              {MASCOTS_CONTRACT && (
                <span className="chip">
                  {minted}/{MASCOT_SUPPLY} minted
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {MASCOTS_CONTRACT ? (
              <>
                <button className="btn btn-primary" disabled={!!busy || soldOut || (state?.minted ?? false) || state?.mintOpen === false} onClick={mint}>
                  {busy === 'Mint' ? <Spinner size={16} /> : <SparkIcon size={16} />}
                  {soldOut ? 'Sold out' : state?.minted ? 'Minted ✓' : state?.mintOpen === false ? 'Mint closed' : me ? 'Mint free' : 'Sign in to mint'}
                </button>
                <a className="btn btn-outline" href={explorerContractUrl(MASCOTS_CONTRACT)} target="_blank" rel="noreferrer">
                  <ExternalIcon size={16} /> Contract
                </a>
                {isOwner && !soldOut && (
                  <button className="btn btn-outline" disabled={!!busy} onClick={reserve}>
                    {busy === 'Reserve' ? <Spinner size={16} /> : null} Reserve 10 (owner)
                  </button>
                )}
              </>
            ) : deployed ? (
              <DeployedNotice address={deployed} />
            ) : (
              <button className="btn btn-primary" disabled={!!busy} onClick={me ? deploy : () => openSignIn('Sign in to deploy the collection from your wallet.')}>
                {busy === 'Deploy' ? <Spinner size={16} /> : <SparkIcon size={16} />}
                {me ? 'Deploy collection from my wallet' : 'Sign in to deploy'}
              </button>
            )}
          </div>
        </div>
      </div>

      {MASCOTS_CONTRACT && me && (
        <div className="mb-3 flex gap-2 px-4">
          {(['all', 'mine'] as const).map((f) => (
            <button key={f} className={cx('cat-pill !rounded-full !px-3 !py-1.5 !text-xs', filter === f && 'is-active')} aria-current={filter === f ? 'page' : undefined} onClick={() => setFilter(f)}>
              {f === 'all' ? 'All mascots' : `Mine (${state?.ownedIds.length ?? 0})`}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <Empty title="No mascots here yet" body="Mint one and it will show up in this tab." />}
      <div className="grid grid-cols-2 gap-3 px-4 pb-8 sm:grid-cols-3">
        {shown.map((it) => (
          <Link key={it.id} to={`/nfts/perpcast/${it.id}`} className="group card overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5">
            <div className="aspect-square overflow-hidden bg-surface-2">
              <img src={mascotImage(it.id)} alt={it.name} loading="lazy" width={512} height={512} className="h-full w-full transition-transform duration-300 group-hover:scale-105" />
            </div>
            <div className="p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold">#{it.id} {it.name}</span>
                {state?.ownedIds.includes(it.id) && <span className="chip !py-0 !text-[10px]">Yours</span>}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-ink-3">
                {it.traits.Mood} · {it.traits.Hat !== 'None' ? it.traits.Hat : it.traits.Eyes}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function DeployedNotice({ address }: { address: Address }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="dreamy-card rounded-2xl p-3 text-xs">
      <div className="font-bold">Deployed! Contract address:</div>
      <button
        className="mono mt-1 flex items-center gap-1 break-all text-left"
        onClick={() => {
          void navigator.clipboard.writeText(address)
          setCopied(true)
        }}
      >
        {address} {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
      </button>
      <div className="mt-1 text-ink-3">Send this address to the Perpcast team so mint + OpenSea buttons switch on for everyone.</div>
      <a className="mt-1 inline-flex items-center gap-1 underline" href={explorerContractUrl(address)} target="_blank" rel="noreferrer">
        View on explorer <ExternalIcon size={12} />
      </a>
    </div>
  )
}

function MascotDetail({ item, col }: { item: MascotIndexItem; col: MascotCollection }) {
  const nav = useNavigate()
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const openComposer = useUI((s) => s.openComposer)
  const prev = col.items.find((x) => x.id === item.id - 1)
  const next = col.items.find((x) => x.id === item.id + 1)
  const share = () => {
    if (!me) return openSignIn('Sign in to share mascots to your feed.')
    openComposer({ text: `Perpcast Mascot #${item.id} · ${item.name} (${item.traits.Mood}) ${SITE}/nfts/perpcast/${item.id}\n${SITE}${mascotImage(item.id)}` })
  }
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <button className="icon-btn" aria-label="Back" onClick={() => nav('/nfts/perpcast')}>
          <ArrowLeftIcon size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-extrabold">
            #{item.id} · {item.name}
          </div>
          <div className="text-xs text-ink-3">Perpcast Mascots · Robinhood Chain</div>
        </div>
        <button className="icon-btn" title="Share to cast" onClick={share}>
          <ShareIcon size={18} />
        </button>
      </div>
      <div className="grid gap-4 px-4 pb-8 md:grid-cols-[1fr_1fr]">
        <div className="card overflow-hidden rounded-3xl">
          <img src={mascotImage(item.id)} alt={item.name} width={512} height={512} className="w-full" />
        </div>
        <div>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(item.traits).map(([k, v]) => (
              <div key={k} className="card rounded-2xl p-3">
                <div className="text-[10px] uppercase tracking-wide text-ink-3">{k}</div>
                <div className="truncate text-sm font-bold">{v}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {MASCOTS_CONTRACT ? (
              <a className="btn btn-primary" href={openSeaAssetUrl(MASCOTS_CONTRACT, item.id)} target="_blank" rel="noreferrer">
                <OpenSeaMark /> View on OpenSea
              </a>
            ) : (
              <span className="chip">OpenSea listing appears once the collection is deployed</span>
            )}
            <button className="btn btn-outline" onClick={share}>
              <ShareIcon size={16} /> Share to cast
            </button>
          </div>
          <div className="mt-4 flex justify-between text-sm">
            {prev ? (
              <Link to={`/nfts/perpcast/${prev.id}`} className="underline decoration-dotted">
                ← #{prev.id}
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={`/nfts/perpcast/${next.id}`} className="underline decoration-dotted">
                #{next.id} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
