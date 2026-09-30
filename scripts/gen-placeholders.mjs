// Fills in neutral placeholder PNG art for any asset slot the game
// references (src/config/assets.ts) that doesn't have a file yet. No
// external dependencies — encodes raw PNGs by hand (IHDR/IDAT/IEND) using
// Node's built-in zlib deflate.
//
// Only ever creates files that are missing — it never overwrites an
// existing public/assets/** file, so replacing a placeholder with real
// artwork is permanent: just commit the real PNG over the placeholder
// and this script (which reruns on every `npm install`) will leave it
// alone from then on.

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { REQUIRED_LOCATIONS, REQUIRED_EVENTS, MIN_NPCS, MIN_ENEMIES } from './worldSlots.mjs'
import { artIn, artPath } from './artFiles.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = join(__dirname, '..', 'public', 'assets')
const SIZE = 256

function crc32(buf) {
  let c
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c >>> 0
    }
    return t
  })())
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/** pixelFn(x, y) -> [r,g,b,a] (0-255) */
function encodePNG(width, height, pixelFn) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type RGBA
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = chunk('IHDR', ihdrData)

  const raw = Buffer.alloc((width * 4 + 1) * height)
  let offset = 0
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0 // no filter
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      raw[offset++] = r
      raw[offset++] = g
      raw[offset++] = b
      raw[offset++] = a
    }
  }
  const idat = chunk('IDAT', deflateSync(raw, { level: 9 }))
  const iend = chunk('IEND', Buffer.alloc(0))
  return Buffer.concat([sig, ihdr, idat, iend])
}

// ---- drawing helpers -------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(a, b, t) {
  return a.map((v, i) => Math.round(v + (b[i] - v) * t))
}

/**
 * Renders a soft vignette background with a centered geometric glyph so
 * every placeholder is instantly distinguishable by category/variant even
 * without text.
 */
function drawPlaceholder({ bg, accent, shape }) {
  const bgRgb = hexToRgb(bg)
  const accentRgb = hexToRgb(accent)
  const cx = SIZE / 2
  const cy = SIZE / 2
  const r = SIZE * 0.32

  return encodePNG(SIZE, SIZE, (x, y) => {
    const dx = x - cx
    const dy = y - cy
    const dist = Math.sqrt(dx * dx + dy * dy)
    // vignette: darker toward edges
    const vignette = Math.min(1, dist / (SIZE * 0.75))
    const base = mix(bgRgb, [0, 0, 0], vignette * 0.35)

    let inShape = false
    switch (shape) {
      case 'circle':
        inShape = dist < r
        break
      case 'square': {
        inShape = Math.abs(dx) < r * 0.85 && Math.abs(dy) < r * 0.85
        break
      }
      case 'diamond':
        inShape = Math.abs(dx) + Math.abs(dy) < r * 1.1
        break
      case 'triangle': {
        const h = r * 1.3
        const ny = dy + r * 0.6
        inShape = ny > -h * 0.15 && ny < h && Math.abs(dx) < (h - ny) * 0.6 + 2
        break
      }
      case 'chest': {
        const w = r * 1.25
        const h = r * 0.95
        const body = Math.abs(dx) < w && dy > -h * 0.1 && dy < h
        const lid = Math.abs(dx) < w && dy > -h * 0.75 && dy < -h * 0.1
        const band = Math.abs(dx) < r * 0.14
        inShape = (body || lid) && !(band && dy > -h * 0.75 && dy < h * 0.2 && Math.abs(dx) > r * 0.02)
        break
      }
      case 'card': {
        const w = r * 0.95
        const h = r * 1.35
        inShape = Math.abs(dx) < w && Math.abs(dy) < h
        break
      }
      case 'skull': {
        const headR = r * 0.85
        const inHead = dist < headR && dy < headR * 0.35
        const jaw = Math.abs(dx) < headR * 0.6 && dy >= headR * 0.15 && dy < headR * 0.75
        const eyeL = Math.hypot(dx + headR * 0.35, dy - headR * 0.05) < headR * 0.22
        const eyeR = Math.hypot(dx - headR * 0.35, dy - headR * 0.05) < headR * 0.22
        inShape = (inHead || jaw) && !eyeL && !eyeR
        break
      }
      case 'bolt': {
        // simple lightning-bolt-ish zigzag using two triangles
        const t1 = dx * 0.6 + dy * 0.3 > -r * 0.2 && dx * 0.6 + dy * 0.3 < r * 0.5 && dy < r * 0.2 && dy > -r
        const t2 = -dx * 0.6 + dy * 0.3 > -r * 0.5 && -dx * 0.6 + dy * 0.3 < r * 0.2 && dy > -r * 0.2 && dy < r
        inShape = t1 || t2
        break
      }
      default:
        inShape = dist < r
    }

    if (inShape) {
      const shade = mix(accentRgb, [255, 255, 255], Math.max(0, 0.25 - dist / SIZE))
      return [shade[0], shade[1], shade[2], 255]
    }
    // subtle border ring
    if (dist > SIZE * 0.47 && dist < SIZE * 0.49) {
      return [accentRgb[0], accentRgb[1], accentRgb[2], 120]
    }
    return [base[0], base[1], base[2], 255]
  })
}

// ---- desired asset slots ---------------------------------------------
//
// This is the list of art the game wants to exist, used only to fill gaps.
// It is NOT the registry: src/config/assets.ts is generated by scanning the
// folder (scripts/gen-asset-manifest.mjs), so a file added here — or dropped
// in by hand — is picked up either way.

// ---- what to fill in ---------------------------------------------------
//
// Two jobs. Global art (Totems, Spell cards) lives outside any world and is
// listed by name. World art is filled by slot: any pack missing a required
// location or event, or short of its NPC or enemy minimum, gets stand-ins so
// it is playable while the real art is drawn. Nothing is ever overwritten,
// so replacing a placeholder with real artwork is permanent.

const globalManifest = {
  // Named totems are content, not slots: nothing in the game requires a
  // particular one, and generating a fixed list meant a placeholder someone
  // deleted came back on the next build.
  //
  // `default` is generated only into an empty folder. It is a fallback for
  // having no portraits at all, and getAsset() already falls back to the
  // first portrait when there is no `default` — so a folder with real art in
  // it does not need one. Generating it regardless is how renaming
  // default.webp to Dolbae.webp put a grey circle in front of every save
  // that still named `default`, in place of the art it had been showing.
  totems: {
    palette: { bg: '#1f2a3a', accent: '#5fa8e0' },
    items: { default: 'circle' },
    onlyWhenEmpty: true,
  },
  // The word shop's keeper. A real slot rather than flavour: the import
  // screen always shows someone behind the counter, so a stand-in here is
  // filling a gap rather than taking a turn ahead of real art. Generated
  // only into an empty folder, so dropping the drawn portrait in over it is
  // permanent.
  shop: {
    palette: { bg: '#2a2218', accent: '#e8c04a' },
    items: { keeper: 'circle' },
    onlyWhenEmpty: true,
  },
  // Spell icons are flavour, not slots: pickFlavorKey() spreads whatever is
  // in the folder across the cards, so a generated stand-in does not fill a
  // gap — it takes a turn in the rotation ahead of real art. Renaming
  // arcane.webp to dark.webp put a grey card back in front of one spell in
  // seven. Generated only into an empty folder, same as the totems.
  spells: {
    palette: { bg: '#1a1a2e', accent: '#f2c14e' },
    items: {
      default: 'card',
      fire: 'card',
      water: 'card',
      earth: 'card',
      wind: 'card',
      arcane: 'card',
    },
    onlyWhenEmpty: true,
  },
}

/** Shape and colour per world slot, so a stand-in still reads as its room. */
const WORLD_STYLE = {
  locations: {
    palette: { bg: '#1b2a2f', accent: '#4fb0a5' },
    shapes: {
      entrance: 'triangle', corridor1: 'square', corridor2: 'square',
      keyRoom: 'diamond', restRoom: 'circle', pathwayFork: 'triangle',
      shrineRoom: 'diamond', treasureRoom: 'chest', trapRoom: 'bolt',
      bossRoom: 'skull', battle: 'triangle', battle2: 'triangle',
    },
  },
  events: {
    palette: { bg: '#2a2440', accent: '#a58bd8' },
    shapes: {
      bossDoor: 'skull', roadSign: 'diamond', key: 'card',
      trap1: 'bolt', trap2: 'bolt', treasureLocked: 'chest',
      treasureOpened: 'chest', treasureMimic: 'skull',
      rest: 'circle', shrineDoor: 'diamond',
    },
  },
  npcs: { palette: { bg: '#1c2a22', accent: '#6fbf8f' }, shapes: {} },
  enemies: { palette: { bg: '#251b2e', accent: '#c15fd0' }, shapes: {} },
}

// Slight per-key accent shifts, so stand-ins are told apart at a glance.
const accentShift = {
  entrance: '#5fbf6a', corridor1: '#6b7d99', corridor2: '#8090aa',
  keyRoom: '#d8b98b', restRoom: '#7fb8d8', pathwayFork: '#a58bd8',
  shrineRoom: '#7fd8c8', treasureRoom: '#e8c04a', trapRoom: '#e0654f',
  bossRoom: '#f24545', battle: '#c15fd0', battle2: '#b04fc0',
  bossDoor: '#f24545', roadSign: '#a58bd8', key: '#d8b98b',
  trap1: '#e0654f', trap2: '#e07a5f', treasureLocked: '#e8c04a',
  treasureOpened: '#9adb6b', treasureMimic: '#f2453f',
  rest: '#7fb8d8', shrineDoor: '#7fd8c8',
  totem_ember: '#e0774f', totem_tide: '#4fb6e0', totem_stone: '#9a9a7f',
  totem_silverKnight: '#c9ced8',
  fire: '#f2653f', water: '#4f9ef2', earth: '#8f6f3f', wind: '#bfe0f2', arcane: '#c15fe0',
  prowler: '#c15fd0', shade: '#9f8fe0', brute: '#e0654f', crawler: '#6bdb8f', sentinel: '#8fa0c0',
  wanderer: '#6fbf8f', merchant: '#e8c04a', scholar: '#7fb8d8', pilgrim: '#c9a0dc', hunter: '#e0904f',
}

/** Stand-in names used only to reach the NPC and enemy minimums. */
const FILLER_NPCS = ['wanderer', 'merchant', 'scholar', 'pilgrim', 'hunter']
const FILLER_ENEMIES = ['prowler', 'shade', 'brute', 'crawler', 'sentinel']

let generated = 0
let skipped = 0

function ensure(dir, key, palette, shape) {
  mkdirSync(dir, { recursive: true })
  // Never clobber real artwork someone has dropped in to replace a
  // placeholder — only fill in slots that have no file yet, in any format.
  // Checking for `.png` alone would bury optimized art under a placeholder.
  if (artPath(dir, key)) { skipped++; return }
  const target = join(dir, `${key}.png`)
  const accent = accentShift[key] || palette.accent
  writeFileSync(target, drawPlaceholder({ bg: palette.bg, accent, shape }))
  generated++
}

// --- global art ---
for (const [category, def] of Object.entries(globalManifest)) {
  const dir = join(OUT_ROOT, category)
  if (def.onlyWhenEmpty && artIn(dir).length > 0) continue
  for (const [key, shape] of Object.entries(def.items)) ensure(dir, key, def.palette, shape)
}

// --- world packs ---
const WORLDS_ROOT = join(__dirname, '..', 'public', 'worlds')
const worldIds = existsSync(WORLDS_ROOT)
  ? readdirSync(WORLDS_ROOT).filter((d) => statSync(join(WORLDS_ROOT, d)).isDirectory())
  : []

for (const id of worldIds) {
  const root = join(WORLDS_ROOT, id)
  const has = (folder) => {
    const dir = join(root, folder)
    return artIn(dir).map((a) => a.slot)
  }

  for (const slot of REQUIRED_LOCATIONS) {
    ensure(join(root, 'locations'), slot, WORLD_STYLE.locations.palette, WORLD_STYLE.locations.shapes[slot] ?? 'square')
  }
  for (const slot of REQUIRED_EVENTS) {
    ensure(join(root, 'events'), slot, WORLD_STYLE.events.palette, WORLD_STYLE.events.shapes[slot] ?? 'circle')
  }
  // Only top up to the minimum: a world with plenty of its own keeps them.
  const npcs = has('npcs')
  for (const name of FILLER_NPCS) {
    if (has('npcs').length >= MIN_NPCS) break
    if (npcs.includes(name)) continue
    ensure(join(root, 'npcs'), name, WORLD_STYLE.npcs.palette, 'circle')
  }
  const enemies = has('enemies')
  for (const name of FILLER_ENEMIES) {
    if (has('enemies').length >= MIN_ENEMIES) break
    if (enemies.includes(name)) continue
    ensure(join(root, 'enemies'), name, WORLD_STYLE.enemies.palette, 'skull')
  }
}

console.log(
  `Generated ${generated} placeholder PNG(s) under ${OUT_ROOT}` +
    (skipped > 0 ? ` (${skipped} already present — left untouched)` : ''),
)
