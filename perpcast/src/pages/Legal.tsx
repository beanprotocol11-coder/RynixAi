import { Link, useLocation } from 'react-router-dom'
import { PageHeader } from '../components/ui'
import { MobileTopBar } from '../components/Layout'
import { cx } from '../lib/format'

const UPDATED = 'September 26, 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 font-display text-lg font-extrabold">{title}</h2>
      <div className="space-y-2 text-[15px] leading-relaxed text-ink-2">{children}</div>
    </section>
  )
}

function Privacy() {
  return (
    <>
      <Section title="What we store">
        <p>
          Perpcast stores the minimum needed to run a social feed: your username, display name, avatar, banner, bio and links, the
          casts, replies, likes, recasts and follows you create, and either the wallet address or the email address you sign in with.
          Wallet addresses are never shown publicly on your profile, in search, in notifications or in the sign-in flow. Email and Google
          sign-ins are matched to your account by email address only; passwords are never used or stored.
        </p>
      </Section>
      <Section title="Direct messages are end-to-end encrypted">
        <p>
          When you first sign in on a device, Perpcast generates an X25519 key pair in your browser. The private key stays on that device
          and is never sent to us; only the public key is published so other users can encrypt to you. Every message is sealed on your
          device (XChaCha20-Poly1305, key derived from the X25519 shared secret) before it leaves the browser.
        </p>
        <p>
          Our servers store and relay <strong>ciphertext only</strong>. Perpcast, Cloudflare, or anyone with database access cannot read
          your messages. The trade-off is real: a message sealed on your phone can only be opened on that phone. Other devices will show
          "Encrypted for another device", and if you clear your browser data the key is gone and past messages cannot be recovered by us.
        </p>
      </Section>
      <Section title="Sign-in with X, Google and email codes">
        <p>
          X sign-in uses X's OAuth 2.0 (read-only scopes: users.read, tweet.read). We keep only your X user ID, handle, name and avatar URL,
          never post on your behalf, and discard the access token after reading your profile. Email codes are six digits, hashed before
          storage, expire after ten minutes and are single use. We send them via Resend from login@perpcast.app. Google sign-in uses Google
          Identity Services; we verify the ID token with Google and keep only your verified email, name and avatar URL.
        </p>
      </Section>
      <Section title="Wallets and on-chain data">
        <p>
          Perpcast is non-custodial. We never ask for, receive or store private keys or seed phrases. Connecting a wallet only lets you sign
          a login message and, when you choose to, submit transactions (token launches, NFT mints) that you approve in your own wallet.
          Balances shown in the app are read directly from public RPCs.
        </p>
      </Section>
      <Section title="Third parties">
        <p>
          Market data comes from Hyperliquid and GeckoTerminal, token and NFT data from Robinhood Chain Blockscout, and the app is served
          by Cloudflare Pages. These providers see ordinary request metadata (IP address, user agent) as any website host does. We do not
          run advertising trackers or sell data.
        </p>
      </Section>
      <Section title="Your controls">
        <p>
          You can edit or clear your profile fields at any time in Settings, sign out of any device, and request account deletion by
          messaging the Perpcast account or emailing login@perpcast.app. Deleting your account removes your profile, casts, follows and
          message ciphertext from our database.
        </p>
      </Section>
    </>
  )
}

function Terms() {
  return (
    <>
      <Section title="Using Perpcast">
        <p>
          Perpcast is a social network for traders. By creating an account you agree to post only content you have the right to share, to
          not impersonate others, and to not use the service for harassment, spam, scams or unlawful activity. We may remove content or
          accounts that break these rules.
        </p>
      </Section>
      <Section title="Trading is simulated; on-chain actions are yours">
        <p>
          The perp terminal on Perpcast is a paper-trading simulation on live market data; no real positions are opened. Token launches,
          NFT mints and any other transaction you sign in your own wallet are real, irreversible on-chain actions performed by you. Perpcast
          never holds funds and cannot reverse transactions.
        </p>
      </Section>
      <Section title="Nothing here is financial advice">
        <p>
          Casts, positions shared by other users, rankings and market data are information, not recommendations. Crypto assets, tokenized
          stocks and RWAs are volatile and you may lose everything you put in. Do your own research.
        </p>
      </Section>
      <Section title="Private messages">
        <p>
          Messages are end-to-end encrypted and we cannot read, moderate or restore them. You are responsible for keeping the device that
          holds your keys secure. Reports of abuse via DMs are handled based on the reporter's own decrypted copy.
        </p>
      </Section>
      <Section title="Availability and changes">
        <p>
          Perpcast is provided "as is", in active development, without warranties of uptime or fitness. We may change or discontinue
          features. We will post updates to these terms here, and continued use after an update means you accept it.
        </p>
      </Section>
    </>
  )
}

export default function Legal() {
  const { pathname } = useLocation()
  const terms = pathname.startsWith('/terms')
  const title = terms ? 'Terms of Service' : 'Privacy Policy'
  return (
    <div>
      <MobileTopBar title={<span className="font-display font-extrabold">{title}</span>} />
      <div className="hidden md:block">
        <PageHeader title={title} sub={`Last updated ${UPDATED}`} />
      </div>
      <div className="px-4 pb-16 pt-4 md:px-6">
        <div className="mb-6 flex gap-2">
          <Link to="/privacy" className={cx('chip', !terms && 'chip-active')}>
            Privacy
          </Link>
          <Link to="/terms" className={cx('chip', terms && 'chip-active')}>
            Terms
          </Link>
        </div>
        {terms ? <Terms /> : <Privacy />}
        <p className="text-xs text-ink-3">Questions: login@perpcast.app · Last updated {UPDATED}</p>
      </div>
    </div>
  )
}
