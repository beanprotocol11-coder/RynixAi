export interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>
  on?: (event: string, cb: (...args: unknown[]) => void) => void
  removeListener?: (event: string, cb: (...args: unknown[]) => void) => void
}

export interface WalletOption {
  id: string
  name: string
  icon: string
  provider: EIP1193Provider
}

interface EIP6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string }
  provider: EIP1193Provider
}

declare global {
  interface Window {
    ethereum?: EIP1193Provider & { isMetaMask?: boolean; isCoinbaseWallet?: boolean; isRabby?: boolean; isPhantom?: boolean; providers?: EIP1193Provider[] }
  }
}

const discovered = new Map<string, WalletOption>()
let listening = false

export function discoverWallets(onUpdate: (wallets: WalletOption[]) => void): () => void {
  const emit = () => onUpdate(Array.from(discovered.values()))
  const handler = (e: Event) => {
    const d = (e as CustomEvent<EIP6963Detail>).detail
    if (!d?.info?.uuid) return
    discovered.set(d.info.rdns || d.info.uuid, { id: d.info.rdns || d.info.uuid, name: d.info.name, icon: d.info.icon, provider: d.provider })
    emit()
  }
  if (!listening) {
    window.addEventListener('eip6963:announceProvider', handler)
    listening = true
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // Fallback for legacy injected provider
  setTimeout(() => {
    if (discovered.size === 0 && window.ethereum) {
      const eth = window.ethereum
      const name = eth.isMetaMask ? 'MetaMask' : eth.isCoinbaseWallet ? 'Coinbase Wallet' : eth.isRabby ? 'Rabby' : eth.isPhantom ? 'Phantom' : 'Browser wallet'
      discovered.set('injected', { id: 'injected', name, icon: '', provider: eth })
    }
    emit()
  }, 120)
  emit()
  return () => {
    /* keep listener alive; providers announce once */
  }
}

export function buildSignInMessage(address: string, nonce: string): string {
  const now = new Date().toISOString()
  return [
    `${location.host} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Perpcast. This request will not trigger a blockchain transaction or cost any gas fees.',
    '',
    `URI: ${location.origin}`,
    'Version: 1',
    'Chain ID: 1',
    `Nonce: ${nonce}`,
    `Issued At: ${now}`,
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
