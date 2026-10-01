import { create } from 'zustand'
import type { Spell } from '@/domain/spell'
import type { DirectionChoice, DungeonConfig, DungeonRunState, RewardBundle } from '@/domain/dungeon'
import { emptyRewardBundle, introducedCount } from '@/domain/dungeon'
import type { BattleState, EnemyCombatant } from '@/domain/battle'
import type { ItemId } from '@/domain/item'
import {
  battleBalance,
  dungeonTiers,
  enemyLevelRange,
  recommendedLevel,
  rewardBalance,
  totemBalance,
  type DungeonTierId,
} from '@/config/balance'
import { attackPower, rollEnemyLevel } from '@/systems/enemyLevel'
import { powerBalance } from '@/config/balance'
import { activeLevelBias } from '@/systems/directionModifiers'
import { mimicBalance, treasureBalance, trapBalance } from '@/config/dungeonEvents'
import { getItemDef, itemBalance } from '@/config/items'
import { getMaterialDef, materialBalance } from '@/config/materials'
import { rollMaterialChance, rollMaterialDrops } from '@/systems/materials'
import { creatureKeyForImage } from '@/systems/creatureTotems'
import { mimicRevealText } from '@/systems/eventContent'
import {
  startDungeon,
  generateNextEvent,
  applyDirectionChoice,
  pickBarrierWords,
  wordsNeededForKey,
  applyRewardBundle,
  canEnterBoss,
  consumeKey,
  grantKey,
  markWordIntroduced,
  recordBossDefeated,
  recordEnemyDefeated,
  recordChargeGain,
  recordRestUsed,
  recordWordAttempt,
  setOutcomeText,
  setEventImage,
  setStandbyNotice,
  setState,
  startEventTimer,
  tickEventTimer as tickEventTimerPure,
  clearEventTimer,
  toStandby,
} from '@/systems/dungeonSession'
import {
  canMove,
  canOpenStandbyMenus,
  canOpenWordInfo,
  isRunOver,
} from '@/systems/dungeonState'
import {
  startBattle,
  spawnEnemy,
  spawnBoss,
  spawnMimic,
  beginPlayerChallenge,
  outmatchedBy,
  resolvePlayerAttack,
  beginEnemyChallenge,
  resolveDefensePrompt,
  tickTimer as engineTickTimer,
  returnToPlayerTurn,
  markDefeat,
  markRewardsGranted,
  selectableSpellIds,
} from '@/systems/battleEngine'
import { isFullyCleared, pickBarrierWord } from '@/systems/bossPlateau'
import { createPuzzle, guess as applyGuess, type HangmanPuzzle } from '@/systems/hangman'
import { applyRest, quoteRest } from '@/systems/restArea'
import { buildRestNpcs, rollNpcGift, markSpoken, findNpc } from '@/systems/restNpcs'
import { resolveWorld } from '@/systems/worldRegistry'
import { buildRunReport, type RunReport } from '@/systems/runResults'
import type { AttemptKind } from '@/systems/wordStats'
import { resolveChallenge } from '@/systems/challengeEngine'
import { applyItemToSpells, applyItemToTotem, countOf, itemUseText, rollItemDrop } from '@/systems/inventory'
import { addTotemExperience, applyDamage, loseLifePoint, recordTierCleared } from '@/systems/totemManager'
import { usePersistentStore } from './persistentStore'

function findSpell(spells: Spell[], id: string): Spell | undefined {
  return spells.find((sp) => sp.id === id)
}

function resolveSpells(ids: string[], allSpells: Spell[]): Spell[] {
  return ids.map((id) => allSpells.find((s) => s.id === id)).filter((s): s is Spell => !!s)
}

/** Words introduced so far — drives the HUD and the Key Room gate. */
export function challengedCount(run: DungeonRunState): number {
  return introducedCount(run)
}

/**
 * How many the run is waiting on before the key can appear.
 *
 * The HUD counts toward this rather than toward the whole word list: with a
 * fixed requirement, a bar filling to "8 of 50" would read as a run barely
 * started when it is in fact about to end.
 */
export function wordsNeededThisRun(run: DungeonRunState): number {
  return wordsNeededForKey(run)
}

/** Which slide-over panel is open on top of the dungeon, if any. */
export type DungeonPanel = 'words' | 'items' | 'status'

/**
 * What just happened in an event, for the things that react to it rather
 * than to state — currently only the soundtrack.
 *
 * A chest opening and a chest breaking leave the run in the same state
 * (`treasure_result`) and differ only in their outcome text, so there was
 * nothing to make a noise about without saying it out loud. The nonce is
 * what lets the same outcome twice in a row fire twice.
 */
export type EventOutcome = 'chest_opened' | 'chest_failed' | 'trap_avoided' | 'trap_sprung'

export interface EventOutcomeSignal {
  kind: EventOutcome
  nonce: number
}

/** Sub-mode within an event that the run state alone doesn't capture. */
export type EventStage =
  | 'intro'
  | 'treasure_choice'
  | 'treasure_result'
  | 'trap_answer'
  | 'trap_result'
  | 'magic_room'
  | 'direction_choice'
  | 'rest'
  | 'boss_door'
  | 'key_room'
  | 'reward'

interface DungeonStore {
  screenPhase: 'config' | 'run' | 'results'
  lastOutcome: EventOutcomeSignal | null
  run: DungeonRunState | null
  battle: BattleState | null
  activePanel: DungeonPanel | null
  report: RunReport | null

  /** Where inside the current event we are. */
  stage: EventStage
  /** Live Magic Room puzzle, non-null only while one is being solved. */
  puzzle: HangmanPuzzle | null
  /** True while the dice animation is playing. */
  rolling: boolean
  /** Re-entrancy guard: blocks a second submit while one is being processed. */
  submitting: boolean
  /** True when the Rest Area was opened from Standby rather than an event. */
  restRevisit: boolean
  /** The last thing a Rest Area NPC said and gave, shown until you leave. */
  npcSaid: { npcId: string; reward: RewardBundle } | null
  /** Boss-door confirmation is showing. Entering is irreversible. */
  confirmingBoss: boolean

  beginDungeon(config: DungeonConfig): void

  // Standby
  move(): void
  finishRoll(): void
  openRestArea(): void
  /** Talk to one of the Rest Area's people. Pays out once each. */
  talkToNpc(npcId: string): void
  leaveRest(): void
  buyRest(): void
  askEnterBossDoor(): void
  cancelEnterBossDoor(): void
  enterBossDoor(): void
  useItem(itemId: ItemId): void
  abandonRun(): void
  /** Walks out mid-run. The run is thrown away rather than finished. */
  giveUpRun(): void

  // Events
  attemptTreasure(): void
  leaveTreasure(): void
  submitEventAnswer(text: string): void
  tickEventTimer(deltaSeconds: number): void
  triggerEventTimeout(): void
  guessSyllable(syllable: string): void
  finishMagicRoom(): void
  chooseDirection(choice: DirectionChoice): void
  takeKey(): void
  acknowledgeEvent(): void

  // Battle
  selectCard(spellId: string): void
  /** The word the barrier demands next, or null when it is down. */
  spinBarrier(): string | null
  submitAttackAnswer(text: string): void
  continueAfterPlayerResolve(): void
  tickBattleTimer(deltaSeconds: number): void
  submitDefenseAnswer(text: string): void
  triggerDefenseTimeout(): void
  continueAfterEnemyResolve(): void
  continueAfterVictory(): void
  continueAfterDefeat(): void

  openPanel(panel: DungeonPanel): void
  closePanel(): void
  toggleWordInfo(): void
  exitToMenu(): void
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function tierFor(run: DungeonRunState) {
  return dungeonTiers.find((t) => t.id === run.config.tierId)!
}

/**
 * What level the next foe of this run rolls.
 *
 * The band comes from the world and tier together, and the bias from
 * whichever path modifiers are still running — so a fork that led somewhere
 * dangerous keeps mattering for the moves it promised and then stops.
 */
function rollLevel(run: DungeonRunState): number {
  return rollEnemyLevel(
    enemyLevelRange(run.config.worldId, run.config.tierId),
    Math.random,
    activeLevelBias(run.modifiers),
  )
}

/** The level a run is pitched at, for anything that has no foe to ask. */
function depthLevel(run: DungeonRunState): number {
  return recommendedLevel(run.config.worldId, run.config.tierId)
}

function totemDeckIds(run: DungeonRunState): string[] {
  return usePersistentStore.getState().spellSets.find((s) => s.id === run.config.totemSpellSetId)?.spellIds ?? []
}

/**
 * Credits a reward bundle to the player. Called exactly once per earned
 * reward, at the moment it is earned — the Results screen only reports.
 */
function creditReward(totemId: string, reward: RewardBundle) {
  const store = usePersistentStore.getState()
  // Money belongs to the player, not to whoever happened to carry it out of
  // the dungeon. XP is the Totem's, because it is the Totem that learned.
  if (reward.money) store.addMoney(reward.money)
  if (reward.totemXp) {
    store.replaceTotem(totemId, (t) => addTotemExperience(t, reward.totemXp).totem)
  }
  for (const itemId of reward.itemIds) store.grantItem(itemId as ItemId)
  for (const materialId of reward.materialIds) store.grantMaterial(materialId)
}

/**
 * Populates a run's Rest Area the first time the player stands in it.
 *
 * Done lazily rather than when the area is discovered so the cast is drawn
 * from the Compendium as it stands on arrival, and so a run that never
 * visits never pays for it. Idempotent: a revisit keeps the same people,
 * including who has already been spoken to.
 */
function withRestNpcs(run: DungeonRunState): DungeonRunState {
  if (run.restNpcs.length > 0) return run
  const spells = usePersistentStore.getState().spells
  const world = resolveWorld(run.config.worldId)
  return { ...run, restNpcs: buildRestNpcs(spells, world?.npcs ?? [], Math.random) }
}

/**
 * Notes that this foe has been met, which is what puts it in the
 * blacksmith's window as a design he could strike.
 *
 * Called at the moment a fight starts rather than when one is won: meeting
 * a thing is seeing it, and a creature that beat you is exactly the one you
 * would want to come back wearing. A Mimic records nothing — it fights
 * dressed as a chest, and `events/treasureMimic` is a prop.
 */
function noteCreatureSeen(worldId: string, enemy: EnemyCombatant) {
  const key = creatureKeyForImage(worldId, enemy.image)
  if (key) usePersistentStore.getState().recordCreatureSeen(key)
}

/**
 * Rolls a material drop for the tier being played and folds it in.
 *
 * Tier rather than world, because the tier is what the drop tables are cut
 * by: a shallow run pays in river stones wherever it is walked, and the
 * deep runs are where the things recipes ask for live.
 */
function addMaterialDrop(reward: RewardBundle, tierId: DungeonTierId, chance: number): RewardBundle {
  const dropped = rollMaterialChance(tierId, chance)
  if (!dropped) return reward
  const def = getMaterialDef(dropped)
  return {
    ...reward,
    materialIds: [...reward.materialIds, dropped],
    lines: [...reward.lines, `${def.icon} ${def.name}`],
  }
}

/** Several independent material rolls — what a boss leaves behind. */
function addMaterialDrops(reward: RewardBundle, tierId: DungeonTierId, count: number): RewardBundle {
  let next = reward
  for (const id of rollMaterialDrops(tierId, count)) {
    const def = getMaterialDef(id)
    next = {
      ...next,
      materialIds: [...next.materialIds, id],
      lines: [...next.lines, `${def.icon} ${def.name}`],
    }
  }
  return next
}

/** Rolls an item drop and folds it into a bundle, with its display line. */
function addItemDrop(reward: RewardBundle, chance: number): RewardBundle {
  if (Math.random() >= chance) return reward
  const dropped = rollItemDrop()
  if (!dropped) return reward
  const def = getItemDef(dropped)
  return {
    ...reward,
    itemIds: [...reward.itemIds, dropped],
    lines: [...reward.lines, `${def.icon} ${def.name}`],
  }
}

/**
 * The Totem's combat numbers, looked up at the moment they are needed.
 *
 * The battle engine is pure and takes them as plain numbers; reading them
 * here rather than snapshotting them at the start of the fight means a Totem
 * that levels up mid-dungeon hits harder for the rest of it.
 */
function levelOf(totemId: string): number {
  return usePersistentStore.getState().totems.find((t) => t.id === totemId)?.level ?? 1
}

/**
 * What one word is worth against the foe in front of you: the Totem's own
 * power, cut by how much of the word its level lets it deliver here.
 */
function mightAgainst(totemId: string, enemyLevel: number): number {
  return attackPower(levelOf(totemId), enemyLevel)
}

function mitigationOf(totemId: string): number {
  const totem = usePersistentStore.getState().totems.find((t) => t.id === totemId)
  return totem ? totemBalance.mitigation(totem.level) : 0
}

/** Applies damage to the Totem, reporting whether it fell. */
function damageTotem(totemId: string, amount: number): boolean {
  let defeated = false
  usePersistentStore.getState().replaceTotem(totemId, (t) => {
    const next = applyDamage(t, amount)
    if (next.currentHp <= 0) defeated = true
    return next
  })
  return defeated
}

export const useDungeonStore = create<DungeonStore>()((set, get) => ({
  screenPhase: 'config',
  lastOutcome: null,
  run: null,
  battle: null,
  activePanel: null,
  report: null,
  stage: 'intro',
  puzzle: null,
  rolling: false,
  submitting: false,
  restRevisit: false,
  npcSaid: null,
  confirmingBoss: false,

  beginDungeon(config) {
    set({
      run: startDungeon(config),
      battle: null,
      screenPhase: 'run',
      report: null,
      activePanel: null,
      stage: 'intro',
      puzzle: null,
      rolling: false,
      submitting: false,
      restRevisit: false,
      confirmingBoss: false,
    })
  },

  // -------------------------------------------------------------------------
  // Standby
  // -------------------------------------------------------------------------

  move() {
    const { run, battle, rolling } = get()
    // Movement is Standby-only and single-shot: this is what stops a Move
    // landing mid-event, mid-roll or mid-battle.
    if (!run || battle || rolling || !canMove(run.state)) return
    set({ rolling: true, run: setState(run, 'Rolling'), activePanel: null })
  },

  finishRoll() {
    const { run, rolling } = get()
    if (!run || !rolling) return
    const spells = resolveSpells(run.config.dungeonWordIds, usePersistentStore.getState().spells)
    const { run: rolled } = generateNextEvent(run, spells)

    // A Magic Room needs its puzzle built up front, and its target word
    // counts as introduced however the puzzle ends.
    if (rolled.currentEvent!.type === 'magic_room' && spells.length > 0) {
      const target = spells[Math.floor(Math.random() * spells.length)]
      const puzzle = createPuzzle(
        target.korean,
        spells.filter((s) => s.id !== target.id).map((s) => s.korean),
      )
      set({ run: markWordIntroduced(rolled, target.id), rolling: false, stage: 'intro', puzzle })
      return
    }

    set({ run: rolled, rolling: false, stage: 'intro', puzzle: null })
  },

  openRestArea() {
    const { run, battle } = get()
    if (!run || battle || !run.restAreaFound || !canMove(run.state)) return
    set({
      run: withRestNpcs(setState(run, 'Rest')),
      stage: 'rest',
      restRevisit: true,
      activePanel: null,
      npcSaid: null,
    })
  },

  talkToNpc(npcId) {
    const { run, submitting } = get()
    if (!run || submitting || run.state !== 'Rest') return
    const npc = findNpc(run.restNpcs, npcId)
    // Once each: talking is free, so a repeatable gift would be a money
    // printer rather than a reward.
    if (!npc || npc.spoken) return

    const store = usePersistentStore.getState()
    const totem = store.totems.find((t) => t.id === run.config.totemId)
    if (!totem) return

    const gift = rollNpcGift(Math.random)
    let reward: RewardBundle = {
      ...emptyRewardBundle(),
      money: gift.money,
      totemXp: gift.totemXp,
      lines: gift.money > 0 ? [`💰 ${gift.money}`] : [],
    }
    if (gift.item) reward = addItemDrop(reward, 1)

    creditReward(totem.id, reward)
    set({
      run: { ...run, restNpcs: markSpoken(run.restNpcs, npcId) },
      npcSaid: { npcId, reward },
    })
  },

  leaveRest() {
    const { run } = get()
    if (!run) return
    set({ run: toStandby(run), stage: 'intro', restRevisit: false, npcSaid: null })
  },

  buyRest() {
    const { run, submitting } = get()
    if (!run || submitting || run.state !== 'Rest') return
    const store = usePersistentStore.getState()
    const totem = store.totems.find((t) => t.id === run.config.totemId)
    if (!totem) return
    const result = applyRest(totem, store.money, run.restUses)
    // applyRest returns null when unaffordable or already at full HP, so a
    // double-tap can never double-charge.
    if (!result) return

    set({ submitting: true })
    store.replaceTotem(totem.id, () => result.totem)
    store.spendMoney(result.spent)
    set({
      run: recordRestUsed(run, result.spent),
      submitting: false,
    })
  },

  askEnterBossDoor() {
    const { run, battle } = get()
    if (!run || battle || !canMove(run.state) || !canEnterBoss(run)) return
    set({ confirmingBoss: true })
  },

  cancelEnterBossDoor() {
    set({ confirmingBoss: false })
  },

  enterBossDoor() {
    const { run, battle } = get()
    if (!run || battle || !canMove(run.state)) return
    // Hard gate: the door must be found, the key held, and unused.
    if (!canEnterBoss(run)) return

    const tier = tierFor(run)
    const world = resolveWorld(run.config.worldId)!
    // A boss does not roll — it stands at the bottom of its band, so the
    // deepest thing in a dungeon is always its guardian.
    // Seeded by where you are rather than by when you arrived. A world's
    // guardian is a fixture of the place, not a roll — and the setup screen
    // shows you which one is down there before you commit, which it can only
    // do honestly if the run agrees.
    const boss = spawnBoss(
      world,
      `boss-${run.config.worldId}-${tier.id}`,
      enemyLevelRange(run.config.worldId, tier.id)[1],
      tier.id,
    )
    // The barrier is a fixed number of words now, not one per word in the
    // pool — so a fifty-word run no longer needs fifty correct answers
    // before its boss can be touched. Drawn from the words this run actually
    // taught.
    noteCreatureSeen(run.config.worldId, boss)
    const bossBattle = startBattle(boss, totemDeckIds(run), pickBarrierWords(run))
    const run2 = consumeKey(setState(run, 'BossBattle'))
    set({ run: { ...run2, currentEvent: null, standbyNotice: null }, battle: bossBattle, stage: 'intro', activePanel: null, confirmingBoss: false })
  },

  useItem(itemId) {
    const { run } = get()
    if (!run || !canOpenStandbyMenus(run.state)) return
    const store = usePersistentStore.getState()
    if (countOf(store.inventory, itemId) <= 0) return

    const def = getItemDef(itemId)

    // An Escape Rope is how the player leaves a dungeon: it ends the run
    // as a voluntary retreat, which costs no Life Point.
    if (def.effect.kind === 'escape') {
      store.consumeItem(itemId)
      set({ activePanel: null })
      finishRun(set, get, { abandoned: true, totemDefeated: false })
      return
    }

    store.replaceTotem(run.config.totemId, (t) => applyItemToTotem(t, def))
    if (def.effect.kind === 'charge') {
      store.replaceSpells((spells) => applyItemToSpells(spells, totemDeckIds(run), def))
    }
    store.consumeItem(itemId)
    set({ run: setStandbyNotice(run, itemUseText(def)), activePanel: null })
  },

  abandonRun() {
    const { run } = get()
    if (!run || isRunOver(run.state)) return
    finishRun(set, get, { abandoned: true, totemDefeated: false })
  },

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  attemptTreasure() {
    const { run } = get()
    if (!run || run.state !== 'ResolvingEvent' || run.currentEvent?.type !== 'treasure') return
    set({ run: setState(run, 'VocabularyInput'), stage: 'treasure_choice' })
  },

  leaveTreasure() {
    const { run } = get()
    if (!run || run.state !== 'ResolvingEvent') return
    set({ run: toStandby(setOutcomeText(run, ['상자를 건드리지 않고 지나갑니다.']), '상자를 하나 두고 왔습니다.'), stage: 'intro' })
  },

  submitEventAnswer(text) {
    submitEvent(set, get, text, false)
  },

  tickEventTimer(deltaSeconds) {
    const { run } = get()
    if (!run || !run.eventTimer || !run.eventTimer.running) return
    const next = tickEventTimerPure(run, deltaSeconds)
    set({ run: next })
    if (next.eventTimer && next.eventTimer.remainingSeconds <= 0) get().triggerEventTimeout()
  },

  triggerEventTimeout() {
    submitEvent(set, get, '', true)
  },

  guessSyllable(syllable) {
    const { puzzle, run } = get()
    if (!puzzle || !run || puzzle.status !== 'playing') return
    // A repeated guess is a no-op inside applyGuess — it costs no attempt.
    set({ puzzle: applyGuess(puzzle, syllable) })
  },

  finishMagicRoom() {
    const { puzzle, run, submitting } = get()
    if (!puzzle || !run || submitting || puzzle.status === 'playing') return
    set({ submitting: true })

    if (puzzle.status !== 'solved') {
      set({
        run: toStandby(run, '마법의 문이 영원히 봉인되었습니다.'),
        stage: 'intro',
        puzzle: null,
        submitting: false,
      })
      return
    }

    let reward: RewardBundle = {
      money: treasureBalance.magicRoomMoney,
      // Paid at the depth it was solved at, so a puzzle in a deep world is
      // worth what its surroundings are worth.
      totemXp: Math.round(treasureBalance.magicRoomTotemXp * powerBalance.scale(depthLevel(run))),
      itemIds: [],
      materialIds: [],
      lines: [`💰 ${treasureBalance.magicRoomMoney}`, `✨ 토템 경험치 ${treasureBalance.magicRoomTotemXp}`],
    }
    reward = addItemDrop(reward, treasureBalance.magicRoomItemChance)
    reward = addMaterialDrop(reward, run.config.tierId, materialBalance.magicRoomDropChance)
    creditReward(run.config.totemId, reward)

    set({
      run: setOutcomeText(applyRewardBundle(run, reward), ['문양이 풀립니다. 방이 열립니다.']),
      stage: 'reward',
      puzzle: null,
      submitting: false,
    })
  },

  chooseDirection(choice) {
    const { run, submitting } = get()
    if (!run || submitting || run.state !== 'ResolvingEvent') return
    if (run.currentEvent?.type !== 'direction') return
    // Only one path may ever be taken; the run leaves ResolvingEvent
    // immediately so a second tap finds nothing to act on.
    set({ submitting: true })
    const run2 = applyDirectionChoice(run, choice)
    set({
      run: toStandby(run2, `${choice.label}(으)로 향합니다.`),
      stage: 'intro',
      submitting: false,
    })
  },

  takeKey() {
    const { run, submitting } = get()
    if (!run || submitting || run.state !== 'ResolvingEvent') return
    if (run.currentEvent?.type !== 'key_room') return
    set({ submitting: true })
    // grantKey is idempotent — a run can never mint two keys.
    set({
      run: toStandby(grantKey(run), '🗝️ 던전 열쇠를 손에 넣었습니다.'),
      stage: 'intro',
      submitting: false,
    })
  },

  acknowledgeEvent() {
    const { run, stage } = get()
    if (!run) return
    const event = run.currentEvent

    // Stages that mean "this event is finished" always return to Standby.
    // Without this an event whose battle or answer already resolved (a
    // mimic chest, say) would be offered a second time — and pay out a
    // second time with it.
    if (stage === 'reward' || stage === 'treasure_result' || stage === 'trap_result') {
      set({ run: toStandby(run), stage: 'intro' })
      return
    }

    if (run.state === 'ResolvingEvent' && event?.type === 'battle') {
      const enemy = spawnEnemy(resolveWorld(run.config.worldId)!, event.id, rollLevel(run))
      noteCreatureSeen(run.config.worldId, enemy)
      set({
        run: setState(run, 'Battle'),
        battle: startBattle(enemy, totemDeckIds(run), null),
        stage: 'intro',
      })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'rest') {
      // Arriving by event populates the cast exactly as revisiting does —
      // otherwise the first visit of a run would have nobody in it.
      set({ run: withRestNpcs(setState(run, 'Rest')), stage: 'rest', restRevisit: false, npcSaid: null })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'magic_room') {
      set({ stage: 'magic_room' })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'direction') {
      set({ stage: 'direction_choice' })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'boss_door') {
      set({ run: toStandby(run, '🚪 지도에 보스의 문을 표시했습니다.'), stage: 'intro' })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'key_room') {
      set({ stage: 'key_room' })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'treasure') {
      set({ stage: 'treasure_choice' })
      return
    }
    if (run.state === 'ResolvingEvent' && event?.type === 'trap') {
      // Traps are timed: the countdown starts the moment the prompt does.
      set({ run: startEventTimer(setState(run, 'VocabularyInput'), trapBalance.timerSeconds), stage: 'trap_answer' })
      return
    }
    set({ run: toStandby(run), stage: 'intro' })
  },

  // -------------------------------------------------------------------------
  // Battle
  // -------------------------------------------------------------------------

  spinBarrier() {
    const { battle } = get()
    if (!battle || battle.phase !== 'player_select' || !battle.plateau) return null
    return pickBarrierWord(battle.plateau)
  },

  selectCard(spellId) {
    const { battle } = get()
    if (!battle || battle.phase !== 'player_select') return
    const spell = findSpell(usePersistentStore.getState().spells, spellId)
    if (!spell) return
    set({ battle: beginPlayerChallenge(battle, spell) })
  },

  submitAttackAnswer(text) {
    const { battle, run, submitting } = get()
    if (!battle || !run || submitting) return
    if (battle.phase !== 'player_challenge' || !battle.activeChallenge) return
    const spellId = battle.activeChallenge.spellId
    const spell = findSpell(usePersistentStore.getState().spells, spellId)
    if (!spell) return

    set({ submitting: true })
    const outcome = resolvePlayerAttack(
      battle,
      spell,
      text,
      mightAgainst(run.config.totemId, battle.enemy.level),
    )

    const finalSpell = outcome.resolution.spell
    usePersistentStore
      .getState()
      .replaceSpells((spells) => spells.map((s) => (s.id === finalSpell.id ? finalSpell : s)))

    let run2 = recordWordAttempt(run, spellId, 'attack', outcome.resolution.correct)
    run2 = recordChargeGain(run2, spellId, outcome.resolution.chargeFrom, outcome.resolution.chargeTo)

    set({ battle: outcome.state, run: run2, submitting: false })
  },

  continueAfterPlayerResolve() {
    const { battle, run } = get()
    if (!battle || !run) return
    if (battle.phase === 'victory') {
      get().continueAfterVictory()
      return
    }
    const dungeonSpells = resolveSpells(run.config.dungeonWordIds, usePersistentStore.getState().spells)
    const timerSeconds = usePersistentStore.getState().settings.enemyTimerSeconds
    // The run's word record goes in too, so an enemy's volley draws by the
    // same weighting the dungeon's own events use — otherwise a fight would
    // be the one place that keeps handing back words already known.
    set({
      battle: beginEnemyChallenge(
        battle,
        dungeonSpells,
        timerSeconds,
        Math.random,
        run.wordStats,
        outmatchedBy(levelOf(run.config.totemId), battle.enemy.level),
      ),
    })
  },

  tickBattleTimer(deltaSeconds) {
    const { battle } = get()
    if (!battle || !battle.timer || !battle.timer.running) return
    const next = engineTickTimer(battle, deltaSeconds)
    set({ battle: next })
    if (next.timer && next.timer.remainingSeconds <= 0) get().triggerDefenseTimeout()
  },

  submitDefenseAnswer(text) {
    resolveDefense(set, get, text, false)
  },

  triggerDefenseTimeout() {
    resolveDefense(set, get, '', true)
  },

  continueAfterEnemyResolve() {
    const { battle } = get()
    if (!battle) return
    if (battle.phase === 'defeat') {
      get().continueAfterDefeat()
      return
    }
    set({ battle: returnToPlayerTurn(battle) })
  },

  continueAfterVictory() {
    const { battle, run } = get()
    if (!battle || !run) return
    // Single-shot: rewards are paid once, however many times this is called.
    if (battle.rewardsGranted) return
    const totemId = run.config.totemId
    const wasMimic = battle.enemy.kind === 'mimic'

    if (battle.isBoss) {
      const bossXp = totemBalance.xpForBoss(battle.enemy.level)
      let reward: RewardBundle = {
        money: rewardBalance.bossMoneyReward,
        totemXp: bossXp,
        itemIds: [],
        materialIds: [],
        lines: [`💰 ${rewardBalance.bossMoneyReward}`, `✨ 토템 경험치 ${bossXp}`],
      }
      for (let i = 0; i < itemBalance.bossDropCount; i++) reward = addItemDrop(reward, 1)
      reward = addMaterialDrops(reward, run.config.tierId, materialBalance.bossDropCount)
      creditReward(totemId, reward)
      // Beating the boss is what opens the next tier, and this is the one
      // place a boss is recorded as beaten, so it is the one place the clear
      // can be written from.
      usePersistentStore.getState().replaceTotem(totemId, (t) =>
        recordTierCleared(
          {
            ...t,
            stats: {
              ...t.stats,
              bossesDefeated: t.stats.bossesDefeated + 1,
              dungeonsCompleted: t.stats.dungeonsCompleted + 1,
            },
          },
          run.config.tierId,
        ),
      )

      const run2 = applyRewardBundle(recordBossDefeated(run), reward)
      set({ battle: markRewardsGranted(battle), run: run2 })
      finishRun(set, get, { abandoned: false, totemDefeated: false })
      return
    }

    // Paid by the level of the thing you beat, so going deeper is worth the
    // risk without anything else having to say so.
    const xp = Math.round(
      totemBalance.xpForEnemy(battle.enemy.level) * (wasMimic ? mimicBalance.xpMultiplier : 1),
    )
    const money = Math.round(battleBalance.enemyMoneyReward * (wasMimic ? mimicBalance.moneyMultiplier : 1))
    let reward: RewardBundle = {
      money,
      totemXp: xp,
      itemIds: [],
      materialIds: [],
      lines: [`💰 ${money}`, `✨ 토템 경험치 ${xp}`],
    }
    reward = addItemDrop(reward, battleBalance.enemyItemDropChance)
    reward = addMaterialDrop(
      reward,
      run.config.tierId,
      wasMimic ? materialBalance.mimicDropChance : materialBalance.enemyDropChance,
    )
    if (wasMimic && Math.random() < mimicBalance.exclusiveDropChance) {
      reward = {
        ...reward,
        money: reward.money + mimicBalance.exclusiveDropMoney,
        lines: [...reward.lines, `🎁 미믹의 보물: 💰 ${mimicBalance.exclusiveDropMoney}`],
      }
    }
    creditReward(totemId, reward)

    // Clearing `battle` is what hands the screen back to ExploreView so the
    // reward panel can show; leaving it set would strand the player in a
    // finished BattleView with nothing left to press.
    const run2 = applyRewardBundle(recordEnemyDefeated(run, wasMimic), reward)
    set({
      battle: null,
      run: setState(setOutcomeText(run2, [`${battle.enemy.name} falls.`]), 'ResolvingEvent'),
      stage: 'reward',
    })
  },

  continueAfterDefeat() {
    const { run } = get()
    if (!run) return
    finishRun(set, get, { abandoned: false, totemDefeated: true })
  },

  openPanel(panel) {
    const { run } = get()
    if (!run) return
    if (panel === 'words' ? !canOpenWordInfo(run.state) : !canOpenStandbyMenus(run.state)) return
    set({ activePanel: panel })
  },
  closePanel() {
    set({ activePanel: null })
  },
  toggleWordInfo() {
    const { run, activePanel, battle } = get()
    if (!run) return
    if (activePanel === 'words') {
      set({ activePanel: null })
      return
    }
    if (!canOpenWordInfo(run.state)) return
    // The Words panel lists every word with its meaning, so it stays shut
    // while a battle prompt is on screen — timed or not, it would just be
    // the answer.
    if (battle && (battle.phase === 'player_challenge' || battle.phase === 'enemy_challenge')) return
    set({ activePanel: 'words' })
  },

  /**
   * Quitting outright.
   *
   * Not the same as an Escape Rope, which *ends* the run — that one still
   * counts, pays out and writes a report. This throws the run away: no
   * results screen, nothing added to the record, no Life Point taken. What
   * the Totem banked as it went (experience, coin, wounds) is already its
   * own and stays; there is no run left to credit it from.
   */
  giveUpRun() {
    if (!get().run) return
    set({
      screenPhase: 'config',
      run: null,
      battle: null,
      report: null,
      activePanel: null,
      stage: 'intro',
      puzzle: null,
      rolling: false,
      submitting: false,
      restRevisit: false,
      confirmingBoss: false,
      lastOutcome: null,
    })
  },

  exitToMenu() {
    set({
      screenPhase: 'config',
      run: null,
      battle: null,
      report: null,
      activePanel: null,
      stage: 'intro',
      puzzle: null,
      rolling: false,
      submitting: false,
      restRevisit: false,
      confirmingBoss: false,
    })
  },
}))

// ---------------------------------------------------------------------------
// Internal resolution helpers
// ---------------------------------------------------------------------------

type SetFn = (partial: Partial<DungeonStore>) => void
type GetFn = () => DungeonStore

/**
 * Resolves an event vocabulary prompt — a treasure lock or a trap.
 *
 * Both the player's submission and the trap timer's auto-fail come through
 * here, and the `submitting` guard means a submit landing at the same
 * instant as the timeout can only be counted once.
 */
function submitEvent(set: SetFn, get: GetFn, text: string, timedOut: boolean) {
  const { run, submitting } = get()
  if (!run || submitting || run.state !== 'VocabularyInput') return
  const event = run.currentEvent
  if (!event?.challenge) return
  const spell = findSpell(usePersistentStore.getState().spells, event.challenge.spellId)
  if (!spell) return

  set({ submitting: true })

  const kind: AttemptKind = event.type === 'trap' ? 'defense' : 'attack'
  // A timeout is graded as an answer that can never match, so it goes
  // through the same stat bookkeeping as a wrong answer.
  const submitted = timedOut ? `__timeout__${event.id}` : text
  const resolution = resolveChallenge(spell, event.challenge, submitted, kind)
  usePersistentStore
    .getState()
    .replaceSpells((spells) => spells.map((sp) => (sp.id === resolution.spell.id ? resolution.spell : sp)))

  let run2 = recordWordAttempt(clearEventTimer(run), spell.id, kind, resolution.correct)
  run2 = recordChargeGain(run2, spell.id, resolution.chargeFrom, resolution.chargeTo)

  if (event.type === 'trap') {
    resolveTrap(set, get, run2, resolution.correct, timedOut)
    return
  }
  resolveTreasure(set, run2, resolution.correct)
}

function resolveTrap(set: SetFn, get: GetFn, run: DungeonRunState, correct: boolean, timedOut = false) {
  const tier = tierFor(run)
  if (correct) {
    set({
      run: setOutcomeText(run, ['숨을 멈추고 — 조심스레 비켜섭니다. 함정은 끝내 작동하지 않았습니다.']),
      stage: 'trap_result',
      submitting: false,
      lastOutcome: signal('trap_avoided'),
    })
    return
  }

  // Scaled to the depth, like everything else that hurts. A trap was
  // balanced against a 40 HP Totem; left flat it would take 9 points off a
  // level-300 Totem carrying 434 of them, which is not a trap, it is
  // scenery.
  const damage = Math.round(
    trapBalance.baseDamage * tier.hazardDamageMultiplier * powerBalance.scale(depthLevel(run)),
  )
  const defeated = damageTotem(run.config.totemId, damage)
  const totem = usePersistentStore.getState().totems.find((t) => t.id === run.config.totemId)
  set({
    run: setOutcomeText(setEventImage(run, 'trap2', '함정 작동!'), [
      timedOut ? '너무 늦었습니다 — 장치가 작동합니다!' : '틀렸습니다! 장치가 작동합니다!',
      `${damage}의 피해를 입었습니다.`,
      `HP: ${Math.max(0, totem?.currentHp ?? 0)}/${totem?.maxHp ?? 0}`,
    ]),
    stage: 'trap_result',
    submitting: false,
    lastOutcome: signal('trap_sprung'),
  })
  if (defeated) finishRun(set, get, { abandoned: false, totemDefeated: true })
}

/** A fresh signal, so the same outcome twice running is heard twice. */
let outcomeNonce = 0
function signal(kind: EventOutcome): EventOutcomeSignal {
  return { kind, nonce: ++outcomeNonce }
}

function resolveTreasure(set: SetFn, run: DungeonRunState, correct: boolean) {
  if (!correct) {
    set({
      run: setOutcomeText(run, ['자물쇠가 딱 하고 부러집니다.', '이 상자는 이제 영영 열리지 않습니다.']),
      stage: 'treasure_result',
      submitting: false,
      lastOutcome: signal('chest_failed'),
    })
    return
  }

  // A correctly opened chest may turn out to be a Mimic.
  if (Math.random() < treasureBalance.mimicChance) {
    const mimic = spawnMimic(resolveWorld(run.config.worldId)!, run.currentEvent!.id, rollLevel(run))
    set({
      run: setOutcomeText(setEventImage(setState(run, 'Battle'), 'treasureMimic', '미믹!'), mimicRevealText),
      battle: startBattle(mimic, totemDeckIds(run), null),
      stage: 'intro',
      submitting: false,
    })
    return
  }

  let reward: RewardBundle = {
    ...emptyRewardBundle(),
    money: treasureBalance.baseMoney,
    lines: [`💰 ${treasureBalance.baseMoney}`],
  }
  reward = addItemDrop(reward, treasureBalance.itemDropChance)
  reward = addMaterialDrop(reward, run.config.tierId, materialBalance.treasureDropChance)
  creditReward(run.config.totemId, reward)

  set({
    run: setOutcomeText(setEventImage(applyRewardBundle(run, reward), 'treasureOpened', '열린 보물'), [
      '자물쇠가 풀립니다. 뚜껑이 열립니다.',
    ]),
    stage: 'treasure_result',
    submitting: false,
    lastOutcome: signal('chest_opened'),
  })
}

function resolveDefense(set: SetFn, get: GetFn, text: string, timedOut: boolean) {
  const { battle, run, submitting } = get()
  if (!battle || !run || submitting) return
  if (battle.phase !== 'enemy_challenge' || !battle.activeChallenge || !battle.defense) return

  const spellId = battle.activeChallenge.spellId
  const spell = findSpell(usePersistentStore.getState().spells, spellId)
  if (!spell) return

  set({ submitting: true })
  const timerSeconds = usePersistentStore.getState().settings.enemyTimerSeconds
  const outcome = resolveDefensePrompt(
    battle,
    spell,
    text,
    timedOut,
    timerSeconds,
    mitigationOf(run.config.totemId),
    mightAgainst(run.config.totemId, battle.enemy.level),
  )

  const finalSpell = outcome.resolution.spell
  usePersistentStore
    .getState()
    .replaceSpells((spells) => spells.map((s) => (s.id === finalSpell.id ? finalSpell : s)))

  let run2 = recordWordAttempt(run, spellId, 'defense', outcome.resolution.correct)
  run2 = recordChargeGain(run2, spellId, outcome.resolution.chargeFrom, outcome.resolution.chargeTo)

  let battleAfter = outcome.state
  let defeated = false
  if (outcome.sequenceComplete && outcome.damageToTotem > 0) {
    defeated = damageTotem(run.config.totemId, outcome.damageToTotem)
    if (defeated) battleAfter = markDefeat(battleAfter)
  }

  set({ battle: battleAfter, run: run2, submitting: false })
}

/**
 * Ends the run exactly once and builds the report.
 *
 * A defeat costs exactly one Life Point here and nowhere else, so no
 * combination of trap damage, enemy damage and re-renders can take two.
 */
function finishRun(
  set: SetFn,
  get: GetFn,
  { abandoned, totemDefeated }: { abandoned: boolean; totemDefeated: boolean },
) {
  const { run } = get()
  if (!run || isRunOver(run.state)) return

  const store = usePersistentStore.getState()
  const before = store.totems.find((t) => t.id === run.config.totemId)
  const levelBefore = before?.level ?? 1

  let lifePointLost = false
  let totemDestroyed = false
  if (totemDefeated) {
    store.replaceTotem(run.config.totemId, (t) => {
      const result = loseLifePoint(t)
      lifePointLost = result.lifePointLost
      totemDestroyed = result.becameDestroyed || t.destroyed
      return result.totem
    })
  }

  const after = usePersistentStore.getState().totems.find((t) => t.id === run.config.totemId)
  const run2: DungeonRunState = {
    ...run,
    state: 'Results',
    stats: {
      ...run.stats,
      abandoned,
      totemDefeated,
      lifePointsRemaining: after?.lifePoints ?? 0,
      lifePointLost,
      totemDestroyed,
    },
  }

  const report = buildRunReport({
    run: run2,
    spells: usePersistentStore.getState().spells,
    totemHp: after?.currentHp ?? 0,
    totemMaxHp: after?.maxHp ?? 0,
    totemLevelBefore: levelBefore,
    totemLevelAfter: after?.level ?? levelBefore,
  })

  set({ run: run2, battle: null, report, screenPhase: 'results', activePanel: null, puzzle: null, rolling: false })
}

export { selectableSpellIds, isFullyCleared, quoteRest }
