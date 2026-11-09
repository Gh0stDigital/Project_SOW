import type { Spell } from '@/domain/spell'
import { levelledSentences } from '@/domain/spell'
import type { ComboPrompt } from '@/domain/combo'
import {
  MAX_SENTENCE_LEVEL,
  MIN_SENTENCE_LEVEL,
  comboLevels,
  type SentenceLevelContext,
} from '@/config/comboLevels'
import { blankSentence } from './sentenceBlank'
import { parseTargets } from './comboTargets'

/**
 * Choosing a Combo sentence and cutting the word out of it.
 *
 * Two jobs that belong together: which of a word's seven sentences this
 * fight deserves, and where the word sits inside the one that was chosen.
 * Everything about Korean lives in sentenceBlank.ts; everything about
 * difficulty lives in config/comboLevels.ts. This is the seam.
 *
 * Pure: no React, no store.
 */

const clamp = (n: number) =>
  Math.max(MIN_SENTENCE_LEVEL, Math.min(MAX_SENTENCE_LEVEL, Math.round(n)))

/** The level this fight asks for, before the word's own stock is consulted. */
export function sentenceLevelFor(context: SentenceLevelContext): number {
  const base = baseLevel(context)
  return clamp(base + (context.isBoss ? comboLevels.bossBonus : 0))
}

function baseLevel(context: SentenceLevelContext): number {
  switch (comboLevels.source) {
    case 'charge':
      // Charge runs 0..7 and the levels run 1..7, so a word met once asks
      // its simplest sentence and a mastered one asks its hardest.
      return clamp(context.charge + 1)
    case 'totemLevel':
      return clamp(Math.ceil(Math.max(1, context.totemLevel) / comboLevels.levelsPerStep))
    case 'fixed':
      return clamp(comboLevels.fixedLevel)
    case 'levelGap':
    default: {
      const gap = context.enemyLevel / Math.max(1, context.totemLevel)
      for (const band of comboLevels.gapBands) {
        if (gap < band.under) return band.level
      }
      return comboLevels.top
    }
  }
}

/**
 * The sentence closest to the level asked for.
 *
 * A deck may have written three levels or seven, and asking for a level it
 * never wrote must not mean asking nothing. Ties go downwards: given a
 * choice between a sentence one easier and one harder, the easier one is
 * the one the player can still read.
 */
export function nearestLevel(
  spell: Pick<Spell, 'levelSentences' | 'levelTranslations'>,
  wanted: number,
): { level: number; sentence: string; translation: string } | null {
  const available = levelledSentences(spell)
  if (available.length === 0) return null
  let best = available[0]
  let bestDistance = Number.POSITIVE_INFINITY
  for (const entry of available) {
    const distance = Math.abs(entry.level - wanted)
    const better =
      distance < bestDistance ||
      (distance === bestDistance && entry.level < best.level)
    if (better) {
      best = entry
      bestDistance = distance
    }
  }
  return best
}

/**
 * Builds the Combo question for a word, or null when nothing in the entry
 * can carry one.
 *
 * Three sources, in the order they are trusted:
 *
 *  1. The levelled sentences a deck now writes, which is where difficulty
 *     comes from. The word is found inside the chosen one.
 *  2. A target cell from the older deck format, which names the word's
 *     form outright. Nothing beats being told.
 *  3. The plain example sentence, if the word can be found in it.
 *
 * Null is an ordinary answer, not a failure: a word with no usable
 * sentence is asked the normal way, which is what keeps a mixed
 * Compendium playable.
 */
export function buildComboQuestion(spell: Spell, context: SentenceLevelContext): ComboPrompt | null {
  const wanted = sentenceLevelFor(context)

  const levelled = nearestLevel(spell, wanted)
  if (levelled) {
    const blanked = blankSentence(levelled.sentence, spell.korean)
    if (blanked) {
      return {
        text: blanked.text,
        sentence: blanked.sentence,
        translation: levelled.translation,
        answer: blanked.answer,
        level: levelled.level,
      }
    }
  }

  const told = fromTargetCell(spell)
  if (told) return told

  const plain = (spell.sampleSentence ?? '').trim()
  if (plain) {
    const blanked = blankSentence(plain, spell.korean)
    if (blanked) {
      return {
        text: blanked.text,
        sentence: blanked.sentence,
        translation: (spell.sampleTranslation ?? '').trim(),
        answer: blanked.answer,
        level: 0,
      }
    }
  }
  return null
}

/**
 * The older deck format, where a cell beside each sentence named the words
 * in it and the exact shape each took. Still the most reliable source
 * there is, since it is the deck saying so rather than the game working it
 * out — it is only second because decks are not written that way now.
 */
function fromTargetCell(spell: Spell): ComboPrompt | null {
  const pairs: [string, string, string][] = [
    [spell.sampleSentence ?? '', spell.sampleTranslation ?? '', spell.sampleTargets ?? ''],
    [spell.sampleSentence2 ?? '', spell.sampleTranslation2 ?? '', spell.sampleTargets2 ?? ''],
  ]
  const keys = [spell.korean, spell.derivedVerb, ...(spell.altKorean ?? [])]
    .map((k) => (k ?? '').trim())
    .filter(Boolean)

  for (const [rawSentence, rawTranslation, rawTargets] of pairs) {
    const sentence = rawSentence.trim()
    if (!sentence) continue
    for (const target of parseTargets(rawTargets)) {
      if (!keys.includes(target.dictionaryForm)) continue
      const at = sentence.indexOf(target.surfaceForm)
      if (at < 0) continue
      return {
        text: sentence.slice(0, at) + '____' + sentence.slice(at + target.surfaceForm.length),
        sentence,
        translation: rawTranslation.trim(),
        answer: target.surfaceForm,
        level: 0,
      }
    }
  }
  return null
}

/** True when Combo has something to ask about this entry at any level. */
export function hasComboSentence(spell: Spell): boolean {
  return (
    buildComboQuestion(spell, {
      totemLevel: 1,
      enemyLevel: 1,
      isBoss: false,
      charge: spell.charge ?? 0,
    }) !== null
  )
}
