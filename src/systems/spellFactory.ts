import type { Spell } from '@/domain/spell'
import { showsConjugations, type WordType } from '@/config/wordTypes'
import { makeId } from './idGen'

/**
 * Content fields shared by creation and editing. Every optional field
 * defaults to empty rather than undefined, so a Spell is always fully
 * shaped and no consumer has to guard for missing properties.
 */
export interface SpellContentInput {
  korean: string
  /** Definition 1 — required. */
  english: string
  definition2?: string
  definition3?: string
  notes?: string
  wordType?: WordType
  sampleSentence?: string
  sampleTranslation?: string
  sampleSentence2?: string
  sampleTranslation2?: string
  /** Combo target metadata, raw: `dictionaryForm=surfaceForm|…`. */
  sampleTargets?: string
  sampleTargets2?: string
  derivedVerb?: string
  presentForm?: string
  pastForm?: string
  futureForm?: string
  altKorean?: string[]
  altEnglish?: string[]
}

export type NewSpellInput = SpellContentInput

export type SpellField = 'korean' | 'english'

export interface SpellValidationError {
  field: SpellField
  message: string
}

/**
 * Basic empty-field validation. No semantic or dictionary validation — the
 * prototype never judges whether a definition is *right*, only that the
 * required ones are present.
 */
export function validateNewSpell(input: SpellContentInput): SpellValidationError[] {
  const errors: SpellValidationError[] = []
  if (!input.korean.trim()) errors.push({ field: 'korean', message: '한국어 단어를 입력하세요.' })
  if (!input.english.trim()) errors.push({ field: 'english', message: '뜻 1을 입력하세요.' })
  return errors
}

const clean = (v: string | undefined): string => (v ?? '').trim()

/** Default type for an entry created without one specified. */
export const DEFAULT_WORD_TYPE: WordType = 'noun'

/**
 * Normalises the content half of a Spell.
 *
 * Conjugations are dropped when the word type (plus derived-verb state)
 * says they don't apply, so switching a verb to a noun can't leave orphan
 * forms behind to resurface later.
 */
export function normalizeContent(input: SpellContentInput): {
  korean: string
  english: string
  definition2: string
  definition3: string
  notes: string
  wordType: WordType
  sampleSentence: string
  sampleTranslation: string
  sampleSentence2: string
  sampleTranslation2: string
  sampleTargets: string
  sampleTargets2: string
  derivedVerb: string
  presentForm: string
  pastForm: string
  futureForm: string
  altKorean: string[]
  altEnglish: string[]
} {
  const wordType = input.wordType ?? DEFAULT_WORD_TYPE
  const derivedVerb = clean(input.derivedVerb)
  const keepForms = showsConjugations(wordType, derivedVerb)
  return {
    korean: clean(input.korean),
    english: clean(input.english),
    definition2: clean(input.definition2),
    definition3: clean(input.definition3),
    notes: clean(input.notes),
    wordType,
    sampleSentence: clean(input.sampleSentence),
    sampleTranslation: clean(input.sampleTranslation),
    sampleSentence2: clean(input.sampleSentence2),
    sampleTranslation2: clean(input.sampleTranslation2),
    sampleTargets: clean(input.sampleTargets),
    sampleTargets2: clean(input.sampleTargets2),
    derivedVerb,
    presentForm: keepForms ? clean(input.presentForm) : '',
    pastForm: keepForms ? clean(input.pastForm) : '',
    futureForm: keepForms ? clean(input.futureForm) : '',
    altKorean: (input.altKorean ?? []).map((s) => s.trim()).filter(Boolean),
    altEnglish: (input.altEnglish ?? []).map((s) => s.trim()).filter(Boolean),
  }
}

export function createSpell(input: NewSpellInput): Spell {
  const now = new Date().toISOString()
  return {
    id: makeId('spell'),
    ...normalizeContent(input),
    // A new word arrives empty. Every slot in it is earned.
    charge: 0,
    timesEncountered: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    correctAttacks: 0,
    failedAttacks: 0,
    successfulDefenses: 0,
    failedDefenses: 0,
    timesEquipped: 0,
    createdAt: now,
    lastPracticedAt: null,
  }
}
