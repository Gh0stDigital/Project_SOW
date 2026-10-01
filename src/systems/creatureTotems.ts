/**
 * Creatures as Totems: the key format, and what a save knows about them.
 *
 * A Totem's `avatarKey` named a file in assets/totems, which is why only
 * painted portraits could be one. A creature's art lives in its world's
 * pack instead — public/worlds/<id>/enemies/<slot> — so wearing one means
 * the key has to be able to say which world and which folder, not just
 * which name.
 *
 * It does that with a prefix: `creature:dragon-king-palace/bosses/minotaur`.
 * Anything without the prefix is an ordinary portrait key and behaves
 * exactly as it always did, so every existing save and every existing
 * lookup is untouched.
 *
 * Pure. The store holds the roster; this is the format and the reading of
 * it.
 */

import type { WorldFolder } from './worldRegistry'
import { findWorld, nameFromSlot, worldAsset } from './worldRegistry'
import { isForgeableCreature, startingLevelFor, type CreatureLevel } from '@/config/creatures'

export const CREATURE_PREFIX = 'creature:'

export interface CreatureRef {
  worldId: string
  folder: WorldFolder
  slot: string
}

/** Only the two folders that hold things you fight. */
const WEARABLE: readonly WorldFolder[] = ['enemies', 'bosses']

export function isCreatureKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith(CREATURE_PREFIX)
}

export function creatureKey(ref: CreatureRef): string {
  return `${CREATURE_PREFIX}${ref.worldId}/${ref.folder}/${ref.slot}`
}

/**
 * Reads a key back, or null for anything that is not one.
 *
 * Rejects a folder that is not fought in and a world this build does not
 * have, so a key from a later version — or a hand-edited save — cannot put
 * a Totem in a backdrop or in nothing at all.
 */
export function parseCreatureKey(key: string | null | undefined): CreatureRef | null {
  if (!isCreatureKey(key)) return null
  const rest = key!.slice(CREATURE_PREFIX.length)
  const parts = rest.split('/')
  if (parts.length !== 3) return null
  const [worldId, folder, slot] = parts
  if (!worldId || !slot) return null
  if (!WEARABLE.includes(folder as WorldFolder)) return null
  return { worldId, folder: folder as WorldFolder, slot }
}

/** The image for a creature key, or null when the art is not in this build. */
export function creatureArt(key: string): string | null {
  const ref = parseCreatureKey(key)
  if (!ref) return null
  const world = findWorld(ref.worldId)
  if (!world) return null
  return worldAsset(world, ref.folder, ref.slot)
}

/** True when this build actually has the art a key names. */
export function creatureExists(key: string | null | undefined): boolean {
  return !!key && creatureArt(key) !== null
}

/** What to call it: the slot, read the way an enemy's name is read. */
export function creatureName(key: string): string {
  const ref = parseCreatureKey(key)
  return ref ? nameFromSlot(ref.slot) : ''
}

/** Which world it came from, for a line saying where you met it. */
export function creatureWorldName(key: string): string {
  const ref = parseCreatureKey(key)
  return (ref && findWorld(ref.worldId)?.name) ?? ''
}

/**
 * Whether the blacksmith could ever strike this one.
 *
 * Some things you fight are not characters you could be — see
 * config/creatures.ts. Checked here rather than only in the workshop so it
 * holds wherever a creature key is handed around.
 */
export function isCreatureForgeable(key: string | null | undefined): boolean {
  const ref = parseCreatureKey(key)
  return !!ref && isForgeableCreature(ref.slot)
}

/** The level a Totem forged from this creature starts at. */
export function creatureStartingLevel(key: string): CreatureLevel {
  const ref = parseCreatureKey(key)
  if (!ref) return { level: 1, provisional: true }
  return startingLevelFor(ref.worldId, ref.folder, ref.slot)
}

/**
 * The roster a save may forge from: every creature it has met whose art
 * this build still has, deepest first.
 *
 * Sorted by starting level so the thing you most want is at the top — the
 * list is a shop window, and a slime above a dragon reads as alphabetical
 * rather than as a ranking.
 */
export function creatureRoster(seen: readonly string[]): string[] {
  return [...new Set(seen)]
    .filter((key) => creatureExists(key) && isCreatureForgeable(key))
    .sort((a, b) => {
      const byLevel = creatureStartingLevel(b).level - creatureStartingLevel(a).level
      return byLevel !== 0 ? byLevel : creatureName(a).localeCompare(creatureName(b))
    })
}

/**
 * The key for a foe that was just spawned, or null when its art is not
 * something you could wear.
 *
 * A Mimic is the null case and deliberately so: it fights wearing a
 * treasure chest, and `events/treasureMimic` is a prop rather than a
 * creature. Beat one and you have met a chest.
 */
export function creatureKeyForImage(
  worldId: string,
  image: { folder: string; slot: string } | null | undefined,
): string | null {
  if (!image?.slot) return null
  if (!WEARABLE.includes(image.folder as WorldFolder)) return null
  return creatureKey({ worldId, folder: image.folder as WorldFolder, slot: image.slot })
}
