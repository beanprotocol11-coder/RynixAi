// Generates the Perpcast Mascots collection: deterministic SVG art + ERC-721 metadata.
// Usage: node scripts/gen-mascots.mjs  → public/nft/img/{id}.svg, public/nft/meta/{id}.json, public/nft/collection.json
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SUPPLY = 100
const SITE = 'https://perpcast.app'
const OUT = resolve(import.meta.dirname, '../public/nft')

function rng(seed) {
  let s = (seed * 2654435761 + 0x9e3779b9) >>> 0
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 0xffffffff
  }
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const weighted = (r, arr) => {
  const total = arr.reduce((a, x) => a + x.w, 0)
  let n = r() * total
  for (const x of arr) if ((n -= x.w) <= 0) return x
  return arr[arr.length - 1]
}

const BACKGROUNDS = [
  { name: 'Dreamy Violet', c: ['#2b1e4d', '#0a0713'], w: 12 },
  { name: 'Ember', c: ['#5b1d1d', '#1a0606'], w: 8 },
  { name: 'Ocean Night', c: ['#0f2b4d', '#040a16'], w: 9 },
  { name: 'Forest', c: ['#1b3d2a', '#06120b'], w: 8 },
  { name: 'Sakura', c: ['#f6c1de', '#c46ba5'], w: 6 },
  { name: 'Golden Hour', c: ['#f5b342', '#c2540f'], w: 6 },
  { name: 'Neon City', c: ['#1b1140', '#3b0f5f'], w: 7 },
  { name: 'Mint Cloud', c: ['#bdf4e2', '#4cbfa4'], w: 6 },
  { name: 'Ice', c: ['#dfe9ff', '#8ea8ff'], w: 6 },
  { name: 'Coral Sunset', c: ['#ff9a8b', '#ff6a88'], w: 5 },
  { name: 'Robinhood Green', c: ['#c6f56d', '#3e8f2f'], w: 4 },
  { name: 'Midnight Gold', c: ['#141018', '#3a2a06'], w: 3 },
]
const BODIES = [
  { name: 'Perpcast Gradient', c: ['#c7b6ff', '#e9a8ff', '#ffb08a'], w: 14 },
  { name: 'Lavender', c: ['#b7a4ff', '#8b5cf6', '#6d28d9'], w: 10 },
  { name: 'Peach', c: ['#ffd1a6', '#ff9a62', '#f4724a'], w: 8 },
  { name: 'Aqua', c: ['#a5f3fc', '#38bdf8', '#2563eb'], w: 8 },
  { name: 'Rose', c: ['#fecdd3', '#fb7185', '#e11d48'], w: 7 },
  { name: 'Lime', c: ['#d9f99d', '#a3e635', '#4d7c0f'], w: 6 },
  { name: 'Gold', c: ['#fde68a', '#fbbf24', '#b45309'], w: 5 },
  { name: 'Obsidian', c: ['#4b5563', '#1f2937', '#030712'], w: 4 },
  { name: 'Ghost', c: ['#ffffff', '#e5e7eb', '#cbd5e1'], w: 3 },
  { name: 'Holo', c: ['#ff9ff3', '#7afcff', '#feff9c'], w: 2 },
]
const PATTERNS = [
  { name: 'None', w: 10 },
  { name: 'Stars', w: 9 },
  { name: 'Grid', w: 8 },
  { name: 'Candles', w: 7 },
  { name: 'Sparkles', w: 6 },
  { name: 'Orbit', w: 4 },
]
const HATS = [
  { name: 'None', w: 14 },
  { name: 'Wizard Hat', w: 10 },
  { name: 'Trader Cap', w: 9 },
  { name: 'Crown', w: 4 },
  { name: 'Halo', w: 5 },
  { name: 'Beanie', w: 8 },
  { name: 'Headphones', w: 7 },
  { name: 'Horns', w: 4 },
  { name: 'Propeller', w: 4 },
  { name: 'Party Hat', w: 5 },
]
const EYES = [
  { name: 'Classic', w: 20 },
  { name: 'Wink', w: 8 },
  { name: 'Sleepy', w: 6 },
  { name: 'Stars', w: 4 },
  { name: 'Hearts', w: 4 },
  { name: 'Laser', w: 3 },
  { name: 'Shades', w: 6 },
  { name: 'Money', w: 2 },
]
const ITEMS = [
  { name: 'None', w: 14 },
  { name: 'Long Candle', w: 9 },
  { name: 'Rocket', w: 8 },
  { name: 'Gold Coin', w: 7 },
  { name: 'Magic Staff', w: 6 },
  { name: 'Diamond', w: 5 },
  { name: 'Chart Scroll', w: 5 },
  { name: 'Lantern', w: 4 },
  { name: 'Lightning', w: 3 },
]
const MOODS = ['Bullish', 'Bearish', 'Degen', 'Zen', 'Whale', 'Builder', 'Caster', 'Moonboy', 'Quant', 'Sniper']
const NAMES = [
  'Pip', 'Ledger', 'Nova', 'Bit', 'Wick', 'Candle', 'Delta', 'Gamma', 'Vega', 'Theta', 'Hodl', 'Moon', 'Dip', 'Pump', 'Bloc', 'Hash',
  'Satoshi', 'Robin', 'Perp', 'Cast', 'Lumen', 'Orbit', 'Zap', 'Glitch', 'Pixel', 'Byte', 'Nibble', 'Oracle', 'Vault', 'Gwei',
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

function bgPattern(kind, r, light) {
  const ink = light ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)'
  const out = []
  if (kind === 'Stars') {
    for (let i = 0; i < 26; i++) {
      const x = Math.round(r() * 512), y = Math.round(r() * 512), s = 2 + Math.round(r() * 4)
      out.push(`<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="${ink}"/>`)
    }
  } else if (kind === 'Grid') {
    out.push(`<path d="${Array.from({ length: 9 }, (_, i) => `M${i * 64} 0V512M0 ${i * 64}H512`).join('')}" stroke="${ink}" stroke-width="2"/>`)
  } else if (kind === 'Candles') {
    let y = 300
    for (let i = 0; i < 12; i++) {
      const x = 16 + i * 42, h = 20 + r() * 90, up = r() > 0.42
      y = Math.max(80, Math.min(430, y + (up ? -1 : 1) * r() * 40))
      const col = up ? 'rgba(52,211,153,.55)' : 'rgba(251,113,133,.55)'
      out.push(`<rect x="${x + 9}" y="${y - h / 2 - 18}" width="2" height="${h + 36}" fill="${col}"/><rect x="${x}" y="${y - h / 2}" width="20" height="${h}" rx="3" fill="${col}"/>`)
    }
  } else if (kind === 'Sparkles') {
    for (let i = 0; i < 12; i++) {
      const x = 30 + r() * 452, y = 30 + r() * 452, s = 6 + r() * 12
      out.push(`<path d="M${x} ${y - s}L${x + s * 0.35} ${y - s * 0.35}L${x + s} ${y}L${x + s * 0.35} ${y + s * 0.35}L${x} ${y + s}L${x - s * 0.35} ${y + s * 0.35}L${x - s} ${y}L${x - s * 0.35} ${y - s * 0.35}Z" fill="${light ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.45)'}"/>`)
    }
  } else if (kind === 'Orbit') {
    out.push(`<g fill="none" stroke="${ink}" stroke-width="3"><ellipse cx="256" cy="256" rx="230" ry="90" transform="rotate(-20 256 256)"/><ellipse cx="256" cy="256" rx="230" ry="90" transform="rotate(35 256 256)"/></g>`)
  }
  return out.join('')
}

function hat(kind, body) {
  // body box spans x 96..416, top y 128
  switch (kind) {
    case 'Wizard Hat':
      return `<path d="M150 150 L256 -6 L362 150 Z" fill="#3b1d7a"/><path d="M150 150 L256 -6 L300 60 L215 130 Z" fill="#5b2fb3" opacity=".7"/><rect x="120" y="136" width="272" height="30" rx="15" fill="#2a1358"/><rect x="180" y="118" width="152" height="14" rx="7" fill="#f5b342"/><circle cx="256" cy="125" r="9" fill="#ff5fd2"/>`
    case 'Trader Cap':
      return `<path d="M136 150 Q256 40 376 150 Z" fill="#16a34a"/><rect x="120" y="140" width="272" height="22" rx="11" fill="#14532d"/><rect x="300" y="146" width="150" height="16" rx="8" fill="#14532d"/><path d="M220 110 l14 -20 l14 20 l14 -20 l14 20" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>`
    case 'Crown':
      return `<path d="M150 150 L150 70 L200 110 L256 40 L312 110 L362 70 L362 150 Z" fill="#fbbf24"/><rect x="150" y="136" width="212" height="24" fill="#d97706"/><circle cx="256" cy="80" r="10" fill="#ef4444"/><circle cx="185" cy="120" r="7" fill="#3b82f6"/><circle cx="327" cy="120" r="7" fill="#22c55e"/>`
    case 'Halo':
      return `<ellipse cx="256" cy="86" rx="120" ry="22" fill="none" stroke="#fde68a" stroke-width="12"/><ellipse cx="256" cy="86" rx="120" ry="22" fill="none" stroke="#fff7cc" stroke-width="4"/>`
    case 'Beanie':
      return `<path d="M120 160 Q256 20 392 160 Z" fill="${body}"/><path d="M120 160 Q256 20 392 160 Z" fill="rgba(0,0,0,.35)"/><rect x="110" y="138" width="292" height="34" rx="17" fill="#f1f5f9"/><circle cx="256" cy="40" r="22" fill="#f1f5f9"/>`
    case 'Headphones':
      return `<path d="M120 200 Q120 60 256 60 Q392 60 392 200" fill="none" stroke="#111827" stroke-width="18"/><rect x="92" y="180" width="52" height="90" rx="20" fill="#1f2937"/><rect x="368" y="180" width="52" height="90" rx="20" fill="#1f2937"/><rect x="104" y="196" width="28" height="58" rx="12" fill="#a78bfa"/><rect x="380" y="196" width="28" height="58" rx="12" fill="#a78bfa"/>`
    case 'Horns':
      return `<path d="M150 150 Q120 80 160 50 Q170 110 200 150 Z" fill="#dc2626"/><path d="M362 150 Q392 80 352 50 Q342 110 312 150 Z" fill="#dc2626"/>`
    case 'Propeller':
      return `<rect x="250" y="70" width="12" height="70" fill="#64748b"/><ellipse cx="256" cy="66" rx="110" ry="14" fill="#f43f5e" opacity=".85"/><ellipse cx="256" cy="66" rx="110" ry="14" fill="#38bdf8" opacity=".85" transform="rotate(30 256 66)"/><circle cx="256" cy="66" r="12" fill="#fde68a"/>`
    case 'Party Hat':
      return `<path d="M200 150 L256 20 L312 150 Z" fill="#ec4899"/><path d="M220 150 L256 70 L292 150 Z" fill="#fbbf24"/><circle cx="256" cy="22" r="14" fill="#a3e635"/>`
    default:
      return ''
  }
}

function eyes(kind) {
  const L = 168, R = 280, Y = 200, W = 64, H = 92
  const eye = (x, pupil = true) =>
    `<rect x="${x}" y="${Y}" width="${W}" height="${H}" rx="28" fill="#fff"/>${pupil ? `<circle cx="${x + W / 2}" cy="${Y + 60}" r="12" fill="#0a0713"/>` : ''}`
  switch (kind) {
    case 'Wink':
      return eye(L) + `<path d="M${R + 6} ${Y + 50} Q${R + W / 2} ${Y + 78} ${R + W - 6} ${Y + 50}" stroke="#fff" stroke-width="12" fill="none" stroke-linecap="round"/>`
    case 'Sleepy':
      return [L, R].map((x) => `<rect x="${x}" y="${Y + 40}" width="${W}" height="${H - 40}" rx="24" fill="#fff"/><circle cx="${x + W / 2}" cy="${Y + 78}" r="10" fill="#0a0713"/>`).join('')
    case 'Stars':
      return [L, R].map((x) => `${eye(x, false)}<path transform="translate(${x + W / 2} ${Y + 48})" d="M0 -22L6 -7L22 -6L10 4L14 20L0 11L-14 20L-10 4L-22 -6L-6 -7Z" fill="#fbbf24"/>`).join('')
    case 'Hearts':
      return [L, R].map((x) => `${eye(x, false)}<path transform="translate(${x + W / 2} ${Y + 50}) scale(1.1)" d="M0 16 C-18 2 -20 -14 -8 -16 C-2 -17 0 -12 0 -10 C0 -12 2 -17 8 -16 C20 -14 18 2 0 16Z" fill="#fb7185"/>`).join('')
    case 'Laser':
      return [L, R].map((x) => `<rect x="${x}" y="${Y + 28}" width="${W}" height="36" rx="18" fill="#ef4444"/><rect x="${x + W - 4}" y="${Y + 40}" width="300" height="12" fill="#ef4444" opacity=".6"/>`).join('')
    case 'Shades':
      return `<rect x="${L - 8}" y="${Y + 8}" width="${W + 16}" height="70" rx="20" fill="#0f172a"/><rect x="${R - 8}" y="${Y + 8}" width="${W + 16}" height="70" rx="20" fill="#0f172a"/><rect x="${L + W + 8}" y="${Y + 30}" width="${R - L - W - 16}" height="10" fill="#0f172a"/><rect x="${L + 6}" y="${Y + 18}" width="26" height="8" rx="4" fill="rgba(255,255,255,.5)"/><rect x="${R + 6}" y="${Y + 18}" width="26" height="8" rx="4" fill="rgba(255,255,255,.5)"/>`
    case 'Money':
      return [L, R].map((x) => `${eye(x, false)}<text x="${x + W / 2}" y="${Y + 70}" text-anchor="middle" font-family="monospace" font-weight="900" font-size="54" fill="#16a34a">$</text>`).join('')
    default:
      return eye(L) + eye(R)
  }
}

function item(kind) {
  switch (kind) {
    case 'Long Candle':
      return `<rect x="430" y="150" width="6" height="250" fill="#34d399"/><rect x="412" y="200" width="42" height="150" rx="6" fill="#34d399"/><path d="M420 140 l13 -26 l13 26" fill="#34d399"/>`
    case 'Rocket':
      return `<g transform="translate(400 300) rotate(-35)"><rect x="-22" y="-70" width="44" height="120" rx="22" fill="#f1f5f9"/><circle cx="0" cy="-30" r="12" fill="#38bdf8"/><path d="M-22 20 L-46 60 L-22 50Z M22 20 L46 60 L22 50Z" fill="#ef4444"/><path d="M-12 50 L0 100 L12 50Z" fill="#fbbf24"/></g>`
    case 'Gold Coin':
      return `<circle cx="428" cy="380" r="52" fill="#b45309"/><circle cx="420" cy="372" r="52" fill="#fbbf24"/><text x="420" y="392" text-anchor="middle" font-family="monospace" font-weight="900" font-size="60" fill="#b45309">P</text>`
    case 'Magic Staff':
      return `<rect x="440" y="150" width="12" height="300" rx="6" fill="#7c2d12"/><circle cx="446" cy="140" r="26" fill="#a855f7"/><circle cx="446" cy="140" r="14" fill="#f5d0fe"/>`
    case 'Diamond':
      return `<path d="M430 300 L470 340 L430 410 L390 340Z" fill="#67e8f9"/><path d="M430 300 L470 340 L390 340Z" fill="#a5f3fc"/><path d="M410 340 L430 410 L450 340Z" fill="#22d3ee"/>`
    case 'Chart Scroll':
      return `<rect x="380" y="330" width="110" height="80" rx="10" fill="#fef3c7"/><path d="M392 395 l22 -22 l18 12 l26 -34 l20 14" stroke="#16a34a" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'Lantern':
      return `<rect x="436" y="170" width="8" height="90" fill="#78350f"/><rect x="404" y="250" width="72" height="96" rx="14" fill="#fbbf24"/><rect x="418" y="264" width="44" height="68" rx="8" fill="#fff7cc"/><rect x="396" y="340" width="88" height="14" rx="7" fill="#78350f"/>`
    case 'Lightning':
      return `<path d="M440 150 L392 280 L432 280 L404 420 L480 250 L440 250 L470 150Z" fill="#fde047" stroke="#f59e0b" stroke-width="5" stroke-linejoin="round"/>`
    default:
      return ''
  }
}

function render(id) {
  const r = rng(id + 7)
  const bg = weighted(r, BACKGROUNDS)
  const body = weighted(r, BODIES)
  const pat = weighted(r, PATTERNS)
  const h = weighted(r, HATS)
  const e = weighted(r, EYES)
  const it = weighted(r, ITEMS)
  const mood = pick(r, MOODS)
  const name = `${pick(r, NAMES)} ${pick(r, NAMES)}`.replace(/(\w+) \1/, '$1 Jr.')
  const light = ['Sakura', 'Golden Hour', 'Mint Cloud', 'Ice', 'Coral Sunset', 'Robinhood Green'].includes(bg.name)
  const traits = { Background: bg.name, Pattern: pat.name, Body: body.name, Hat: h.name, Eyes: e.name, Item: it.name, Mood: mood }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" shape-rendering="geometricPrecision">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg.c[0]}"/><stop offset="1" stop-color="${bg.c[1]}"/></linearGradient>
<linearGradient id="body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${body.c[0]}"/><stop offset=".5" stop-color="${body.c[1]}"/><stop offset="1" stop-color="${body.c[2]}"/></linearGradient>
<linearGradient id="hill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b1e4d"/><stop offset="1" stop-color="#0a0713"/></linearGradient>
<clipPath id="box"><rect x="96" y="128" width="320" height="320" rx="80"/></clipPath>
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<rect width="512" height="512" fill="url(#bg)"/>
${bgPattern(pat.name, r, light)}
<rect x="96" y="128" width="320" height="320" rx="80" fill="${body.c[1]}" opacity=".55" filter="url(#glow)"/>
<rect x="96" y="128" width="320" height="320" rx="80" fill="url(#body)"/>
<g clip-path="url(#box)"><path d="M80 388 C 120 268, 205 193, 320 198 C 380 203, 420 238, 435 278 L435 468 L80 468 Z" fill="url(#hill)"/></g>
${eyes(e.name)}
${hat(h.name, body.c[1])}
${item(it.name)}
<text x="256" y="490" text-anchor="middle" font-family="ui-monospace, Menlo, monospace" font-size="16" font-weight="700" fill="${light ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.7)'}" letter-spacing="2">PERPCAST MASCOT #${id}</text>
</svg>`
  return { svg, traits, name, mood }
}

mkdirSync(`${OUT}/img`, { recursive: true })
mkdirSync(`${OUT}/meta`, { recursive: true })
const index = []
for (let id = 1; id <= SUPPLY; id++) {
  const { svg, traits, name, mood } = render(id)
  writeFileSync(`${OUT}/img/${id}.svg`, svg)
  const meta = {
    name: `Perpcast Mascot #${id} · ${name}`,
    description: `${name} is a ${mood.toLowerCase()} Perpcast mascot — one of ${SUPPLY} onchain companions for traders who cast on perpcast.app. Minted on Robinhood Chain.`,
    image: `${SITE}/nft/img/${id}.svg`,
    external_url: `${SITE}/nfts/perpcast/${id}`,
    attributes: Object.entries(traits).map(([trait_type, value]) => ({ trait_type, value })),
  }
  writeFileSync(`${OUT}/meta/${id}.json`, JSON.stringify(meta))
  index.push({ id, name, traits })
}
writeFileSync(
  `${OUT}/collection.json`,
  JSON.stringify({
    name: 'Perpcast Mascots',
    symbol: 'PCAST',
    description: `${SUPPLY} generative Perpcast mascots on Robinhood Chain. Cast, trade perps and launch tokens with your mascot at your side.`,
    image: `${SITE}/nft/img/1.svg`,
    banner_image: `${SITE}/og.png`,
    external_link: SITE,
    supply: SUPPLY,
    items: index,
  }),
)
console.log(`generated ${SUPPLY} mascots → ${OUT}`)
