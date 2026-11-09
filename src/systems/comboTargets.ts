/**
 * The older deck format's target cell.
 *
 * Before decks carried seven levelled sentences, each example came with a
 * cell naming the words inside it and the exact shape each one took:
 *
 *   sentence: 계속 연습하면 한국어 실력이 나아질 거예요.
 *   targets:  연습하다=연습하면|나아지다=나아질 거예요
 *
 * Decks are not written that way any more — systems/sentenceBlank.ts finds
 * the word in the sentence instead — but a Compendium built from one of
 * those files still holds the cells, and being told outright is better
 * evidence than working it out. So the parsing stays, and
 * comboSentence.ts reads it when a word has no levelled sentence.
 *
 * Pure: no React, no store.
 */

import type { ComboTarget } from '@/domain/combo'

export type { ComboTarget }

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
