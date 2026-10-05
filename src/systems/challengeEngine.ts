import type { Spell } from '@/domain/spell'
import type { Challenge, ChallengeContext, ChallengeDirection } from '@/domain/challenge'
import { makeId } from './idGen'
import { checkAnswer } from './answerChecker'
import { buildComboPrompt, comboPromptCorrect, type ComboPromptOptions } from './comboTargets'
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
 * A Combo question for this entry, or null when its vocabulary list has
 * nothing Combo can ask about.
 *
 * Null is an ordinary answer. A word imported before Combo existed carries
 * no target data, and a Combo run's word pool will usually be a mix — so
 * the caller falls back to `generateChallenge` for that word rather than
 * re-drawing. Re-drawing would quietly steer a volley away from the words
 * the player is weakest on, which is the opposite of what the draw is for.
 */
export function generateComboChallenge(
  spell: Spell,
  context: ChallengeContext,
  options: ComboPromptOptions = {},
): Challenge | null {
  const combo = buildComboPrompt(spell, options)
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
 * `submitted` takes a list because a Combo question may have several gaps;
 * a normal question reads the first entry, and a single string is still the
 * ordinary way to call this.
 */
export function resolveChallenge(
  spell: Spell,
  challenge: Challenge,
  submitted: string | readonly string[],
  compendiumContext: 'challenge' | 'attack' | 'defense',
): ChallengeResolution {
  const correct = challenge.combo
    ? comboPromptCorrect(answerList(submitted), challenge.combo)
    : checkAnswer(
        firstAnswer(submitted),
        acceptableAnswers(spell, challenge.direction === 'eng_to_kor' ? 'korean' : 'english'),
        challenge.direction === 'eng_to_kor' ? 'korean' : 'english',
      )
  const outcome = recordChallengeOutcome(spell, correct, compendiumContext)
  return { ...outcome, correct }
}

function answerList(submitted: string | readonly string[]): string[] {
  return typeof submitted === 'string' ? [submitted] : [...submitted]
}

function firstAnswer(submitted: string | readonly string[]): string {
  return typeof submitted === 'string' ? submitted : (submitted[0] ?? '')
}
