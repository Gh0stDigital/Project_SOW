/**
 * Dungeon event catalog + generation balance.
 *
 * Every probability, weight and modifier that shapes what the player runs
 * into lives here. Event screens read the *resolved* event object and never
 * roll dice or consult a weight themselves — rebalancing the dungeon should
 * only ever mean editing this file.
 */

export type DungeonEventType =
  | 'treasure'
  | 'trap'
  | 'magic_room'
  | 'rest'
  | 'battle'
  | 'direction'
  | 'boss_door'
  | 'key_room'

/**
 * Base selection weights, relative to each other (they do not need to sum
 * to anything in particular).
 *
 * Rarity intent:
 *   treasure / trap / battle  common
 *   rest                      occasional
 *   direction                 uncommon
 *   magic_room                slightly rare
 *   boss_door                 rare, but reachable from turn 1
 *   key_room                  weight 0 — never rolled normally; it is
 *                             force-selected once unlocked (see keyRoomBalance)
 */
export const baseEventWeights: Record<DungeonEventType, number> = {
  treasure: 22,
  trap: 20,
  battle: 24,
  rest: 10,
  direction: 8,
  magic_room: 6,
  boss_door: 4,
  key_room: 0,
}

/** Never allow the same event type more than this many times in a row. */
export const maxRepeatEventStreak = 2

/**
 * Events that must only ever occur once per run. Once generated (or already
 * discovered) they are excluded from every later roll, which is what keeps
 * a run from producing two keys or re-finding a door it already knows.
 */
export const onceOnlyEvents: DungeonEventType[] = ['boss_door', 'key_room']

/** What each event type is called on screen. */
export const eventTypeLabels: Record<DungeonEventType, string> = {
  treasure: '보물',
  trap: '함정',
  magic_room: '마법실',
  rest: '휴식',
  battle: '전투',
  direction: '갈림길',
  boss_door: '보스의 문',
  key_room: '열쇠의 방',
}

// ---------------------------------------------------------------------------
// Direction modifiers
// ---------------------------------------------------------------------------

/**
 * A Direction event hands the player a temporary bias on future event
 * rolls. `weightDelta` is added to the affected type's base weight (the
 * result is floored at 0 — a weight can never go negative).
 */
export interface DirectionEffect {
  /** Stable id, used to decide which existing modifier a new one replaces. */
  id: string
  label: string
  /** Thematic hint shown to the player instead of raw numbers. */
  flavor: string
  /** Event types this path biases, and by how much. */
  weightDeltas: Partial<Record<DungeonEventType, number>>
  /**
   * Which end of the tier's level band its foes come from while this path's
   * effect lasts: -1 the shallow end, +1 the deep end. This is the player's
   * hand on the one thing a dungeon otherwise decides for them — how strong
   * the next few things they meet are going to be.
   */
  enemyLevelBias?: number
  /** How many Move events the effect lasts for. */
  durationMoves: number
}

export const directionBalance = {
  /** Strength of a "more of this" nudge, added to the base weight. */
  boost: 18,
  /** Strength of a "less of this" nudge, subtracted from the base weight. */
  reduction: 16,
  standardDuration: 5,
  shortDuration: 3,
  /**
   * Stacking rule (documented because the game had no prior rule):
   * modifiers affecting *different* event types coexist; a new modifier
   * that touches an event type an active modifier already touches replaces
   * that older modifier. Weights are clamped at 0 either way.
   */
  replaceOnOverlappingType: true,
}

/**
 * Paths that change how strong the next few foes are rather than what kind
 * of room turns up. Offered alongside the others, so a fork is sometimes a
 * question about danger and sometimes a question about what you are looking
 * for.
 */
export const levelDirections: DirectionEffect[] = [
  {
    id: 'dir_descent',
    label: '내려가는 길',
    flavor: '계단이 어둠 속으로 이어집니다. 아래쪽 공기가 무겁습니다.',
    // Deeper means stronger, and stronger means worth more — the risk pays
    // for itself through the XP a higher-level kill is worth.
    weightDeltas: { battle: Math.round(directionBalance.boost * 0.5) },
    enemyLevelBias: 1,
    durationMoves: directionBalance.standardDuration,
  },
  {
    id: 'dir_shallows',
    label: '얕은 길',
    flavor: '빛이 스며들고, 발밑의 돌이 닳아 있습니다. 누군가 자주 지나다닌 길입니다.',
    enemyLevelBias: -1,
    weightDeltas: {},
    durationMoves: directionBalance.standardDuration,
  },
]

export const twoWayDirections: DirectionEffect[] = [
  {
    id: 'dir_gilded',
    label: '황금빛 통로',
    flavor: '이쪽에서 희미한 동전 빛이 새어 나옵니다.',
    weightDeltas: { treasure: directionBalance.boost },
    durationMoves: directionBalance.standardDuration,
  },
  {
    id: 'dir_snares',
    label: '속삭이는 통로',
    flavor: '아래쪽 어둠 속에서 무언가 나직이 딸깍입니다.',
    weightDeltas: { trap: directionBalance.boost },
    durationMoves: directionBalance.standardDuration,
  },
]

export const fourWayDirections: DirectionEffect[] = [
  {
    id: 'dir_warpath',
    label: '전화의 길',
    flavor: '벽에 깊은 발톱 자국이 나 있습니다. 무언가 사냥하고 있습니다.',
    weightDeltas: { battle: directionBalance.boost },
    durationMoves: directionBalance.standardDuration,
  },
  {
    id: 'dir_hush',
    label: '고요한 길',
    flavor: '공기가 멎어 있고, 이상하리만치 흐트러짐이 없습니다.',
    weightDeltas: { battle: -directionBalance.reduction },
    durationMoves: directionBalance.shortDuration,
  },
  {
    id: 'dir_sigils',
    label: '문양의 길',
    flavor: '오래된 문양이 돌벽을 따라 희미하게 맥동합니다.',
    weightDeltas: { magic_room: directionBalance.boost },
    durationMoves: directionBalance.standardDuration,
  },
  {
    id: 'dir_hoard',
    label: '수집가의 내리막',
    flavor: '아래 어딘가에 부와 파멸이 뒤엉켜 있습니다.',
    weightDeltas: {
      treasure: Math.round(directionBalance.boost * 0.7),
      trap: Math.round(directionBalance.boost * 0.7),
    },
    durationMoves: directionBalance.standardDuration,
  },
]

/** Chance a Direction event offers four paths rather than two. */
export const fourWayDirectionChance = 0.35

// ---------------------------------------------------------------------------
// Key Room
// ---------------------------------------------------------------------------

/**
 * The Boss Door has the same gate as the Key Room — every word in the
 * dungeon's set introduced at least once — but it is not force-selected the
 * way the Key Room is, because the player should still be exploring when
 * they find it. Instead its weight in the ordinary table is raised sharply
 * and keeps climbing while it hides, which is the difference between "will
 * turn up soon" and the 4-in-94 it had before, where a run could end without
 * ever seeing the door it needed.
 */
export const bossDoorBalance = {
  /** Replaces the base weight once every word has been seen. */
  weightOnceUnlocked: 40,
  /** Added per Move that passes without it appearing. */
  weightRampPerMiss: 8,
  /** Ceiling, so the rest of the dungeon never disappears entirely. */
  maxWeight: 140,
}

export const keyRoomBalance = {
  /**
   * Once every word in the dungeon's Spellword Set has been introduced, the
   * Key Room becomes eligible and is force-selected with this probability on
   * each following Move.
   */
  chanceOnceUnlocked: 0.9,
  /**
   * If it somehow keeps losing the roll, the chance climbs by this much per
   * Move so it can never stay hidden for long.
   */
  chanceRampPerMiss: 0.05,
}

// ---------------------------------------------------------------------------
// Treasure
// ---------------------------------------------------------------------------

export const treasureBalance = {
  /** Chance an opened chest turns out to be a Mimic instead of loot. */
  mimicChance: 0.18,
  /** Money granted by an ordinary opened chest. */
  baseMoney: 14,
  /** Chance an ordinary opened chest also yields a consumable item. */
  itemDropChance: 0.45,
  /** Extra money a Magic Room's higher-tier hoard is worth. */
  magicRoomMoney: 34,
  /** Bonus Totem XP from a solved Magic Room. */
  magicRoomTotemXp: 30,
  /** Chance a Magic Room also yields an item on top of its money + XP. */
  magicRoomItemChance: 0.75,
}

export const mimicBalance = {
  /** Mimic HP multiplier relative to an ordinary enemy of the same tier. */
  hpMultiplier: 1.15,
  /** Mimics hit harder than ordinary foes. */
  damageMultiplier: 1.2,
  /** XP multiplier over an ordinary enemy — mimics are worth more. */
  xpMultiplier: 2,
  /** Money multiplier over an ordinary enemy. */
  moneyMultiplier: 2,
  /** Chance a defeated Mimic drops its exclusive treasure. */
  exclusiveDropChance: 0.5,
  /** Money value of the Mimic-exclusive hoard. */
  exclusiveDropMoney: 45,
}

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

export const trapBalance = {
  /** Damage before the tier multiplier when a trap is not disarmed. */
  baseDamage: 9,
  /** Seconds to answer a trap's defense prompt. */
  timerSeconds: 12,
}

// ---------------------------------------------------------------------------
// Magic Room (Hangman)
// ---------------------------------------------------------------------------

export const magicRoomBalance = {
  /** Incorrect guesses allowed before the door seals permanently. */
  maxMistakes: 3,
  /**
   * Size of the tappable guess grid. The grid always contains every
   * syllable of the answer plus decoys drawn from the run's other words,
   * up to this total.
   */
  guessGridSize: 14,
}

// ---------------------------------------------------------------------------
// Rest Areas
// ---------------------------------------------------------------------------

export const restBalance = {
  /** Fraction of max HP restored per use. */
  healFraction: 0.4,
  /** Price of the first use in a run. */
  startingPrice: 20,
  /** Each use multiplies the price of the next one by this. */
  priceGrowth: 1.6,
}

/** Price of the Nth rest use this run (0-indexed uses already spent). */
export function restPriceFor(usesSoFar: number): number {
  return Math.round(restBalance.startingPrice * Math.pow(restBalance.priceGrowth, usesSoFar))
}

/**
 * The folk you meet at a Rest Area.
 *
 * They are a reason to revisit and a way to see your own sample sentences in
 * someone else's mouth. Gifts are deliberately modest: a Rest Area is
 * already a money sink, and talking is free, so anything generous here would
 * undercut the cost curve above.
 */
export const npcBalance = {
  /** A Rest Area holds between this many and `maxCount` people. */
  minCount: 1,
  maxCount: 3,
  /** Chance that talking to someone yields anything at all. */
  giftChance: 0.6,
  /** Money gift range, inclusive. */
  minMoney: 6,
  maxMoney: 22,
  /** Totem XP for the conversation itself, gift or no gift. */
  totemXp: 4,
  /** Chance a gift includes an item rather than only coin. */
  itemChance: 0.22,
} as const
