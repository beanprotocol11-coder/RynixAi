import { createPublicClient, encodeFunctionData, formatEther, formatUnits, http, parseAbi, parseUnits, type Address } from 'viem'
import { ROBINHOOD_CHAIN, type EIP1193Provider } from './wallet'
import { PAIR_CANDIDATES } from './pons'

/**
 * Real, non-custodial balances for the signed-in wallet. Nothing here is simulated:
 *  - Robinhood Chain: native ETH (gas + Pons launch fee) and USDG via public RPC
 *  - Hyperliquid: perps account value / withdrawable + spot USDC via the public info API
 *  - Arbitrum: USDC held in the wallet (what can be deposited into Hyperliquid)
 */

export const ARBITRUM = { id: 42161, name: 'Arbitrum One', rpc: 'https://arb1.arbitrum.io/rpc', explorer: 'https://arbiscan.io' } as const
export const ARB_USDC: Address = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'
/** Hyperliquid Bridge2 on Arbitrum — USDC sent here is credited to the same address on Hyperliquid (min 5 USDC). */
export const HL_BRIDGE: Address = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7'
export const HL_MIN_DEPOSIT = 5
export const HL_APP = 'https://app.hyperliquid.xyz'
const INFO_URL = 'https://api.hyperliquid.xyz/info'

const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)', 'function transfer(address to, uint256 amount) returns (bool)'])

const rh = createPublicClient({ chain: { id: ROBINHOOD_CHAIN.id, name: ROBINHOOD_CHAIN.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [ROBINHOOD_CHAIN.rpc] } } }, transport: http() })
const arb = createPublicClient({ chain: { id: ARBITRUM.id, name: ARBITRUM.name, nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [ARBITRUM.rpc] } } }, transport: http() })

export interface WalletBalances {
  address: Address
  rhEth: number
  rhUsdg: number
  arbUsdc: number
  hlAccountValue: number
  hlWithdrawable: number
  hlMarginUsed: number
  hlSpotUsdc: number
  hlPositions: number
  fetchedAt: number
  errors: string[]
}

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(INFO_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`Hyperliquid ${res.status}`)
  return (await res.json()) as T
}

interface ClearinghouseState {
  marginSummary: { accountValue: string; totalMarginUsed: string }
  withdrawable: string
  assetPositions: unknown[]
}
interface SpotState {
  balances: Array<{ coin: string; total: string }>
}

export async function fetchBalances(address: Address): Promise<WalletBalances> {
  const usdg = PAIR_CANDIDATES.find((p) => p.symbol === 'USDG')
  const errors: string[] = []
  const [eth, usdgBal, arbUsdc, perps, spot] = await Promise.allSettled([
    rh.getBalance({ address }),
    usdg ? rh.readContract({ address: usdg.address, abi: ERC20, functionName: 'balanceOf', args: [address] }) : Promise.resolve(0n),
    arb.readContract({ address: ARB_USDC, abi: ERC20, functionName: 'balanceOf', args: [address] }),
    hlInfo<ClearinghouseState>({ type: 'clearinghouseState', user: address }),
    hlInfo<SpotState>({ type: 'spotClearinghouseState', user: address }),
  ])
  const num = <T,>(r: PromiseSettledResult<T>, label: string, f: (v: T) => number): number => {
    if (r.status === 'fulfilled') return f(r.value)
    errors.push(label)
    return 0
  }
  return {
    address,
    rhEth: num(eth, 'Robinhood Chain ETH', (v) => Number(formatEther(v))),
    rhUsdg: num(usdgBal, 'USDG', (v) => Number(formatUnits(v, usdg?.decimals ?? 6))),
    arbUsdc: num(arbUsdc, 'Arbitrum USDC', (v) => Number(formatUnits(v, 6))),
    hlAccountValue: num(perps, 'Hyperliquid perps', (v) => Number(v.marginSummary.accountValue)),
    hlWithdrawable: perps.status === 'fulfilled' ? Number(perps.value.withdrawable) : 0,
    hlMarginUsed: perps.status === 'fulfilled' ? Number(perps.value.marginSummary.totalMarginUsed) : 0,
    hlPositions: perps.status === 'fulfilled' ? perps.value.assetPositions.length : 0,
    hlSpotUsdc: num(spot, 'Hyperliquid spot', (v) => Number(v.balances.find((b) => b.coin === 'USDC')?.total ?? 0)),
    fetchedAt: Date.now(),
    errors,
  }
}

/** Switch the wallet to Arbitrum One (adding it if unknown). */
export async function switchToArbitrum(provider: EIP1193Provider): Promise<void> {
  const chainId = `0x${ARBITRUM.id.toString(16)}`
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId }] })
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? (e as { code: unknown }).code : undefined
    if (code !== 4902 && code !== -32603) throw e
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{ chainId, chainName: ARBITRUM.name, rpcUrls: [ARBITRUM.rpc], blockExplorerUrls: [ARBITRUM.explorer], nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } }],
    })
  }
}

/**
 * Non-custodial deposit into Hyperliquid: a plain USDC `transfer` from the user's wallet to the
 * Hyperliquid bridge on Arbitrum. The wallet shows and signs the transaction; Perpcast never holds funds.
 */
export async function depositToHyperliquid(provider: EIP1193Provider, from: Address, amountUsdc: number): Promise<`0x${string}`> {
  if (!(amountUsdc >= HL_MIN_DEPOSIT)) throw new Error(`Minimum deposit is ${HL_MIN_DEPOSIT} USDC`)
  await switchToArbitrum(provider)
  const data = encodeFunctionData({ abi: ERC20, functionName: 'transfer', args: [HL_BRIDGE, parseUnits(amountUsdc.toFixed(6), 6)] })
  const hash = await provider.request({ method: 'eth_sendTransaction', params: [{ from, to: ARB_USDC, data, value: '0x0' }] })
  return hash as `0x${string}`
}
