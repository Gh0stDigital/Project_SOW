import type { WorldImageRef } from './dungeon'
import type { Challenge } from './challenge'

export type BattlePhase =
  | 'player_select'
  | 'player_challenge'
  | 'player_resolve'
  | 'enemy_intro'
  | 'enemy_challenge'
  | 'enemy_resolve'
  | 'victory'
  | 'defeat'

export interface EnemyCombatant {
  kind: 'enemy' | 'boss' | 'mimic'
  name: string
  image: WorldImageRef
  /**
   * The level this foe rolled inside its tier's band.
   *
   * Everything else about it in combat terms comes from this number — its
   * HP, its damage, how much of a word the Totem facing it may deliver, and
   * how hard its questions are. It is shown to the player, because the whole
   * decision of whether to fight or run is "how does that compare to me".
   */
  level: number
  maxHp: number
  currentHp: number
  damage: number
}

export interface PlateauRequirement {
  spellId: string
  cleared: boolean
}

/** Ordered spell-id deck. Only card order lives here — never vocabulary data. */
export interface DeckState {
  order: string[]
}

export interface TimerState {
  totalSeconds: number
  remainingSeconds: number
  running: boolean
}

/**
 * One enemy attack, which may demand several defense prompts in sequence.
 * Damage scales with how many were answered correctly — see
 * battleEngine.defenseDamage(). A fully-correct defense still lets a
 * sliver through (battleBalance.defendedDamageFraction), which is the
 * partial-defense behavior the game already had for single prompts.
 */
export interface DefenseSequence {
  challenges: Challenge[]
  /** Index of the prompt currently being answered. */
  index: number
  /** One entry per answered prompt, in order. */
  results: boolean[]
}

export function defenseSequenceComplete(seq: DefenseSequence): boolean {
  return seq.index >= seq.challenges.length
}

export interface BattleState {
  enemy: EnemyCombatant
  isBoss: boolean
  /** Non-null only for boss battles; empty array once fully cleared. */
  plateau: PlateauRequirement[] | null
  deck: DeckState
  phase: BattlePhase
  activeChallenge: Challenge | null
  /**
   * The question that was just answered, kept after `activeChallenge` is
   * cleared. The resolve screen needs to say what the word was — and show
   * its example sentence, which the prompt had been hiding.
   */
  lastChallenge: Challenge | null
  /** Non-null while an enemy attack is being defended against. */
  defense: DefenseSequence | null
  timer: TimerState | null
  log: string[]
  totemDamageTakenThisBattle: number
  /** Result of the most recently resolved challenge, for UI feedback styling. */
  lastResult: 'correct' | 'incorrect' | null
  /** Guard so a victory's rewards can only ever be granted once. */
  rewardsGranted: boolean
}

export function isPlateauCleared(plateau: PlateauRequirement[] | null): boolean {
  if (!plateau) return true
  return plateau.every((r) => r.cleared)
}
