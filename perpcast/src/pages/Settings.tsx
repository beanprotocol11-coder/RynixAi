import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { useTrading, START_BALANCE } from '../store/trading'
import { useSocial } from '../store/social'
import { useNotify } from '../store/notify'
import { Avatar, PageHeader, Modal, ModalHeader, Spinner } from '../components/ui'
import { MobileTopBar, explorerUrl } from '../components/Layout'
import { SunIcon, MoonIcon, LogoutIcon, ExternalIcon, CopyIcon, ShieldIcon, TrashIcon, ImageIcon, XIcon, GlobeIcon } from '../components/Icons'
import { api } from '../lib/api'
import { USERNAME_RE, userPath, type User } from '../lib/social'
import { chainName, findWallet, ROBINHOOD_CHAIN, ROBINHOOD_TESTNET, switchToRobinhoodChain } from '../lib/wallet'
import { cx, usd, shortAddr, fullDate } from '../lib/format'
import { toast } from '../store/notify'

export default function Settings() {
  const me = useAuth((s) => s.user)
  const session = useAuth((s) => s.session)
  const openSignIn = useAuth((s) => s.openSignIn)
  const signOut = useAuth((s) => s.signOut)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const balance = useTrading((s) => s.balance)
  const resetDesk = useTrading((s) => s.reset)
  const follows = useSocial((s) => s.follows)
  const bookmarks = useSocial((s) => s.bookmarks)
  const muted = useSocial((s) => s.muted)
  const toggleMute = useSocial((s) => s.toggleMute)
  const clearNotifs = useNotify((s) => s.clear)
  const [wipe, setWipe] = useState(false)
  const [revealAddr, setRevealAddr] = useState(false)
  const local = api().mode === 'local'

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast({ kind: 'success', title: 'Copied' }))

  const isEmail = session?.walletId === 'email'
  const onRobinhood = session ? session.chainId === ROBINHOOD_CHAIN.id || session.chainId === ROBINHOOD_TESTNET.id : false
  const switchChain = async () => {
    if (!session) return
    const w = findWallet(session.walletId)
    if (!w) {
      toast({ kind: 'error', title: 'Wallet not detected', body: `Open ${session.walletName} and switch to Robinhood Chain (chain ID ${ROBINHOOD_CHAIN.id}).` })
      return
    }
    try {
      await switchToRobinhoodChain(w.provider)
      toast({ kind: 'success', title: 'Switched to Robinhood Chain' })
    } catch (e) {
      toast({ kind: 'error', title: 'Could not switch network', body: e instanceof Error ? e.message : 'Rejected in wallet' })
    }
  }

  const wipeAll = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('perpcast:'))
      .forEach((k) => localStorage.removeItem(k))
    location.href = '/'
  }

  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">Settings</span>} />
      <div className="hidden md:block">
        <PageHeader title="Settings" sub="Account, appearance and data" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <Section title="Account">
          {me && session ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar src={me.pfp} name={me.displayName || me.username} seed={me.id} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{me.displayName || me.username}</div>
                  <div className="truncate text-sm text-ink-3">@{me.username}</div>
                </div>
                <Link to={userPath(me)} className="btn btn-ghost !py-2">
                  View profile
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm [&>dt]:text-ink-3">
                <dt>{isEmail ? 'Sign-in' : 'Wallet'}</dt>
                <dd>{session.walletName}</dd>
                {isEmail ? (
                  <>
                    <dt>Wallet</dt>
                    <dd className="text-ink-3">Not connected — connect one from Trade or Launch for on-chain actions</dd>
                  </>
                ) : (
                  <>
                    <dt>Address</dt>
                    <dd className="mono flex items-center gap-2">
                      <button className="chip !py-0 !text-[11px]" onClick={() => setRevealAddr((v) => !v)}>
                        {revealAddr ? shortAddr(me.address) : 'Hidden · tap to reveal'}
                      </button>
                      <button className="icon-btn !h-6 !w-6" onClick={() => copy(me.address)} aria-label="Copy address">
                        <CopyIcon size={13} />
                      </button>
                      <a className="icon-btn !h-6 !w-6" href={explorerUrl(session.chainId, me.address)} target="_blank" rel="noreferrer noopener" aria-label="View on explorer">
                        <ExternalIcon size={13} />
                      </a>
                    </dd>
                  </>
                )}
                {!isEmail && <dt>Network</dt>}
                {!isEmail && <dd className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    {onRobinhood && <img src="/robinhood-chain.png" alt="" width={14} height={14} className="rounded-sm" />}
                    {chainName(session.chainId)}
                  </span>
                  {!onRobinhood && (
                    <button className="btn btn-ghost !py-1 !px-2 gap-1.5 text-xs" onClick={() => void switchChain()}>
                      <img src="/robinhood-chain.png" alt="" width={12} height={12} className="rounded-sm" /> Switch to Robinhood Chain
                    </button>
                  )}
                </dd>}
                <dt>Signed in</dt>
                <dd>{fullDate(session.signedInAt)}</dd>
                <dt>Storage</dt>
                <dd>{local ? 'Offline — this browser only' : 'Perpcast server'}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="btn btn-ghost !py-2 gap-1.5 text-short"
                  onClick={() => {
                    void signOut()
                    toast({ kind: 'info', title: 'Signed out' })
                  }}
                >
                  <LogoutIcon size={15} /> Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-ink-2">You are browsing as a guest. Sign in with your wallet to cast, follow and trade.</span>
              <button className="btn btn-primary !py-2" onClick={() => openSignIn()}>
                Sign in
              </button>
            </div>
          )}
        </Section>

        {me && (
          <Section title="Profile">
            <ProfileForm me={me} />
          </Section>
        )}

        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-2">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} className={cx('flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors', theme === t ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-surface-hover')} onClick={() => setTheme(t)}>
                {t === 'dark' ? <MoonIcon size={16} /> : <SunIcon size={16} />} {t === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </Section>

        <Section title="Trading desk">
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Paper balance <span className="mono font-semibold">{usd(balance)}</span>
              <span className="block text-xs text-ink-3">Simulated USDC on live Hyperliquid marks. Resets to {usd(START_BALANCE)}.</span>
            </span>
            <button className="btn btn-ghost !py-2" onClick={resetDesk}>
              Reset desk
            </button>
          </div>
        </Section>

        <Section title={`Muted accounts (${Object.keys(muted).length})`}>
          {Object.keys(muted).length === 0 ? (
            <div className="text-sm text-ink-3">You haven’t muted anyone.</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.keys(muted).map((id) => (
                <button key={id} className="chip mono" onClick={() => toggleMute(id)}>
                  {shortAddr(id)} · unmute
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Data & privacy">
          <div className="flex items-start gap-3 text-sm text-ink-2">
            <ShieldIcon className="mt-0.5 shrink-0 text-accent" />
            <p>
              {local
                ? 'Perpcast is running in offline mode: your profile, casts, follows and messages are stored in this browser’s localStorage and are not shared with other users.'
                : 'Your profile, casts, follows and messages are stored on the Perpcast server and tied to your wallet address. Signing in never asks for a transaction or gas.'}{' '}
              Bookmarks ({Object.keys(bookmarks).length}), follows ({Object.keys(follows).length}), the paper-trading desk and appearance stay on this device. Prices stream from Hyperliquid.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn btn-ghost !py-2"
              onClick={() => {
                clearNotifs()
                toast({ kind: 'info', title: 'Notifications cleared' })
              }}
            >
              Clear notifications
            </button>
            <button className="btn btn-ghost !py-2 gap-1.5 text-short" onClick={() => setWipe(true)}>
              <TrashIcon size={15} /> Erase local data
            </button>
          </div>
        </Section>

        <div className="pb-6 text-center text-xs text-ink-3">
          Perpcast · market data by Hyperliquid ·{' '}
          <a href="https://www.merps.co/trade" target="_blank" rel="noreferrer" className="hover:text-ink">
            terminal inspired by Merps
          </a>
        </div>
      </div>

      <Modal open={wipe} onClose={() => setWipe(false)} size="sm" label="Erase data">
        <ModalHeader title="Erase local data?" sub="Signs you out and deletes bookmarks, trades, drafts and settings on this device." onClose={() => setWipe(false)} />
        <div className="flex gap-2 px-5 pb-5">
          <button className="btn btn-ghost flex-1" onClick={() => setWipe(false)}>
            Cancel
          </button>
          <button className="btn btn-short flex-1" onClick={wipeAll}>
            Erase everything
          </button>
        </div>
      </Modal>
    </div>
  )
}

function ProfileForm({ me }: { me: User }) {
  const setUser = useAuth((s) => s.setUser)
  const [username, setUsername] = useState(me.username)
  const [displayName, setDisplayName] = useState(me.displayName)
  const [bio, setBio] = useState(me.bio)
  const [pfp, setPfp] = useState(me.pfp)
  const [banner, setBanner] = useState(me.banner ?? '')
  const [twitter, setTwitter] = useState(me.twitter ?? '')
  const [website, setWebsite] = useState(me.website ?? '')
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const onPickBanner = async (file: File | null) => {
    if (bannerFileRef.current) bannerFileRef.current.value = ''
    if (!file) return
    setBannerError(null)
    try {
      setBanner(await bannerDataUrl(file))
    } catch (e) {
      setBannerError((e as Error).message)
    }
  }
  const pfpFileRef = useRef<HTMLInputElement>(null)
  const [pfpError, setPfpError] = useState<string | null>(null)
  const onPickPfp = async (file: File | null) => {
    if (pfpFileRef.current) pfpFileRef.current.value = ''
    if (!file) return
    setPfpError(null)
    try {
      setPfp(await avatarDataUrl(file))
    } catch (e) {
      setPfpError((e as Error).message)
    }
  }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setUsername(me.username)
    setDisplayName(me.displayName)
    setBio(me.bio)
    setPfp(me.pfp)
    setBanner(me.banner ?? '')
    setTwitter(me.twitter ?? '')
    setWebsite(me.website ?? '')
  }, [me])

  const uname = username.trim().toLowerCase()
  const validName = USERNAME_RE.test(uname)
  const handle = twitter.trim().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?(x|twitter)\.com\//i, '').replace(/\/.*$/, '')
  const validHandle = handle === '' || /^[A-Za-z0-9_]{1,15}$/.test(handle)
  const site = website.trim()
  const validSite = site === '' || /^https?:\/\/\S+\.\S+$/.test(site)
  const dirty =
    uname !== me.username ||
    displayName.trim() !== me.displayName ||
    bio.trim() !== me.bio ||
    pfp.trim() !== me.pfp ||
    banner.trim() !== (me.banner ?? '') ||
    handle !== (me.twitter ?? '') ||
    site !== (me.website ?? '')

  const save = async () => {
    if (!validName || !validHandle || !validSite || busy) return
    setBusy(true)
    try {
      const u = await api().updateProfile({ username: uname, displayName: displayName.trim(), bio: bio.trim(), pfp: pfp.trim(), banner: banner.trim(), twitter: handle, website: site })
      setUser(u)
      toast({ kind: 'success', title: 'Profile updated' })
    } catch (e) {
      toast({ kind: 'error', title: 'Could not save profile', body: (e as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <div className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Banner</span>
        <div className="relative h-28 overflow-hidden rounded-xl border border-line bg-bg-2">
          {banner.trim() ? (
            <img src={banner.trim()} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="absolute inset-0 dot-grid opacity-70" />
          )}
          <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-2">
            <input ref={bannerFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickBanner(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-ghost !py-1.5 !text-xs gap-1.5 !bg-black/40 !text-white" onClick={() => bannerFileRef.current?.click()}>
              <ImageIcon size={14} /> Upload banner
            </button>
            {banner && (
              <button type="button" className="icon-btn !bg-black/40 !text-white" title="Remove banner" aria-label="Remove banner" onClick={() => setBanner('')}>
                <TrashIcon size={14} />
              </button>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-ink-3">Recommended 3:1 (e.g. 1500×500). Saved when you press Save profile.</p>
        {bannerError && <p className="mt-1 text-xs text-short">{bannerError}</p>}
      </div>
      <div className="flex items-center gap-4">
        <Avatar src={pfp.trim()} name={displayName || uname} seed={me.id} size={64} />
        <div className="min-w-0 flex-1 text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Avatar</span>
          <div className="flex items-center gap-2">
            <input ref={pfpFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void onPickPfp(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn btn-ghost !py-2 shrink-0 gap-1.5" onClick={() => pfpFileRef.current?.click()}>
              <ImageIcon size={15} /> Upload
            </button>
            <input className="input min-w-0 flex-1" placeholder="or paste https://… (empty = generated)" value={pfp.startsWith('data:') ? '' : pfp} onChange={(e) => setPfp(e.target.value)} />
            {pfp && (
              <button type="button" className="icon-btn shrink-0" title="Remove avatar" aria-label="Remove avatar" onClick={() => setPfp('')}>
                <TrashIcon size={15} />
              </button>
            )}
          </div>
          {pfp.startsWith('data:') && <p className="mt-1 text-xs text-ink-3">Photo from your device — saved when you press Save profile.</p>}
          {pfpError && <p className="mt-1 text-xs text-short">{pfpError}</p>}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Username</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">@</span>
            <input className={cx('input !pl-7', !validName && 'border-short')} value={username} onChange={(e) => setUsername(e.target.value)} maxLength={20} spellCheck={false} />
          </div>
          {!validName && <span className="mt-1 block text-xs text-short">3–20 lowercase letters, numbers or underscores.</span>}
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Display name</span>
          <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder="Your name" />
        </label>
      </div>
      <label className="text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Bio</span>
        <textarea className="input min-h-[72px] resize-y" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} placeholder="What do you trade?" />
        <span className="mt-1 block text-right text-xs text-ink-3">{bio.length}/160</span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">X (Twitter)</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><XIcon size={14} /></span>
            <input className={cx('input !pl-9', !validHandle && 'border-short')} value={twitter} onChange={(e) => setTwitter(e.target.value)} maxLength={60} spellCheck={false} placeholder="username or x.com/username" />
          </div>
          {!validHandle ? (
            <span className="mt-1 block text-xs text-short">1–15 letters, numbers or underscores.</span>
          ) : handle ? (
            <span className="mt-1 block text-xs text-ink-3">Shown on your profile as a link to x.com/{handle}.</span>
          ) : null}
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-3">Website</span>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"><GlobeIcon size={14} /></span>
            <input className={cx('input !pl-9', !validSite && 'border-short')} value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={200} spellCheck={false} placeholder="https://" />
          </div>
          {!validSite && <span className="mt-1 block text-xs text-short">Must start with http:// or https://</span>}
        </label>
      </div>
      <div className="flex justify-end">
        <button type="submit" className="btn btn-primary !py-2" disabled={!dirty || !validName || !validHandle || !validSite || busy}>
          {busy ? <Spinner /> : 'Save profile'}
        </button>
      </div>
    </form>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      {children}
    </section>
  )
}

/** Center-crops an avatar to a 256px square JPEG data URL (fits the 500 KB profile limit). */
function bannerDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const W = Math.min(1200, img.width)
      const H = Math.round(W / 3)
      const srcH = Math.min(img.height, img.width / 3)
      const srcW = srcH * 3
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) {
        reject(new Error('Could not read image'))
        return
      }
      ctx.drawImage(img, (img.width - srcW) / 2, (img.height - srcH) / 2, srcW, srcH, 0, 0, W, H)
      resolve(canvas.toDataURL('image/jpeg', 0.82))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not an image'))
    }
    img.src = url
  })
}

function avatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const out = Math.min(256, side)
      const canvas = document.createElement('canvas')
      canvas.width = out
      canvas.height = out
      const ctx = canvas.getContext('2d')
      URL.revokeObjectURL(url)
      if (!ctx) {
        reject(new Error('Could not read image'))
        return
      }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out)
      resolve(canvas.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file is not an image'))
    }
    img.src = url
  })
}
