/**
 * Who stands at the end of each dungeon.
 *
 * A world's boss used to be one hash away from random: `bossSlot()` picked
 * from the bosses folder by a seed, so the three depths of a world all met
 * the same creature, or three creatures in no particular order. That makes a
 * tier a number rather than a place — there is nothing to tell a player they
 * have reached the bottom of the Dragon King's Palace rather than the middle
 * of it.
 *
 * Named per world and per tier instead, so the depths have faces and the
 * order is the order you meet them in. A world with no entry here still
 * works: it falls back to the seeded pick, which is what every world did
 * before and what an unfinished pack still needs.
 */

import type { DungeonTierId } from './balance'

/**
 * Art slot per world per tier — the filename in that world's `bosses/`
 * folder, without its extension.
 */
const WORLD_TIER_BOSSES: Record<string, Partial<Record<DungeonTierId, string>>> = {
  'dragon-king-palace': {
    tier10: 'minotaur',
    tier25: 'waterDragonRyu',
    tier50: 'dragonWarriorWarden',
  },
}

/**
 * The boss this world and tier should field, or null when the world has not
 * been cast and the seeded pick should stand in.
 */
export function bossSlotFor(worldId: string, tierId: DungeonTierId): string | null {
  return WORLD_TIER_BOSSES[worldId]?.[tierId] ?? null
}

/** Every boss a world fields, in tier order. For the bestiary and tests. */
export function bossesOfWorld(worldId: string): string[] {
  const table = WORLD_TIER_BOSSES[worldId]
  if (!table) return []
  return Object.values(table).filter((slot): slot is string => !!slot)
}

/** Worlds that have been cast, for tests that want to check them all. */
export const castWorldIds: readonly string[] = Object.keys(WORLD_TIER_BOSSES)
