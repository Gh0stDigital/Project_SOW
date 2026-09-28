import type { Spell } from '@/domain/spell'
import { isWordType, showsConjugations, type WordType } from '@/config/wordTypes'
import { spellBalance } from '@/config/balance'
import { DEFAULT_WORD_TYPE } from './spellFactory'

/**
 * Forward-migration for saved vocabulary.
 *
 * Entries written before word types and structured definitions existed
 * carry only korean/english/notes. They must keep working untouched, so
 * every new field gets a safe empty default and the word type is inferred
 * as best it can be from the headword.
 */

/**
 * Best-effort word type for a legacy entry.
 *
 * Korean verbs and adjectives end in 다 in their dictionary form, so a
 * 다-final headword is far more likely a verb than anything else, and
 * everything else is most likely a noun. This is a *guess* on data that
 * never recorded the answer — it is surfaced in the editor precisely so
 * the player can correct it, and it never changes an entry that already
 * has a type.
 */
export function inferWordType(korean: string): WordType {
  const word = korean.trim()
  if (word.endsWith('하다')) return 'action_verb'
  if (word.endsWith('다')) return 'action_verb'
  return DEFAULT_WORD_TYPE
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

/**
 * Brings a word's charge back inside the cap.
 *
 * A save written while the ceiling was 20 can hold words well above it, and
 * nothing would ever pull them back down on its own: addExperience() only
 * clamps a word it is adding experience to, so a word that is simply carried
 * along at level 14 would keep hitting for level 14 forever.
 *
 * maxCharge has to come down with it. It is stored on the word rather than
 * derived on read, so a level-14 word carries a cap of 31 that no level-7
 * word could have, and its charge is clamped to whatever the new cap allows.
 * Levelling down is the ordinary consequence of a wrong answer here, so a
 * word arriving over the ceiling is not a loss of progress — it is the same
 * word at the top of the range it is now allowed.
 */
function clampCharge(raw: Spell): Pick<Spell, 'level' | 'maxCharge' | 'charge'> {
  const level = Math.max(1, Math.min(spellBalance.maxLevel, Math.round(raw.level || 1)))
  const maxCharge = spellBalance.maxCharge(level)
  return {
    level,
    maxCharge,
    charge: Math.max(0, Math.min(maxCharge, Math.round(raw.charge || 0))),
  }
}

/**
 * Fills in every field added after a save was written. Values already
 * present are preserved exactly; only genuinely missing ones are defaulted.
 */
export function migrateSpell(raw: Spell): Spell {
  const loose = raw as unknown as Record<string, unknown>
  const wordType = isWordType(loose.wordType) ? loose.wordType : inferWordType(str(loose.korean))
  const derivedVerb = str(loose.derivedVerb).trim()
  const keepForms = showsConjugations(wordType, derivedVerb)

  return {
    ...raw,
    ...clampCharge(raw),
    korean: str(loose.korean),
    english: str(loose.english),
    definition2: str(loose.definition2),
    definition3: str(loose.definition3),
    notes: str(loose.notes),
    wordType,
    sampleSentence: str(loose.sampleSentence),
    sampleTranslation: str(loose.sampleTranslation),
    // Absent from every save written before a second example existed, which
    // str() turns into '' — the same as an entry that simply has one.
    sampleSentence2: str(loose.sampleSentence2),
    sampleTranslation2: str(loose.sampleTranslation2),
    derivedVerb,
    // Guard against a save where the type was later changed to one that
    // doesn't conjugate, leaving stale forms behind.
    presentForm: keepForms ? str(loose.presentForm) : '',
    pastForm: keepForms ? str(loose.pastForm) : '',
    futureForm: keepForms ? str(loose.futureForm) : '',
    altKorean: arr(loose.altKorean),
    altEnglish: arr(loose.altEnglish),
  }
}

export function migrateSpells(spells: Spell[]): Spell[] {
  return spells.map(migrateSpell)
}
