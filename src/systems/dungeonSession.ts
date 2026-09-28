import type { Spell } from '@/domain/spell'
import type {
  ActiveModifier,
  DirectionChoice,
  DungeonConfig,
  DungeonEvent,
  DungeonRunState,
  DungeonState,
  RewardBundle,
} from '@/domain/dungeon'
import { allWordsIntroduced, createEmptyRunStats } from '@/domain/dungeon'
import type { DungeonTierDef } from '@/config/balance'
import { spellBalance } from '@/config/balance'
import {
  fourWayDirectionChance,
  fourWayDirections,
  levelDirections,
  twoWayDirections,
  type DungeonEventType,
} from '@/config/dungeonEvents'
import { rollEvent } from './eventGenerator'
import { eventDefinitions } from './eventContent'
import { generateChallenge } from './challengeEngine'
import { tickModifiers, addModifier as addModifierTo } from './directionModifiers'
import { initWordStats, markIntroduced, pickRunWord, recordAttempt, type AttemptKind } from './wordStats'
import { transition } from './dungeonState'
import { makeId } from './idGen'
import { resolveWorld, pickSlot } from './worldRegistry'

/**
 * Dungeon run orchestration — pure state transforms over DungeonRunState.
 *
 * Every function here returns a new run object and performs no side
 * effects: no store writes, no persistence, no randomness except via an
 * injected rng. The store applies the results and handles anything that
 * touches the outside world (Totem HP, inventory, the Compendium).
 */

/**
 * Builds a DungeonConfig, capping the resolved word pool to the tier's
 * word limit. If the chosen Dungeon Spell Set has more words than the tier
 * allows, a random subset is used.
 */
export function buildDungeonConfig(
  totemId: string,
  totemSpellSetId: string,
  dungeonSpellSetId: string,
  dungeonSpellSetWordIds: string[],
  tier: DungeonTierDef,
  worldId: string,
  rng: () => number = Math.random,
): DungeonConfig {
  let pool = [...dungeonSpellSetWordIds]
  if (pool.length > tier.wordLimit) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1))
      ;[pool[i], pool[j]] = [pool[j], pool[i]]
    }
    pool = pool.slice(0, tier.wordLimit)
  }
  return {
    totemId,
    totemSpellSetId,
    dungeonSpellSetId,
    tierId: tier.id,
    dungeonWordIds: pool,
    worldId,
  }
}

export function startDungeon(config: DungeonConfig): DungeonRunState {
  return {
    config,
    // A run opens in Standby: the first event is only rolled once the
    // player chooses to Move.
    state: 'Standby',
    turn: 0,
    wordStats: initWordStats(config.dungeonWordIds),
    eventHistory: [],
    modifiers: [],
    keyFound: false,
    keyUsed: false,
    bossDoorFound: false,
    bossDoorPressure: 0,
    keyRoomUnlocked: false,
    keyRoomSeen: false,
    keyRoomPressure: 0,
    restAreaFound: false,
    restUses: 0,
    restNpcs: [],
    currentEvent: null,
    eventTimer: null,
    pendingReward: null,
    lastOutcomeText: [],
    standbyNotice: null,
    stats: createEmptyRunStats(),
    startedAt: new Date().toISOString(),
  }
}

/** Moves the run to a new state, ignoring the change if it isn't legal. */
export function setState(run: DungeonRunState, next: DungeonState): DungeonRunState {
  return { ...run, state: transition(run.state, next) }
}

/** Returns the player to Standby, optionally with a one-line notice. */
export function toStandby(run: DungeonRunState, notice: string | null = null): DungeonRunState {
  return {
    ...run,
    state: transition(run.state, 'Standby'),
    currentEvent: null,
    eventTimer: null,
    pendingReward: null,
    standbyNotice: notice,
    lastOutcomeText: [],
  }
}

export function setStandbyNotice(run: DungeonRunState, notice: string | null): DungeonRunState {
  return { ...run, standbyNotice: notice }
}

// ---------------------------------------------------------------------------
// Movement + event generation
// ---------------------------------------------------------------------------

/**
 * The word this event asks about.
 *
 * Weighted by how the run has gone so far rather than drawn evenly — see
 * systems/wordStats.ts. The word the previous event used is passed as the
 * one to damp, so the same prompt does not come round twice running more
 * often than it has to.
 */
function pickEventSpell(run: DungeonRunState, spells: Spell[], rng: () => number): Spell {
  const id = pickRunWord(
    spells.map((s) => s.id),
    run.wordStats,
    rng,
    run.currentEvent?.challenge?.spellId ?? null,
  )
  return spells.find((s) => s.id === id) ?? spells[0]
}

function buildDirectionChoices(rng: () => number): DirectionChoice[] {
  const fourWay = rng() < fourWayDirectionChance
  const slots = fourWay ? 4 : 2
  // The level-biasing paths are pooled in with the rest and the fork is cut
  // to its slots afterwards, so a fork is sometimes a question about danger
  // and sometimes a question about what you are hunting for — rather than
  // always offering both and always looking the same.
  const source = [...(fourWay ? fourWayDirections : twoWayDirections), ...levelDirections]
  // Shuffle so left/right (or the four slots) aren't in a fixed order; the
  // player still gets each path's thematic clue, never a raw probability.
  const shuffled = [...source]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, slots).map((d) => ({
    id: d.id,
    label: d.label,
    flavor: d.flavor,
    weightDeltas: d.weightDeltas,
    ...(d.enemyLevelBias === undefined ? {} : { enemyLevelBias: d.enemyLevelBias }),
    durationMoves: d.durationMoves,
  }))
}

export interface NextEventResult {
  run: DungeonRunState
  event: DungeonEvent
}

/**
 * Advances the turn, rolls one event under the active modifiers, and ticks
 * those modifiers down. The run lands in ResolvingEvent; nothing about the
 * event's *outcome* is decided here.
 */
export function generateNextEvent(
  run: DungeonRunState,
  dungeonSpells: Spell[],
  rng: () => number = Math.random,
): NextEventResult {
  const roll = rollEvent(
    {
      history: run.eventHistory,
      modifiers: run.modifiers,
      bossDoorFound: run.bossDoorFound,
      restAreaFound: run.restAreaFound,
      keyRoomSeen: run.keyRoomSeen,
      keyRoomUnlocked: run.keyRoomUnlocked,
      keyRoomPressure: run.keyRoomPressure,
      bossDoorPressure: run.bossDoorPressure,
    },
    rng,
  )

  const type = roll.type
  const def = eventDefinitions[type]
  const spell = def.hasChallenge && dungeonSpells.length > 0 ? pickEventSpell(run, dungeonSpells, rng) : null

  // Treasure asks for the Korean word (attack-style); traps ask for the
  // English meaning under a timer (defense-style).
  const direction = type === 'trap' ? 'kor_to_eng' : 'eng_to_kor'
  const challenge = spell ? generateChallenge(spell, def.challengeContext, direction) : null

  // spawnEnemy is seeded by the event id, so deciding the art here from the
  // same id means the encounter shows the foe the player is about to fight
  // rather than a generic placeholder.
  const eventId = makeId('evt')
  const world = resolveWorld(run.config.worldId)
  const enemySlot = world ? pickSlot(world.enemies, eventId) : null

  const event: DungeonEvent = {
    id: eventId,
    type,
    title: def.title,
    bodyText: def.bodyText,
    image:
      type === 'battle' && enemySlot
        ? { folder: 'enemies', slot: enemySlot }
        : { folder: 'events', slot: def.imageSlot },
    challenge,
    directionChoices: type === 'direction' ? buildDirectionChoices(rng) : null,
  }

  const run2: DungeonRunState = {
    ...run,
    state: transition(run.state, 'ResolvingEvent'),
    turn: run.turn + 1,
    currentEvent: event,
    eventTimer: null,
    standbyNotice: null,
    pendingReward: null,
    eventHistory: [...run.eventHistory, type],
    // Modifiers tick after the roll they influenced, so a 5-move modifier
    // biases exactly five rolls.
    modifiers: tickModifiers(run.modifiers),
    keyRoomSeen: run.keyRoomSeen || type === 'key_room',
    keyRoomPressure: roll.nextKeyRoomPressure,
    bossDoorPressure: roll.nextBossDoorPressure,
    bossDoorFound: run.bossDoorFound || type === 'boss_door',
    restAreaFound: run.restAreaFound || type === 'rest',
    stats: {
      ...run.stats,
      turns: run.turn + 1,
      eventsEncountered: run.stats.eventsEncountered + 1,
    },
  }

  return { run: run2, event }
}

// ---------------------------------------------------------------------------
// Run bookkeeping
// ---------------------------------------------------------------------------

/**
 * Records one completed vocabulary prompt against the run: per-word stats,
 * aggregate accuracy, and the Key Room unlock (which fires as soon as every
 * pool word has been introduced).
 */
export function recordWordAttempt(
  run: DungeonRunState,
  spellId: string,
  kind: AttemptKind,
  correct: boolean,
): DungeonRunState {
  const wordStats = recordAttempt(run.wordStats, spellId, kind, correct)
  const next: DungeonRunState = {
    ...run,
    wordStats,
    stats: {
      ...run.stats,
      correctAnswers: run.stats.correctAnswers + (correct ? 1 : 0),
      incorrectAnswers: run.stats.incorrectAnswers + (correct ? 0 : 1),
      attackCorrect: run.stats.attackCorrect + (kind === 'attack' && correct ? 1 : 0),
      attackTotal: run.stats.attackTotal + (kind === 'attack' ? 1 : 0),
      defenseCorrect: run.stats.defenseCorrect + (kind === 'defense' && correct ? 1 : 0),
      defenseTotal: run.stats.defenseTotal + (kind === 'defense' ? 1 : 0),
    },
  }
  return refreshKeyRoomUnlock(next)
}

/** Marks a word seen without an attempt (the Magic Room's puzzle word). */
export function markWordIntroduced(run: DungeonRunState, spellId: string): DungeonRunState {
  return refreshKeyRoomUnlock({ ...run, wordStats: markIntroduced(run.wordStats, spellId) })
}

function refreshKeyRoomUnlock(run: DungeonRunState): DungeonRunState {
  if (run.keyRoomUnlocked) return run
  if (!allWordsIntroduced(run)) return run
  return { ...run, keyRoomUnlocked: true }
}

export function applyDirectionChoice(run: DungeonRunState, choice: DirectionChoice): DungeonRunState {
  return { ...run, modifiers: addModifierTo(run.modifiers, choice) }
}

export function activeModifiers(run: DungeonRunState): ActiveModifier[] {
  return run.modifiers
}

export function grantKey(run: DungeonRunState): DungeonRunState {
  // Guarded so a re-render or double-tap can never mint a second key.
  if (run.keyFound) return run
  return { ...run, keyFound: true }
}

export function consumeKey(run: DungeonRunState): DungeonRunState {
  return { ...run, keyUsed: true }
}

/** The boss is enterable only once its door is found and the key is in hand. */
export function canEnterBoss(run: DungeonRunState): boolean {
  return run.bossDoorFound && run.keyFound && !run.keyUsed
}

export function recordRestUsed(run: DungeonRunState, spent: number): DungeonRunState {
  return {
    ...run,
    restUses: run.restUses + 1,
    stats: { ...run.stats, restsUsed: run.stats.restsUsed + 1, moneyEarned: run.stats.moneyEarned - spent },
  }
}

// ---------------------------------------------------------------------------
// Rewards + results
// ---------------------------------------------------------------------------

/**
 * Folds a reward bundle into the run's totals and parks it as
 * `pendingReward` for the UI to display. The store is responsible for
 * actually crediting the Totem/inventory — and does so exactly once,
 * at the same moment this is called.
 */
export function applyRewardBundle(run: DungeonRunState, reward: RewardBundle): DungeonRunState {
  return {
    ...run,
    pendingReward: reward,
    stats: {
      ...run.stats,
      moneyEarned: run.stats.moneyEarned + reward.money,
      totemXpEarned: run.stats.totemXpEarned + reward.totemXp,
      itemsCollected: [...run.stats.itemsCollected, ...reward.itemIds],
      treasureCollected: run.stats.treasureCollected + (reward.money > 0 ? 1 : 0),
    },
  }
}

export function addSpellXp(run: DungeonRunState, amount: number): DungeonRunState {
  return { ...run, stats: { ...run.stats, spellXpEarned: run.stats.spellXpEarned + amount } }
}

export function recordEnemyDefeated(run: DungeonRunState, wasMimic: boolean): DungeonRunState {
  return {
    ...run,
    stats: {
      ...run.stats,
      enemiesDefeated: run.stats.enemiesDefeated + 1,
      mimicsDefeated: run.stats.mimicsDefeated + (wasMimic ? 1 : 0),
    },
  }
}

export function recordBossDefeated(run: DungeonRunState): DungeonRunState {
  return { ...run, stats: { ...run.stats, bossDefeated: true } }
}

export function recordLevelUp(
  run: DungeonRunState,
  spellId: string,
  from: number,
  to: number,
): DungeonRunState {
  if (to <= from) return run
  const crossedMastery = from < spellBalance.masteryLevel && to >= spellBalance.masteryLevel
  return {
    ...run,
    stats: {
      ...run.stats,
      spellLevelUps: [...run.stats.spellLevelUps, { spellId, from, to }],
      newlyMasteredWords:
        crossedMastery && !run.stats.newlyMasteredWords.includes(spellId)
          ? [...run.stats.newlyMasteredWords, spellId]
          : run.stats.newlyMasteredWords,
    },
  }
}

export function setOutcomeText(run: DungeonRunState, lines: string[]): DungeonRunState {
  return { ...run, lastOutcomeText: lines }
}

/**
 * Repaints the current event with the art for how it turned out.
 *
 * Every world ships a treasureOpened and a trap2, and nothing was ever
 * pointing at them: a chest you unlocked went on showing the same padlocked
 * box as before you answered, which read as the game not having registered
 * the win. The slot is a plain string so a world that lacks it falls back
 * the way any missing art does, rather than throwing.
 */
export function setEventImage(run: DungeonRunState, slot: string, title?: string): DungeonRunState {
  if (!run.currentEvent) return run
  return {
    ...run,
    currentEvent: {
      ...run.currentEvent,
      image: { folder: 'events', slot },
      // The label names what is on screen, so it follows the art: a chest
      // that has just been unlocked should not still be captioned "locked".
      title: title ?? run.currentEvent.title,
    },
  }
}

export type { DungeonEventType }

// ---------------------------------------------------------------------------
// Timed event prompts (traps)
// ---------------------------------------------------------------------------

/** Starts the countdown for a timed prompt, replacing any previous one. */
export function startEventTimer(run: DungeonRunState, seconds: number): DungeonRunState {
  return { ...run, eventTimer: { totalSeconds: seconds, remainingSeconds: seconds, running: true } }
}

export function tickEventTimer(run: DungeonRunState, deltaSeconds: number): DungeonRunState {
  if (!run.eventTimer || !run.eventTimer.running) return run
  return {
    ...run,
    eventTimer: {
      ...run.eventTimer,
      remainingSeconds: Math.max(0, run.eventTimer.remainingSeconds - deltaSeconds),
    },
  }
}

export function clearEventTimer(run: DungeonRunState): DungeonRunState {
  return { ...run, eventTimer: null }
}
