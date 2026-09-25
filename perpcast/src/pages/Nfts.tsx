import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader, Spinner, Empty } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { CategoryBar } from '../components/CategoryBar'
import { ArrowLeftIcon, ExternalIcon, RefreshIcon, SearchIcon, ShareIcon } from '../components/Icons'
import { fetchCollections, fetchCollection, fetchCover, fetchItems, explorerNft, nftImageFallback, type NftCollection, type NftItem } from '../lib/nfts'
import { useUI } from '../store/ui'
import { useAuth } from '../store/auth'
import { cx, compact } from '../lib/format'
import { MascotsGallery } from './Mascots'
import { MASCOT_SUPPLY, mascotImage } from '../lib/mascots'

export default function Nfts() {
  const { address, id } = useParams()
  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">NFT Gallery</span>} />
      {address === 'perpcast' || id ? <MascotsGallery id={id} /> : address ? <CollectionDetail address={address} /> : <CollectionGrid />}
    </div>
  )
}

function NftImage({ src, alt = '' }: { src: string; alt?: string }) {
  const [cur, setCur] = useState(src)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    setCur(src)
    setFailed(false)
  }, [src])
  if (failed) return <div className="flex h-full w-full items-center justify-center text-xs text-ink-3">No image</div>
  return (
    <img
      src={cur}
      alt={alt}
      loading="lazy"
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
      onError={() => {
        const alt2 = nftImageFallback(cur)
        if (alt2 && alt2 !== cur) setCur(alt2)
        else setFailed(true)
      }}
    />
  )
}

function Cover({ address, icon, className }: { address: string; icon: string | null; className?: string }) {
  const [src, setSrc] = useState<string | null>(icon)
  useEffect(() => {
    if (icon) return
    let alive = true
    void fetchCover(address).then((u) => alive && setSrc(u))
    return () => {
      alive = false
    }
  }, [address, icon])
  return (
    <div className={cx('relative overflow-hidden bg-surface-2', className)}>
      {src ? (
        <NftImage src={src} />
      ) : (
        <div className="skeleton h-full w-full" />
      )}
    </div>
  )
}

function CollectionGrid() {
  const [list, setList] = useState<NftCollection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const load = (force = false) => {
    setLoading(true)
    fetchCollections({ force })
      .then((l) => {
        setList(l)
        setError(null)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }
  useEffect(() => load(), [])
  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (list ?? []).filter((c) => !k || c.name.toLowerCase().includes(k) || c.symbol.toLowerCase().includes(k)).slice(0, 60)
  }, [list, q])

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          title="NFT Gallery"
          sub="Collections minted on Robinhood Chain"
          right={
            <button className="icon-btn" title="Refresh" onClick={() => load(true)} disabled={loading}>
              {loading ? <Spinner size={16} /> : <RefreshIcon size={18} />}
            </button>
          }
        />
      </div>
      <CategoryBar />
      <Link to="/nfts/perpcast" className="mascot-hero group mx-4 mb-3 block overflow-hidden rounded-3xl p-4">
        <div className="mascot-hero-strip" aria-hidden>
          {Array.from({ length: 24 }, (_, i) => (
            <img key={i} src={mascotImage((i % 12) + 1)} alt="" width={64} height={64} loading="lazy" />
          ))}
        </div>
        <div className="relative mt-3 flex items-center gap-3">
          <img src="/logo.svg" alt="" width={44} height={44} className="rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="font-display text-lg font-extrabold">Perpcast Mascots</div>
            <div className="text-xs text-ink-3">Our own {MASCOT_SUPPLY}-piece generative collection · free mint · OpenSea</div>
          </div>
          <span className="btn btn-primary !h-9 !px-3 !text-xs">Open →</span>
        </div>
      </Link>
      <div className="dreamy-card mx-4 mb-3 flex flex-wrap items-center gap-3 rounded-2xl p-4">
        <img src="/robinhood-chain.png" alt="" width={40} height={40} className="rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="font-display font-extrabold">Real collections, live from the chain</div>
          <div className="text-xs text-ink-3">Every ERC-721 / ERC-1155 collection on Robinhood Chain, ranked by holders. Tap a collection to browse its items and share one to your feed.</div>
        </div>
        <label className="relative w-full sm:w-44">
          <SearchIcon size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input className="input !h-9 !rounded-full !pl-8 !text-xs" placeholder="Search collection" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <p className="px-4 pb-3 text-[11px] text-ink-3">
        Live onchain data from{' '}
        <a href="https://robinhoodchain.blockscout.com/tokens?type=ERC-721" target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-ink">
          Robinhood Chain explorer
        </a>
        . LP-position NFTs are hidden.
      </p>
      {error && !list && (
        <Empty
          title="Couldn’t load collections"
          body={error}
          action={
            <button className="btn btn-outline" onClick={() => load(true)}>
              <RefreshIcon size={16} /> Retry
            </button>
          }
        />
      )}
      {!list && !error && (
        <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      )}
      {list && shown.length === 0 && <Empty title="No collections match" body="Try another name or symbol." />}
      <div className="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-3">
        {shown.map((c, i) => (
          <Link key={c.address} to={`/nfts/${c.address}`} className="group card overflow-hidden rounded-2xl transition-transform hover:-translate-y-0.5">
            <Cover address={c.address} icon={c.icon} className="aspect-square" />
            <div className="p-3">
              <div className="flex items-center gap-1.5">
                <span className="mono text-[10px] text-ink-3">#{i + 1}</span>
                <span className="truncate text-sm font-bold">{c.name}</span>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-xs text-ink-3">
                <span>{compact(c.holders)} holders</span>
                <span className="mono">{c.supply ? `${compact(c.supply)} items` : c.type}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

function CollectionDetail({ address }: { address: string }) {
  const [col, setCol] = useState<NftCollection | null>(null)
  const [items, setItems] = useState<NftItem[]>([])
  const [next, setNext] = useState<Record<string, string | number> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const openComposer = useUI((s) => s.openComposer)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setItems([])
    Promise.all([fetchCollection(address), fetchItems(address)])
      .then(([c, r]) => {
        if (!alive) return
        setCol(c)
        setItems(r.items)
        setNext(r.next)
        setError(null)
      })
      .catch((e: Error) => alive && setError(e.message))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [address])

  const more = () => {
    if (!next) return
    setLoading(true)
    fetchItems(address, next)
      .then((r) => {
        setItems((p) => [...p, ...r.items])
        setNext(r.next)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }

  const share = (it: NftItem) => {
    if (!me) return openSignIn('Sign in to share NFTs to your feed.')
    const img = it.image && it.image.startsWith('http') ? `\n${it.image}` : ''
    openComposer({ text: `${it.name} · ${col?.name ?? 'NFT'} on Robinhood Chain ${explorerNft(address, it.id)}${img}` })
  }

  return (
    <div>
      <div className="hidden md:block">
        <PageHeader
          title={col?.name ?? 'Collection'}
          sub={col ? `${compact(col.holders)} holders · ${col.type}` : undefined}
          back={
            <Link to="/nfts" className="icon-btn" aria-label="Back">
              <ArrowLeftIcon size={18} />
            </Link>
          }
          right={
            <a className="icon-btn" href={explorerNft(address)} target="_blank" rel="noreferrer" title="View on explorer">
              <ExternalIcon size={18} />
            </a>
          }
        />
      </div>
      <div className="flex items-center gap-3 px-4 py-3 md:hidden">
        <Link to="/nfts" className="icon-btn" aria-label="Back">
          <ArrowLeftIcon size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg font-extrabold">{col?.name ?? 'Collection'}</div>
          {col && <div className="text-xs text-ink-3">{compact(col.holders)} holders · {col.type}</div>}
        </div>
        <a className="icon-btn" href={explorerNft(address)} target="_blank" rel="noreferrer" title="View on explorer">
          <ExternalIcon size={18} />
        </a>
      </div>
      {error && items.length === 0 && <Empty title="Couldn’t load this collection" body={error} />}
      {loading && items.length === 0 && (
        <div className="grid grid-cols-2 gap-3 px-4 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="skeleton aspect-square rounded-2xl" />
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 px-4 pb-4 sm:grid-cols-3">
        {items.map((it) => (
          <div key={it.id} className="group card overflow-hidden rounded-2xl">
            <a href={explorerNft(address, it.id)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden bg-surface-2">
              {it.image ? <NftImage src={it.image} alt={it.name} /> : <div className="flex h-full items-center justify-center text-xs text-ink-3">No image</div>}
            </a>
            <div className="flex items-center justify-between gap-2 p-2.5">
              <span className="truncate text-xs font-bold">{it.name}</span>
              <button className="icon-btn !h-7 !w-7" title="Share to cast" onClick={() => share(it)}>
                <ShareIcon size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {next && (
        <div className="flex justify-center pb-8">
          <button className="btn btn-outline" onClick={more} disabled={loading}>
            {loading ? <Spinner size={16} /> : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
