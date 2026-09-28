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
 * Brings a saved word onto the slot meter.
 *
 * Saves written before this carry a level (1-7, driven by an experience bar
 * that only ever climbed), a charge, and a maxCharge derived from the level.
 * Three numbers for one idea. The level is the one that decided damage, so
 * it is what the slots are taken from — a word that hit hard still hits
 * hard, and the other two are dropped.
 */
function slotsFrom(raw: Spell): Pick<Spell, 'charge'> {
  const loose = raw as unknown as Record<string, unknown>
  const legacyLevel = typeof loose.level === 'number' ? loose.level : undefined
  const stored = typeof loose.charge === 'number' ? loose.charge : 0
  const slots = legacyLevel ?? stored
  return { charge: Math.max(0, Math.min(spellBalance.chargeSlots, Math.round(slots || 0))) }
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

  // The three fields the slot meter replaced are dropped rather than
  // carried along. Spreading `raw` would keep them, and a save that still
  // holds a level and an experience bar invites the next person reading it
  // to believe they mean something.
  const { level: _level, experience: _experience, maxCharge: _maxCharge, ...rest } = raw as unknown as Record<
    string,
    unknown
  >
  void _level
  void _experience
  void _maxCharge

  return {
    ...(rest as unknown as Spell),
    ...slotsFrom(raw),
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
