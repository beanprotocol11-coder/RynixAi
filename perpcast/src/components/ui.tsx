import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../lib/format'
import { CloseIcon } from './Icons'
import { useNotify } from '../store/notify'

export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return <img src="/logo.svg" alt="Perpcast" width={size} height={size} className={cx('rounded-[28%] shrink-0', className)} draggable={false} />
}

export function Wordmark({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg'
  return (
    <span className={cx('font-display font-extrabold tracking-tight', s, className)}>
      Perp<span className="text-gradient">cast</span>
    </span>
  )
}

export function Avatar({ src, name, size = 40, className, fid }: { src?: string; name?: string; size?: number; className?: string; fid?: number }) {
  const [err, setErr] = useState(false)
  const letter = (name ?? '?').replace(/^@/, '').slice(0, 1).toUpperCase()
  const hue = fid !== undefined ? Math.abs(fid * 47) % 360 : (letter.charCodeAt(0) * 37) % 360
  const show = src && !err
  return (
    <div
      className={cx('relative shrink-0 overflow-hidden rounded-full bg-surface-2 flex items-center justify-center font-bold select-none', className)}
      style={{ width: size, height: size, fontSize: size * 0.4, background: show ? undefined : `linear-gradient(135deg, hsl(${hue} 60% 55%), hsl(${(hue + 40) % 360} 70% 45%))`, color: '#fff' }}
    >
      {show ? <img src={src} alt={name ?? ''} className="h-full w-full object-cover" loading="lazy" onError={() => setErr(true)} draggable={false} /> : letter}
    </div>
  )
}

export function Modal({ open, onClose, children, className, size = 'md', label }: { open: boolean; onClose: () => void; children: ReactNode; className?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; label?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  if (!open) return null
  const w = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : size === 'xl' ? 'max-w-4xl' : 'max-w-lg'
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade-up" onClick={onClose} />
      <div className={cx('relative w-full card !rounded-b-none sm:!rounded-2xl shadow-pop anim-pop max-h-[92vh] overflow-y-auto', w, className)}>{children}</div>
    </div>,
    document.body,
  )
}

export function ModalHeader({ title, onClose, sub }: { title: ReactNode; onClose: () => void; sub?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
      <div>
        <h2 className="font-display text-lg font-extrabold tracking-tight">{title}</h2>
        {sub && <p className="text-sm text-ink-3 mt-0.5">{sub}</p>}
      </div>
      <button className="icon-btn -mr-2 -mt-1" onClick={onClose} aria-label="Close">
        <CloseIcon size={18} />
      </button>
    </div>
  )
}

export function Menu({ trigger, children, align = 'right', className }: { trigger: (open: boolean) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className={cx('relative', className)}>
      <div
        onClick={(e) => {
          e.stopPropagation()
          setOpen((o) => !o)
        }}
      >
        {trigger(open)}
      </div>
      {open && (
        <div className={cx('absolute z-50 mt-1 min-w-[200px] card !rounded-xl p-1.5 shadow-pop anim-pop', align === 'right' ? 'right-0' : 'left-0')} onClick={(e) => e.stopPropagation()}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ children, onClick, danger, icon }: { children: ReactNode; onClick?: () => void; danger?: boolean; icon?: ReactNode }) {
  return (
    <button className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors hover:bg-surface-hover', danger ? 'text-short' : 'text-ink')} onClick={onClick}>
      {icon && <span className="text-ink-3 [&>svg]:h-4 [&>svg]:w-4">{icon}</span>}
      {children}
    </button>
  )
}

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={cx('animate-spin text-accent', className)} fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} />
}

export function CastSkeleton() {
  return (
    <div className="flex gap-3 px-4 py-4">
      <Skeleton className="h-10 w-10 !rounded-full" />
      <div className="flex-1 space-y-2.5 pt-1">
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  )
}

export function Empty({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">{icon}</div>}
      <h3 className="font-display text-base font-bold">{title}</h3>
      {body && <p className="mt-1 max-w-xs text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Toasts() {
  const toasts = useNotify((s) => s.toasts)
  const dismiss = useNotify((s) => s.dismiss)
  if (!toasts.length) return null
  return createPortal(
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[min(360px,calc(100vw-2rem))]">
      {toasts.map((t) => (
        <div key={t.id} className="card !rounded-xl px-4 py-3 flex items-start gap-3 anim-pop shadow-pop">
          <span
            className={cx('mt-1.5 h-2 w-2 rounded-full shrink-0', t.kind === 'success' || t.kind === 'long' ? 'bg-long' : t.kind === 'error' || t.kind === 'short' ? 'bg-short' : 'bg-accent')}
          />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{t.title}</div>
            {t.body && <div className="text-xs text-ink-3 mt-0.5 break-words">{t.body}</div>}
            {t.action && (
              <button className="mt-1.5 text-xs font-semibold text-accent hover:underline" onClick={() => { t.action?.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
          </div>
          <button className="icon-btn !h-7 !w-7 -mr-2 -mt-1" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            <CloseIcon size={14} />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  )
}

/** Number that flashes green/red when it changes. */
export function LiveNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const prev = useRef(value)
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  useEffect(() => {
    if (value !== prev.current) {
      setFlash(value > prev.current ? 'up' : 'down')
      prev.current = value
      const t = setTimeout(() => setFlash(null), 700)
      return () => clearTimeout(t)
    }
  }, [value])
  return (
    <span className={cx('mono transition-colors duration-500 rounded px-0.5', flash === 'up' && 'text-long', flash === 'down' && 'text-short', className)}>
      {format(value)}
    </span>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: Array<{ id: T; label: ReactNode }>; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cx('flex gap-1 border-b border-line px-2', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx('relative px-3 py-3 text-sm font-semibold transition-colors', value === t.id ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
        >
          {t.label}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />}
        </button>
      ))}
    </div>
  )
}

export function PageHeader({ title, sub, right, back }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; back?: ReactNode }) {
  return (
    <div className="sticky top-0 z-30 glass border-b border-line">
      <div className="flex items-center gap-3 px-4 h-14">
        {back}
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg font-extrabold tracking-tight truncate leading-tight">{title}</h1>
          {sub && <div className="text-xs text-ink-3 truncate">{sub}</div>}
        </div>
        {right}
      </div>
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 py-0.5 text-[10px] font-semibold text-ink-3 mono">{children}</kbd>
}
