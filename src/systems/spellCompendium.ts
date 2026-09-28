import type { Spell } from '@/domain/spell'
import { definitionsOf } from '@/domain/spell'
import { spellBalance } from '@/config/balance'
import { createSpell, normalizeContent, type NewSpellInput, type SpellContentInput } from './spellFactory'
import { applyChargeDelta } from './spellProgression'

/**
 * Spell Compendium — pure reducer-style operations over an array of Spells.
 * These are the only functions allowed to mutate Spell records; UI and
 * state stores call into them rather than editing Spells directly.
 */

export function addSpell(spells: Spell[], input: NewSpellInput): Spell[] {
  return [...spells, createSpell(input)]
}

export type SpellEditInput = Partial<SpellContentInput>

/**
 * Edits only the player-authored content fields — never progression stats.
 *
 * The patch is merged onto the current content and then normalised as a
 * whole, so switching an entry's word type also clears conjugations that
 * no longer apply rather than leaving them stranded on the record.
 */
export function editSpell(spells: Spell[], id: string, patch: SpellEditInput): Spell[] {
  return spells.map((s) => {
    if (s.id !== id) return s
    const merged: SpellContentInput = {
      korean: patch.korean ?? s.korean,
      english: patch.english ?? s.english,
      definition2: patch.definition2 ?? s.definition2,
      definition3: patch.definition3 ?? s.definition3,
      notes: patch.notes ?? s.notes,
      wordType: patch.wordType ?? s.wordType,
      sampleSentence: patch.sampleSentence ?? s.sampleSentence,
      sampleTranslation: patch.sampleTranslation ?? s.sampleTranslation,
      sampleSentence2: patch.sampleSentence2 ?? s.sampleSentence2,
      sampleTranslation2: patch.sampleTranslation2 ?? s.sampleTranslation2,
      derivedVerb: patch.derivedVerb ?? s.derivedVerb,
      presentForm: patch.presentForm ?? s.presentForm,
      pastForm: patch.pastForm ?? s.pastForm,
      futureForm: patch.futureForm ?? s.futureForm,
      altKorean: patch.altKorean ?? s.altKorean,
      altEnglish: patch.altEnglish ?? s.altEnglish,
    }
    return { ...s, ...normalizeContent(merged) }
  })
}

export function deleteSpell(spells: Spell[], id: string): Spell[] {
  return spells.filter((s) => s.id !== id)
}

export function getSpell(spells: Spell[], id: string): Spell | undefined {
  return spells.find((s) => s.id === id)
}

/**
 * Every answer that counts as correct for this entry.
 *
 * For English that is all populated definitions (1, and 2/3 when filled in)
 * plus any explicit alternatives — blank optional definitions are dropped,
 * so an unused Definition 3 never becomes an empty accepted answer.
 */
export function acceptableAnswers(spell: Spell, kind: 'korean' | 'english'): string[] {
  if (kind === 'korean') return [spell.korean, ...spell.altKorean].map((a) => a.trim()).filter(Boolean)
  return [...definitionsOf(spell), ...spell.altEnglish.map((a) => a.trim()).filter(Boolean)]
}

export type ChallengeContext = 'challenge' | 'attack' | 'defense'

export interface ChallengeOutcomeResult {
  spell: Spell
  /** Slots before and after this answer, for the run's report. */
  chargeFrom: number
  chargeTo: number
  /** True when this answer filled the word's last slot. */
  newlyFull: boolean
}

/**
 * Applies the result of any vocabulary challenge (general event, battle
 * attack, or battle defense) to a Spell: updates encounter and accuracy
 * stats, and moves the charge meter one slot.
 *
 * One slot up on a right answer, one down on a wrong one. There is no
 * experience to grant any more: a word's charge is the only measure of how
 * well it is known, so an answer moves that and nothing else.
 */
export function recordChallengeOutcome(
  spell: Spell,
  correct: boolean,
  context: ChallengeContext,
): ChallengeOutcomeResult {
  let s: Spell = {
    ...spell,
    timesEncountered: spell.timesEncountered + 1,
    correctAnswers: spell.correctAnswers + (correct ? 1 : 0),
    incorrectAnswers: spell.incorrectAnswers + (correct ? 0 : 1),
    lastPracticedAt: new Date().toISOString(),
  }

  if (context === 'attack') {
    s = { ...s, correctAttacks: s.correctAttacks + (correct ? 1 : 0), failedAttacks: s.failedAttacks + (correct ? 0 : 1) }
  } else if (context === 'defense') {
    s = {
      ...s,
      successfulDefenses: s.successfulDefenses + (correct ? 1 : 0),
      failedDefenses: s.failedDefenses + (correct ? 0 : 1),
    }
  }

  const chargeFrom = s.charge
  s = applyChargeDelta(s, correct ? spellBalance.chargeGainOnCorrect : -spellBalance.chargeLossOnIncorrect)

  return {
    spell: s,
    chargeFrom,
    chargeTo: s.charge,
    newlyFull: chargeFrom < spellBalance.chargeSlots && s.charge >= spellBalance.chargeSlots,
  }
}

export function markEquipped(spells: Spell[], spellIds: string[]): Spell[] {
  const idSet = new Set(spellIds)
  return spells.map((s) => (idSet.has(s.id) ? { ...s, timesEquipped: s.timesEquipped + 1 } : s))
}
