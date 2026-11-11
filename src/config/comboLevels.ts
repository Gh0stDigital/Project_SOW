import type { DungeonTierId } from './balance'

/**
 * How hard a Combo sentence should be.
 *
 * Decks carry seven sentences per word, from a plain present-tense line to
 * a paragraph, and something has to choose between them. Today that is the
 * gap between the Totem and what it is fighting: a foe below your level
 * speaks simply, one well above you speaks in long clauses, and being
 * outmatched costs you the grammar you can follow rather than a bigger
 * number on its side.
 *
 * It is a setting rather than an if-statement because it is expected to
 * change. `source` is the whole switch: point it at another rule and every
 * caller follows, since nothing else decides this.
 */

export type SentenceLevelSource =
  /** The gap between Totem level and foe level. The rule in use. */
  | 'levelGap'
  /** How well the player knows the word — its charge, 0..7, which is the
   *  same range as the levels. Attack becomes a mastery ladder. */
  | 'charge'
  /** The Totem's own level, so a deck hardens as the player grows. */
  | 'totemLevel'
  /** One level for the whole run, whatever the fight. */
  | 'fixed'

export interface SentenceLevelContext {
  totemLevel: number
  enemyLevel: number
  isBoss: boolean
  /** The attacking word's charge, 0..spellBalance.chargeSlots. */
  charge: number
  tierId?: DungeonTierId
  /** The level is rolled; a test passes its own so it can pin the result. */
  rng?: () => number
}

export const MIN_SENTENCE_LEVEL = 1
export const MAX_SENTENCE_LEVEL = 7

export const comboLevels = {
  source: 'levelGap' as SentenceLevelSource,

  /**
   * Levels added to both sides before they are divided.
   *
   * Without it the measure is enemyLevel / totemLevel, and a ratio cannot
   * say "outmatched" near zero: a Lv1 Totem meeting a Lv2 foe reads as
   * twice its level, while a Lv30 Totem meeting a Lv50 one reads as less
   * than twice. So a brand new Totem — every Totem's first fight — was
   * asked for a paragraph by the second goblin it met, and a Lv50 Totem
   * was asked for a one-clause sentence by a boss.
   *
   * Ten is roughly where a level starts to mean something here: tier 1
   * runs to Lv10 and recommends a Lv6 Totem. Below that the difference
   * between Lv1 and Lv3 is a starting position rather than a gulf, and
   * this is what says so.
   */
  anchor: 10,

  /**
   * How likely each step up the ladder is, by anchored gap.
   *
   * The level is rolled rather than looked up: six coin flips at this
   * chance, and the level is one plus however many came up. So the gap
   * does not say "you get level 5", it says how often a question climbs —
   * and two fights against the same foe ask differently, which is the
   * point.
   *
   * A binomial rather than a straight climb because it concentrates.
   * Six flips at 0.33 average out to level 3 and reach level 7 about once
   * in 750 questions; at 0.8 they average 5.8 and reach it about a
   * quarter of the time. That is the shape asked for: the top of the
   * ladder is somewhere a far significant gap takes you, not somewhere an
   * ordinary bad matchup does.
   *
   * Read as a piecewise line: between two points the chance slides, and
   * outside the ends it holds.
   */
  escalation: [
    { gap: 0.6, chance: 0.08 },
    { gap: 1.0, chance: 0.33 },
    { gap: 1.5, chance: 0.45 },
    { gap: 2.0, chance: 0.58 },
    { gap: 3.0, chance: 0.8 },
  ],

  /** Flips per question: one fewer than the levels, so level 1 is all tails. */
  steps: MAX_SENTENCE_LEVEL - MIN_SENTENCE_LEVEL,

  /**
   * A boss is likelier to climb than its numbers alone suggest — added to
   * the chance rather than to the level, so it tilts the roll instead of
   * overriding it.
   */
  bossBonus: 0.1,

  /** Used only by the 'fixed' source. */
  fixedLevel: 3,

  /** Totem levels per sentence level, for the 'totemLevel' source. */
  levelsPerStep: 8,
} as const
