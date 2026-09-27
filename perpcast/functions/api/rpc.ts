import type { PagesFunction } from '../lib/types'
import { json } from '../lib/db'

const UPSTREAM = 'https://rpc.mainnet.chain.robinhood.com'
const MAX_BYTES = 256 * 1024
const ALLOWED = new Set(['eth_call', 'eth_chainId', 'eth_blockNumber', 'eth_getBalance', 'eth_getLogs', 'eth_getTransactionReceipt', 'eth_getTransactionByHash', 'eth_getCode', 'eth_estimateGas', 'eth_gasPrice', 'eth_feeHistory', 'eth_getBlockByNumber', 'eth_getTransactionCount', 'eth_maxPriorityFeePerGas', 'net_version'])

interface RpcReq {
  method?: unknown
}

/** Same-origin read-only JSON-RPC relay to Robinhood Chain, used as a fallback when the public RPC is unreachable from the user's network. */
export const onRequestPost: PagesFunction = async ({ request }) => {
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) return json({ error: 'Payload too large' }, 413)
  const text = await request.text()
  if (text.length > MAX_BYTES) return json({ error: 'Payload too large' }, 413)
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  const reqs: RpcReq[] = Array.isArray(body) ? body : [body as RpcReq]
  if (reqs.length > 50) return json({ error: 'Too many requests in batch' }, 413)
  for (const r of reqs) {
    if (typeof r?.method !== 'string' || !ALLOWED.has(r.method)) return json({ error: `Method not allowed: ${String(r?.method)}` }, 403)
  }
  const up = await fetch(UPSTREAM, { method: 'POST', headers: { 'content-type': 'application/json' }, body: text })
  return new Response(up.body, { status: up.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

export const onRequest: PagesFunction = async () => json({ error: 'Method not allowed' }, 405)
