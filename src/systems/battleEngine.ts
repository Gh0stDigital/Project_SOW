import type { Spell } from '@/domain/spell'
import type { BattleState, DefenseSequence, EnemyCombatant, PlateauRequirement } from '@/domain/battle'
import type { Challenge } from '@/domain/challenge'
import type { WordRunStats } from '@/domain/dungeon'
import { battleBalance, type DungeonTierDef } from '@/config/balance'
import { mimicBalance } from '@/config/dungeonEvents'
import type { WorldPack } from '@/config/worldManifest'
import { pickSlot, bossSlot, nameFromSlot } from './worldRegistry'
import { buildDeck, playCard, visibleCards } from './deck'
import { generateChallenge, resolveChallenge, type ChallengeResolution } from './challengeEngine'
import { buildPlateau, clearRequirement, isFullyCleared } from './bossPlateau'
import { damageForSpell } from './spellProgression'
import { makeId } from './idGen'
import { pickRunWord } from './wordStats'

/**
 * Turn-based battle state machine. Pure functions only — React components
 * and the dungeon store call these and re-render from the returned state.
 * Vocabulary data (Spells) is always passed in by the caller; this module
 * never reads or writes the Compendium directly.
 */

/**
 * Which foe a seed spawns, decided from the seed alone.
 *
 * Exported so an encounter event can show the creature it is actually about
 * to put in front of the player. The event used to render the generic
 * `enemies/default` placeholder while the fight spawned something else
 * entirely; sharing this function is what keeps the two honest.
 */
export function enemyArtFor(world: WorldPack, seed: string): string | null {
  return pickSlot(world.enemies, seed)
}

/** A readable name for a foe from its art: `wraith` -> "Wraith". */
export function enemyNameFor(slot: string | null): string {
  if (!slot) return '떠도는 적'
  return nameFromSlot(slot)
}

export function spawnEnemy(world: WorldPack, seed: string, tier: DungeonTierDef): EnemyCombatant {
  const hp = tier.enemyHp
  const art = enemyArtFor(world, seed)
  return {
    kind: 'enemy',
    name: enemyNameFor(art),
    image: { folder: 'enemies', slot: art ?? '' },
    maxHp: hp,
    currentHp: hp,
    damage: tier.enemyDamage,
  }
}

/**
 * A Mimic: an ordinary foe's shape, but tougher, angrier and worth more.
 * Spawned only from an opened treasure chest.
 */
export function spawnMimic(world: WorldPack, seed: string, tier: DungeonTierDef): EnemyCombatant {
  const base = spawnEnemy(world, seed, tier)
  const hp = Math.round(base.maxHp * mimicBalance.hpMultiplier)
  return {
    ...base,
    kind: 'mimic',
    name: '미믹',
    image: { folder: 'events', slot: 'treasureMimic' },
    maxHp: hp,
    currentHp: hp,
    damage: Math.round(base.damage * mimicBalance.damageMultiplier),
  }
}

/**
 * The tier's boss.
 *
 * Its HP is the tier's own number and nothing else. It used to be a base
 * plus four per word in the dungeon pool, which made the deepest boss tough
 * because the run had read fifty words rather than because it was the
 * deepest boss — and the barrier already charges one right answer per pool
 * word, so the pool was being billed for twice.
 */
export function spawnBoss(world: WorldPack, seed: string, tier: DungeonTierDef): EnemyCombatant {
  const hp = tier.bossHp
  // A world may ship its own boss art; one that doesn't borrows an enemy.
  const boss = bossSlot(world, seed)
  return {
    kind: 'boss',
    name: '보스 수호자',
    image: boss ? { folder: boss.folder, slot: boss.slot } : { folder: 'enemies', slot: '' },
    maxHp: hp,
    currentHp: hp,
    damage: Math.round(tier.enemyDamage * battleBalance.bossDamageMultiplier),
  }
}

export function startBattle(
  enemy: EnemyCombatant,
  totemDeckSpellIds: string[],
  dungeonWordIds: string[] | null,
): BattleState {
  const isBoss = enemy.kind === 'boss'
  return {
    enemy,
    isBoss,
    plateau: isBoss && dungeonWordIds ? buildPlateau(dungeonWordIds) : null,
    deck: buildDeck(totemDeckSpellIds),
    phase: 'player_select',
    activeChallenge: null,
    lastChallenge: null,
    defense: null,
    timer: null,
    log: [isBoss ? '보스가 길을 막아섭니다!' : `${enemy.name}이(가) 나타났습니다!`],
    totemDamageTakenThisBattle: 0,
    lastResult: null,
    rewardsGranted: false,
  }
}

/**
 * Cards the player may attack with.
 *
 * While a boss barrier is up the *whole dungeon word set* stays selectable,
 * not just the rotating hand — otherwise a word buried in the deck could
 * lock the barrier shut. A failed attempt never removes a word either: the
 * card returns to the deck, so nothing becomes permanently unavailable.
 */
export function selectableSpellIds(state: BattleState, dungeonWordIds: string[] | null): string[] {
  const barrierUp = state.isBoss && state.plateau && !isFullyCleared(state.plateau)
  if (barrierUp && dungeonWordIds && dungeonWordIds.length > 0) {
    const seen = new Set<string>()
    return [...dungeonWordIds, ...state.deck.order].filter((id) => {
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }
  return visibleHand(state)
}

export function visibleHand(state: BattleState, count: number = battleBalance.visibleHandSize): string[] {
  return visibleCards(state.deck, count)
}

export function beginPlayerChallenge(state: BattleState, spell: Spell): BattleState {
  // Attacking: the card shows the word's first syllable and the player
  // supplies the whole Korean word.
  const challenge = generateChallenge(spell, 'attack', 'eng_to_kor')
  return { ...state, phase: 'player_challenge', activeChallenge: challenge, lastResult: null }
}

/**
 * The face of an attack card: the first syllable of the Korean word.
 *
 * It used to be two letters of the English — "Anxiety" became "AY" — on the
 * reasoning that an attack asks for the Korean, so the Korean must not
 * appear. In a hand of eight that reads as eight pairs of initials with
 * nothing to tell them apart, and it is the wrong language for a card in a
 * Korean deck besides.
 *
 * One syllable is a better card face and no more of a giveaway. Hangul is
 * syllabic, so 안내 shows 안: enough to know which word you are picking,
 * and short of the answer, which is the whole word spelled out a syllable
 * at a time. A word of one syllable gives itself away — but a one-syllable
 * word is a tile or two on the board anyway, so there was never much to
 * hide.
 */
export function attackCardAvatar(korean: string): string {
  const word = korean.trim()
  if (word.length === 0) return '?'
  // [...word] rather than word[0]: a character outside the basic plane is
  // two UTF-16 units, and half of one renders as a replacement glyph.
  return [...word][0]
}

export interface AttackOutcome {
  state: BattleState
  resolution: ChallengeResolution
  damageDealt: number
  plateauCleared: boolean
}

/**
 * Resolves the player's attack submission. Advances the deck either way.
 *
 * `might` is the attacking Totem's damage multiplier — see
 * totemBalance.might(). It is passed in rather than read from a store
 * because this module is pure, and it defaults to 1 so a caller that has no
 * Totem in hand (a test, a preview) gets the word's own damage.
 */
export function resolvePlayerAttack(
  state: BattleState,
  spell: Spell,
  submitted: string,
  might = 1,
): AttackOutcome {
  const challenge = state.activeChallenge as Challenge
  const resolution = resolveChallenge(spell, challenge, submitted, 'attack')

  let plateau = state.plateau
  let plateauCleared = false
  let damageDealt = 0
  let enemy = state.enemy

  if (resolution.correct) {
    const plateauActive = state.isBoss && plateau && !isFullyCleared(plateau)
    if (plateauActive && plateau!.some((r) => r.spellId === spell.id && !r.cleared)) {
      plateau = clearRequirement(plateau!, spell.id)
      plateauCleared = true
    }
    const stillBlocked = state.isBoss && plateau && !isFullyCleared(plateau)
    if (!stillBlocked) {
      damageDealt = damageForSpell(resolution.spell, might)
      enemy = { ...enemy, currentHp: Math.max(0, enemy.currentHp - damageDealt) }
    }
  }

  const deck = playCard(state.deck, spell.id)
  const log = [
    ...state.log,
    resolution.correct
      ? damageDealt > 0
        ? `${spell.korean}이(가) 명중해 ${damageDealt}의 피해를 입혔습니다!`
        : `${spell.korean}이(가) 명중했지만 결계가 흡수합니다.`
      : `"${challenge.prompt}"을(를) 잘못 옮겼습니다 — 공격이 흩어집니다.`,
  ]

  const nextPhase = enemy.currentHp <= 0 ? 'victory' : 'player_resolve'

  return {
    state: {
      ...state,
      enemy,
      deck,
      plateau,
      phase: nextPhase,
      activeChallenge: null,
      lastChallenge: challenge,
      log,
      lastResult: resolution.correct ? 'correct' : 'incorrect',
    },
    resolution,
    damageDealt,
    plateauCleared,
  }
}

/**
 * Starts an enemy attack, which may demand several defense prompts in a
 * row. Prompts show the Korean word; the player supplies an accepted
 * English meaning under a visible timer.
 */
export function beginEnemyChallenge(
  state: BattleState,
  dungeonSpells: Spell[],
  timerSeconds: number,
  rng: () => number = Math.random,
  /**
   * The run's word record, so a volley draws by the same weighting the
   * dungeon's own events use. Omitted, the draw falls back to even — which
   * is what a caller without a run in hand should get.
   */
  wordStats: Record<string, WordRunStats> = {},
): BattleState {
  if (dungeonSpells.length === 0) {
    return { ...state, phase: 'enemy_intro', activeChallenge: null, defense: null, timer: null }
  }

  const count = defensePromptCount(state.isBoss, dungeonSpells.length, rng)
  const challenges: Challenge[] = []
  const used = new Set<string>()
  for (let i = 0; i < count; i++) {
    // Prefer distinct words per attack, but never loop forever on a tiny pool.
    const draw = () => {
      const id = pickRunWord(
        dungeonSpells.map((s) => s.id),
        wordStats,
        rng,
        state.lastChallenge?.spellId ?? null,
      )
      return dungeonSpells.find((s) => s.id === id) ?? dungeonSpells[0]
    }
    let spell = draw()
    for (let tries = 0; tries < 8 && used.has(spell.id) && used.size < dungeonSpells.length; tries++) {
      spell = draw()
    }
    used.add(spell.id)
    challenges.push(generateChallenge(spell, 'defense', 'kor_to_eng'))
  }

  const defense: DefenseSequence = { challenges, index: 0, results: [] }
  return {
    ...state,
    phase: 'enemy_challenge',
    defense,
    activeChallenge: challenges[0],
    timer: { totalSeconds: timerSeconds, remainingSeconds: timerSeconds, running: true },
    lastResult: null,
  }
}

/** How many words this attack demands. Bosses lean harder on multi-word. */
export function defensePromptCount(isBoss: boolean, poolSize: number, rng: () => number): number {
  const chance = isBoss ? battleBalance.bossMultiPromptChance : battleBalance.multiPromptChance
  const max = Math.min(
    poolSize,
    isBoss ? battleBalance.bossMaxDefensePrompts : battleBalance.maxDefensePrompts,
  )
  if (max <= battleBalance.minDefensePrompts) return battleBalance.minDefensePrompts
  if (rng() >= chance) return battleBalance.minDefensePrompts
  const extra = 1 + Math.floor(rng() * (max - battleBalance.minDefensePrompts))
  return Math.min(max, battleBalance.minDefensePrompts + extra)
}

export function tickTimer(state: BattleState, deltaSeconds: number): BattleState {
  if (!state.timer || !state.timer.running) return state
  const remainingSeconds = Math.max(0, state.timer.remainingSeconds - deltaSeconds)
  return { ...state, timer: { ...state.timer, remainingSeconds } }
}

export function setTimerRunning(state: BattleState, running: boolean): BattleState {
  if (!state.timer) return state
  return { ...state, timer: { ...state.timer, running } }
}

/**
 * Damage from an enemy attack, given how many of its prompts were answered
 * correctly.
 *
 * Partial defense already existed for single prompts (a correct answer let
 * `defendedDamageFraction` through rather than zero), so multi-prompt
 * attacks extend the same idea: damage scales linearly from full damage at
 * zero correct down to that same reduced fraction at all correct.
 */
export function defenseDamage(
  enemyDamage: number,
  correct: number,
  total: number,
  mitigation = 0,
): number {
  if (total <= 0) return 0
  const ratio = correct / total
  const floor = battleBalance.defendedDamageFraction
  const multiplier = 1 - ratio * (1 - floor)
  // The Totem's own toughness comes off after the defense, so answering
  // well is still the larger of the two effects and a sturdy Totem is not a
  // reason to stop answering.
  const absorbed = 1 - Math.max(0, Math.min(1, mitigation))
  return Math.round(enemyDamage * multiplier * absorbed)
}

export interface DefensePromptOutcome {
  state: BattleState
  resolution: ChallengeResolution
  /** The spell this prompt asked about. */
  spellId: string
  /** True once every prompt in the attack has been answered. */
  sequenceComplete: boolean
  /** Only meaningful when sequenceComplete — 0 until then. */
  damageToTotem: number
  plateauCleared: boolean
}

/**
 * Resolves ONE prompt of the current enemy attack. When more prompts
 * remain the state advances to the next one with a fresh timer; when the
 * last one is answered the accumulated damage is applied.
 */
export function resolveDefensePrompt(
  state: BattleState,
  spell: Spell,
  submitted: string,
  timedOut: boolean,
  timerSeconds: number,
  /** The defending Totem's damage reduction — totemBalance.mitigation(). */
  mitigation = 0,
): DefensePromptOutcome {
  const defense = state.defense!
  const challenge = defense.challenges[defense.index]
  const resolution = timedOut
    ? forceIncorrect(spell, challenge)
    : resolveChallenge(spell, challenge, submitted, 'defense')

  // A correct defense counts toward the boss barrier, exactly like a
  // correct attack — which is what stops the barrier soft-locking.
  let plateau = state.plateau
  let plateauCleared = false
  if (resolution.correct && state.isBoss && plateau) {
    const req = plateau.find((r) => r.spellId === spell.id && !r.cleared)
    if (req) {
      plateau = clearRequirement(plateau, spell.id)
      plateauCleared = true
    }
  }

  const results = [...defense.results, resolution.correct]
  const nextIndex = defense.index + 1
  const complete = nextIndex >= defense.challenges.length

  const log = [
    ...state.log,
    resolution.correct
      ? `"${challenge.prompt}"을(를) 제때 떠올렸습니다.`
      : timedOut
        ? `너무 늦었습니다! "${challenge.prompt}"에 답하지 못했습니다.`
        : `"${challenge.prompt}"의 뜻이 틀렸습니다.`,
  ]

  if (!complete) {
    return {
      state: {
        ...state,
        plateau,
        defense: { ...defense, index: nextIndex, results },
        activeChallenge: defense.challenges[nextIndex],
        timer: { totalSeconds: timerSeconds, remainingSeconds: timerSeconds, running: true },
        log,
        lastResult: resolution.correct ? 'correct' : 'incorrect',
      },
      resolution,
      spellId: spell.id,
      sequenceComplete: false,
      damageToTotem: 0,
      plateauCleared,
    }
  }

  const correctCount = results.filter(Boolean).length
  const damageToTotem = defenseDamage(state.enemy.damage, correctCount, results.length, mitigation)
  const summary =
    correctCount === results.length
      ? `공격을 막아냈습니다 — ${damageToTotem}의 피해만 들어왔습니다.`
      : correctCount === 0
        ? `공격이 그대로 적중해 ${damageToTotem}의 피해를 입혔습니다!`
        : `일부만 막았습니다 — ${results.length}개 중 ${correctCount}개 정답, ${damageToTotem}의 피해를 입었습니다.`

  return {
    state: {
      ...state,
      plateau,
      phase: 'enemy_resolve',
      defense: { ...defense, index: nextIndex, results },
      activeChallenge: null,
      lastChallenge: challenge,
      timer: null,
      totemDamageTakenThisBattle: state.totemDamageTakenThisBattle + damageToTotem,
      log: [...log, summary],
      lastResult: correctCount === results.length ? 'correct' : 'incorrect',
    },
    resolution,
    spellId: spell.id,
    sequenceComplete: true,
    damageToTotem,
    plateauCleared,
  }
}

function forceIncorrect(spell: Spell, challenge: Challenge): ChallengeResolution {
  // Re-use resolveChallenge's stat bookkeeping by submitting a value that
  // can never match, guaranteeing an "incorrect" result on timeout.
  return resolveChallenge(spell, challenge, `__timeout__${makeId('x')}`, 'defense')
}

export function returnToPlayerTurn(state: BattleState): BattleState {
  if (state.enemy.currentHp <= 0) return { ...state, phase: 'victory', defense: null }
  return { ...state, phase: 'player_select', defense: null, activeChallenge: null, timer: null }
}

/** Flipped once a victory's rewards have been paid out, so they can't repeat. */
export function markRewardsGranted(state: BattleState): BattleState {
  return { ...state, rewardsGranted: true }
}

export function markDefeat(state: BattleState): BattleState {
  return { ...state, phase: 'defeat' }
}

export function plateauRequirements(state: BattleState): PlateauRequirement[] {
  return state.plateau ?? []
}
