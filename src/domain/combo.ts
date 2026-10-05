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

export interface ComboBlank {
  dictionaryForm: string
  /** The expected answer, exactly as the list wrote it. */
  surfaceForm: string
  /**
   * The Compendium entry this blank belongs to. The primary blank is the
   * word the attack was launched with; a secondary blank exists only
   * because an equipped word was found in the sentence, so it has one too.
   *
   * Kept so the interface can label a gap — not to credit it. Only the
   * primary word's progression moves, so Combo cannot pay out two or three
   * words' worth of practice for one answer.
   */
  spellId: string
  /** True for the word the attack was launched with. Exactly one blank is. */
  primary: boolean
}

export interface ComboPrompt {
  /** The sentence with each chosen form replaced by a blank. */
  text: string
  /** The untouched sentence, for showing once the answer is in. */
  sentence: string
  translation: string
  /** Expected answers in the order their blanks appear in the sentence. */
  blanks: ComboBlank[]
}
