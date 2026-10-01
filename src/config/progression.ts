/**
 * What a save has access to, and what it has to earn.
 *
 * Everything the game can show the player exists from the first launch —
 * six portraits, four worlds, three dungeon tiers — and until now every one
 * of them was selectable immediately. That makes the first screen a menu of
 * content rather than a starting point, and it makes the tiers meaningless:
 * a fresh Totem could walk into the 50-word dungeon and be flattened by it,
 * having been told nothing about why.
 *
 * So the openings are declared here, in one place, rather than spread
 * through the screens that happen to render them. Two of the three are flat
 * lists for now because the features that would open them (a roster, world
 * discovery) are not built yet; the tiers are the one that already has a
 * rule, and it is the obvious one — clear a tier's boss and the next tier
 * opens.
 */

import { dungeonTiers, type DungeonTierId } from './balance'
import { hasAsset, resolvedKey } from './assets'
import { creatureExists, isCreatureKey } from '@/systems/creatureTotems'

// ---------------------------------------------------------------------------
// Totems
// ---------------------------------------------------------------------------

/**
 * The Totem a new game starts as.
 *
 * Also the name it starts with: the default used to be '토템', the word
 * "totem", which named the category rather than the character. Dolbae is
 * who you are.
 */
export const STARTING_TOTEM_KEY = 'Dolbae'

/** The portraits a save starts with, before the blacksmith has made any. */
export const unlockedTotemKeys: readonly string[] = [STARTING_TOTEM_KEY]

/**
 * True when this portrait is available.
 *
 * Compared through the same loose resolution the art registry itself uses,
 * so a key that differs only in case or separators still matches the one
 * file it means. A key naming nothing at all is checked first, because
 * resolvedKey() answers such a key with the category's fallback — which for
 * the totems folder is simply whichever file comes first, and would read as
 * unlocked for any junk string handed in.
 *
 * `forged` is the save's own list — the portraits the blacksmith has struck
 * for this player. It is a parameter rather than a store read because this
 * file is configuration: what ships open is a build-time fact, what has
 * been earned is a save-time one, and the caller is the only one holding
 * both. It defaults to empty, which is what a fresh save has.
 */
export function isTotemUnlocked(avatarKey: string, forged: readonly string[] = []): boolean {
  // A creature is never shipped open — it has to be met and then struck —
  // and its key names world art rather than a portrait, so the loose
  // portrait resolution below would answer for the wrong thing entirely.
  // An exact match against what this save has forged is the whole rule.
  if (isCreatureKey(avatarKey)) {
    return creatureExists(avatarKey) && forged.includes(avatarKey)
  }
  if (!hasAsset('totems', avatarKey)) return false
  const asked = resolvedKey('totems', avatarKey)
  return [...unlockedTotemKeys, ...forged].some(
    (key) => !isCreatureKey(key) && resolvedKey('totems', key) === asked,
  )
}

// ---------------------------------------------------------------------------
// Worlds
// ---------------------------------------------------------------------------

/** The world a new game can enter. */
export const STARTING_WORLD_ID = 'dragon-king-palace'

/** The worlds a save may actually enter. */
export const unlockedWorldIds: readonly string[] = [STARTING_WORLD_ID]

export function isWorldUnlocked(worldId: string): boolean {
  return unlockedWorldIds.includes(worldId)
}

// ---------------------------------------------------------------------------
// Dungeon tiers
// ---------------------------------------------------------------------------

/** The tiers in the order they open, shallowest first. */
export const tierOrder: readonly DungeonTierId[] = dungeonTiers.map((t) => t.id)

/**
 * The tier whose boss must fall before this one opens, or null for the
 * first tier, which is always open.
 */
export function tierRequirement(tierId: DungeonTierId): DungeonTierId | null {
  const index = tierOrder.indexOf(tierId)
  if (index <= 0) return null
  return tierOrder[index - 1]
}

/**
 * True when this Totem may enter this tier.
 *
 * Per Totem, not per save: each one is its own character with its own record,
 * so a second Totem earns its own way down rather than inheriting the first
 * one's clears. An unknown tier id (a save naming a tier that no longer
 * exists) reads as locked, and the caller falls back to the first tier.
 */
export function isTierUnlocked(tierId: DungeonTierId, clearedTiers: readonly DungeonTierId[]): boolean {
  if (!tierOrder.includes(tierId)) return false
  const required = tierRequirement(tierId)
  return required === null || clearedTiers.includes(required)
}

/** The deepest tier this Totem may enter — what a picker should default to. */
export function deepestUnlockedTier(clearedTiers: readonly DungeonTierId[]): DungeonTierId {
  let deepest = tierOrder[0]
  for (const tierId of tierOrder) {
    if (!isTierUnlocked(tierId, clearedTiers)) break
    deepest = tierId
  }
  return deepest
}
