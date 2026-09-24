import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Modal, Menu, MenuItem } from './ui'
import { CastText } from './CastText'
import { QuoteCard, PositionCard, castPath } from './CastCard'
import { ChartIcon, ChevronDownIcon, CloseIcon, HashIcon, ImageIcon, GlobeIcon } from './Icons'
import { CHANNELS, channelById, marketOfChannel, type PositionEmbed } from '../lib/social'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { useUI, type ComposerOptions } from '../store/ui'
import { useTrading, unrealized, roe } from '../store/trading'
import { useMarket } from '../store/market'
import { toast, notify } from '../store/notify'
import { cx, usd, pct } from '../lib/format'
import { displaySymbol } from '../lib/hyperliquid'

const MAX = 1024
const MAX_IMAGES = 4
const IMG_MAX_EDGE = 1280

function normalizeImageUrl(raw: string): string | null {
  let u = raw.trim()
  if (!u) return null
  if (/^data:image\//i.test(u)) return u
  if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    if (!parsed.hostname.includes('.')) return null
    return parsed.toString()
  } catch {
    return null
  }
}

function probeImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const t = setTimeout(() => resolve(false), 8000)
    img.onload = () => { clearTimeout(t); resolve(true) }
    img.onerror = () => { clearTimeout(t); resolve(false) }
    img.src = src
  })
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, IMG_MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('Could not read image')); return }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not an image')) }
    img.src = url
  })
}

export function ComposerModal() {
  const opts = useUI((s) => s.composer)
  const close = useUI((s) => s.closeComposer)
  return (
    <Modal open={!!opts} onClose={close} size="md" label="Compose cast">
      {opts && <ComposerBody opts={opts} onDone={close} modal />}
    </Modal>
  )
}

export function ComposerBody({ opts, onDone, modal, autoFocus = true }: { opts: ComposerOptions; onDone?: () => void; modal?: boolean; autoFocus?: boolean }) {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const publish = useSocial((s) => s.publish)
  const nav = useNavigate()
  const [text, setText] = useState(opts.text ?? '')
  const [channelId, setChannelId] = useState<string | null>(opts.channel ?? null)
  const [position, setPosition] = useState<PositionEmbed | undefined>(opts.position)
  const [images, setImages] = useState<string[]>([])
  const [imgInput, setImgInput] = useState<string | null>(null)
  const [imgError, setImgError] = useState<string | null>(null)
  const [imgBusy, setImgBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const positions = useTrading((s) => s.positions)
  const mids = useMarket((s) => s.mids)
  const parentAuthor = opts.parent?.author

  useEffect(() => {
    setText(opts.text ?? '')
    setChannelId(opts.channel ?? null)
    setPosition(opts.position)
    setImages([])
    setImgInput(null)
    setImgError(null)
    if (autoFocus) setTimeout(() => ref.current?.focus(), 30)
  }, [opts, autoFocus])

  const addImage = (src: string) => {
    setImages((a) => (a.includes(src) || a.length >= MAX_IMAGES ? a : [...a, src]))
  }

  const addImageUrl = async () => {
    if (imgBusy) return
    const u = normalizeImageUrl(imgInput ?? '')
    if (!u) {
      setImgError('Paste a full image link, e.g. https://site.com/photo.jpg')
      return
    }
    if (images.length >= MAX_IMAGES) {
      setImgError(`Up to ${MAX_IMAGES} images per cast`)
      return
    }
    setImgBusy(true)
    setImgError(null)
    const ok = await probeImage(u)
    setImgBusy(false)
    if (!ok) {
      setImgError('That link did not load as an image. Use a direct link ending in .jpg/.png/.gif/.webp, or upload from your device.')
      return
    }
    addImage(u)
    setImgInput(null)
  }

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setImgBusy(true)
    setImgError(null)
    try {
      for (const f of Array.from(files).slice(0, MAX_IMAGES - images.length)) {
        if (!f.type.startsWith('image/')) throw new Error(`${f.name} is not an image`)
        addImage(await fileToDataUrl(f))
      }
      setImgInput(null)
    } catch (e) {
      setImgError((e as Error).message)
    } finally {
      setImgBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(360, Math.max(modal ? 120 : 56, el.scrollHeight)) + 'px'
  }, [text, modal])

  const remaining = MAX - text.length
  const canPost = ((text.trim().length > 0 && remaining >= 0) || (!!position && remaining >= 0)) && !busy
  const channel = channelById(channelId)
  const marketRoom = marketOfChannel(channelId)

  const submit = async () => {
    if (!me) return openSignIn('Sign in to cast.')
    if (!canPost) return
    setBusy(true)
    try {
      const cast = await publish({ text: text.trim(), channel: opts.parent ? null : channelId, parentId: opts.parent?.id ?? null, quoteId: opts.quote?.id ?? null, position, images })
      setText('')
      setImages([])
      setPosition(undefined)
      if (opts.parent) {
        toast({ kind: 'success', title: 'Reply posted' })
        notify({ kind: 'reply', title: `You replied to @${parentAuthor?.username ?? 'someone'}`, body: cast.text.slice(0, 80), href: castPath(cast) })
      } else {
        toast({ kind: 'success', title: 'Cast published', body: channel ? `Posted in /${channel.id}` : marketRoom ? `Posted in $${displaySymbol(marketRoom)} room` : 'Posted to your feed', action: { label: 'View', onClick: () => nav(castPath(cast)) } })
        notify({ kind: 'cast', title: 'Your cast is live', body: cast.text.slice(0, 80), href: castPath(cast) })
      }
      onDone?.()
    } catch (e) {
      toast({ kind: 'error', title: 'Could not publish', body: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const livePositions = useMemo(
    () =>
      positions.map((p) => {
        const mark = mids[p.coin] ?? p.entry
        return { p, mark, pnl: unrealized(p, mark), r: roe(p, mark) }
      }),
    [positions, mids],
  )

  return (
    <div className={cx(modal && 'px-4 pb-4 pt-3')}>
      {modal && (
        <div className="flex items-center justify-between pb-2">
          <button className="icon-btn" onClick={onDone} aria-label="Close">
            <CloseIcon size={18} />
          </button>
          <span className="font-display font-bold">{opts.parent ? 'Reply' : opts.quote ? 'Quote cast' : 'New cast'}</span>
          <span className="w-9" />
        </div>
      )}

      {opts.parent && (
        <div className="mb-3 rounded-2xl border border-line bg-surface-2/60 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Avatar src={parentAuthor?.pfp} name={parentAuthor?.displayName || parentAuthor?.username} seed={parentAuthor?.id} size={22} />
            <span className="font-bold">{parentAuthor?.displayName || parentAuthor?.username}</span>
            <span className="text-ink-3">@{parentAuthor?.username}</span>
          </div>
          <div className="mt-1.5 text-sm text-ink-2 line-clamp-4">
            <CastText text={opts.parent.text} className="!text-sm" />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Avatar src={me?.pfp} name={me?.displayName || me?.username} seed={me?.id} size={40} />
        <div className="min-w-0 flex-1">
          <textarea
            ref={ref}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => !me && openSignIn('Sign in to cast.')}
            placeholder={opts.parent ? 'Cast your reply' : opts.quote ? 'Add a comment' : "What's happening in the markets?"}
            className="w-full resize-none bg-transparent text-[16px] leading-relaxed placeholder:text-ink-3 focus:outline-none py-2"
            maxLength={MAX + 200}
            rows={1}
          />

          {position && (
            <div className="relative">
              <PositionCard pos={position} />
              <button className="icon-btn absolute -right-2 -top-2 !h-7 !w-7 bg-surface border border-line shadow" onClick={() => setPosition(undefined)} aria-label="Remove position">
                <CloseIcon size={14} />
              </button>
            </div>
          )}

          {images.length > 0 && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              {images.map((src) => (
                <div key={src} className="relative overflow-hidden rounded-xl border border-line">
                  <img src={src} alt="" className="aspect-video w-full object-cover" />
                  <button className="icon-btn absolute right-1.5 top-1.5 !h-7 !w-7 bg-black/60 text-white" onClick={() => setImages((a) => a.filter((x) => x !== src))} aria-label="Remove image">
                    <CloseIcon size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPickFiles(e.target.files)} />

          {imgInput !== null && (
            <form
              className="mt-2 rounded-2xl border border-line bg-surface-2/60 p-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                void addImageUrl()
              }}
            >
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={cx('input !py-2 text-sm flex-1', imgError && '!border-short')}
                  placeholder="Paste image link (https://…)"
                  value={imgInput}
                  onChange={(e) => { setImgInput(e.target.value); setImgError(null) }}
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  aria-invalid={!!imgError}
                />
                <div className="flex gap-2">
                  <button type="submit" className="btn btn-ink !py-2 text-sm flex-1 sm:flex-none" disabled={imgBusy}>
                    {imgBusy ? 'Checking…' : 'Add link'}
                  </button>
                  <button type="button" className="btn btn-ghost !py-2 text-sm" onClick={() => { setImgInput(null); setImgError(null) }}>
                    Cancel
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                <button type="button" className="chip !py-1" onClick={() => fileRef.current?.click()} disabled={imgBusy}>
                  <ImageIcon size={13} /> Upload from device
                </button>
                <span>{images.length}/{MAX_IMAGES} images · JPG, PNG, GIF, WEBP</span>
              </div>
              {imgError && (
                <p className="mt-2 text-xs text-short" role="alert">
                  {imgError}
                </p>
              )}
            </form>
          )}

          {opts.quote && <QuoteCard cast={opts.quote} />}

          <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
            {!opts.parent && (
              <Menu
                align="left"
                trigger={() => (
                  <button className="chip chip-active !py-1.5 gap-1.5 max-w-[190px]" type="button">
                    {channel ? <HashIcon size={14} /> : marketRoom ? <ChartIcon size={14} /> : <GlobeIcon size={14} />}
                    <span className="truncate">{channel ? `/${channel.id}` : marketRoom ? `$${displaySymbol(marketRoom)} room` : 'Home'}</span>
                    <ChevronDownIcon size={14} />
                  </button>
                )}
              >
                {(close) => (
                  <div className="max-h-72 overflow-auto">
                    <MenuItem icon={<GlobeIcon />} onClick={() => { setChannelId(null); close() }}>
                      Home feed
                    </MenuItem>
                    {CHANNELS.map((c) => (
                      <MenuItem key={c.id} icon={<HashIcon />} onClick={() => { setChannelId(c.id); close() }}>
                        /{c.id}
                      </MenuItem>
                    ))}
                    {marketRoom && (
                      <MenuItem icon={<ChartIcon />} onClick={close}>
                        ${displaySymbol(marketRoom)} room (current)
                      </MenuItem>
                    )}
                  </div>
                )}
              </Menu>
            )}
            <button className={cx('icon-btn text-accent', imgInput !== null && 'bg-accent/10')} type="button" title="Add image" aria-label="Add image" onClick={() => { setImgError(null); setImgInput((v) => (v === null ? '' : null)) }}>
              <ImageIcon size={19} />
            </button>
            <Menu
              align="left"
              trigger={() => (
                <button className="icon-btn text-accent" type="button" title="Share a position" aria-label="Share a position">
                  <ChartIcon size={19} />
                </button>
              )}
            >
              {(close) => (
                <div className="max-h-72 w-72 overflow-auto">
                  {livePositions.length === 0 && (
                    <div className="px-3 py-3 text-sm text-ink-3">
                      No open positions yet.{' '}
                      <button className="text-accent font-medium" onClick={() => { close(); onDone?.(); nav('/trade') }}>
                        Open one →
                      </button>
                    </div>
                  )}
                  {livePositions.map(({ p, mark, pnl, r }) => (
                    <MenuItem
                      key={p.id}
                      onClick={() => {
                        setPosition({ coin: p.coin, side: p.side, leverage: p.leverage, entry: p.entry, size: p.size, pnl, pnlPct: r })
                        close()
                      }}
                    >
                      <span className={cx('badge', p.side === 'long' ? 'badge-long' : 'badge-short')}>{p.side}</span>
                      <span className="font-bold">{displaySymbol(p.coin)}</span>
                      <span className="mono text-xs text-ink-3">{p.leverage}x</span>
                      <span className={cx('ml-auto mono text-xs', pnl >= 0 ? 'text-long' : 'text-short')}>
                        {usd(pnl, { sign: true })} ({pct(r)})
                      </span>
                      <span className="sr-only">{usd(mark)}</span>
                    </MenuItem>
                  ))}
                </div>
              )}
            </Menu>
            <div className="ml-auto flex items-center gap-3">
              <CharRing used={text.length} max={MAX} />
              <button className="btn btn-primary !py-2 !px-5" disabled={!canPost} onClick={() => void submit()} type="button">
                {busy ? 'Posting…' : opts.parent ? 'Reply' : 'Cast'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CharRing({ used, max }: { used: number; max: number }) {
  const r = 9
  const c = 2 * Math.PI * r
  const p = Math.min(1, used / max)
  const over = used > max
  const warn = max - used <= 50
  if (used === 0) return null
  return (
    <span className="flex items-center gap-1.5">
      {warn && <span className={cx('mono text-xs', over ? 'text-short' : 'text-ink-3')}>{max - used}</span>}
      <svg width="24" height="24" viewBox="0 0 24 24" className="-rotate-90">
        <circle cx="12" cy="12" r={r} stroke="var(--border-strong)" strokeWidth="2.5" fill="none" />
        <circle cx="12" cy="12" r={r} stroke={over ? 'var(--short)' : warn ? 'var(--accent-3)' : 'var(--accent)'} strokeWidth="2.5" fill="none" strokeDasharray={c} strokeDashoffset={c * (1 - p)} strokeLinecap="round" />
      </svg>
    </span>
  )
}
