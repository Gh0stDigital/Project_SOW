import type { WordType } from '@/config/wordTypes'

/**
 * Spell / word domain model.
 *
 * A Spell is a single vocabulary entry. It carries both the study content
 * (Korean/English/notes) and its long-term progression + statistics. This
 * file only defines the shape of the data — see systems/spellProgression.ts
 * and systems/spellCompendium.ts for the logic that mutates it.
 */

export interface Spell {
  id: string
  /** The headword itself. */
  korean: string
  /**
   * Definition 1 — required, and the canonical English answer. Kept under
   * this name because it is what every prompt, tile board and report
   * already reads; definitions 2 and 3 are additional accepted meanings.
   */
  english: string
  definition2: string
  definition3: string
  notes: string

  /**
   * Grammatical category. Drives the entry's Element (see
   * config/wordTypes.ts — Element is derived, never stored) and which
   * conjugation fields apply.
   */
  wordType: WordType

  /**
   * Example usage and its translation. Both optional.
   *
   * A second pair, also optional. One example shows what a word means; two
   * show what it does in different company, which is the difference between
   * recognising a word and being able to use it. Word lists written for
   * study routinely carry two, and dropping the second on import threw away
   * half of what the player had written.
   */
  sampleSentence: string
  sampleTranslation: string
  sampleSentence2: string
  sampleTranslation2: string

  /**
   * Conjugations. Populated for verbs and adjectives, or for the derived
   * 하다 verb of a noun/phrase (검토 → 검토하다); empty otherwise.
   */
  derivedVerb: string
  presentForm: string
  pastForm: string
  futureForm: string

  /** Optional alternative acceptable answers, entered explicitly by the player. */
  altKorean: string[]
  altEnglish: string[]

  /**
   * How many slots of charge this word holds, 0..spellBalance.chargeSlots.
   *
   * The only measure of how well the word is known. A right answer fills a
   * slot, a wrong one empties one. There is no level and no experience bar
   * underneath: those were a second, one-way score that disagreed with this
   * one, so a word answered wrong all evening still read as highly ranked.
   */
  charge: number

  timesEncountered: number
  correctAnswers: number
  incorrectAnswers: number

  correctAttacks: number
  failedAttacks: number
  successfulDefenses: number
  failedDefenses: number

  timesEquipped: number

  createdAt: string
  lastPracticedAt: string | null
}

export function spellAccuracy(spell: Spell): number {
  const total = spell.correctAnswers + spell.incorrectAnswers
  if (total === 0) return 0
  return spell.correctAnswers / total
}

/**
 * Every English meaning this entry accepts, in study order: Definition 1
 * first, then the optional definitions, then any explicit alternatives.
 * Blank fields are dropped, so an unused Definition 3 never becomes an
 * empty row in a list or an empty accepted answer.
 */
export function definitionsOf(spell: Spell): string[] {
  return [spell.english, spell.definition2, spell.definition3]
    .map((d) => (d ?? '').trim())
    .filter(Boolean)
}

/** True when the entry carries a usage example worth displaying. */
export function hasSample(spell: Spell): boolean {
  return spell.sampleSentence.trim().length > 0
}

/** True when any conjugation has actually been filled in. */
export function hasConjugations(spell: Spell): boolean {
  return [spell.presentForm, spell.pastForm, spell.futureForm].some((f) => (f ?? '').trim().length > 0)
}
