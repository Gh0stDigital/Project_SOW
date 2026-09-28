import type { DungeonRunState, WordRunStats } from '@/domain/dungeon'
import { emptyWordStats } from '@/domain/dungeon'
import { wordPacing } from '@/config/balance'

/**
 * Per-run vocabulary tracking.
 *
 * Separate from the lifetime counters on a Spell (which
 * spellCompendium.recordChallengeOutcome already maintains) — this module
 * answers "how did this word go *in this run*", which is what the Key Room
 * gate and the Results screen report on.
 *
 * Pure functions only.
 */

export type AttemptKind = 'attack' | 'defense' | 'event'

export function initWordStats(spellIds: string[]): Record<string, WordRunStats> {
  const out: Record<string, WordRunStats> = {}
  for (const id of spellIds) out[id] = emptyWordStats(id)
  return out
}

/**
 * Records one *completed* prompt. Completing a prompt is what marks a word
 * "introduced", right or wrong — which is the exact condition the Key Room
 * unlock is defined against.
 */
export function recordAttempt(
  stats: Record<string, WordRunStats>,
  spellId: string,
  kind: AttemptKind,
  correct: boolean,
): Record<string, WordRunStats> {
  const prev = stats[spellId] ?? emptyWordStats(spellId)
  const next: WordRunStats = {
    ...prev,
    introduced: true,
    correct: prev.correct + (correct ? 1 : 0),
    incorrect: prev.incorrect + (correct ? 0 : 1),
    attackCorrect: prev.attackCorrect + (kind === 'attack' && correct ? 1 : 0),
    attackTotal: prev.attackTotal + (kind === 'attack' ? 1 : 0),
    defenseCorrect: prev.defenseCorrect + (kind === 'defense' && correct ? 1 : 0),
    defenseTotal: prev.defenseTotal + (kind === 'defense' ? 1 : 0),
  }
  return { ...stats, [spellId]: next }
}

/**
 * Marks a word introduced without recording an attempt — used by the Magic
 * Room, whose puzzle word counts as seen however the puzzle ended.
 */
export function markIntroduced(
  stats: Record<string, WordRunStats>,
  spellId: string,
): Record<string, WordRunStats> {
  const prev = stats[spellId] ?? emptyWordStats(spellId)
  if (prev.introduced) return stats
  return { ...stats, [spellId]: { ...prev, introduced: true } }
}

export function accuracyOf(s: WordRunStats): number {
  const total = s.correct + s.incorrect
  return total === 0 ? 0 : s.correct / total
}

export function attackAccuracyOf(s: WordRunStats): number {
  return s.attackTotal === 0 ? 0 : s.attackCorrect / s.attackTotal
}

export function defenseAccuracyOf(s: WordRunStats): number {
  return s.defenseTotal === 0 ? 0 : s.defenseCorrect / s.defenseTotal
}

/** Attempted words the player got wrong at least as often as right. */
export function strugglingWords(run: DungeonRunState): WordRunStats[] {
  return run.config.dungeonWordIds
    .map((id) => run.wordStats[id])
    .filter((s): s is WordRunStats => !!s && s.correct + s.incorrect > 0 && s.incorrect >= s.correct)
    .sort((a, b) => b.incorrect - a.incorrect)
}

// ---------------------------------------------------------------------------
// Which word to ask about next
// ---------------------------------------------------------------------------

/**
 * How likely one word is to be the next one asked about.
 *
 * See config/balance.ts `wordPacing` for what the numbers mean and why. A
 * word with no stats at all counts as unseen, which is the right answer for
 * a pool id the run has somehow not initialised.
 */
export function wordWeight(stats: WordRunStats | undefined): number {
  if (!stats || !stats.introduced) return wordPacing.unseen
  const raw =
    wordPacing.seenBase + wordPacing.missWeight * stats.incorrect - wordPacing.masteryDrop * stats.correct
  return Math.min(wordPacing.maxSeen, Math.max(wordPacing.minSeen, raw))
}

/**
 * The next word to ask about, drawn by weight rather than evenly.
 *
 * `avoid` is the word the previous prompt used; it is damped rather than
 * excluded, so a word just answered wrong can still come straight back —
 * just not every time.
 *
 * Returns null only for an empty pool. The caller decides what that means;
 * here it is simply "there is nothing to ask about".
 */
export function pickRunWord(
  pool: string[],
  stats: Record<string, WordRunStats>,
  rng: () => number,
  avoid?: string | null,
): string | null {
  if (pool.length === 0) return null
  if (pool.length === 1) return pool[0]

  const weights = pool.map((id) => {
    const w = wordWeight(stats[id])
    return id === avoid ? w * wordPacing.repeatDamp : w
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  // Every weight is floored above zero, so this cannot happen — but a total
  // of zero would make the walk below return nothing, and falling back to an
  // even draw is better than returning the last element by accident.
  if (total <= 0) return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))]

  let roll = rng() * total
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

/** What share of the next draw each word holds — for tests and tuning. */
export function drawShares(
  pool: string[],
  stats: Record<string, WordRunStats>,
  avoid?: string | null,
): Record<string, number> {
  const weights = pool.map((id) => {
    const w = wordWeight(stats[id])
    return id === avoid ? w * wordPacing.repeatDamp : w
  })
  const total = weights.reduce((sum, w) => sum + w, 0)
  const out: Record<string, number> = {}
  pool.forEach((id, i) => { out[id] = total > 0 ? weights[i] / total : 0 })
  return out
}

