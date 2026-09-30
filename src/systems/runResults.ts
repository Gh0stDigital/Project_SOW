import type { Spell } from '@/domain/spell'
import type { DungeonRunState, WordRunStats } from '@/domain/dungeon'
import { attackAccuracyOf, accuracyOf, defenseAccuracyOf, strugglingWords } from './wordStats'

/**
 * Builds the end-of-run report.
 *
 * Purely derived from the run state that already exists — this module
 * grants nothing and mutates nothing, so re-rendering or reopening the
 * Results screen can never award anything a second time. Rewards are
 * credited at the moment they're earned, during the run.
 */

export interface WordReportRow {
  spellId: string
  korean: string
  english: string
  introduced: boolean
  correct: number
  incorrect: number
  accuracy: number
  attackCorrect: number
  attackTotal: number
  attackAccuracy: number
  defenseCorrect: number
  defenseTotal: number
  defenseAccuracy: number
}

export interface RunReport {
  outcome: 'victory' | 'defeat' | 'abandoned'
  title: string
  turns: number
  moneyEarned: number
  totemXpEarned: number
  itemsCollected: string[]
  materialsCollected: string[]
  enemiesDefeated: number
  mimicsDefeated: number
  treasureCollected: number
  restsUsed: number

  totalCorrect: number
  totalIncorrect: number
  totalAccuracy: number
  attackAccuracy: number
  defenseAccuracy: number

  words: WordReportRow[]
  struggled: WordReportRow[]
  /** Words whose charge climbed this run. */
  chargeGains: { spellId: string; korean: string; from: number; to: number }[]
  masteredWords: string[]

  totemHp: number
  totemMaxHp: number
  lifePointsRemaining: number
  lifePointLost: boolean
  totemDestroyed: boolean
  totemLevelBefore: number
  totemLevelAfter: number
}

function rowFor(stats: WordRunStats | undefined, spell: Spell | undefined, spellId: string): WordReportRow {
  const s: WordRunStats = stats ?? {
    spellId,
    introduced: false,
    correct: 0,
    incorrect: 0,
    attackCorrect: 0,
    attackTotal: 0,
    defenseCorrect: 0,
    defenseTotal: 0,
  }
  return {
    spellId,
    korean: spell?.korean ?? '?',
    english: spell?.english ?? '?',
    introduced: s.introduced,
    correct: s.correct,
    incorrect: s.incorrect,
    accuracy: accuracyOf(s),
    attackCorrect: s.attackCorrect,
    attackTotal: s.attackTotal,
    attackAccuracy: attackAccuracyOf(s),
    defenseCorrect: s.defenseCorrect,
    defenseTotal: s.defenseTotal,
    defenseAccuracy: defenseAccuracyOf(s),
  }
}

export interface ReportInput {
  run: DungeonRunState
  spells: Spell[]
  totemHp: number
  totemMaxHp: number
  totemLevelBefore: number
  totemLevelAfter: number
}

export function buildRunReport({
  run,
  spells,
  totemHp,
  totemMaxHp,
  totemLevelBefore,
  totemLevelAfter,
}: ReportInput): RunReport {
  const byId = new Map(spells.map((s) => [s.id, s]))
  const words = run.config.dungeonWordIds.map((id) => rowFor(run.wordStats[id], byId.get(id), id))
  const struggled = strugglingWords(run).map((s) => rowFor(s, byId.get(s.spellId), s.spellId))

  const totalAnswered = run.stats.correctAnswers + run.stats.incorrectAnswers
  const outcome: RunReport['outcome'] = run.stats.bossDefeated
    ? 'victory'
    : run.stats.abandoned
      ? 'abandoned'
      : 'defeat'

  return {
    outcome,
    title:
      outcome === 'victory'
        ? '던전 클리어!'
        : outcome === 'abandoned'
          ? '던전 포기'
          : '토템이 쓰러졌습니다',
    turns: run.stats.turns,
    moneyEarned: run.stats.moneyEarned,
    totemXpEarned: run.stats.totemXpEarned,
    itemsCollected: run.stats.itemsCollected,
    materialsCollected: run.stats.materialsCollected,
    enemiesDefeated: run.stats.enemiesDefeated,
    mimicsDefeated: run.stats.mimicsDefeated,
    treasureCollected: run.stats.treasureCollected,
    restsUsed: run.stats.restsUsed,

    totalCorrect: run.stats.correctAnswers,
    totalIncorrect: run.stats.incorrectAnswers,
    totalAccuracy: totalAnswered === 0 ? 0 : run.stats.correctAnswers / totalAnswered,
    attackAccuracy: run.stats.attackTotal === 0 ? 0 : run.stats.attackCorrect / run.stats.attackTotal,
    defenseAccuracy: run.stats.defenseTotal === 0 ? 0 : run.stats.defenseCorrect / run.stats.defenseTotal,

    words,
    struggled,
    chargeGains: run.stats.chargeGains.map((g) => ({ ...g, korean: byId.get(g.spellId)?.korean ?? '?' })),
    masteredWords: run.stats.newlyMasteredWords.map((id) => byId.get(id)?.korean ?? '?'),

    totemHp,
    totemMaxHp,
    lifePointsRemaining: run.stats.lifePointsRemaining,
    lifePointLost: run.stats.lifePointLost,
    totemDestroyed: run.stats.totemDestroyed,
    totemLevelBefore,
    totemLevelAfter,
  }
}

export function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}
