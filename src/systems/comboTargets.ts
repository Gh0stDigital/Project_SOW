/**
 * Combo mode's sentence layer.
 *
 * Combo asks the player to produce a word *as the sentence needs it* —
 * 나아지다 typed back as 나아질 거예요 — which means the game has to know the
 * exact surface form each entry takes inside each of its examples. It never
 * works that out: the vocabulary list supplies it, in a target cell written
 * alongside the sentence.
 *
 *   sentence: 계속 연습하면 한국어 실력이 나아질 거예요.
 *   targets:  연습하다=연습하면|나아지다=나아질 거예요
 *
 * This file is the whole of the Korean knowledge in Combo mode, and there
 * is none: it reads the cell, finds the supplied strings inside the
 * sentence, and blanks them. No conjugation is derived, inferred or
 * generated — deliberately, because the point of the mode is to test
 * grammar the data already knows the answer to, and a generator would
 * narrow that to the handful of forms it could produce.
 *
 * Pure: no React, no store.
 */

import type { Spell } from '@/domain/spell'
import type { ComboBlank, ComboPrompt, ComboTarget } from '@/domain/combo'

export type { ComboBlank, ComboPrompt, ComboTarget }

/** What Combo draws a blank over. */
export const COMBO_BLANK = '________'

/**
 * How many blanks a single Combo question may carry.
 *
 * More than three and the sentence stops being a sentence — there has to be
 * enough Korean left to work out what grammar the gaps want, which is the
 * thing being tested. `COMBO_MAX_BLANKED_RATIO` guards the same property by
 * length, for a short sentence where even two blanks would eat most of it.
 */
export const COMBO_MAX_BLANKS = 3
export const COMBO_MAX_BLANKED_RATIO = 0.5

/**
 * Separators accepted between targets.
 *
 * The pipe is what the spec and the lists use. The semicolon is accepted
 * too because the pipe is also one of the delimiters the importer will
 * split a *row* on (see spellImport.ts): a pipe-delimited list cannot carry
 * a pipe-separated cell, and a writer in that corner needs a way out.
 */
const TARGET_SEPARATOR = /[|;]/

/**
 * Reads a target cell.
 *
 * Anything malformed is dropped rather than raised: a half-written cell
 * makes an entry less Combo-eligible, never un-importable. The first
 * mapping for a dictionary form wins, so a cell that names a word twice
 * blanks its first occurrence and leaves the rest of the sentence alone.
 */
export function parseTargets(raw: string): ComboTarget[] {
  const out: ComboTarget[] = []
  const seen = new Set<string>()
  for (const chunk of (raw ?? '').split(TARGET_SEPARATOR)) {
    const at = chunk.indexOf('=')
    if (at < 0) continue
    const dictionaryForm = chunk.slice(0, at).trim()
    const surfaceForm = chunk.slice(at + 1).trim()
    if (!dictionaryForm || !surfaceForm) continue
    if (seen.has(dictionaryForm)) continue
    seen.add(dictionaryForm)
    out.push({ dictionaryForm, surfaceForm })
  }
  return out
}

/** Writes targets back out in the form the list carries them. */
export function formatTargets(targets: readonly ComboTarget[]): string {
  return targets.map((t) => `${t.dictionaryForm}=${t.surfaceForm}`).join('|')
}

/**
 * Every dictionary form a target may legitimately name for this entry.
 *
 * A noun is equipped as 연습 but appears in a list's targets as 연습하다,
 * because that is the word the sentence uses; an entry's explicit
 * alternatives count too. The conjugation fields deliberately do not — a
 * target names a *dictionary* entry, not a form of one.
 */
export function dictionaryKeysOf(spell: Spell): string[] {
  return [spell.korean, spell.derivedVerb, ...(spell.altKorean ?? [])]
    .map((k) => (k ?? '').trim())
    .filter(Boolean)
}

function matchesSpell(dictionaryForm: string, spell: Spell): boolean {
  const key = dictionaryForm.trim()
  return dictionaryKeysOf(spell).some((k) => k === key)
}

interface Example {
  sentence: string
  translation: string
  targets: ComboTarget[]
}

/** The entry's examples, in list order. An example needs a sentence; its
 * target cell may be empty — see ownTarget(). */
export function examplesOf(spell: Spell): Example[] {
  return [
    { sentence: spell.sampleSentence, translation: spell.sampleTranslation, raw: spell.sampleTargets },
    { sentence: spell.sampleSentence2, translation: spell.sampleTranslation2, raw: spell.sampleTargets2 },
  ]
    .map((e) => ({
      sentence: (e.sentence ?? '').trim(),
      translation: (e.translation ?? '').trim(),
      targets: parseTargets(e.raw ?? ''),
    }))
    .filter((e) => e.sentence.length > 0)
}

/**
 * Every spelling of itself the entry has actually written down.
 *
 * Not `spellForms()` from exampleSentence.ts, which also guesses a stem —
 * 먹다 gives 먹 — because a blank there is only a hint, while here it is the
 * expected answer. An answer the data never supplied is one the player
 * cannot be asked for.
 */
function storedForms(spell: Spell): string[] {
  return [
    spell.korean,
    spell.derivedVerb,
    ...(spell.altKorean ?? []),
    spell.presentForm,
    spell.pastForm,
    spell.futureForm,
  ]
    .map((f) => (f ?? '').trim())
    .filter(Boolean)
}

interface Span {
  start: number
  end: number
}

function overlaps(span: Span, taken: readonly Span[]): boolean {
  return taken.some((t) => span.start < t.end && t.start < span.end)
}

/**
 * Where a supplied surface form sits in the sentence, skipping any stretch
 * already claimed by another blank.
 *
 * Whole-string, not token-by-token: a target may be a multi-word expression
 * (생각나다=생각이 안 나요), and splitting the sentence on spaces would blank
 * 나요 and leave the rest of the answer printed above it.
 */
function locate(sentence: string, surfaceForm: string, taken: readonly Span[]): Span | null {
  const needle = surfaceForm.trim()
  if (!needle) return null
  let from = 0
  for (;;) {
    const start = sentence.indexOf(needle, from)
    if (start < 0) return null
    const span = { start, end: start + needle.length }
    if (!overlaps(span, taken)) return span
    from = start + 1
  }
}

/**
 * The entry's own form inside one of its examples — the blank the question
 * is built around.
 *
 * The targets cell is asked first, and a list that names the headword there
 * is the exact case the format was designed for. But a list may name only
 * the *other* words in a sentence, on the fair assumption that the game
 * knows its own headword, and a list may carry no target cell at all while
 * still holding conjugations. Treating either as "not Combo-eligible" made
 * the mode quietly do nothing for whole vocabularies, which is a worse
 * answer than the one available: fall back to the spellings the entry has
 * itself written down, and take the longest one actually present in the
 * sentence.
 *
 * Nothing here is derived. Every candidate is a string some column already
 * holds, which is the rule that matters — the surface form is the answer,
 * so it has to be one the data supplied.
 *
 * Secondary blanks are not covered by this: knowing that *another* word
 * appears in this sentence, and in what shape, is exactly what only the
 * target cell can say. Without it a Combo question has one blank.
 */
function ownTarget(spell: Spell, example: Example): ComboTarget | null {
  const named = example.targets.find(
    (t) => matchesSpell(t.dictionaryForm, spell) && locate(example.sentence, t.surfaceForm, []) !== null,
  )
  if (named) return named

  const present = storedForms(spell)
    .filter((form) => example.sentence.includes(form))
    .sort((a, b) => b.length - a.length)
  if (present.length === 0) return null
  // Longest first: 전달했어요 rather than the 전달하다 that is not in there,
  // and never a fragment of a longer form that is.
  return { dictionaryForm: spell.korean.trim() || present[0], surfaceForm: present[0] }
}

/** True when the entry has at least one example Combo can ask about. */
export function hasComboData(spell: Spell): boolean {
  return examplesOf(spell).some((e) => ownTarget(spell, e) !== null)
}

export interface ComboPromptOptions {
  /**
   * The run's equipped words, used only to decide which *other* targets in
   * the sentence may also become blanks. Pass none — as an enemy prompt
   * does — and the question has exactly one blank.
   */
  equipped?: readonly Spell[]
  maxBlanks?: number
  /** Picks the example and the extra blanks. Defaults to Math.random. */
  rng?: () => number
}

/**
 * Builds one Combo question for an entry, or null when its data cannot
 * support one.
 *
 * Null is an ordinary answer, not a failure: an entry imported before Combo
 * existed has no targets, and a list may name a form that its sentence does
 * not actually contain. The caller falls back to the normal question for
 * that word, which is what keeps a mixed word pool playable.
 */
export function buildComboPrompt(
  spell: Spell,
  options: ComboPromptOptions = {},
): ComboPrompt | null {
  const rng = options.rng ?? Math.random
  const maxBlanks = Math.max(1, options.maxBlanks ?? COMBO_MAX_BLANKS)
  const equipped = options.equipped ?? []

  // Only examples where this entry's own form can actually be found: the
  // primary blank is the question, so there is nothing to ask without it.
  const usable = examplesOf(spell)
    .map((example) => {
      const own = ownTarget(spell, example)
      return own ? { example, own } : null
    })
    .filter((x): x is { example: Example; own: ComboTarget } => x !== null)
  if (usable.length === 0) return null

  const chosen = usable[Math.min(usable.length - 1, Math.floor(rng() * usable.length))]
  const { example, own } = chosen

  const primarySpan = locate(example.sentence, own.surfaceForm, [])
  if (!primarySpan) return null

  const taken: Span[] = [primarySpan]
  const picked: { span: Span; blank: ComboBlank }[] = [
    {
      span: primarySpan,
      blank: {
        dictionaryForm: own.dictionaryForm,
        surfaceForm: own.surfaceForm,
        spellId: spell.id,
        primary: true,
      },
    },
  ]

  // Everything else the sentence names that the player happens to have
  // equipped. Shuffled, so a sentence does not always break in the same
  // place, and capped twice over: by count, and by how much of the
  // sentence is allowed to disappear.
  const extras = example.targets
    .filter((t) => t.surfaceForm !== own.surfaceForm && !matchesSpell(t.dictionaryForm, spell))
    .map((t) => {
      const match = equipped.find((e) => e.id !== spell.id && matchesSpell(t.dictionaryForm, e))
      return match ? { target: t, spell: match } : null
    })
    .filter((x): x is { target: ComboTarget; spell: Spell } => x !== null)

  for (let i = extras.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[extras[i], extras[j]] = [extras[j], extras[i]]
  }

  const budget = example.sentence.length * COMBO_MAX_BLANKED_RATIO
  let blanked = primarySpan.end - primarySpan.start

  for (const extra of extras) {
    if (picked.length >= maxBlanks) break
    const span = locate(example.sentence, extra.target.surfaceForm, taken)
    if (!span) continue
    const width = span.end - span.start
    if (blanked + width > budget) continue
    taken.push(span)
    blanked += width
    picked.push({
      span,
      blank: {
        dictionaryForm: extra.target.dictionaryForm,
        surfaceForm: extra.target.surfaceForm,
        spellId: extra.spell.id,
        primary: false,
      },
    })
  }

  picked.sort((a, b) => a.span.start - b.span.start)

  // Replaced back to front so that each earlier span's indices still refer
  // to the string they were measured against.
  let text = example.sentence
  for (const { span } of [...picked].reverse()) {
    text = text.slice(0, span.start) + COMBO_BLANK + text.slice(span.end)
  }

  return {
    text,
    sentence: example.sentence,
    translation: example.translation,
    blanks: picked.map((p) => p.blank),
  }
}

/**
 * Normalises a typed Combo answer.
 *
 * Only the differences that are not the player's point: surrounding space,
 * a double space, a sentence-final mark typed out of habit. Nothing that
 * would let a different conjugation through — 나아져요 for 나아질 거예요 is
 * wrong, and saying so is most of what the mode is for. This is why Combo
 * does not go through `answerChecker`, which widens a match to an entry's
 * other spellings on purpose.
 */
export function normalizeComboAnswer(text: string): string {
  return (text ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.!?。！？]+$/u, '')
    .trim()
}

/** Whether one typed answer matches the form its blank asked for. */
export function comboAnswerCorrect(submitted: string, blank: ComboBlank): boolean {
  const want = normalizeComboAnswer(blank.surfaceForm)
  return want.length > 0 && normalizeComboAnswer(submitted) === want
}

/**
 * Whether a whole Combo question was answered. Every blank counts: the
 * attack lands when the sentence is complete, not when part of it is.
 */
export function comboPromptCorrect(submitted: readonly string[], prompt: ComboPrompt): boolean {
  if (prompt.blanks.length === 0) return false
  return prompt.blanks.every((blank, i) => comboAnswerCorrect(submitted[i] ?? '', blank))
}
