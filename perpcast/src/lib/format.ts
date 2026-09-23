export const FARCASTER_EPOCH = 1609459200 // 2021-01-01 UTC, seconds

export function fcTimeToMs(ts: number): number {
  return (ts + FARCASTER_EPOCH) * 1000
}

export function timeAgo(ms: number, now = Date.now()): string {
  const diff = Math.max(0, now - ms) / 1000
  if (diff < 45) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d`
  const d = new Date(ms)
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return d.toLocaleDateString(undefined, sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' })
}

export function fullDate(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function compact(n: number): string {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Number.isInteger(n) || abs >= 100 ? n.toFixed(0) : n.toFixed(1)
}

export function usd(n: number, opts: { compact?: boolean; sign?: boolean; decimals?: number } = {}): string {
  if (!isFinite(n)) return '—'
  const sign = opts.sign ? (n > 0 ? '+' : n < 0 ? '-' : '') : n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (opts.compact && abs >= 1e5) return `${sign}$${compact(abs)}`
  const decimals = opts.decimals ?? (abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6)
  return `${sign}$${abs.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

/** Format a market price with sensible precision. */
export function px(n: number, szDecimals = 2): string {
  if (!isFinite(n)) return '—'
  const abs = Math.abs(n)
  let decimals: number
  if (abs >= 10000) decimals = 1
  else if (abs >= 1000) decimals = 2
  else if (abs >= 100) decimals = 2
  else if (abs >= 1) decimals = 3
  else if (abs >= 0.01) decimals = 5
  else decimals = 6
  decimals = Math.max(decimals, Math.min(6, 6 - szDecimals) - 2 > decimals ? decimals : decimals)
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function pct(n: number, digits = 2): string {
  if (!isFinite(n)) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
}

export function num(n: number, digits = 4): string {
  if (!isFinite(n)) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
