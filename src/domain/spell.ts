import type { Element, WordType } from '@/config/wordTypes'
import { elementDefs, elementFor, type ElementDef } from '@/config/wordTypes'

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
   * Combo target metadata for each example, exactly as the CSV wrote it:
   *
   *   dictionaryForm=surfaceForm|dictionaryForm=surfaceForm
   *
   * It records which vocabulary entries appear inside the sentence and the
   * precise form each one takes there (연습하다 → 연습하면). Combo mode blanks
   * those forms out and asks the player to produce them; nothing derives a
   * conjugation, the sentence data supplies it.
   *
   * Stored as the raw string rather than a parsed structure so that an
   * entry saved before Combo existed migrates to '' and a re-export
   * round-trips the cell unchanged. See systems/comboTargets.ts for the
   * parser. Empty simply means the entry is not Combo-eligible yet.
   */
  sampleTargets: string
  sampleTargets2: string

  /**
   * Up to seven sentences for this word, rising in difficulty — index 0 is
   * level 1, a plain present-tense line; index 6 is a paragraph.
   *
   * Combo mode picks one by how hard the fight is and blanks the word out
   * of it (see systems/sentenceBlank.ts). There is deliberately no column
   * saying which part of the sentence the word became: the deck writes
   * Korean, and the game finds the word in it.
   *
   * Short arrays are fine, and so are gaps — a deck that only wrote levels
   * 1 to 3 simply has nothing to ask above level 3, and the nearest level
   * it does have is used instead.
   */
  levelSentences: string[]
  levelTranslations: string[]

  /**
   * The element this entry was given by its deck, or '' to derive it from
   * the word type as the game always has.
   *
   * Decks began naming elements directly, and a named one has to win:
   * deriving 'earth' from "noun" would quietly overrule a deck that said
   * Aether. Stored rather than resolved so that re-exporting gives the
   * deck back what it wrote.
   */
  element: Element | ''

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

/**
 * The element to show for an entry: the one its deck named, else the one
 * its word type implies.
 */
export function elementOf(spell: Pick<Spell, 'element' | 'wordType'>): Element {
  return spell.element && spell.element in elementDefs ? spell.element : elementFor(spell.wordType)
}

export function elementDefOf(spell: Pick<Spell, 'element' | 'wordType'>): ElementDef {
  return elementDefs[elementOf(spell)]
}

/**
 * The entry's sentences, level 1 first, with the gaps left out.
 *
 * Paired with the level each one actually is, since a deck may skip some
 * and Combo needs to know how hard the one it picked really was.
 */
export function levelledSentences(
  spell: Pick<Spell, 'levelSentences' | 'levelTranslations'>,
): { level: number; sentence: string; translation: string }[] {
  const out: { level: number; sentence: string; translation: string }[] = []
  for (let i = 0; i < (spell.levelSentences ?? []).length; i++) {
    const sentence = (spell.levelSentences[i] ?? '').trim()
    if (!sentence) continue
    out.push({ level: i + 1, sentence, translation: (spell.levelTranslations?.[i] ?? '').trim() })
  }
  return out
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
