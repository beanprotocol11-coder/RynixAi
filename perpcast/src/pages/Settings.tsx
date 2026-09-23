import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import { useUI } from '../store/ui'
import { useTrading, START_BALANCE } from '../store/trading'
import { useSocial } from '../store/social'
import { useNotify } from '../store/notify'
import { useDMs } from '../store/dm'
import { Avatar, PageHeader, Modal, ModalHeader } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { SunIcon, MoonIcon, LogoutIcon, ExternalIcon, CopyIcon, ShieldIcon, TrashIcon } from '../components/Icons'
import { cx, usd, shortAddr } from '../lib/format'
import { toast } from '../store/notify'

export default function Settings() {
  const me = useAuth((s) => s.user)
  const openSignIn = useAuth((s) => s.openSignIn)
  const signOut = useAuth((s) => s.signOut)
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const balance = useTrading((s) => s.balance)
  const resetDesk = useTrading((s) => s.reset)
  const casts = useSocial((s) => s.casts)
  const follows = useSocial((s) => s.follows)
  const muted = useSocial((s) => s.mutedFids)
  const toggleMute = useSocial((s) => s.toggleMute)
  const clearNotifs = useNotify((s) => s.clear)
  const threads = useDMs((s) => s.threads)
  const [wipe, setWipe] = useState(false)

  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => toast({ kind: 'success', title: 'Copied' }))

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
          {me ? (
            <>
              <div className="flex items-center gap-3">
                <Avatar src={me.pfp} name={me.displayName} fid={me.fid} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{me.displayName}</div>
                  <div className="truncate text-sm text-ink-3">@{me.username}</div>
                </div>
                <Link to={`/u/${me.username}`} className="btn btn-ghost !py-2">
                  View profile
                </Link>
              </div>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm [&>dt]:text-ink-3">
                <dt>Signed in with</dt>
                <dd className="capitalize">{me.method === 'farcaster' ? 'Farcaster (Sign in with Farcaster)' : 'Ethereum wallet'}</dd>
                {me.fid > 0 && (
                  <>
                    <dt>FID</dt>
                    <dd className="mono">{me.fid}</dd>
                  </>
                )}
                {me.address && (
                  <>
                    <dt>Address</dt>
                    <dd className="mono flex items-center gap-2">
                      {shortAddr(me.address)}
                      <button className="icon-btn !h-6 !w-6" onClick={() => copy(me.address!)} aria-label="Copy address">
                        <CopyIcon size={13} />
                      </button>
                    </dd>
                  </>
                )}
                {me.verifications && me.verifications.length > 0 && (
                  <>
                    <dt>Verified addresses</dt>
                    <dd className="mono flex flex-col gap-1">
                      {me.verifications.map((v) => (
                        <span key={v}>{shortAddr(v)}</span>
                      ))}
                    </dd>
                  </>
                )}
                <dt>Session started</dt>
                <dd>{new Date(me.signedInAt).toLocaleString()}</dd>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2">
                {me.method === 'farcaster' && (
                  <a className="btn btn-ghost !py-2 gap-1.5" href={`https://warpcast.com/${me.username}`} target="_blank" rel="noreferrer">
                    Warpcast <ExternalIcon size={13} />
                  </a>
                )}
                <button className="btn btn-ghost !py-2 gap-1.5 text-short" onClick={() => { signOut(); toast({ kind: 'info', title: 'Signed out' }) }}>
                  <LogoutIcon size={15} /> Sign out
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-ink-2">You are browsing as a guest. Sign in to cast, follow and trade.</span>
              <button className="btn btn-primary !py-2" onClick={() => openSignIn()}>
                Sign in
              </button>
            </div>
          )}
        </Section>

        <Section title="Appearance">
          <div className="grid grid-cols-2 gap-2">
            {(['dark', 'light'] as const).map((t) => (
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
              {Object.keys(muted).map((f) => (
                <button key={f} className="chip" onClick={() => toggleMute(Number(f))}>
                  fid {f} · unmute
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Data & privacy">
          <div className="flex items-start gap-3 text-sm text-ink-2">
            <ShieldIcon className="mt-0.5 shrink-0 text-accent" />
            <p>
              Perpcast runs fully in your browser. Your casts ({casts.length}), follows ({Object.keys(follows).length}), messages ({threads.length}) and trades are stored in this device’s localStorage — no account server. Public feed data is
              read from Farcaster hubs; prices stream from Hyperliquid.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn btn-ghost !py-2" onClick={() => { clearNotifs(); toast({ kind: 'info', title: 'Notifications cleared' }) }}>
              Clear notifications
            </button>
            <button className="btn btn-ghost !py-2 gap-1.5 text-short" onClick={() => setWipe(true)}>
              <TrashIcon size={15} /> Erase all local data
            </button>
          </div>
        </Section>

        <div className="pb-6 text-center text-xs text-ink-3">
          Perpcast · built on Farcaster + Hyperliquid data ·{' '}
          <a href="https://www.merps.co/trade" target="_blank" rel="noreferrer" className="hover:text-ink">
            inspired by Merps
          </a>
        </div>
      </div>

      <Modal open={wipe} onClose={() => setWipe(false)} size="sm" label="Erase data">
        <ModalHeader title="Erase all local data?" sub="Signs you out and deletes casts, messages, trades and settings on this device." onClose={() => setWipe(false)} />
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-3">{title}</h2>
      {children}
    </section>
  )
}
