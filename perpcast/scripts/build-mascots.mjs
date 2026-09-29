// Builds /public/nft/{img,meta,collection.json} for the Perpcast Mascots collection
// from the curated pixel-art source PNGs in scripts/mascots-src/<id>.png.
// Usage: node scripts/build-mascots.mjs
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, 'scripts', 'mascots-src')
const OUT = join(root, 'public', 'nft')
const SITE = 'https://perpcast.app'

// [name, Element, Background, Hat, Item, Aura]
const ITEMS = [
  ['Arcane Pip', 'Arcane', 'Twilight Violet', 'Violet Wizard Hat', 'Amethyst Orb Staff', 'Purple Flame'],
  ['Ember Wick', 'Fire', 'Ember Red', 'Crimson Wizard Hat', 'Torch Staff', 'Fire'],
  ['Lunar Gwei', 'Celestial', 'Midnight Blue', 'Star-Runed Hat', 'Crescent Moon Staff', 'Starlight'],
  ['Void Ledger', 'Shadow', 'Obsidian Smoke', 'Black Wizard Hat', 'Shadow Crystal Staff', 'Violet Mist'],
  ['Solar Halo', 'Light', 'Golden Dawn', 'Ivory Wizard Hat', 'Sun Sceptre', 'Golden Halo'],
  ['Bloom Robin', 'Nature', 'Meadow Green', 'Leaf-Trimmed Hat', 'Blossom Branch', 'Petals'],
  ['Frost Delta', 'Ice', 'Glacier Blue', 'Frosted Wizard Hat', 'Ice Crystal Staff', 'Snowflakes'],
  ['Sakura Cast', 'Nature', 'Sakura Pink', 'Blossom Hat', 'Cherry Branch', 'Petals'],
  ['Nebula Vega', 'Arcane', 'Cosmic Purple', 'Rune Hat', 'Nebula Orb Staff', 'Purple Flame'],
  ['Dune Satoshi', 'Earth', 'Desert Ruins', 'Traveller Hat', 'Lantern', 'Sandstorm'],
  ['Neon Glitch', 'Cyber', 'Neon City', 'Circuit Hat', 'Holo Tablet', 'Neon Glow'],
  ['Maple Theta', 'Nature', 'Autumn Orange', 'Maple-Leaf Hat', 'Autumn Branch', 'Falling Leaves'],
  ['Inferno Pump', 'Fire', 'Blood Red', 'Flame Hat', 'Blazing Orb Staff', 'Fire'],
  ['Zap Lumen', 'Lightning', 'Amber Storm', 'Gilded Hat', 'Lightning Sceptre', 'Sparks'],
  ['Alchemist Moss', 'Nature', 'Deep Forest', 'Mossy Hat', 'Potion Flask', 'Fireflies'],
  ['Galaxy Orbit', 'Celestial', 'Deep Space', 'Nebula Hat', 'Planet Orb', 'Stardust'],
  ['Phantom Bloc', 'Spirit', 'Haunted Grey', 'Ghost Hat', 'Wisp Staff', 'Ghosts'],
  ['Compass Nova', 'Light', 'Midnight Gold', 'Star Hat', 'Compass Rose Staff', 'Gold Stars'],
  ['Nomad Hash', 'Earth', 'Desert Dunes', 'Sand Hood', 'Sun Disk', 'Sandstorm'],
  ['Ranger Byte', 'Steel', 'Pine Forest', 'Ranger Hat', 'Steel Sword', 'Mist'],
  ['Crown Perp', 'Royal', 'Marble Hall', 'Jewelled Crown Hat', 'Royal Sceptre', 'Gold Trim'],
  ['Tide Gamma', 'Water', 'Ocean Blue', 'Wave Hat', 'Tide Orb Staff', 'Water Swirl'],
  ['Torii Oracle', 'Spirit', 'Shrine Red', 'Kabuto Hat', 'Prayer Scroll', 'Lanterns'],
  ['Prism Pixel', 'Crystal', 'Amethyst Cave', 'Crystal Hat', 'Prism Shard Staff', 'Crystals'],
  ['Pumpkin Dip', 'Shadow', 'Halloween Night', 'Bat Hat', 'Jack-o-Lantern', 'Bats'],
  ['Seraph Moon', 'Light', 'Rosé Sky', 'Winged Hat', 'Light Orb Staff', 'Feathers'],
  ['Abyss Nibble', 'Shadow', 'Void Black', 'Dark Rune Hat', 'Void Orb', 'Dark Flame'],
  ['Tinker Vault', 'Steel', 'Workshop Green', 'Goggle Hat', 'Green Potion', 'Gears'],
  ['Astral Gwei', 'Celestial', 'Star Chart', 'Astral Hat', 'Scales Staff', 'Constellations'],
  ['Amethyst Zap', 'Crystal', 'Magenta Cave', 'Gem Hat', 'Crystal Wand', 'Crystals'],
]

const files = readdirSync(SRC).filter((f) => /^\d+\.png$/.test(f))
if (files.length !== ITEMS.length) throw new Error(`Expected ${ITEMS.length} source PNGs, found ${files.length}`)

rmSync(join(OUT, 'img'), { recursive: true, force: true })
rmSync(join(OUT, 'meta'), { recursive: true, force: true })
mkdirSync(join(OUT, 'img'), { recursive: true })
mkdirSync(join(OUT, 'meta'), { recursive: true })

const items = ITEMS.map(([name, element, background, hat, item, aura], i) => {
  const id = i + 1
  copyFileSync(join(SRC, `${id}.png`), join(OUT, 'img', `${id}.png`))
  const traits = { Element: element, Background: background, Hat: hat, Item: item, Aura: aura }
  writeFileSync(
    join(OUT, 'meta', `${id}.json`),
    JSON.stringify({
      name: `Perpcast Mascot #${id} · ${name}`,
      description: `${name} is a ${element.toLowerCase()} mage of the Perpcast order — one of ${ITEMS.length} pixel-art companions for traders who cast on perpcast.app. Minted on Robinhood Chain.`,
      image: `${SITE}/nft/img/${id}.png`,
      external_url: `${SITE}/nfts/perpcast/${id}`,
      attributes: Object.entries(traits).map(([trait_type, value]) => ({ trait_type, value })),
    }),
  )
  return { id, name, traits }
})

writeFileSync(
  join(OUT, 'collection.json'),
  JSON.stringify({
    name: 'Perpcast Mascots',
    symbol: 'PCAST',
    description: `${ITEMS.length} pixel-art mage mascots of Perpcast on Robinhood Chain. Cast, trade perps and launch tokens with your mascot at your side.`,
    image: `${SITE}/nft/collection-logo.png`,
    banner_image: `${SITE}/nft/collection-banner.png`,
    featured_image: `${SITE}/nft/img/1.png`,
    external_link: SITE,
    collaborators: ['0x5384a862EEA70013D2e711aB44308ce8FCc28290'],
    seller_fee_basis_points: 500,
    fee_recipient: '0x5384a862EEA70013D2e711aB44308ce8FCc28290',
    supply: ITEMS.length,
    items,
  }),
)
console.log(`built ${items.length} mascots`)
