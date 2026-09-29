import { useEffect, useState } from 'react'
import { coinColor, dexOf, displaySymbol } from '../lib/hyperliquid'
import { cx } from '../lib/format'

/**
 * Real token / equity / commodity logos with a resilient fallback chain:
 * Hyperliquid's own coin art → CoinCap (crypto) or Parqet (equities & ETFs) → coloured monogram.
 * Results are memoised per coin so a failed source is never retried in the same session.
 */
function candidates(coin: string): string[] {
  const dex = dexOf(coin)
  const sym = displaySymbol(coin)
  const bare = sym.replace(/^k(?=[A-Z])/, '')
  const list = [`https://app.hyperliquid.xyz/coins/${encodeURIComponent(coin)}.svg`]
  if (bare !== sym) list.push(`https://app.hyperliquid.xyz/coins/${encodeURIComponent(dex ? `${dex}:${bare}` : bare)}.svg`)
  if (dex) list.push(`https://assets.parqet.com/logos/symbol/${encodeURIComponent(bare)}?format=png`)
  else list.push(`https://assets.coincap.io/assets/icons/${bare.toLowerCase()}@2x.png`)
  return list
}

const resolved = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

function probe(url: string): Promise<boolean> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res(img.naturalWidth > 0)
    img.onerror = () => res(false)
    img.src = url
  })
}

export function resolveLogo(coin: string): Promise<string | null> {
  const hit = resolved.get(coin)
  if (hit !== undefined) return Promise.resolve(hit)
  const inflight = pending.get(coin)
  if (inflight) return inflight
  const p = (async () => {
    for (const url of candidates(coin)) {
      if (await probe(url)) {
        resolved.set(coin, url)
        return url
      }
    }
    resolved.set(coin, null)
    return null
  })()
  pending.set(coin, p)
  void p.finally(() => pending.delete(coin))
  return p
}

export function CoinLogo({ coin, size = 22, className, rounded = 'full' }: { coin: string; size?: number; className?: string; rounded?: 'full' | 'xl' }) {
  const [src, setSrc] = useState<string | null | undefined>(() => resolved.get(coin))
  useEffect(() => {
    let alive = true
    const known = resolved.get(coin)
    if (known !== undefined) {
      setSrc(known)
      return
    }
    setSrc(undefined)
    void resolveLogo(coin).then((u) => alive && setSrc(u))
    return () => {
      alive = false
    }
  }, [coin])

  const sym = displaySymbol(coin)
  const color = coinColor(coin)
  const shape = rounded === 'xl' ? 'rounded-xl' : 'rounded-full'

  if (src) {
    return (
      <span className={cx('grid shrink-0 place-items-center overflow-hidden bg-surface-2', shape, className)} style={{ width: size, height: size }}>
        <img src={src} alt={sym} width={size} height={size} className="h-full w-full object-contain" loading="lazy" draggable={false} />
      </span>
    )
  }
  return (
    <span
      className={cx('grid shrink-0 place-items-center font-display font-extrabold text-white', shape, src === undefined && 'animate-pulse', className)}
      style={{ width: size, height: size, fontSize: Math.max(9, size * 0.42), background: `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 70%, #3b2a1a))` }}
    >
      {sym.replace(/^k(?=[A-Z])/, '').slice(0, 1)}
    </span>
  )
}
