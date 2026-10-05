/**
 * Vocabulary challenge domain — shared by general dungeon events and battle.
 */

import type { ComboPrompt } from './combo'

export type ChallengeDirection = 'kor_to_eng' | 'eng_to_kor'

export type ChallengeContext =
  | 'event'
  | 'trap'
  | 'treasure'
  | 'shrine'
  | 'discovery'
  | 'special'
  | 'attack'
  | 'defense'

export interface Challenge {
  id: string
  spellId: string
  direction: ChallengeDirection
  /** The word/phrase shown to the player. */
  prompt: string
  context: ChallengeContext
  /**
   * Set only in Combo mode: the sentence this question is really asking,
   * with the gaps and the forms they expect.
   *
   * It is an extra field on the ordinary Challenge rather than a type of
   * its own so that everything downstream — the battle phases, the defense
   * sequence, the timer, the boss barrier, damage, the log — carries a
   * Combo question without knowing there is such a thing. The two places
   * that do know are challengeEngine, which grades it, and the battle view,
   * which draws it.
   *
   * Absent means a normal question, which is what a word with no target
   * data falls back to even in a Combo run.
   */
  combo?: ComboPrompt
}

export interface ChallengeOutcome {
  challenge: Challenge
  submitted: string
  correct: boolean
}
