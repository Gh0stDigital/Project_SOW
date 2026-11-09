/**
 * Combo mode's question shape.
 *
 * Combo asks the player to produce a word the way a sentence needs it —
 * 나아지다 typed back as 나아질 거예요 — rather than to recognise it on its
 * own. A question is therefore a sentence with one or more of its words
 * taken out, plus the exact strings those gaps want.
 *
 * Only the shape lives here. systems/comboTargets.ts reads the vocabulary
 * list's target data and builds these; nothing anywhere derives a Korean
 * form, which is the point — the list supplies every expected answer.
 */

/**
 * Which question layer a dungeon run uses.
 *
 * 'normal' is the combat the game has always had: recognise or recall the
 * word on its own. 'combo' asks for the same words inside sentences, in the
 * form the sentence needs. Everything else about the run — the foes, the
 * damage, the timers, the progression, the rewards — is the same either way.
 *
 * Chosen once, before the run, and fixed for its duration.
 */
export type CombatMode = 'normal' | 'combo'

export interface ComboTarget {
  /** The vocabulary entry this refers to, in dictionary form. */
  dictionaryForm: string
  /** The exact string that appears in the sentence. */
  surfaceForm: string
}

export interface ComboPrompt {
  /** The sentence with the word replaced by a blank. */
  text: string
  /** The sentence untouched, for showing once the answer is in. */
  sentence: string
  translation: string
  /**
   * Exactly what the player has to produce — the word as this sentence
   * inflects it. Always a string the deck itself wrote.
   */
  answer: string
  /**
   * Which of the deck's difficulty levels the sentence came from, 1 to 7,
   * or 0 for a sentence that has no level (an older deck's single
   * example). Shown to the player, since being asked a level 7 sentence
   * is the fight telling you how far out of your depth you are.
   */
  level: number
}
