import type { PagesFunction } from '../lib/types'
import { json } from '../lib/db'

const UPSTREAMS = ['https://robinhood-rpc.publicnode.com', 'https://robinhood.drpc.org', 'https://rpc.mainnet.chain.robinhood.com']
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
  let last: Response | null = null
  for (const url of UPSTREAMS) {
    try {
      const up = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: text, signal: AbortSignal.timeout(10_000) })
      if (up.status === 429 || up.status >= 500) {
        last = up
        continue
      }
      const out = await up.text()
      if (/"code":\s*429/.test(out) && out.length < 200) {
        last = new Response(out, { status: 429 })
        continue
      }
      return new Response(out, { status: up.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
    } catch {
      continue
    }
  }
  return json({ error: 'All Robinhood Chain RPC upstreams failed' }, last?.status === 429 ? 429 : 502)
}

export const onRequest: PagesFunction = async () => json({ error: 'Method not allowed' }, 405)
