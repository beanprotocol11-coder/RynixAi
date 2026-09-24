import { createPublicClient, custom, decodeEventLog, encodeFunctionData, formatEther, formatUnits, http, isAddress, parseAbi, toHex, type Address, type Hex, type Log } from 'viem'
import { ROBINHOOD_CHAIN, type EIP1193Provider } from './wallet'

/**
 * Pons V2 — token launchpad on Robinhood Chain. Tokens start on a bonding curve and graduate into a
 * permanently locked Uniswap V4 pool. Source: docs.pons.family (V2 factory & ABI).
 */
export const PONS_V2_FACTORY: Address = '0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'
export const PONS_APP = 'https://pons.family'
export const PONS_DOCS = 'https://docs.pons.family'
export const NATIVE_ETH: Address = '0x0000000000000000000000000000000000000000'

export const PONS_ABI = parseAbi([
  'struct Socials { string twitter; string telegram; string discord; string website; string farcaster; }',
  'struct TokenParams { string name; string symbol; string logo; string description; Socials socials; address creatorFeeRecipient; uint16 creatorTaxBps; bool buybackEnabled; bytes32 expectedEconomics; bytes32 salt; }',
  'struct LaunchConfig { uint256 supply; uint256 curveFeeBps; uint256 phantomQuote; uint256 graduationThreshold; uint24 poolFee; int24 tickSpacing; bool enabled; }',
  'function launchToken(TokenParams params, uint256 launchConfigId, address pairToken) payable returns (address token, address curve)',
  'function previewLaunchEconomics(uint256 launchConfigId, address pairToken) view returns (bytes32)',
  'function launchFee() view returns (uint256)',
  'function launchConfigCount() view returns (uint256)',
  'function getLaunchConfig(uint256 id) view returns (LaunchConfig)',
  'function approvedPairTokens(address pairToken) view returns (bool)',
  'function pairTokenEconomics(address pairToken) view returns (uint256 phantomQuote, uint256 graduationThreshold, uint8 decimals)',
  'function canLaunch(address account) view returns (bool)',
  'function maxCreatorTaxBps() view returns (uint16)',
  'event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)',
])

export type PairKind = 'native' | 'stable' | 'stock' | 'etf' | 'rwa'

export interface PairAsset {
  address: Address
  symbol: string
  name: string
  kind: PairKind
  decimals: number
  logo?: string
}

/**
 * Pair assets to offer in the launch form. ETH is the default (no approval flag needed); the rest are
 * Robinhood tokenized equities/ETFs and USDG. Every ERC-20 here is re-checked against
 * `approvedPairTokens` on-chain before it can be selected, so a token Pons stops approving disappears.
 */
export const PAIR_CANDIDATES: PairAsset[] = [
  { address: NATIVE_ETH, symbol: 'ETH', name: 'Ether', kind: 'native', decimals: 18, logo: 'https://coin-images.coingecko.com/coins/images/279/large/ethereum.png' },
  { address: '0x5fc5360d0400a0fd4f2af552add042d716f1d168', symbol: 'USDG', name: 'Global Dollar', kind: 'stable', decimals: 6, logo: 'https://coin-images.coingecko.com/coins/images/51281/large/GDN_USDG_Token_200x200.png' },
  { address: '0x322f0929c4625ed5bad873c95208d54e1c003b2d', symbol: 'TSLA', name: 'Tesla • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', symbol: 'NVDA', name: 'NVIDIA • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0xaf3d76f1834a1d425780943c99ea8a608f8a93f9', symbol: 'AAPL', name: 'Apple • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0xe93237c50d904957cf27e7b1133b510c669c2e74', symbol: 'MSFT', name: 'Microsoft • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0x12f190a9f9d7d37a250758b26824b97ce941bf54', symbol: 'AMZN', name: 'Amazon • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3', symbol: 'GOOGL', name: 'Alphabet Class A • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0xc0d6457c16cc70d6790dd43521c899c87ce02f35', symbol: 'META', name: 'Meta Platforms • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0xec262a75e413fafd0df80480274532c79d42da09', symbol: 'MSTR', name: 'Strategy Inc. • Robinhood Token', kind: 'stock', decimals: 18 },
  { address: '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', symbol: 'SPY', name: 'SPDR S&P 500 ETF • Robinhood Token', kind: 'etf', decimals: 18 },
  { address: '0xd5f3879160bc7c32ebb4dc785f8a4f505888de68', symbol: 'QQQ', name: 'Invesco QQQ • Robinhood Token', kind: 'etf', decimals: 18 },
  { address: '0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e', symbol: 'GLD', name: 'SPDR Gold Trust • Robinhood Token', kind: 'rwa', decimals: 18 },
  { address: '0x92fd66527192e3e61d4ddd13322aa222de86f9b5', symbol: 'SGOV', name: 'iShares 0-3M Treasury Bond • Robinhood Token', kind: 'rwa', decimals: 18 },
]

export const PAIR_KIND_LABEL: Record<PairKind, string> = { native: 'Native', stable: 'Stablecoin', stock: 'Stock', etf: 'ETF', rwa: 'RWA' }

const publicClient = createPublicClient({ transport: http(ROBINHOOD_CHAIN.rpc, { batch: true }) })

export interface LaunchConfig {
  id: number
  supply: bigint
  curveFeeBps: bigint
  phantomQuote: bigint
  graduationThreshold: bigint
  poolFee: number
  tickSpacing: number
  enabled: boolean
}

export interface FactoryState {
  launchFee: bigint
  maxCreatorTaxBps: number
  configs: LaunchConfig[]
  pairs: PairAsset[]
}

/** Read the live factory state: fee, tax cap, launch configs and which pair assets are approved right now. */
export async function readFactoryState(): Promise<FactoryState> {
  const [launchFee, maxCreatorTaxBps, count] = await Promise.all([
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'launchFee' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'maxCreatorTaxBps' }),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'launchConfigCount' }),
  ])
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i))
  const [rawConfigs, approvals] = await Promise.all([
    Promise.all(ids.map((id) => publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'getLaunchConfig', args: [id] }))),
    Promise.all(PAIR_CANDIDATES.map((p) => (p.kind === 'native' ? Promise.resolve(true) : publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'approvedPairTokens', args: [p.address] }).catch(() => false)))),
  ])
  const configs: LaunchConfig[] = rawConfigs.map((c, i) => ({ id: i, supply: c.supply, curveFeeBps: c.curveFeeBps, phantomQuote: c.phantomQuote, graduationThreshold: c.graduationThreshold, poolFee: c.poolFee, tickSpacing: c.tickSpacing, enabled: c.enabled }))
  return { launchFee, maxCreatorTaxBps, configs, pairs: PAIR_CANDIDATES.filter((_, i) => approvals[i]) }
}

export interface PairEconomics {
  phantomQuote: bigint
  graduationThreshold: bigint
  decimals: number
}

export async function readPairEconomics(pair: PairAsset, configId: number): Promise<PairEconomics> {
  if (pair.kind === 'native') {
    const cfg = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'getLaunchConfig', args: [BigInt(configId)] })
    return { phantomQuote: cfg.phantomQuote, graduationThreshold: cfg.graduationThreshold, decimals: 18 }
  }
  const [phantomQuote, graduationThreshold, decimals] = await publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'pairTokenEconomics', args: [pair.address] })
  return { phantomQuote, graduationThreshold, decimals: Number(decimals) }
}

export function canLaunch(account: Address): Promise<boolean> {
  return publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'canLaunch', args: [account] })
}

export function previewEconomics(configId: number, pair: Address): Promise<Hex> {
  return publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'previewLaunchEconomics', args: [BigInt(configId), pair] })
}

export function randomSalt(): Hex {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return toHex(bytes)
}

export interface LaunchInput {
  name: string
  symbol: string
  logo: string
  description: string
  socials: { twitter: string; telegram: string; discord: string; website: string }
  creatorFeeRecipient: Address
  creatorTaxBps: number
  buybackEnabled: boolean
  launchConfigId: number
  pairToken: Address
}

export interface LaunchResult {
  hash: Hex
  token?: Address
  curve?: Address
  deployer?: Address
}

export interface LaunchProgress {
  step: 'preview' | 'wallet' | 'pending' | 'confirmed'
  hash?: Hex
}

function isWalletError(e: unknown): e is { code: number; message?: string } {
  return typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'number'
}

/**
 * Launch a token through the Pons V2 factory. Nothing is sent until the user confirms the transaction
 * in their wallet; the economics hash is re-read right before submit so the launch reverts if Pons
 * changes the curve parameters in between.
 */
export async function launchToken(provider: EIP1193Provider, from: Address, input: LaunchInput, onProgress: (p: LaunchProgress) => void): Promise<LaunchResult> {
  onProgress({ step: 'preview' })
  const [expectedEconomics, fee] = await Promise.all([
    previewEconomics(input.launchConfigId, input.pairToken),
    publicClient.readContract({ address: PONS_V2_FACTORY, abi: PONS_ABI, functionName: 'launchFee' }),
  ])
  const params = {
    name: input.name,
    symbol: input.symbol,
    logo: input.logo,
    description: input.description,
    socials: { ...input.socials, farcaster: '' },
    creatorFeeRecipient: input.creatorFeeRecipient,
    creatorTaxBps: input.creatorTaxBps,
    buybackEnabled: input.buybackEnabled,
    expectedEconomics,
    salt: randomSalt(),
  }
  const data = encodeFunctionData({ abi: PONS_ABI, functionName: 'launchToken', args: [params, BigInt(input.launchConfigId), input.pairToken] })
  const walletClient = createPublicClient({ transport: custom(provider) })
  const gas = await walletClient.estimateGas({ account: from, to: PONS_V2_FACTORY, data, value: fee }).catch(() => undefined)
  onProgress({ step: 'wallet' })
  let hash: Hex
  try {
    hash = (await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: PONS_V2_FACTORY, data, value: toHex(fee), ...(gas ? { gas: toHex((gas * 125n) / 100n) } : {}) }],
    })) as Hex
  } catch (e) {
    if (isWalletError(e) && e.code === 4001) throw new Error('Transaction rejected in wallet')
    if (isWalletError(e) && e.code === -32002) throw new Error('A request is already pending — open your wallet to continue')
    throw new Error(isWalletError(e) && e.message ? e.message : 'Wallet could not send the transaction')
  }
  onProgress({ step: 'pending', hash })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000 })
  if (receipt.status !== 'success') throw new Error(`Transaction reverted — ${ROBINHOOD_CHAIN.explorer}/tx/${hash}`)
  const launched = decodeLaunched(receipt.logs)
  onProgress({ step: 'confirmed', hash })
  return { hash, ...launched }
}

function decodeLaunched(logs: Log[]): Omit<LaunchResult, 'hash'> {
  for (const log of logs) {
    if (log.address.toLowerCase() !== PONS_V2_FACTORY.toLowerCase()) continue
    try {
      const ev = decodeEventLog({ abi: PONS_ABI, data: log.data, topics: log.topics, eventName: 'TokenLaunched' })
      return { token: ev.args.token, curve: ev.args.curve, deployer: ev.args.deployer }
    } catch {
      continue
    }
  }
  return {}
}

export function fmtEth(v: bigint): string {
  const n = Number(formatEther(v))
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ETH`
}

export function fmtPair(v: bigint, pair: PairAsset, decimals = pair.decimals): string {
  const n = Number(formatUnits(v, decimals))
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${pair.symbol}`
}

export function validSymbol(s: string): boolean {
  return /^[A-Z0-9]{2,12}$/.test(s)
}

export function validAddress(a: string): a is Address {
  return isAddress(a)
}

export function explorerTx(hash: string): string {
  return `${ROBINHOOD_CHAIN.explorer}/tx/${hash}`
}

export function explorerAddress(a: string): string {
  return `${ROBINHOOD_CHAIN.explorer}/address/${a}`
}
