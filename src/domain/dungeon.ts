import type { WorldFolder } from '@/systems/worldRegistry'
import type { DungeonEventType } from '@/config/dungeonEvents'
import type { DungeonTierId } from '@/config/balance'
import type { Challenge } from './challenge'
import type { RestNpc } from '@/systems/restNpcs'

export interface DungeonConfig {
  totemId: string
  totemSpellSetId: string
  dungeonSpellSetId: string
  tierId: DungeonTierId
  /** Resolved word pool for this run (capped to the tier's word limit). */
  dungeonWordIds: string[]
  /**
   * Which world this run takes place in. Every backdrop, prop, foe and face
   * comes from its pack, so the world is chosen once at setup and the rest
   * follows from it.
   */
  worldId: string
}

/**
 * Explicit dungeon state machine.
 *
 * Every screen the player can be looking at is exactly one of these, and
 * `systems/dungeonState.ts` owns which transitions are legal. Nothing may
 * start a Move, open a Standby menu, or submit an answer unless the run is
 * in the state that permits it — that guard is what keeps events, timers,
 * battles and results from overlapping.
 */
export type DungeonState =
  | 'DungeonSetup'
  | 'Standby'
  | 'Rolling'
  | 'ResolvingEvent'
  | 'VocabularyInput'
  | 'Battle'
  | 'Rest'
  | 'BossBattle'
  | 'Results'
  | 'Defeat'

/** Per-word performance for the current run only (lifetime stats live on the Spell). */
export interface WordRunStats {
  spellId: string
  /** True once the word has appeared in any *completed* prompt this run. */
  introduced: boolean
  correct: number
  incorrect: number
  attackCorrect: number
  attackTotal: number
  defenseCorrect: number
  defenseTotal: number
}

export function emptyWordStats(spellId: string): WordRunStats {
  return {
    spellId,
    introduced: false,
    correct: 0,
    incorrect: 0,
    attackCorrect: 0,
    attackTotal: 0,
    defenseCorrect: 0,
    defenseTotal: 0,
  }
}

/** An active Direction bias on future event rolls. */
export interface ActiveModifier {
  /** Matches DirectionEffect.id — used to resolve replacement on overlap. */
  id: string
  label: string
  weightDeltas: Partial<Record<DungeonEventType, number>>
  /**
   * Which end of the tier's level band foes are drawn from while this runs.
   * -1 is as shallow as the band goes, +1 as deep. Absent on a path that
   * only changes which *kind* of room turns up.
   */
  enemyLevelBias?: number
  /** Move events remaining before this expires. */
  movesRemaining: number
}

export interface DungeonEvent {
  id: string
  type: DungeonEventType
  title: string
  /** Sequential lines shown in the typewriter area. */
  bodyText: string[]
  /** Art for this event, as a slot inside the run's world. */
  image: WorldImageRef
  challenge: Challenge | null
  /** Direction paths offered, for `direction` events only. */
  directionChoices: DirectionChoice[] | null
}

/** A picture addressed by slot within the run's world. */
export interface WorldImageRef {
  folder: WorldFolder
  slot: string
}

export interface DirectionChoice {
  id: string
  label: string
  flavor: string
  weightDeltas: Partial<Record<DungeonEventType, number>>
  /** See ActiveModifier.enemyLevelBias. */
  enemyLevelBias?: number
  durationMoves: number
}

export interface RewardBundle {
  money: number
  totemXp: number
  itemIds: string[]
  /** Human-readable lines describing what was gained, for the reward panel. */
  lines: string[]
}

export function emptyRewardBundle(): RewardBundle {
  return { money: 0, totemXp: 0, itemIds: [], lines: [] }
}

export interface RunStats {
  turns: number
  eventsEncountered: number
  enemiesDefeated: number
  mimicsDefeated: number
  treasureCollected: number
  moneyEarned: number
  totemXpEarned: number
  spellXpEarned: number
  correctAnswers: number
  incorrectAnswers: number
  attackCorrect: number
  attackTotal: number
  defenseCorrect: number
  defenseTotal: number
  itemsCollected: string[]
  spellLevelUps: { spellId: string; from: number; to: number }[]
  newlyMasteredWords: string[]
  restsUsed: number
  bossDefeated: boolean
  /** Set when the run ended because the Totem hit 0 HP. */
  totemDefeated: boolean
  /** Set when the player walked out voluntarily. */
  abandoned: boolean
  /** Life Points the Totem had left once the run ended. */
  lifePointsRemaining: number
  lifePointLost: boolean
  totemDestroyed: boolean
}

export function createEmptyRunStats(): RunStats {
  return {
    turns: 0,
    eventsEncountered: 0,
    enemiesDefeated: 0,
    mimicsDefeated: 0,
    treasureCollected: 0,
    moneyEarned: 0,
    totemXpEarned: 0,
    spellXpEarned: 0,
    correctAnswers: 0,
    incorrectAnswers: 0,
    attackCorrect: 0,
    attackTotal: 0,
    defenseCorrect: 0,
    defenseTotal: 0,
    itemsCollected: [],
    spellLevelUps: [],
    newlyMasteredWords: [],
    restsUsed: 0,
    bossDefeated: false,
    totemDefeated: false,
    abandoned: false,
    lifePointsRemaining: 0,
    lifePointLost: false,
    totemDestroyed: false,
  }
}

export interface DungeonRunState {
  config: DungeonConfig
  state: DungeonState
  /** Advances once per Move. */
  turn: number

  /** Per-word run tracking, keyed by spell id. */
  wordStats: Record<string, WordRunStats>
  /** Event types generated this run, for the anti-repeat rule. */
  eventHistory: DungeonEventType[]
  /** Direction biases currently in force. */
  modifiers: ActiveModifier[]

  keyFound: boolean
  keyUsed: boolean
  bossDoorFound: boolean
  /** Climbing weight bonus while an unlocked Boss Door keeps not appearing. */
  bossDoorPressure: number
  /** True once every pool word has been introduced — gates the Key Room. */
  keyRoomUnlocked: boolean
  /** Set once the Key Room has been generated, so it can never repeat. */
  keyRoomSeen: boolean
  /** Climbing selection chance while the unlocked Key Room keeps losing its roll. */
  keyRoomPressure: number

  restAreaFound: boolean
  restUses: number
  /**
   * The people in this run's Rest Area. Generated on first arrival and kept
   * for the rest of the run, so who is there — and who you have already
   * spoken to — survives leaving and coming back.
   */
  restNpcs: RestNpc[]

  currentEvent: DungeonEvent | null
  /**
   * Countdown for a timed event prompt (traps). Non-null only while one is
   * running, so there is never more than one event timer in flight.
   */
  eventTimer: { totalSeconds: number; remainingSeconds: number; running: boolean } | null
  /** Rewards from the most recently resolved event, shown then cleared. */
  pendingReward: RewardBundle | null
  lastOutcomeText: string[]
  /** Transient one-line notice shown in Standby (e.g. an item was used). */
  standbyNotice: string | null

  stats: RunStats
  startedAt: string
}

export function poolWordIds(run: DungeonRunState): string[] {
  return run.config.dungeonWordIds
}

/** Words introduced so far (any completed prompt, right or wrong). */
export function introducedCount(run: DungeonRunState): number {
  return run.config.dungeonWordIds.filter((id) => run.wordStats[id]?.introduced).length
}

