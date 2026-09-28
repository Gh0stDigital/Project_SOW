import { type EnemyLevelRange, powerBalance } from '@/config/balance'

/**
 * What level the thing in front of you turned out to be.
 *
 * Every foe rolls its own level inside its tier's band, so a run is not a
 * fixed difficulty but a sequence of draws. That is the point: the tier says
 * what *could* be down there, and which end of the band you actually meet is
 * the part you can lean on — at a fork in the path, and later with items.
 *
 * Pure, and takes its randomness injected, so a test can name the roll.
 */

/**
 * Rolls are pulled toward the shallow end.
 *
 * A flat draw over 1–10 hands a brand-new Totem a level-9 foe on its second
 * fight about as often as a level-2 one, and at level 1 that is not a hard
 * fight but an unwinnable one. Weighting the draw low makes the ordinary
 * encounter ordinary and keeps the top of the band for the times the dungeon
 * means it — which is also what gives a fork in the path something to push
 * against.
 */
const SHALLOW_PULL = 2

/**
 * How far a bias shifts the draw, as a share of the band.
 *
 * A bias never takes you outside the band: the deepest a "dangerous path"
 * roll can land is the band's own ceiling, so a fork changes the odds of
 * meeting something nasty and never invents something worse than the tier
 * holds.
 */
export const levelBiasStrength = 0.6

export interface LevelRoll {
  /** The band this was drawn from, for anything that wants to show it. */
  range: EnemyLevelRange
  level: number
}

/**
 * One foe's level.
 *
 * `bias` runs from -1 (as shallow as this band goes) through 0 (the ordinary
 * draw) to +1 (as deep as it goes). Path choices and items set it; nothing
 * else needs to know how it is applied.
 */
export function rollEnemyLevel(
  range: EnemyLevelRange,
  rng: () => number = Math.random,
  bias = 0,
): number {
  const [low, high] = range
  if (high <= low) return Math.max(1, Math.round(low))

  // Weighted toward `low`, then shifted by the bias and clamped back into
  // the band. Clamping rather than re-rolling keeps a strong bias meaning
  // "the end of the band", not "off the end of it".
  const weighted = Math.pow(Math.max(0, Math.min(1, rng())), SHALLOW_PULL)
  const shifted = weighted + bias * levelBiasStrength
  const t = Math.max(0, Math.min(1, shifted))
  return Math.max(1, Math.round(low + (high - low) * t))
}

/** A foe's HP from its level. */
export function enemyHpForLevel(level: number): number {
  return Math.max(1, Math.round(powerBalance.enemyHpBase * powerBalance.scale(level)))
}

/** A foe's attack damage from its level. */
export function enemyDamageForLevel(level: number): number {
  return Math.max(1, Math.round(powerBalance.enemyDamageBase * powerBalance.scale(level)))
}

/** A boss holds several ordinary foes' worth of HP at its level. */
export function bossHpForLevel(level: number): number {
  return Math.max(1, Math.round(enemyHpForLevel(level) * powerBalance.bossHpMultiplier))
}

/**
 * How far out of its depth a Totem is, as a plain ratio: 1 means level with
 * the foe, 2 means the foe is twice its level.
 *
 * Used for the two things being outmatched costs you — how much of a word's
 * damage lands, and how hard the questions get.
 */
export function levelGap(totemLevel: number, enemyLevel: number): number {
  return enemyLevel / Math.max(1, totemLevel)
}

/**
 * The multiplier to hand the battle engine: the Totem's own power, cut by
 * how much of a word it is allowed to deliver against this foe.
 *
 * Kept together because the engine takes one number, and because these two
 * are the whole of "your word's full potential is only as high as your
 * Totem's level".
 */
export function attackPower(totemLevel: number, enemyLevel: number): number {
  return powerBalance.scale(totemLevel) * powerBalance.efficiency(totemLevel, enemyLevel)
}
