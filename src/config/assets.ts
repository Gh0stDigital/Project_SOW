/**
 * Local asset configuration.
 *
 * All game art is bundled as local image files under /public/assets — nothing
 * is ever fetched from the network. Every lookup here falls back to a
 * neutral placeholder so the game stays fully playable before final art
 * exists.
 *
 * The catalogue is generated from the folder itself (assetManifest.ts, via
 * scripts/gen-asset-manifest.mjs) rather than hand-listed. Dropping an image
 * into public/assets/<category>/ is all it takes to make it usable — there
 * is no second place to remember to update.
 */

import { assetFiles, assetFrames, assetManifest } from './assetManifest'

export type AssetCategory = keyof typeof assetManifest

const BASE = 'assets'

/**
 * Data URIs for every image, present only in the single-file offline
 * build (see scripts/bundle-offline.mjs), which inlines the art so one
 * HTML file is the whole game. Absent in every other build, where images
 * are ordinary sibling files.
 */
function inlinedAssets(): Record<string, string> | undefined {
  return (globalThis as { __THOTH_INLINE_ASSETS?: Record<string, string> }).__THOTH_INLINE_ASSETS
}

function assetUrl(category: string, file: string): string {
  // Vite serves /public at the app root; base: './' in vite.config.ts keeps
  // this working when the built app is opened directly from disk.
  const path = `${BASE}/${category}/${assetFiles[`${category}/${file}`] ?? `${file}.png`}`
  return inlinedAssets()?.[path] ?? path
}

const registry = Object.fromEntries(
  Object.entries(assetManifest).map(([category, keys]) => [
    category,
    Object.fromEntries((keys as readonly string[]).map((key) => [key, assetUrl(category, key)])),
  ]),
) as Record<AssetCategory, Record<string, string>>

/**
 * Keys matched loosely: lowercased with separators removed, so `dkp_keyRoom`,
 * `dkp-keyroom` and `DKPKeyRoom` all name the same art. Art tends to arrive
 * named by hand, and a capital letter is not worth a missing image.
 */
function normalize(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * A `totem_` prefix is decoration, not identity.
 *
 * Portraits have been named both ways — `totem_stone` and `silverKnight` sit
 * in the folder together — and renaming a file is how a Totem loses its face:
 * a save holding `totem_silverKnight` finds nothing once the file is called
 * `silverKnight`, and falls back to the default portrait. Matching with the
 * prefix ignored means that rename costs nobody their character.
 */
function stripTotemPrefix(normalized: string): string {
  return normalized.startsWith('totem') ? normalized.slice('totem'.length) : normalized
}

/**
 * Art that has been renamed, old name to new.
 *
 * Saves hold the key they were written with, and a portrait is the one
 * thing a player would notice losing. Dropping the `totem_` prefix was a
 * pattern this could infer; `SilverFinal` becoming `Silver Knight` is not,
 * so it is written down. Keys are normalised, so spelling and spacing on
 * either side do not matter.
 */
const RENAMED: Record<string, string> = {
  silverfinal: 'silverknight',
}

function looseTable(keys: string[]): Record<string, string> {
  const table: Record<string, string> = {}
  // Exact spellings first, so no bare form can displace one: `stone` must
  // keep meaning `stone` even when `totem_stone` sits beside it.
  for (const key of keys) table[normalize(key)] = key
  for (const key of keys) {
    const bare = stripTotemPrefix(normalize(key))
    if (bare && !(bare in table)) table[bare] = key
  }
  return table
}

const loose: Record<AssetCategory, Record<string, string>> = Object.fromEntries(
  Object.entries(registry).map(([category, table]) => [category, looseTable(Object.keys(table))]),
) as Record<AssetCategory, Record<string, string>>

/** Looks a key up loosely: exact spelling first, then without the prefix. */
function looseLookup(category: AssetCategory, key: string): string | undefined {
  const table = loose[category]
  if (!table) return undefined
  const normalized = normalize(key)
  return (
    table[normalized] ??
    table[stripTotemPrefix(normalized)] ??
    // Last: what this art used to be called.
    (RENAMED[normalized] ? table[RENAMED[normalized]] : undefined)
  )
}

/**
 * The key a lookup will actually use — the spelling asked for when it names
 * real art, otherwise whatever the fallback resolves to.
 *
 * Anything keyed off a portrait rather than drawing it needs this. A Totem
 * whose saved key is `default` is *shown* as the first real portrait, so
 * asking for `default`'s written lore got a picture of one character with
 * another's blank underneath it.
 */
export function resolvedKey(category: AssetCategory, key?: string | null): string {
  if (!registry[category]) return ''
  if (key) {
    if (registry[category][key]) return key
    const match = looseLookup(category, key)
    if (match) return match
  }
  return fallbackKey(category)
}

/** The key a category falls back to: its `default`, else whatever it has. */
function fallbackKey(category: AssetCategory): string {
  const table = registry[category]
  return 'default' in table ? 'default' : Object.keys(table)[0]
}

/**
 * Resolve an asset path for a category + key, falling back to that
 * category's "default" placeholder when the key is missing or blank.
 */
export function getAsset(category: AssetCategory, key?: string | null): string {
  const table = registry[category]
  if (!table) return ''
  if (key) {
    if (table[key]) return table[key]
    const match = looseLookup(category, key)
    if (match) return table[match]
  }
  return table[fallbackKey(category)]
}

/**
 * Deterministically pick a "random" flavor asset key for a category from an
 * id string.
 *
 * Callers that want to name the art rather than draw it want the key, not a
 * path: a path cannot be turned back into a key in the single-file offline
 * build, where it is a data URI with no filename in it.
 */
export function pickFlavorKey(category: AssetCategory, seed: string): string {
  const table = registry[category]
  const fallback = fallbackKey(category)
  const keys = Object.keys(table).filter((k) => k !== fallback)
  if (keys.length === 0) return fallback
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return keys[hash % keys.length]
}

/**
 * The art named by `key`, or a stand-in from the same folder when the folder
 * has none for it.
 *
 * What a spell icon needs: the element's own seal where one is painted, and
 * something rather than nothing where it is not — `lightning` and `metal`
 * have no art yet, and a card face with a hole in it is worse than a card
 * face borrowing a neighbour's. Drop the missing art in and every one of
 * these picks it up without a code change.
 */
export function assetKeyOrFlavor(category: AssetCategory, key: string, seed: string): string {
  return hasAsset(category, key) ? key : pickFlavorKey(category, seed)
}

/** The same pick, as a drawable path. */
export function pickFlavor(category: AssetCategory, seed: string): string {
  return registry[category][pickFlavorKey(category, seed)]
}

export const assetRegistry = registry

/**
 * Art that the game works without.
 *
 * The manifest only lists categories that have files in them, so a category
 * the game references before any art exists for it — interface art, which is
 * the whole point of this — cannot be named in AssetCategory yet. Returning
 * null rather than a placeholder is what lets a caller fall back to something
 * else, the way the main menu keeps its written title until a logo is added.
 */
export function optionalAsset(category: string, key: string): string | null {
  const table = (registry as Record<string, Record<string, string> | undefined>)[category]
  if (!table) return null
  if (table[key]) return table[key]
  const match = looseLookup(category as AssetCategory, key)
  return match ? table[match] : null
}

/**
 * Every key a category offers, in registry order. This is the list the UI
 * picks from, so anything dropped into public/assets/<category>/ becomes
 * selectable with no other change.
 */
export function assetKeys(category: AssetCategory): string[] {
  return Object.keys(registry[category] ?? {})
}

/**
 * Every frame of an animated asset, in order, or an empty array.
 *
 * Empty is the ordinary answer: almost all art is one picture, and a caller
 * that gets nothing back should draw the single image from getAsset(). Only
 * art stored as a folder of frames (see scripts/artFiles.mjs) answers here,
 * and its first frame is the same file getAsset() returns — so the still
 * and the animation can never drift apart.
 */
export function framesFor(category: AssetCategory, key?: string | null): string[] {
  if (!key || !registry[category]) return []
  const resolved = registry[category][key] ? key : looseLookup(category, key)
  if (!resolved) return []
  const frames = assetFrames[`${category}/${resolved}`]
  if (!frames || frames.length < 2) return []
  return frames.map((file) => {
    const path = `${BASE}/${category}/${file}`
    return inlinedAssets()?.[path] ?? path
  })
}

/** True when a key names real art rather than falling back to the placeholder. */
export function hasAsset(category: AssetCategory, key: string): boolean {
  if (!registry[category]) return false
  return key in registry[category] || looseLookup(category, key) !== undefined
}

/**
 * First candidate that names real art, or null. Lets callers list several
 * spellings and preferences for one slot and take whichever exists.
 */
export function resolveKey(category: AssetCategory, candidates: readonly string[]): string | null {
  if (!registry[category]) return null
  for (const candidate of candidates) {
    if (registry[category][candidate]) return candidate
    const match = looseLookup(category, candidate)
    if (match) return match
  }
  return null
}
