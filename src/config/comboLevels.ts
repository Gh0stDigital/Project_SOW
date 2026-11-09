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
}

export const MIN_SENTENCE_LEVEL = 1
export const MAX_SENTENCE_LEVEL = 7

export const comboLevels = {
  source: 'levelGap' as SentenceLevelSource,

  /**
   * Bands on enemyLevel / totemLevel. The first band whose `under` the gap
   * falls below wins; anything past the last is `top`.
   *
   * An even fight sits at 3, which leaves room to be spoken to simply and
   * room to be out of your depth. 1.2 is where "even" stops because that
   * is already a foe a fifth above you.
   */
  gapBands: [
    { under: 0.6, level: 1 },
    { under: 0.8, level: 2 },
    { under: 1.2, level: 3 },
    { under: 1.45, level: 4 },
    { under: 1.7, level: 5 },
    { under: 2.0, level: 6 },
  ],
  top: MAX_SENTENCE_LEVEL,

  /** A boss speaks a level above its numbers, because it is a boss. */
  bossBonus: 1,

  /** Used only by the 'fixed' source. */
  fixedLevel: 3,

  /** Totem levels per sentence level, for the 'totemLevel' source. */
  levelsPerStep: 8,
} as const
