import { worldPacks, type WorldPack } from '@/config/worldManifest'
import { bossSlotFor } from '@/config/bosses'
import type { DungeonTierId } from '@/config/balance'

/**
 * The Unwritten Worlds registry.
 *
 * A world is a folder of art under public/worlds. The build compiles each
 * one and records whether it has everything the pack format requires; this
 * module is how the game asks about them. Only complete worlds are ever
 * offered — an incomplete one is a message to whoever is building it, not a
 * broken screen for the player.
 *
 * Art is addressed by slot ('trapRoom', 'treasureMimic') rather than by
 * filename, so every world answers the same questions and adding one needs
 * no code.
 */

const WORLD_BASE = 'worlds'

/** Data URIs for every image, present only in the single-file offline build. */
function inlined(): Record<string, string> | undefined {
  return (globalThis as { __THOTH_INLINE_ASSETS?: Record<string, string> }).__THOTH_INLINE_ASSETS
}

export type WorldFolder = 'locations' | 'events' | 'npcs' | 'enemies' | 'bosses'

export const allWorlds: readonly WorldPack[] = worldPacks

/** The worlds a player may actually enter. */
export function playableWorlds(): WorldPack[] {
  return worldPacks.filter((w) => w.complete)
}

/** Worlds that exist but are missing something, with what they need. */
export function incompleteWorlds(): WorldPack[] {
  return worldPacks.filter((w) => !w.complete)
}

export function findWorld(id: string | null | undefined): WorldPack | undefined {
  if (!id) return undefined
  return worldPacks.find((w) => w.id === id)
}

/**
 * The world a run should use: the one asked for when it is playable, else
 * the first playable world. Returns undefined only when no world is
 * complete, which the setup screen reports rather than starting a run.
 */
export function resolveWorld(id: string | null | undefined): WorldPack | undefined {
  const asked = findWorld(id)
  if (asked?.complete) return asked
  return playableWorlds()[0]
}

/** The URL for one slot, or null when that world has no such file. */
export function worldAsset(world: WorldPack, folder: WorldFolder, slot: string): string | null {
  const available: readonly string[] =
    folder === 'locations'
      ? world.locations
      : folder === 'events'
        ? world.events
        : folder === 'npcs'
          ? world.npcs
          : folder === 'enemies'
            ? world.enemies
            : world.bosses
  if (!available.includes(slot)) return null
  const path = `${WORLD_BASE}/${world.id}/${folder}/${world.files[`${folder}/${slot}`] ?? `${slot}.png`}`
  return inlined()?.[path] ?? path
}

/**
 * First slot that exists, or null. Lets a caller name a preference and a
 * fallback — the battle backdrops, say, which not every world ships.
 */
export function resolveSlot(
  world: WorldPack,
  folder: WorldFolder,
  candidates: readonly string[],
): string | null {
  for (const slot of candidates) {
    if (worldAsset(world, folder, slot)) return slot
  }
  return null
}

/**
 * The art a boss should use.
 *
 * A cast world names its boss per tier (config/bosses.ts), so the three
 * depths have three faces and you meet them in order. Anything else falls
 * back to the seeded pick: a world may ship its own bosses folder, and one
 * that doesn't borrows an enemy, so a pack is complete without boss art.
 *
 * A named boss the world does not actually ship falls through to the pick
 * rather than to a blank, which keeps a typo or a half-added world playable.
 */
export function bossSlot(
  world: WorldPack,
  seed: string,
  tierId?: DungeonTierId,
): { folder: WorldFolder; slot: string } | null {
  if (tierId) {
    const cast = bossSlotFor(world.id, tierId)
    if (cast && world.bosses.includes(cast)) return { folder: 'bosses', slot: cast }
  }
  const pool = world.bosses.length > 0 ? world.bosses : world.enemies
  const folder: WorldFolder = world.bosses.length > 0 ? 'bosses' : 'enemies'
  if (pool.length === 0) return null
  return { folder, slot: pool[hash(seed) % pool.length] }
}

/** Deterministic pick from a world's own list, so a seed always agrees. */
export function pickSlot(pool: readonly string[], seed: string): string | null {
  if (pool.length === 0) return null
  return pool[hash(seed) % pool.length]
}

function hash(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

/** A readable name from a slot: `silver_knight` -> "Silver Knight". */
export function nameFromSlot(slot: string): string {
  return slot
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
