import type { PagesFunction } from '../lib/types'
import { json } from '../lib/db'

const MAX_BYTES = 2 * 1024 * 1024
const PINATA = 'https://api.pinata.cloud/pinning/pinFileToIPFS'

interface PinResponse {
  IpfsHash: string
}

/** Pins a token logo to IPFS via Pinata so the on-chain `logo` field can hold an `ipfs://` URI. */
export const onRequestPost: PagesFunction = async ({ request, env }) => {
  if (!env.PINATA_JWT) return json({ error: 'Image upload is not configured on this server yet — paste an image URL instead.' }, 503)
  const type = request.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) return json({ error: 'Only image files are accepted' }, 415)
  const len = Number(request.headers.get('content-length') ?? 0)
  if (len > MAX_BYTES) return json({ error: 'Image must be under 2 MB' }, 413)
  const bytes = await request.arrayBuffer()
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) return json({ error: 'Image must be between 1 byte and 2 MB' }, 413)

  const form = new FormData()
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  form.append('file', new Blob([bytes], { type }), `logo.${ext}`)
  form.append('pinataMetadata', JSON.stringify({ name: `perpcast-logo-${Date.now()}` }))
  form.append('pinataOptions', JSON.stringify({ cidVersion: 1 }))

  const r = await fetch(PINATA, { method: 'POST', headers: { authorization: `Bearer ${env.PINATA_JWT}` }, body: form })
  if (!r.ok) return json({ error: `IPFS pin failed (${r.status})` }, 502)
  const { IpfsHash } = (await r.json()) as PinResponse
  const gateway = env.IPFS_GATEWAY ?? 'https://gateway.pinata.cloud/ipfs'
  return json({ cid: IpfsHash, uri: `ipfs://${IpfsHash}`, url: `${gateway}/${IpfsHash}` })
}

export const onRequest: PagesFunction = async () => json({ error: 'Method not allowed' }, 405)
