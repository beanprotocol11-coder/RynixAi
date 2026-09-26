export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
}

export interface WalletOption {
  id: string
  name: string
  icon: string
  rdns?: string
  provider: EIP1193Provider
}

interface EIP6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: EIP1193Provider
}

type InjectedFlags = {
  isMetaMask?: boolean
  isCoinbaseWallet?: boolean
  isRabby?: boolean
  isPhantom?: boolean
  isBraveWallet?: boolean
  isTrust?: boolean
  isOkxWallet?: boolean
  isRainbow?: boolean
  isBitKeep?: boolean
  isTokenPocket?: boolean
  isZerion?: boolean
  providers?: Array<EIP1193Provider & InjectedFlags>
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider & InjectedFlags
  }
}

const discovered = new Map<string, WalletOption>()
const listeners = new Set<(w: WalletOption[]) => void>()
let listening = false

function emit() {
  const list = Array.from(discovered.values())
  listeners.forEach((fn) => fn(list))
}

function nameOf(eth: InjectedFlags): string {
  if (eth.isRabby) return 'Rabby'
  if (eth.isBraveWallet) return 'Brave Wallet'
  if (eth.isCoinbaseWallet) return 'Coinbase Wallet'
  if (eth.isPhantom) return 'Phantom'
  if (eth.isTrust) return 'Trust Wallet'
  if (eth.isOkxWallet) return 'OKX Wallet'
  if (eth.isRainbow) return 'Rainbow'
  if (eth.isBitKeep) return 'Bitget Wallet'
  if (eth.isTokenPocket) return 'TokenPocket'
  if (eth.isZerion) return 'Zerion'
  if (eth.isMetaMask) return 'MetaMask'
  return 'Browser wallet'
}

/** Register the legacy `window.ethereum` provider(s) that no EIP-6963 announcement already covers. */
function addLegacy(): boolean {
  const eth = window.ethereum
  if (!eth) return false
  const list = eth.providers?.length ? eth.providers : [eth]
  let added = false
  for (const p of list) {
    const known = Array.from(discovered.values())
    if (known.some((w) => w.provider === p)) continue
    const name = nameOf(p)
    if (known.some((w) => w.name === name)) continue
    const id = `injected:${name.toLowerCase().replace(/\s+/g, '-')}`
    discovered.set(id, { id, name, icon: '', provider: p })
    added = true
  }
  return added
}

const DISCOVERY_WINDOW_MS = 4000
const DISCOVERY_TICK_MS = 250

/**
 * Discover wallets via EIP-6963 and the legacy `window.ethereum` provider.
 * Mobile in-app browsers and some extensions inject late, so discovery keeps polling for a few seconds.
 */
export function discoverWallets(onUpdate: (wallets: WalletOption[]) => void): () => void {
  listeners.add(onUpdate)
  if (!listening) {
    listening = true
    window.addEventListener('eip6963:announceProvider', (e: Event) => {
      const d = (e as CustomEvent<EIP6963Detail>).detail
      if (!d?.info?.uuid || !d.provider) return
      const id = d.info.rdns || d.info.uuid
      for (const [k, w] of discovered) if (k.startsWith('injected:') && w.provider === d.provider) discovered.delete(k)
      discovered.set(id, { id, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider })
      emit()
    })
    window.addEventListener('ethereum#initialized', () => {
      if (addLegacy()) emit()
    })
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  if (addLegacy()) emit()
  const started = Date.now()
  const t = setInterval(() => {
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    if (addLegacy()) emit()
    if (Date.now() - started > DISCOVERY_WINDOW_MS) clearInterval(t)
  }, DISCOVERY_TICK_MS)
  onUpdate(Array.from(discovered.values()))
  return () => {
    clearInterval(t)
    listeners.delete(onUpdate)
  }
}

export function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

export interface MobileWallet {
  id: string
  name: string
  icon: string
  link: (url: string) => string
}

/** Mobile wallets open the dapp inside their in-app browser through these universal links. */
export const MOBILE_WALLETS: MobileWallet[] = [
  { id: 'metamask', name: 'MetaMask', icon: '/wallets/metamask.svg', link: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}` },
  { id: 'trust', name: 'Trust Wallet', icon: '/wallets/trust.svg', link: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  { id: 'coinbase', name: 'Coinbase Wallet', icon: '/wallets/coinbase.svg', link: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  { id: 'phantom', name: 'Phantom', icon: '/wallets/phantom.svg', link: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}` },
  { id: 'okx', name: 'OKX Wallet', icon: '/wallets/okx.svg', link: (url) => `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}` },
]

export class WalletError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
  }
}

function asWalletError(e: unknown): WalletError {
  const err = e as { code?: number; message?: string; error?: { message?: string } }
  const code = typeof err?.code === 'number' ? err.code : -1
  if (code === 4001) return new WalletError(code, 'Request rejected in wallet')
  if (code === -32002) return new WalletError(code, 'A request is already pending — open your wallet to continue')
  return new WalletError(code, err?.error?.message ?? err?.message ?? 'Wallet request failed')
}

export async function requestAccounts(provider: EIP1193Provider): Promise<string[]> {
  try {
    const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[]
    if (!accounts?.length) throw new WalletError(4100, 'No account returned by wallet')
    return accounts
  } catch (e) {
    throw asWalletError(e)
  }
}

export async function currentChainId(provider: EIP1193Provider): Promise<number> {
  try {
    const hex = (await provider.request({ method: 'eth_chainId' })) as string
    return parseInt(hex, 16) || 1
  } catch {
    return 1
  }
}

function isSignature(v: unknown): v is string {
  return typeof v === 'string' && /^0x[0-9a-fA-F]{130,}$/.test(v)
}

/**
 * `personal_sign` with the hex-encoded message (EIP-191). Some wallets only accept the raw UTF-8
 * string, so that is retried once unless the user explicitly rejected the request.
 */
export async function signMessage(provider: EIP1193Provider, address: string, message: string): Promise<string> {
  try {
    const sig = await provider.request({ method: 'personal_sign', params: [toHex(message), address] })
    if (isSignature(sig)) return sig
    throw new WalletError(-1, 'Wallet returned an invalid signature')
  } catch (e) {
    const err = asWalletError(e)
    if (err.code === 4001 || err.code === -32002) throw err
    try {
      const sig = await provider.request({ method: 'personal_sign', params: [message, address] })
      if (isSignature(sig)) return sig
    } catch (e2) {
      throw asWalletError(e2)
    }
    throw err
  }
}

export function onAccountsChanged(provider: EIP1193Provider, cb: (accounts: string[]) => void): () => void {
  const h = (...args: unknown[]) => cb((args[0] as string[]) ?? [])
  provider.on?.('accountsChanged', h)
  return () => provider.removeListener?.('accountsChanged', h)
}

export function onChainChanged(provider: EIP1193Provider, cb: (chainId: number) => void): () => void {
  const h = (...args: unknown[]) => cb(parseInt(String(args[0]), 16) || 1)
  provider.on?.('chainChanged', h)
  return () => provider.removeListener?.('chainChanged', h)
}

export function buildSignInMessage(address: string, nonce: string, chainId = 1, issuedAt = new Date().toISOString()): string {
  return [
    `${location.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Perpcast. This signature only proves you own this wallet — it does not send a transaction, approve spending or cost gas.',
    '',
    `URI: ${location.origin}`,
    'Version: 1',
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

export function toHex(s: string): string {
  const bytes = new TextEncoder().encode(s)
  return '0x' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function randomNonce(): string {
  const a = new Uint8Array(12)
  crypto.getRandomValues(a)
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Robinhood Chain (Arbitrum Orbit L2) — the home chain of Perpcast. Source: docs.robinhood.com/chain/connecting */
export const ROBINHOOD_CHAIN = {
  id: 4663,
  name: 'Robinhood Chain',
  rpc: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  currency: 'ETH',
} as const

export const ROBINHOOD_TESTNET = {
  id: 46630,
  name: 'Robinhood Chain Testnet',
  rpc: 'https://rpc.testnet.chain.robinhood.com',
  explorer: 'https://explorer.testnet.chain.robinhood.com',
  currency: 'ETH',
} as const

export const CHAIN_NAMES: Record<number, string> = {
  [ROBINHOOD_CHAIN.id]: ROBINHOOD_CHAIN.name,
  [ROBINHOOD_TESTNET.id]: ROBINHOOD_TESTNET.name,
  1: 'Ethereum',
  10: 'Optimism',
  56: 'BNB Chain',
  137: 'Polygon',
  42161: 'Arbitrum',
  43114: 'Avalanche',
  59144: 'Linea',
  81457: 'Blast',
  534352: 'Scroll',
  7777777: 'Zora',
  999: 'HyperEVM',
}

/** Ask the wallet to switch to Robinhood Chain, adding the network first if the wallet doesn't know it (EIP-3326 / EIP-3085). */
export async function switchToRobinhoodChain(provider: EIP1193Provider, net: typeof ROBINHOOD_CHAIN | typeof ROBINHOOD_TESTNET = ROBINHOOD_CHAIN): Promise<void> {
  const chainId = `0x${net.id.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? (e as { code: unknown }).code : undefined
    if (code !== 4902 && code !== -32603) throw e
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId, chainName: net.name, rpcUrls: [net.rpc], blockExplorerUrls: [net.explorer], nativeCurrency: { name: 'Ether', symbol: net.currency, decimals: 18 } }],
    })
  }
}

export function findWallet(id: string): WalletOption | undefined {
  return discovered.get(id)
}

export function chainName(id: number): string {
  return CHAIN_NAMES[id] ?? `Chain ${id}`
}

export const WALLET_ICONS: Record<string, string> = {
  trust: '/wallets/trust.svg',
  coinbase: '/wallets/coinbase.svg',
  phantom: '/wallets/phantom.svg',
  okx: '/wallets/okx.svg',
  brave: '/wallets/brave.svg',
  bitget: '/wallets/bitget.svg',
  tokenpocket: '/wallets/tokenpocket.svg',
  metamask:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#E17726" d="m28.6 3.5-11 8.2 2-4.8z"/><path fill="#E27625" d="m3.4 3.5 10.9 8.3-1.9-4.9zM24.6 22.2l-2.9 4.5 6.3 1.7 1.8-6.1zM2.2 22.3 4 28.4l6.3-1.7-2.9-4.5z"/><path fill="#E27625" d="m10 14.2-1.8 2.7 6.2.3-.2-6.7zM22 14.2l-4.3-3.8-.1 6.8 6.2-.3zM10.3 26.7l3.8-1.8-3.2-2.5zM17.9 24.9l3.8 1.8-.6-4.3z"/><path fill="#D5BFB2" d="m21.7 26.7-3.8-1.8.3 2.5v1zM10.3 26.7l3.5 1.7v-1l.3-2.5z"/><path fill="#233447" d="m13.9 20.8-3.1-.9 2.2-1zM18.1 20.8l.9-1.9 2.2 1z"/><path fill="#CC6228" d="m10.3 26.7.6-4.5-3.5.1zM21.1 22.2l.6 4.5 2.9-4.4zM23.8 16.9l-6.2.3.6 3.6.9-1.9 2.2 1zM10.8 19.9l2.2-1 .9 1.9.6-3.6-6.2-.3z"/><path fill="#E27525" d="m8.2 16.9 2.6 5.1-.1-2.5zM21.3 19.5l-.1 2.5 2.6-5.1zM14.4 17.2l-.6 3.6.7 3.8.2-5z"/><path fill="#F5841F" d="m17.6 17.2-.2 2.4.1 5 .7-3.8z"/><path fill="#C0AC9D" d="m18.2 20.8-.7 3.8.5.3 3.2-2.5.1-2.5zM10.8 19.9l.1 2.5 3.2 2.5.5-.3-.7-3.8z"/><path fill="#161616" d="m18.2 28.4.1-1-.3-.2h-4l-.3.2.1 1-3.5-1.7 1.2 1 2.5 1.7h4.1l2.5-1.7 1.2-1z"/><path fill="#763E1A" d="m17.6 11.7.1-.1-.8-6.1h0l-.9 3.2.1.1.1 6.7 4.3-3.8zM14.4 11.8 10 14.2l4.3 3.8.2-6.7z"/><path fill="#F5841F" d="m23.8 16.9-2.5 2.6 2.6 5.1 1.4-4.5.6-.5zM8.2 16.9l-2.1 2.7.6.5 1.4 4.5 2.6-5.1z"/></svg>',
    ),
}

export function walletIcon(w: WalletOption): string {
  if (w.icon) return w.icon
  const key = w.name.toLowerCase().split(' ')[0]
  return WALLET_ICONS[key] ?? ''
}

export interface WalletBrand {
  id: string
  name: string
  icon: string
  /** EIP-6963 rdns values this brand announces under. */
  rdns: string[]
  install: string
  /** Universal link that opens the dapp inside the wallet's in-app browser. */
  mobile?: (url: string) => string
}

/**
 * Wallets Perpcast always lists in the sign-in grid. A brand is "detected" when discovery finds a
 * provider with a matching rdns or name; otherwise the card links to install / open-in-app.
 */
export const WALLET_BRANDS: WalletBrand[] = [
  { id: 'walletconnect', name: 'WalletConnect', icon: '/wallets/walletconnect.svg', rdns: [], install: 'https://walletconnect.network' },
  { id: 'metamask', name: 'MetaMask', icon: '/wallets/metamask.svg', rdns: ['io.metamask', 'io.metamask.flask'], install: 'https://metamask.io/download/', mobile: (url) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}` },
  { id: 'rabby', name: 'Rabby', icon: '/wallets/rabby.svg', rdns: ['io.rabby'], install: 'https://rabby.io' },
  { id: 'bitget', name: 'Bitget Wallet', icon: '/wallets/bitget.svg', rdns: ['com.bitget.web3'], install: 'https://web3.bitget.com/en/wallet-download', mobile: (url) => `https://bkcode.vip?action=dapp&url=${encodeURIComponent(url)}` },
  { id: 'phantom', name: 'Phantom', icon: '/wallets/phantom.svg', rdns: ['app.phantom'], install: 'https://phantom.com/download', mobile: (url) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}` },
  { id: 'trust', name: 'Trust Wallet', icon: '/wallets/trust.svg', rdns: ['com.trustwallet.app'], install: 'https://trustwallet.com/download', mobile: (url) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  { id: 'okx', name: 'OKX Wallet', icon: '/wallets/okx.svg', rdns: ['com.okex.wallet'], install: 'https://www.okx.com/web3', mobile: (url) => `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}` },
  { id: 'coinbase', name: 'Coinbase Wallet', icon: '/wallets/coinbase.svg', rdns: ['com.coinbase.wallet'], install: 'https://www.coinbase.com/wallet/downloads', mobile: (url) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  { id: 'brave', name: 'Brave Wallet', icon: '/wallets/brave.svg', rdns: ['com.brave.wallet'], install: 'https://brave.com/wallet/' },
  { id: 'tokenpocket', name: 'TokenPocket', icon: '/wallets/tokenpocket.svg', rdns: ['pro.tokenpocket'], install: 'https://www.tokenpocket.pro/en/download/app', mobile: (url) => `tpdapp://open?params=${encodeURIComponent(JSON.stringify({ url, chain: 'ETH' }))}` },
]

/** Find the discovered provider that belongs to a brand (by rdns, then by name). */
export function brandWallet(brand: WalletBrand, wallets: WalletOption[]): WalletOption | undefined {
  return wallets.find((w) => w.rdns && brand.rdns.includes(w.rdns)) ?? wallets.find((w) => w.name.toLowerCase().split(' ')[0] === brand.id || w.name.toLowerCase() === brand.name.toLowerCase())
}

/** Discovered wallets that don't match any catalog brand (still shown so nothing detected is hidden). */
export function unbrandedWallets(wallets: WalletOption[]): WalletOption[] {
  return wallets.filter((w) => !WALLET_BRANDS.some((b) => brandWallet(b, [w])))
}

/** WalletConnect / Reown project ID (public, client-side). Override with VITE_REOWN_PROJECT_ID. */
export const REOWN_PROJECT_ID: string = (import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined) || 'af278a63d0fdcb04640235a3af975504'

export const WALLETCONNECT_ID = 'walletconnect'

type WcProvider = EIP1193Provider & { connect: () => Promise<void>; disconnect: () => Promise<void>; session?: unknown; accounts: string[] }
let wcProvider: Promise<WcProvider> | null = null

/** Loads @walletconnect/ethereum-provider lazily so the ~300 kB SDK only ships when someone picks WalletConnect. */
function walletConnect(): Promise<WcProvider> {
  if (!wcProvider) {
    wcProvider = import('@walletconnect/ethereum-provider').then(({ EthereumProvider }) =>
      EthereumProvider.init({
        projectId: REOWN_PROJECT_ID,
        optionalChains: [ROBINHOOD_CHAIN.id, 1, 8453, 42161, 10, 137, ROBINHOOD_TESTNET.id],
        rpcMap: { [ROBINHOOD_CHAIN.id]: ROBINHOOD_CHAIN.rpc, [ROBINHOOD_TESTNET.id]: ROBINHOOD_TESTNET.rpc },
        showQrModal: true,
        metadata: { name: 'Perpcast', description: 'Cast, chat and trade perps on Robinhood Chain', url: location.origin, icons: [`${location.origin}/logo.svg`] },
      }) as Promise<WcProvider>,
    )
    wcProvider.catch(() => {
      wcProvider = null
    })
  }
  return wcProvider
}

/** EIP-1193 facade that defers SDK loading until the first request. */
const wcFacade: EIP1193Provider = {
  request: async (args) => {
    const p = await walletConnect()
    if (args.method === 'eth_requestAccounts') {
      if (!p.session) await p.connect()
      return p.accounts.length ? p.accounts : p.request({ method: 'eth_accounts' })
    }
    return p.request(args)
  },
  on: (event, cb) => void walletConnect().then((p) => p.on?.(event, cb)),
  removeListener: (event, cb) => void walletConnect().then((p) => p.removeListener?.(event, cb)),
}

export async function disconnectWalletConnect(): Promise<void> {
  if (!wcProvider) return
  const p = await wcProvider.catch(() => null)
  if (p?.session) await p.disconnect().catch(() => {})
}

if (REOWN_PROJECT_ID && typeof window !== 'undefined') {
  discovered.set(WALLETCONNECT_ID, { id: WALLETCONNECT_ID, name: 'WalletConnect', icon: '/wallets/walletconnect.svg', provider: wcFacade })
}
