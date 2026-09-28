import type { ActiveModifier } from '@/domain/dungeon'
import {
  baseEventWeights,
  bossDoorBalance,
  keyRoomBalance,
  maxRepeatEventStreak,
  onceOnlyEvents,
  type DungeonEventType,
} from '@/config/dungeonEvents'
import { applyModifiers } from './directionModifiers'

/**
 * Weighted dungeon-event selection.
 *
 * Every probability comes from config/dungeonEvents.ts; this module only
 * combines them with the run's live situation (active Direction modifiers,
 * what has already been found, the anti-repeat rule). No UI, no state —
 * randomness arrives through an injected rng so every branch is testable.
 */

export interface EventRollContext {
  history: DungeonEventType[]
  modifiers: ActiveModifier[]
  /** Suppresses a second Boss Door once one has been found. */
  bossDoorFound: boolean
  /**
   * Suppresses further Rest Areas once one has been found.
   *
   * Finding one is what puts it on the hold-to-open destinations menu, so
   * from then on it is somewhere the player can walk to whenever they like.
   * Rolling it again spends a Move on a room they already had, which on a
   * run that is waiting for its last word is the most expensive thing the
   * table can hand out.
   */
  restAreaFound: boolean
  /** Suppresses a second Key Room — a run may only ever produce one key. */
  keyRoomSeen: boolean
  /** True once every pool word has been introduced. */
  keyRoomUnlocked: boolean
  /** Climbing bonus applied while an unlocked Key Room keeps missing its roll. */
  keyRoomPressure: number
  /** Climbing weight bonus while an unlocked Boss Door keeps not appearing. */
  bossDoorPressure: number
}

export interface EventRollResult {
  type: DungeonEventType
  /** True when the Key Room won its dedicated roll rather than the weighted one. */
  forced: boolean
  /** Key Room pressure to carry into the next roll. */
  nextKeyRoomPressure: number
  /** Boss Door pressure to carry into the next roll. */
  nextBossDoorPressure: number
}

/**
 * Picks the next event.
 *
 * The Key Room is not part of the weighted table (its base weight is 0).
 * Once unlocked it gets its own high-probability roll *first*, so it
 * reliably shows up soon after the last word is introduced, and its chance
 * ramps on each miss so it can never stay hidden indefinitely.
 */
export function rollEvent(ctx: EventRollContext, rng: () => number = Math.random): EventRollResult {
  // Pressure only builds while the door is both wanted and still missing;
  // once it is found the number stops mattering and is left where it is.
  const bossDoorWanted = ctx.keyRoomUnlocked && !ctx.bossDoorFound
  const rampBossDoor = (type: DungeonEventType) =>
    !bossDoorWanted || type === 'boss_door'
      ? ctx.bossDoorPressure
      : ctx.bossDoorPressure + bossDoorBalance.weightRampPerMiss

  if (ctx.keyRoomUnlocked && !ctx.keyRoomSeen) {
    const chance = Math.min(1, keyRoomBalance.chanceOnceUnlocked + ctx.keyRoomPressure)
    if (rng() < chance) {
      return { type: 'key_room', forced: true, nextKeyRoomPressure: 0, nextBossDoorPressure: rampBossDoor('key_room') }
    }
    const type = pickWeighted(ctx, rng)
    return {
      type,
      forced: false,
      nextKeyRoomPressure: ctx.keyRoomPressure + keyRoomBalance.chanceRampPerMiss,
      nextBossDoorPressure: rampBossDoor(type),
    }
  }
  const type = pickWeighted(ctx, rng)
  return {
    type,
    forced: false,
    nextKeyRoomPressure: ctx.keyRoomPressure,
    nextBossDoorPressure: rampBossDoor(type),
  }
}

function pickWeighted(ctx: EventRollContext, rng: () => number): DungeonEventType {
  const weighted = { ...applyModifiers(baseEventWeights, ctx.modifiers) }

  // Once the dungeon has nothing left to teach, the way out becomes the most
  // likely thing to find, and more likely again every Move it stays hidden.
  if (ctx.keyRoomUnlocked && !ctx.bossDoorFound) {
    weighted.boss_door = Math.min(
      bossDoorBalance.maxWeight,
      bossDoorBalance.weightOnceUnlocked + ctx.bossDoorPressure,
    )
  }

  const streakType = ctx.history.length > 0 ? ctx.history[ctx.history.length - 1] : null
  const streak = currentStreakLength(ctx.history)

  const entries = (Object.entries(weighted) as [DungeonEventType, number][]).filter(([type, weight]) => {
    if (weight <= 0) return false
    // Once-only events disappear from the table after they've been found.
    if (type === 'boss_door' && ctx.bossDoorFound) return false
    if (type === 'rest' && ctx.restAreaFound) return false
    if (type === 'key_room') return false // never rolled here — see rollEvent
    if (type === streakType && streak >= maxRepeatEventStreak) return false
    return true
  })

  // Fall back to ignoring the anti-repeat rule rather than returning
  // nothing, in the corner case where it excluded the only candidate.
  const pool =
    entries.length > 0
      ? entries
      : (Object.entries(weighted) as [DungeonEventType, number][]).filter(
          ([type, weight]) =>
            weight > 0 && type !== 'key_room' && !(type === 'boss_door' && ctx.bossDoorFound),
        )

  if (pool.length === 0) return 'battle'

  const total = pool.reduce((sum, [, w]) => sum + w, 0)
  let roll = rng() * total
  for (const [type, weight] of pool) {
    roll -= weight
    if (roll <= 0) return type
  }
  return pool[pool.length - 1][0]
}

function currentStreakLength(history: DungeonEventType[]): number {
  if (history.length === 0) return 0
  const last = history[history.length - 1]
  let count = 0
  for (let i = history.length - 1; i >= 0 && history[i] === last; i--) count++
  return count
}

/** Exposed for the debug/status UI: the weights a roll would actually use. */
export function effectiveWeights(modifiers: ActiveModifier[]): Record<DungeonEventType, number> {
  return applyModifiers(baseEventWeights, modifiers)
}

export { onceOnlyEvents }
