import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Avatar, Modal, Menu, MenuItem } from './ui'
import { CastText } from './CastText'
import { QuoteCard, PositionCard, castPath } from './CastCard'
import { ChartIcon, ChevronDownIcon, CloseIcon, HashIcon, ImageIcon, GlobeIcon } from './Icons'
import { CHANNELS, channelByUrl, MARKET_CHANNEL_PREFIX, PERPCAST_CHANNEL_URL, type PositionEmbed } from '../lib/farcaster'
import { useAuth } from '../store/auth'
import { useSocial } from '../store/social'
import { useUI, type ComposerOptions } from '../store/ui'
import { useTrading, unrealized, roe } from '../store/trading'
import { useMarket } from '../store/market'
import { toast, notify } from '../store/notify'
import { cx, usd, pct } from '../lib/format'
import { useUser } from '../hooks/useFarcaster'

const MAX = 1024

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
  const [channelUrl, setChannelUrl] = useState<string | null>(opts.channelUrl ?? null)
  const [position, setPosition] = useState<PositionEmbed | undefined>(opts.position)
  const [images, setImages] = useState<string[]>([])
  const [imgInput, setImgInput] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const positions = useTrading((s) => s.positions)
  const mids = useMarket((s) => s.mids)
  const parentAuthor = useUser(opts.parent?.fid)

  useEffect(() => {
    setText(opts.text ?? '')
    setChannelUrl(opts.channelUrl ?? null)
    setPosition(opts.position)
    setImages([])
    if (autoFocus) setTimeout(() => ref.current?.focus(), 30)
  }, [opts, autoFocus])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = Math.min(360, Math.max(modal ? 120 : 56, el.scrollHeight)) + 'px'
  }, [text, modal])

  const remaining = MAX - text.length
  const canPost = text.trim().length > 0 && remaining >= 0 || (!!position && remaining >= 0)
  const channel = channelByUrl(channelUrl)
  const marketRoom = channelUrl?.startsWith(MARKET_CHANNEL_PREFIX) ? channelUrl.slice(MARKET_CHANNEL_PREFIX.length) : null

  const submit = () => {
    if (!me) return openSignIn('Sign in to cast.')
    if (!canPost) return
    const cast = publish({ author: me, text: text.trim(), channelUrl: opts.parent ? null : channelUrl, parent: opts.parent ?? null, quote: opts.quote ?? null, position, images })
    setText('')
    setImages([])
    setPosition(undefined)
    if (opts.parent) {
      toast({ kind: 'success', title: 'Reply posted' })
      notify({ kind: 'reply', title: `You replied to @${parentAuthor?.username ?? opts.parent.fid}`, body: cast.text.slice(0, 80), href: castPath(cast) })
    } else {
      toast({ kind: 'success', title: 'Cast published', body: channel ? `Posted in /${channel.id}` : marketRoom ? `Posted in $${marketRoom} room` : 'Posted to your feed', action: { label: 'View', onClick: () => nav(castPath(cast)) } })
      notify({ kind: 'cast', title: 'Your cast is live', body: cast.text.slice(0, 80), href: castPath(cast) })
    }
    onDone?.()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      submit()
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
            <Avatar src={parentAuthor?.pfp} name={parentAuthor?.displayName} fid={opts.parent.fid} size={22} />
            <span className="font-bold">{parentAuthor?.displayName ?? '…'}</span>
            <span className="text-ink-3">@{parentAuthor?.username ?? opts.parent.fid}</span>
          </div>
          <div className="mt-1.5 text-sm text-ink-2 line-clamp-4">
            <CastText text={opts.parent.text} className="!text-sm" />
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <Avatar src={me?.pfp} name={me?.displayName ?? me?.username} fid={me?.fid} size={40} />
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

          {imgInput !== null && (
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                const u = imgInput.trim()
                if (!/^https?:\/\//.test(u)) return toast({ kind: 'error', title: 'Enter a valid image URL' })
                setImages((a) => (a.includes(u) || a.length >= 4 ? a : [...a, u]))
                setImgInput(null)
              }}
            >
              <input className="input !py-2 text-sm flex-1" placeholder="Paste image URL (https://…)" value={imgInput} onChange={(e) => setImgInput(e.target.value)} autoFocus />
              <button type="submit" className="btn btn-ink !py-2 text-sm">
                Add
              </button>
              <button type="button" className="btn btn-ghost !py-2 text-sm" onClick={() => setImgInput(null)}>
                Cancel
              </button>
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
                    <span className="truncate">{channel ? `/${channel.id}` : marketRoom ? `$${marketRoom} room` : 'Home'}</span>
                    <ChevronDownIcon size={14} />
                  </button>
                )}
              >
                {(close) => (
                  <div className="max-h-72 overflow-auto">
                    <MenuItem icon={<GlobeIcon />} onClick={() => { setChannelUrl(null); close() }}>
                      Home feed
                    </MenuItem>
                    <MenuItem icon={<HashIcon />} onClick={() => { setChannelUrl(PERPCAST_CHANNEL_URL); close() }}>
                      /perpcast
                    </MenuItem>
                    {CHANNELS.filter((c) => c.url !== PERPCAST_CHANNEL_URL).map((c) => (
                      <MenuItem key={c.id} icon={<HashIcon />} onClick={() => { setChannelUrl(c.url); close() }}>
                        /{c.id}
                      </MenuItem>
                    ))}
                    {marketRoom && (
                      <MenuItem icon={<ChartIcon />} onClick={close}>
                        ${marketRoom} room (current)
                      </MenuItem>
                    )}
                  </div>
                )}
              </Menu>
            )}
            <button className="icon-btn text-accent" type="button" title="Add image" aria-label="Add image" onClick={() => setImgInput((v) => (v === null ? '' : null))}>
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
                      <span className="font-bold">{p.coin}</span>
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
              <button className="btn btn-primary !py-2 !px-5" disabled={!canPost} onClick={submit} type="button">
                {opts.parent ? 'Reply' : 'Cast'}
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
