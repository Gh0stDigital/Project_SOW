import type { Spell } from '@/domain/spell'
import type { Challenge, ChallengeContext, ChallengeDirection } from '@/domain/challenge'
import { makeId } from './idGen'
import { checkAnswer } from './answerChecker'
import { buildComboQuestion } from './comboSentence'
import type { SentenceLevelContext } from '@/config/comboLevels'
import { acceptableAnswers, recordChallengeOutcome, type ChallengeOutcomeResult } from './spellCompendium'

/**
 * Vocabulary challenge engine — turns a Spell into a prompt/answer pair and
 * grades submissions. Contains no UI or presentation logic.
 */

export function pickDirection(rng: () => number = Math.random): ChallengeDirection {
  return rng() < 0.5 ? 'eng_to_kor' : 'kor_to_eng'
}

export function generateChallenge(
  spell: Spell,
  context: ChallengeContext,
  direction: ChallengeDirection = pickDirection(),
): Challenge {
  return {
    id: makeId('chal'),
    spellId: spell.id,
    direction,
    prompt: direction === 'eng_to_kor' ? spell.english : spell.korean,
    context,
  }
}

/**
 * A Combo question for this entry, or null when nothing in it can carry
 * one.
 *
 * Null is an ordinary answer. A word may have no sentences at all, or
 * none its headword can be found in, and a Compendium will usually be a
 * mix — so the caller falls back to `generateChallenge` for that word
 * rather than re-drawing. Re-drawing would quietly steer a volley away
 * from the words the player is weakest on, which is the opposite of what
 * the draw is for.
 */
export function generateComboChallenge(
  spell: Spell,
  context: ChallengeContext,
  level: SentenceLevelContext,
): Challenge | null {
  const combo = buildComboQuestion(spell, level)
  if (!combo) return null
  return {
    id: makeId('chal'),
    spellId: spell.id,
    // Combo always asks the player to produce Korean, in both directions of
    // combat: the sentence is Korean and so is the gap in it.
    direction: 'eng_to_kor',
    // The log quotes this. The sentence would be a paragraph in the battle
    // log, so what is quoted is the word the question was built from.
    prompt: spell.korean,
    context,
    combo,
  }
}

export interface ChallengeResolution extends ChallengeOutcomeResult {
  correct: boolean
}

/**
 * Grades a submission against the Spell's saved answer(s) and applies the
 * standard progression/stat update. Which "context" (challenge/attack/
 * defense) is passed determines which counters and XP amount apply.
 *
 * A Combo question is graded here too, and this is the only fork: it is
 * checked against the exact forms its sentence asked for, and then recorded
 * through the very same progression call. So a Combo answer moves a word's
 * charge, accuracy and attack/defense counters by exactly what a normal
 * answer moves them by — no multiplier, and no extra credit for the other
 * words in the sentence. Combo is a different question about the same word,
 * not a different amount of progress.
 *
 */
export function resolveChallenge(
  spell: Spell,
  challenge: Challenge,
  submitted: string,
  compendiumContext: 'challenge' | 'attack' | 'defense',
): ChallengeResolution {
  const kind = challenge.direction === 'eng_to_kor' ? 'korean' : 'english'
  // A Combo answer is checked against the one form its sentence asked for
  // and nothing else. The ordinary list — the entry's other spellings, its
  // alternatives — is right for a dictionary form and wrong for a
  // conjugation: accepting 통하다 where the sentence wanted 통했는데 would
  // let through the exact mistake the mode exists to catch.
  const correct = challenge.combo
    ? checkAnswer(submitted, [challenge.combo.answer], kind)
    : checkAnswer(submitted, acceptableAnswers(spell, kind), kind)
  const outcome = recordChallengeOutcome(spell, correct, compendiumContext)
  return { ...outcome, correct }
}

