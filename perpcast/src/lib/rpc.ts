import { fallback, http } from 'viem'
import { ROBINHOOD_CHAIN } from './wallet'

/** Same-origin relay (functions/api/rpc.ts) so reads still work when the public RPC is blocked on the user's network. */
export const ROBINHOOD_RPC_PROXY = '/api/rpc'

/** Resilient Robinhood Chain transport: direct public RPC first, same-origin relay second, ranked by health with retries. */
export function robinhoodTransport() {
  return fallback(
    [
      http(ROBINHOOD_CHAIN.rpc, { batch: true, timeout: 12_000, retryCount: 1 }),
      http(typeof location === 'undefined' ? ROBINHOOD_RPC_PROXY : `${location.origin}${ROBINHOOD_RPC_PROXY}`, { batch: true, timeout: 15_000, retryCount: 2 }),
    ],
    { rank: false, retryCount: 2, retryDelay: 400 },
  )
}
