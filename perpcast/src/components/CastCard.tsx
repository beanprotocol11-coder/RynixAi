import { memo, useMemo, type MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Menu, MenuItem } from './ui'
import { CastText } from './CastText'
import { BookmarkIcon, CopyIcon, ExternalIcon, HeartIcon, LinkIcon, MoreIcon, RecastIcon, ReplyIcon, ShareIcon, TrashIcon, TrendDownIcon, TrendUpIcon, ChartIcon } from './Icons'
import { channelById, castPath, extractLinks, isImageUrl, marketOfChannel, userPath, type Cast, type PositionEmbed } from '../lib/social'
import { useCast, useSocial } from '../store/social'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { toast, notify } from '../store/notify'
import { cx, timeAgo, fullDate, usd, pct, compact } from '../lib/format'
import { useMarket } from '../store/market'
import { displaySymbol } from '../lib/hyperliquid'
import { CoinLogo } from './CoinLogo'

export { castPath }

interface Props {
  cast: Cast
  compact?: boolean
  detail?: boolean
  hideThreadLine?: boolean
  showParentContext?: boolean
  onDeleted?: () => void
}

export const CastCard = memo(function CastCard({ cast: seed, compact: dense, detail, showParentContext = true, onDeleted }: Props) {
  const nav = useNavigate()
  const cast = useCast(seed)
  const user = cast.author
  const bookmarked = useSocial((s) => !!s.bookmarks[cast.id])
  const toggleLike = useSocial((s) => s.toggleLike)
  const toggleRecast = useSocial((s) => s.toggleRecast)
  const toggleBookmark = useSocial((s) => s.toggleBookmark)
  const remove = useSocial((s) => s.remove)
  const hide = useSocial((s) => s.hide)
  const toggleMute = useSocial((s) => s.toggleMute)
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const openComposer = useUI((s) => s.openComposer)

  const channel = channelById(cast.channel)
  const marketRoom = marketOfChannel(cast.channel)
  const textLinks = useMemo(() => extractLinks(cast.text), [cast.text])
  const images = useMemo(() => [...cast.images, ...textLinks.filter(isImageUrl)], [cast.images, textLinks])
  const links = useMemo(() => textLinks.filter((u) => !isImageUrl(u)).slice(0, 2), [textLinks])
  const isMine = !!me && cast.author.id === me.id

  const requireAuth = (fn: () => void) => {
    if (!me) return openSignIn('Sign in to like, reply and recast.')
    fn()
  }

  const onCardClick = (e: MouseEvent) => {
    if (detail) return
    const target = e.target as HTMLElement
    if (target.closest('a,button,img,video')) return
    nav(castPath(cast))
  }

  const shareUrl = `${location.origin}${castPath(cast)}`
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${user.displayName} on Perpcast`, text: cast.text.slice(0, 120), url: shareUrl })
        return
      } catch {
        /* cancelled */
      }
    }
    await navigator.clipboard.writeText(shareUrl)
    toast({ kind: 'info', title: 'Link copied' })
  }

  return (
    <article className={cx('group relative border-b border-line transition-colors', !detail && 'hover:bg-surface-hover/40 cursor-pointer', dense ? 'px-4 py-3' : 'px-4 py-3.5')} onClick={onCardClick}>
      <div className="flex gap-3">
        <Link to={userPath(user)} className="shrink-0 self-start" onClick={(e) => e.stopPropagation()}>
          <Avatar src={user.pfp} name={user.displayName || user.username} seed={user.id} size={detail ? 46 : 40} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className={cx('min-w-0 flex-1 flex flex-wrap items-center gap-x-1.5 text-[15px]', detail && 'flex-col !items-start gap-0')}>
              <Link to={userPath(user)} className="font-bold truncate max-w-[220px] hover:underline" onClick={(e) => e.stopPropagation()}>
                {user.displayName || user.username}
              </Link>
              <span className="text-ink-3 truncate max-w-[180px] text-sm">@{user.username}</span>
              {!detail && (
                <>
                  <span className="text-ink-3 text-sm">·</span>
                  <time className="text-ink-3 text-sm" title={fullDate(cast.timestamp)}>
                    {timeAgo(cast.timestamp)}
                  </time>
                </>
              )}
              {channel && !detail && (
                <Link to={`/channel/${channel.id}`} className="ml-0.5 text-sm text-ink-3 hover:text-accent" onClick={(e) => e.stopPropagation()}>
                  in <span className="font-medium">/{channel.id}</span>
                </Link>
              )}
              {marketRoom && !detail && (
                <Link to={`/trade/${encodeURIComponent(marketRoom)}`} className="ml-0.5 text-sm text-ink-3 hover:text-accent" onClick={(e) => e.stopPropagation()}>
                  in <span className="font-medium">${displaySymbol(marketRoom)} room</span>
                </Link>
              )}
            </div>
            <div className="-mr-2 -mt-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
              <Menu
                trigger={() => (
                  <button className="icon-btn !h-8 !w-8 opacity-60 group-hover:opacity-100" aria-label="More">
                    <MoreIcon size={18} />
                  </button>
                )}
              >
                {(close) => (
                  <>
                    <MenuItem icon={<CopyIcon />} onClick={() => { void navigator.clipboard.writeText(shareUrl); toast({ kind: 'info', title: 'Link copied' }); close() }}>
                      Copy link
                    </MenuItem>
                    <MenuItem icon={<CopyIcon />} onClick={() => { void navigator.clipboard.writeText(cast.text); toast({ kind: 'info', title: 'Text copied' }); close() }}>
                      Copy text
                    </MenuItem>
                    <MenuItem icon={<BookmarkIcon />} onClick={() => { const on = toggleBookmark(cast.id); toast({ kind: 'info', title: on ? 'Saved to bookmarks' : 'Removed from bookmarks' }); close() }}>
                      {bookmarked ? 'Remove bookmark' : 'Bookmark'}
                    </MenuItem>
                    {isMine ? (
                      <MenuItem
                        icon={<TrashIcon />}
                        danger
                        onClick={() => {
                          close()
                          remove(cast.id)
                            .then(() => { toast({ kind: 'info', title: 'Cast deleted' }); onDeleted?.() })
                            .catch((e: Error) => toast({ kind: 'error', title: e.message }))
                        }}
                      >
                        Delete cast
                      </MenuItem>
                    ) : (
                      <>
                        <MenuItem onClick={() => { hide(cast.id); toast({ kind: 'info', title: 'Cast hidden' }); close() }}>Hide this cast</MenuItem>
                        <MenuItem danger onClick={() => { toggleMute(user.id); toast({ kind: 'info', title: `Muted @${user.username}` }); close() }}>
                          Mute @{user.username}
                        </MenuItem>
                      </>
                    )}
                  </>
                )}
              </Menu>
            </div>
          </div>

          {showParentContext && cast.parentId && !detail && (
            <div className="text-sm text-ink-3 mt-0.5">
              Replying to{' '}
              {cast.parentAuthor ? (
                <Link to={userPath(cast.parentAuthor)} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                  @{cast.parentAuthor.username}
                </Link>
              ) : (
                <Link to={castPath({ id: cast.parentId })} className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                  a cast
                </Link>
              )}
            </div>
          )}

          <div className={cx('mt-1', detail && 'mt-3 text-[17px]')}>
            <CastText text={cast.text} clamp={!detail} className={detail ? '!text-[17px] !leading-relaxed' : ''} />
          </div>

          {cast.position && <PositionCard pos={cast.position} />}

          {images.length > 0 && (
            <div className={cx('mt-3 grid gap-1.5 overflow-hidden rounded-2xl border border-line', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
              {images.slice(0, 4).map((src, i) => (
                <a key={i} href={src} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="block bg-surface-2">
                  <img src={src} alt="" loading="lazy" className={cx('w-full object-cover', images.length > 1 ? 'aspect-square' : 'max-h-[520px]')} onError={(e) => ((e.target as HTMLImageElement).parentElement!.style.display = 'none')} />
                </a>
              ))}
            </div>
          )}

          {links.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm hover:bg-surface-hover transition-colors">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface text-ink-3">
                <LinkIcon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{safeHost(url)}</span>
                <span className="block truncate text-xs text-ink-3">{url}</span>
              </span>
              <ExternalIcon size={14} className="text-ink-3 shrink-0" />
            </a>
          ))}

          {cast.quote && <QuoteCard cast={cast.quote} />}
          {cast.quoteId && !cast.quote && <div className="mt-3 rounded-2xl border border-dashed border-line p-3 text-sm text-ink-3">This cast was deleted</div>}

          {detail && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-ink-3 border-b border-line pb-3">
              <time title={fullDate(cast.timestamp)}>{fullDate(cast.timestamp)}</time>
              {channel && (
                <>
                  <span>·</span>
                  <Link to={`/channel/${channel.id}`} className="hover:text-accent">
                    /{channel.id}
                  </Link>
                </>
              )}
              {marketRoom && (
                <>
                  <span>·</span>
                  <Link to={`/trade/${encodeURIComponent(marketRoom)}`} className="hover:text-accent">
                    ${displaySymbol(marketRoom)} room
                  </Link>
                </>
              )}
            </div>
          )}

          <div className={cx('mt-2 -ml-2 flex items-center justify-between max-w-md', detail && 'mt-3')} onClick={(e) => e.stopPropagation()}>
            <ActionBtn icon={<ReplyIcon size={18} />} count={cast.replies} label="Reply" onClick={() => requireAuth(() => openComposer({ parent: cast }))} />
            <ActionBtn
              icon={<RecastIcon size={18} />}
              count={cast.recasts}
              label="Recast"
              active={cast.recasted}
              activeClass="text-long"
              onClick={() =>
                requireAuth(() => {
                  void toggleRecast(cast).then((on) => {
                    toast({ kind: on ? 'success' : 'info', title: on ? 'Recasted' : 'Recast removed' })
                    if (on) notify({ kind: 'recast', title: `You recasted @${user.username}`, body: cast.text.slice(0, 80), href: castPath(cast) })
                  })
                })
              }
              menu={(close) => (
                <MenuItem icon={<ReplyIcon />} onClick={() => { close(); requireAuth(() => openComposer({ quote: cast })) }}>
                  Quote cast
                </MenuItem>
              )}
            />
            <ActionBtn
              icon={<HeartIcon size={18} filled={cast.liked} />}
              count={cast.likes}
              label="Like"
              active={cast.liked}
              activeClass="text-short"
              onClick={() =>
                requireAuth(() => {
                  void toggleLike(cast).then((on) => {
                    if (on) notify({ kind: 'like', title: `You liked @${user.username}'s cast`, body: cast.text.slice(0, 80), href: castPath(cast) })
                  })
                })
              }
            />
            <ActionBtn icon={<BookmarkIcon size={18} filled={bookmarked} />} label="Bookmark" active={bookmarked} activeClass="text-accent" onClick={() => requireAuth(() => { const on = toggleBookmark(cast.id); toast({ kind: 'info', title: on ? 'Saved to bookmarks' : 'Removed from bookmarks' }) })} />
            <ActionBtn icon={<ShareIcon size={18} />} label="Share" onClick={() => void share()} />
          </div>
        </div>
      </div>
    </article>
  )
})

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ActionBtn({ icon, count, label, active, activeClass, onClick, menu }: { icon: React.ReactNode; count?: number; label: string; active?: boolean; activeClass?: string; onClick: () => void; menu?: (close: () => void) => React.ReactNode }) {
  const btn = (
    <button
      className={cx('flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] font-medium text-ink-3 transition-colors hover:bg-surface-hover hover:text-ink active:scale-95', active && activeClass)}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {icon}
      {count !== undefined && count > 0 && <span className="mono text-xs">{compact(count)}</span>}
    </button>
  )
  if (!menu) return btn
  return (
    <div className="flex items-center">
      {btn}
      <Menu trigger={() => <button className="icon-btn !h-6 !w-5 -ml-1.5 text-ink-3" aria-label={`${label} options`}><MoreIcon size={12} /></button>}>{menu}</Menu>
    </div>
  )
}

export function QuoteCard({ cast }: { cast: Cast }) {
  const nav = useNavigate()
  const user = cast.author
  const img = cast.images[0] ?? extractLinks(cast.text).find(isImageUrl)
  return (
    <div
      className="mt-3 rounded-2xl border border-line bg-surface-2/60 p-3 transition-colors hover:bg-surface-hover cursor-pointer"
      onClick={(e) => {
        e.stopPropagation()
        nav(castPath(cast))
      }}
    >
      <div className="flex items-center gap-2 text-sm">
        <Avatar src={user.pfp} name={user.displayName || user.username} seed={user.id} size={20} />
        <span className="font-bold truncate">{user.displayName || user.username}</span>
        <span className="text-ink-3 truncate">@{user.username}</span>
        <span className="text-ink-3">· {timeAgo(cast.timestamp)}</span>
      </div>
      <div className="mt-1.5 text-sm line-clamp-4 whitespace-pre-wrap break-words text-ink-2">{cast.text}</div>
      {cast.position && <PositionCard pos={cast.position} small />}
      {img && <img src={img} alt="" className="mt-2 max-h-56 w-full rounded-xl object-cover" loading="lazy" />}
    </div>
  )
}

export function PositionCard({ pos, small }: { pos: PositionEmbed; small?: boolean }) {
  const mid = useMarket((s) => s.mids[pos.coin])
  const livePnl = mid ? (pos.side === 'long' ? (mid - pos.entry) * pos.size : (pos.entry - mid) * pos.size) : pos.pnl
  const margin = (pos.entry * pos.size) / pos.leverage
  const livePct = livePnl !== undefined && margin > 0 ? (livePnl / margin) * 100 : pos.pnlPct
  const up = (livePnl ?? 0) >= 0
  const sym = displaySymbol(pos.coin)
  return (
    <Link
      to={`/trade/${encodeURIComponent(pos.coin)}`}
      onClick={(e) => e.stopPropagation()}
      className={cx('mt-3 flex items-center gap-3 rounded-2xl border p-3 transition-colors hover:bg-surface-hover', pos.side === 'long' ? 'border-long/30 bg-long-soft/40' : 'border-short/30 bg-short-soft/40', small && 'p-2.5')}
    >
      <CoinLogo coin={pos.coin} size={40} rounded="xl" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cx('badge', pos.side === 'long' ? 'badge-long' : 'badge-short')}>{pos.side}</span>
          <span className="font-bold">{sym}-PERP</span>
          <span className="mono text-xs text-ink-3">{pos.leverage.toFixed(0)}x</span>
        </span>
        <span className="mt-0.5 block text-xs text-ink-3 mono">
          Entry {usd(pos.entry)} · Size {pos.size} {sym}
        </span>
      </span>
      <span className="text-right">
        <span className={cx('flex items-center justify-end gap-1 font-bold mono', up ? 'text-long' : 'text-short')}>
          {up ? <TrendUpIcon size={14} /> : <TrendDownIcon size={14} />}
          {livePnl !== undefined ? usd(livePnl, { sign: true }) : '—'}
        </span>
        <span className={cx('block text-xs mono', up ? 'text-long' : 'text-short')}>{livePct !== undefined ? pct(livePct) : ''}</span>
      </span>
      <ChartIcon size={16} className="text-ink-3 shrink-0" />
    </Link>
  )
}
