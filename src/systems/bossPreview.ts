/**
 * What is waiting at the bottom of a dungeon, before you walk into it.
 *
 * The setup screen shows the boss alongside the Totem you are taking, so
 * the choice of tier is a choice of opponent rather than a number. That
 * only works if this agrees with the run: both go through the same seed and
 * the same cast table, so what is shown is what you meet.
 *
 * Pure, and takes no randomness of its own.
 */

import type { WorldPack } from '@/config/worldManifest'
import type { DungeonTierId } from '@/config/balance'
import { enemyLevelRange } from '@/config/balance'
import { bossHpForLevel } from './enemyLevel'
import { bossSlot, type WorldFolder } from './worldRegistry'
import { enemyNameFor } from './battleEngine'

/** The seed a world's guardian is picked with, here and in the run alike. */
export function bossSeed(worldId: string, tierId: DungeonTierId): string {
  return `boss-${worldId}-${tierId}`
}

export interface BossPreview {
  folder: WorldFolder
  slot: string
  name: string
  /** A boss does not roll — it stands at the top of its tier's band. */
  level: number
  maxHp: number
}

/**
 * The boss this world and tier fields, or null when the world ships no art
 * to show — an unfinished pack, which the setup screen already reports in
 * its own way rather than drawing a gap.
 */
export function bossPreview(
  world: WorldPack | undefined,
  tierId: DungeonTierId,
): BossPreview | null {
  if (!world) return null
  const art = bossSlot(world, bossSeed(world.id, tierId), tierId)
  if (!art) return null
  const level = enemyLevelRange(world.id, tierId)[1]
  return {
    folder: art.folder,
    slot: art.slot,
    name: enemyNameFor(art.slot),
    level,
    maxHp: bossHpForLevel(level),
  }
}
