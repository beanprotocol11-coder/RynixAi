/**
 * End-to-end encrypted DMs.
 *
 * Every account has an X25519 device key. The private half lives only in this browser (localStorage); the public
 * half is published to the server so peers can encrypt to it. A message is sealed with XChaCha20-Poly1305 under a
 * key derived (HKDF-SHA256) from the X25519 shared secret of the two parties, so the server only ever stores
 * ciphertext it cannot read.
 *
 * Wire format (stored in `messages.text`):  e2e1.<fromPub>.<toPub>.<nonce b64url>.<ciphertext b64url>
 */
import { x25519 } from '@noble/curves/ed25519'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils'

const PREFIX = 'e2e1'
const STORE = 'perpcast:dmkey:'

export interface DeviceKey {
  priv: Uint8Array
  pub: string // hex
}

const cache = new Map<string, DeviceKey>()

/** Loads (or creates on first use) this device's key for the signed-in account. */
export function deviceKey(userId: string): DeviceKey {
  const hit = cache.get(userId)
  if (hit) return hit
  let priv: Uint8Array | null = null
  try {
    const raw = localStorage.getItem(STORE + userId)
    if (raw && /^[0-9a-f]{64}$/.test(raw)) priv = hexToBytes(raw)
  } catch {
    /* storage unavailable */
  }
  if (!priv) {
    priv = x25519.utils.randomPrivateKey()
    try {
      localStorage.setItem(STORE + userId, bytesToHex(priv))
    } catch {
      /* in-memory only for this session */
    }
  }
  const k = { priv, pub: bytesToHex(x25519.getPublicKey(priv)) }
  cache.set(userId, k)
  return k
}

export function forgetDeviceKey(userId: string) {
  cache.delete(userId)
  try {
    localStorage.removeItem(STORE + userId)
  } catch {
    /* ignore */
  }
}

export function isEncrypted(text: string): boolean {
  return text.startsWith(PREFIX + '.')
}

function b64u(b: Uint8Array): string {
  let s = ''
  for (const c of b) s += String.fromCharCode(c)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function unb64u(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)
  const bin = atob(pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function sessionKey(priv: Uint8Array, peerPub: string, fromPub: string, toPub: string): Uint8Array {
  const shared = x25519.getSharedSecret(priv, hexToBytes(peerPub))
  return hkdf(sha256, shared, utf8ToBytes(`${fromPub}:${toPub}`), utf8ToBytes('perpcast-dm-v1'), 32)
}

export function seal(text: string, me: DeviceKey, peerPub: string): string {
  const key = sessionKey(me.priv, peerPub, me.pub, peerPub)
  const nonce = randomBytes(24)
  const ct = xchacha20poly1305(key, nonce).encrypt(utf8ToBytes(text))
  return [PREFIX, me.pub, peerPub, b64u(nonce), b64u(ct)].join('.')
}

export type Opened = { ok: true; text: string } | { ok: false; reason: 'other-device' | 'corrupt' }

/** Decrypts a stored message for the current device; fails softly when it was sealed for a different device key. */
export function open(payload: string, me: DeviceKey): Opened {
  const parts = payload.split('.')
  if (parts.length !== 5 || parts[0] !== PREFIX) return { ok: false, reason: 'corrupt' }
  const [, fromPub, toPub, nonce, ct] = parts
  const peerPub = fromPub === me.pub ? toPub : toPub === me.pub ? fromPub : null
  if (!peerPub) return { ok: false, reason: 'other-device' }
  try {
    const key = sessionKey(me.priv, peerPub, fromPub, toPub)
    const pt = xchacha20poly1305(key, unb64u(nonce)).decrypt(unb64u(ct))
    return { ok: true, text: new TextDecoder().decode(pt) }
  } catch {
    return { ok: false, reason: 'corrupt' }
  }
}
