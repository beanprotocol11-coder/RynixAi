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
  if (eth.isMetaMask) return 'MetaMask'
  return 'Browser wallet'
}

function addLegacy() {
  const eth = window.ethereum
  if (!eth) return
  const list = eth.providers?.length ? eth.providers : [eth]
  for (const p of list) {
    const name = nameOf(p)
    const id = `injected:${name.toLowerCase().replace(/\s+/g, '-')}`
    if (Array.from(discovered.values()).some((w) => w.name === name)) continue
    discovered.set(id, { id, name, icon: '', provider: p })
  }
}

/** Discover wallets via EIP-6963, falling back to the legacy `window.ethereum` provider. */
export function discoverWallets(onUpdate: (wallets: WalletOption[]) => void): () => void {
  listeners.add(onUpdate)
  if (!listening) {
    listening = true
    window.addEventListener('eip6963:announceProvider', (e: Event) => {
      const d = (e as CustomEvent<EIP6963Detail>).detail
      if (!d?.info?.uuid || !d.provider) return
      const id = d.info.rdns || d.info.uuid
      discovered.set(id, { id, name: d.info.name, icon: d.info.icon, rdns: d.info.rdns, provider: d.provider })
      emit()
    })
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  const t = setTimeout(() => {
    if (discovered.size === 0) addLegacy()
    emit()
  }, 150)
  onUpdate(Array.from(discovered.values()))
  return () => {
    clearTimeout(t)
    listeners.delete(onUpdate)
  }
}

export function isMobile(): boolean {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

/** Mobile wallets open the dapp inside their in-app browser through these universal links. */
export const MOBILE_WALLETS = [
  { id: 'metamask', name: 'MetaMask', link: (url: string) => `https://metamask.app.link/dapp/${url.replace(/^https?:\/\//, '')}` },
  { id: 'trust', name: 'Trust Wallet', link: (url: string) => `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
  { id: 'coinbase', name: 'Coinbase Wallet', link: (url: string) => `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
  { id: 'rainbow', name: 'Rainbow', link: (url: string) => `https://rnbwapp.com/dapp?url=${encodeURIComponent(url)}` },
  { id: 'phantom', name: 'Phantom', link: (url: string) => `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(location.origin)}` },
  { id: 'okx', name: 'OKX Wallet', link: (url: string) => `https://www.okx.com/download?deeplink=${encodeURIComponent(`okx://wallet/dapp/url?dappUrl=${encodeURIComponent(url)}`)}` },
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

export async function signMessage(provider: EIP1193Provider, address: string, message: string): Promise<string> {
  try {
    return (await provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string
  } catch (e) {
    throw asWalletError(e)
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
