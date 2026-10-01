/**
 * Central balance configuration.
 *
 * Every tunable number in the game lives here (or is derived from these
 * values) instead of being scattered through UI components or systems.
 * Formulas are intentionally simple and deterministic for the prototype —
 * tune the constants, not the code that reads them.
 */

// ---------------------------------------------------------------------------
// Spell progression
// ---------------------------------------------------------------------------

export const spellBalance = {
  /**
   * How many slots of charge a word can hold.
   *
   * A word's power is a meter, not a rank. One right answer fills a slot,
   * one wrong answer empties one, and that is the whole rule — there is no
   * experience accumulating underneath and no level that only ever goes up.
   *
   * It used to be both at once: a level driven by an experience bar, plus a
   * separate charge meter whose size depended on that level. Two numbers
   * that both meant "how well do you know this", one of which could never
   * fall. A word answered wrong three times still read as level 6, and the
   * meter the player watched was not the thing the game was scoring.
   */
  chargeSlots: 7,
  /** Slots gained on a correct answer. */
  chargeGainOnCorrect: 1,
  /** Slots lost on an incorrect answer (never below empty). */
  chargeLossOnIncorrect: 1,
  /**
   * Damage a word deals at a given charge, before the Totem's power.
   *
   * Linear in the slots, so the meter reads as the damage: each slot is
   * worth five more. Empty still lands for something — knowing a word badly
   * is not the same as not having it.
   */
  damageForCharge(charge: number): number {
    const slots = Math.max(0, Math.min(spellBalance.chargeSlots, Math.round(charge)))
    return 8 + slots * 5
  },
  /** A word filling its last slot counts as "newly mastered" for the run report. */
  masteredAt: 7,
}


// ---------------------------------------------------------------------------
// The power curve
// ---------------------------------------------------------------------------

/**
 * One curve behind every number that grows.
 *
 * A Totem's damage, its HP, a foe's HP and a foe's damage all ride this, so
 * a fight between equals is about the same length whether they are level 3
 * or level 300 — while the numbers themselves climb from tens into the
 * hundreds. That climb is the point: this is a game you play by answering
 * the same kinds of question over and over, and watching a number go up is
 * how repetition reads as progress rather than as a treadmill.
 *
 * What levelling does *not* do is let you skip knowing the words. Charge
 * swings a word's damage by 3x on its own and a word's level by another
 * 2.6x, so how well you know the word you picked is still the largest thing
 * in any single exchange. Levelling raises the whole board, not your skill
 * at reading it.
 *
 * The softening term is why level 1 and level 10 are not a world apart. A
 * raw power curve makes the first ten levels the steepest stretch in the
 * game — level 10 would be 5.6x level 1 — and the first tier is exactly
 * where a level-1 Totem has to stand. Adding a constant to both sides flattens
 * that opening and leaves the rest of the curve alone.
 */
export const powerBalance = {
  /** Flattens the bottom of the curve, where one level is a huge relative step. */
  soften: 12,
  /** Multiplier on every scaling number at this level. scale(1) is exactly 1. */
  scale(level: number): number {
    const l = Math.max(1, level)
    return Math.pow((l + powerBalance.soften) / (1 + powerBalance.soften), 0.75)
  },
  /** HP a level-1 foe holds; every other foe is this times scale(). */
  enemyHpBase: 90,
  /** Damage a level-1 foe deals. */
  enemyDamageBase: 7,
  /** HP a level-1 Totem holds. */
  totemHpBase: 40,
  /** A boss holds this many times an ordinary foe of its level. */
  bossHpMultiplier: 3,
  /** However far out of its depth, a Totem always lands something. */
  minEfficiency: 0.2,
  /**
   * How much of a word's damage this Totem is allowed to deliver against
   * this foe — the ceiling.
   *
   * At or above the foe's level the word does everything it is worth. Below
   * it, the word still lands but arrives weakened, which is the difference
   * between "I need a bigger health bar" and "my Totem cannot use this word
   * properly here". Softened by the same constant, so the early levels are
   * not a cliff.
   */
  efficiency(totemLevel: number, enemyLevel: number): number {
    const ratio = (totemLevel + powerBalance.soften) / (enemyLevel + powerBalance.soften)
    return Math.max(powerBalance.minEfficiency, Math.min(1, ratio))
  },
}

// ---------------------------------------------------------------------------
// Totem progression
// ---------------------------------------------------------------------------

export const totemBalance = {
  /**
   * The ceiling, matched to the deepest foes the worlds hold. It used to be
   * 50, which was fine while a Totem's level bought only HP; now that the
   * level a foe rolls is compared against it directly, a Totem has to be
   * able to reach the places the game sends it.
   */
  maxLevel: 500,
  /**
   * Life Points are the Totem's run-level lives. A dungeon defeat (HP
   * reaching 0) costs exactly one, never more; ordinary damage that leaves
   * HP above 0 costs none. At 0 Life Points the Totem is permanently
   * destroyed and can no longer be selected.
   */
  startingLifePoints: 3,
  /**
   * XP to the next level, on the same curve as everything else — so a level
   * costs about three and a half same-level kills at every depth, from the
   * first to the five hundredth. A flat curve against scaling rewards would
   * have made the late levels arrive in seconds; a steep one would have made
   * them never arrive at all.
   */
  xpToNextLevel(level: number): number {
    return Math.round(88 * powerBalance.scale(level))
  },
  maxHp(level: number): number {
    return Math.round(powerBalance.totemHpBase * powerBalance.scale(level))
  },
  /**
   * How hard this Totem hits, as a multiplier on a word's damage.
   *
   * Knowing the word is what lands the blow; the Totem is what the blow is
   * worth. This is the power curve itself: a maxed word hits for 21 at level
   * 1 and for 684 at level 500, against foes whose HP has grown by the same
   * factor. So it is not an advantage — it is the scale the whole board is
   * drawn at — but it is the number the player watches climb.
   */
  might(level: number): number {
    return powerBalance.scale(level)
  },
  /**
   * The fraction of incoming damage this Totem shrugs off.
   *
   * The other half of the same idea, and the reason an under-levelled Totem
   * in a deep dungeon dies to the third enemy rather than merely taking
   * longer to win. Capped at 45% so no level makes a Totem untouchable.
   */
  mitigation(level: number): number {
    return Math.min(0.45, (level - 1) * 0.012)
  },
  /**
   * XP for a kill, scaled by what was killed.
   *
   * This is what makes 500 levels reachable. A flat reward would have meant
   * the same 25 XP from a level-1 rat and a level-400 horror, so every level
   * past the first world would have cost hundreds of kills. Paying by the
   * level of the thing you beat keeps the cost of a level steady all the way
   * up, and makes going deeper worth the risk on its own.
   */
  xpForEnemy(enemyLevel: number): number {
    return Math.round(25 * powerBalance.scale(enemyLevel))
  },
  /** A boss is worth several ordinary foes of its level. */
  xpForBoss(enemyLevel: number): number {
    return totemBalance.xpForEnemy(enemyLevel) * 6
  },
  /** A resolved dungeon event, scaled by the depth it was resolved at. */
  xpForEvent(depthLevel: number): number {
    return Math.max(1, Math.round(4 * powerBalance.scale(depthLevel)))
  },
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

export const rewardBalance = {
  /** Base money for a successful treasure / event outcome. */
  baseMoney: 8,
  /** Bonus money multiplier when the answering spell is at full charge. */
  fullChargeMoneyBonus: 1.5,
  /** Money reduced to this fraction when a treasure/event is only partly resolved. */
  partialRewardFraction: 0.4,
  bossMoneyReward: 60,
  bossXpReward: 80,
}

// ---------------------------------------------------------------------------
// Dungeon tiers
// ---------------------------------------------------------------------------

export type DungeonTierId = 'tier10' | 'tier25' | 'tier50'

export interface DungeonTierDef {
  id: DungeonTierId
  /** Flavorful dungeon name shown as the headline on the config screen. */
  name: string
  /** Short functional label (still used in compact spots like stat tiles). */
  label: string
  /** One-line flavor/difficulty blurb shown in the dungeon info display. */
  description: string
  /**
   * The size of a run at this tier: the words it draws on, the fewest a set
   * may bring, and the number it must teach before the Key Room opens — all
   * the same number.
   *
   * These were three separate numbers once, and the gap between them was a
   * problem. The key asked for fewer words than the pool held, so a tier-50
   * run taught sixteen of its fifty and handed over the key; and a set only
   * had to clear that lower bar, so bringing as few words as possible was
   * strictly the best play — run length was your word-list size, for
   * identical rewards.
   *
   * Collapsing them fixes both ends at once. A set must carry the tier's
   * full count, so the choice of how little to bring is gone; and the key
   * waits for every one of those words to have been met at least once, so
   * the tier's name is the honest length of the run. A 50-word dungeon is a
   * fifty-word session.
   */
  wordLimit: number
  /**
   * How many words the boss barrier demands, drawn from the run's pool.
   *
   * Also used to be one per word in the pool, so the fifty-word dungeon
   * asked for fifty correct answers before its boss could be touched. The
   * pool was being billed for depth twice — once here and once in the key —
   * while the fight itself was no harder. Difficulty lives in enemy levels
   * now, which leaves the barrier free to be the ritual that opens the boss
   * rather than the reason the boss is hard.
   */
  barrierWords: number
  /** Roughly how many non-boss events occur before the boss room can spawn. */
  minEventsBeforeBossEligible: number
  /** Multiplies hazard damage — traps, which are not combatants. */
  hazardDamageMultiplier: number
}

/**
 * The band of levels a foe can roll in, per world and tier.
 *
 * This is where depth actually lives now. A tier no longer states a foe's HP
 * and damage — it states how strong the things down there are, and each foe
 * rolls its own level inside the band. Two runs of the same tier are not the
 * same run: one may hand you the bottom of the band all the way through and
 * another the top, and a fork in the path or the right item is how you lean
 * on that.
 *
 * The bands overlap deliberately. The top of one tier is the bottom of the
 * next, so moving down a tier is a shift in the odds rather than a step onto
 * a different ladder.
 */
export type EnemyLevelRange = readonly [low: number, high: number]

const WORLD_TIER_LEVELS: Record<string, Record<DungeonTierId, EnemyLevelRange>> = {
  'dragon-king-palace': { tier10: [1, 10], tier25: [10, 50], tier50: [50, 100] },
  'parasite-garden': { tier10: [100, 150], tier25: [150, 250], tier50: [300, 500] },
  // Provisional: the two worlds beyond these have no stated bands yet, and
  // carry on the same shape so they are playable rather than empty.
  'profane-prison': { tier10: [500, 700], tier25: [700, 1000], tier50: [1000, 1400] },
  starter: { tier10: [1, 10], tier25: [10, 50], tier50: [50, 100] },
}

/** A band for any world, falling back to the shallowest so no run is unplayable. */
export function enemyLevelRange(worldId: string, tierId: DungeonTierId): EnemyLevelRange {
  return WORLD_TIER_LEVELS[worldId]?.[tierId] ?? WORLD_TIER_LEVELS['dragon-king-palace'][tierId]
}

/**
 * The fewest words a set needs to carry a run at this tier — the tier's full
 * count, nothing less.
 *
 * The pool is mandatory now rather than a ceiling. A smaller set could never
 * open the Key Room, since the key waits on every word in the pool having
 * been met; and allowing one would bring back the old incentive to carry the
 * thinnest set that still qualified.
 */
export function minimumSetSize(tier: DungeonTierDef): number {
  return tier.wordLimit
}

/**
 * The deepest tier a set of this size can carry, or null when it cannot
 * carry any.
 *
 * Better than a pass/fail against one number. A 25-word set is not "too
 * small" — it is a tier-25 set, and telling somebody who has opened tier 50
 * that their perfectly good tier-25 set is deficient is both discouraging
 * and untrue.
 */
export function deepestTierForSize(wordCount: number): DungeonTierDef | null {
  let deepest: DungeonTierDef | null = null
  for (const tier of dungeonTiers) {
    if (wordCount >= minimumSetSize(tier)) deepest = tier
  }
  return deepest
}

/** The middle of a band — what a Totem should be to belong there. */
export function recommendedLevel(worldId: string, tierId: DungeonTierId): number {
  const [low, high] = enemyLevelRange(worldId, tierId)
  return Math.round((low + high) / 2)
}

/**
 * The three depths.
 *
 * They used to differ in two things: how many words the run drew from, and a
 * multiplier on enemy damage. Enemy HP was 36, 39 and 42 — a spread of six
 * points across the whole game — so a deeper tier did not mean tougher foes,
 * it meant *more questions*. Depth was a reading load.
 *
 * What a tier says now is how many words the run draws on, how many of them
 * it has to teach before the key turns up, and roughly how long it runs
 * before the boss can appear. How hard it is comes from the
 * band of levels its foes roll in, which is set per world in
 * WORLD_TIER_LEVELS above — the same tier is a different proposition in a
 * later world.
 */
export const dungeonTiers: DungeonTierDef[] = [
  {
    id: 'tier10',
    name: '속삭이는 숲의 골짜기',
    label: '10단어 던전',
    description: '부담 없는 첫 탐험 — 기초 어휘를 다지기에 좋습니다.',
    wordLimit: 10,
    barrierWords: 4,
    minEventsBeforeBossEligible: 6,
    hazardDamageMultiplier: 1,
  },
  {
    id: 'tier25',
    name: '가라앉은 지하 묘지',
    label: '25단어 던전',
    description: '익숙한 단어와 새 단어가 섞여 압박이 점점 커지는 긴 시험입니다.',
    wordLimit: 25,
    barrierWords: 6,
    minEventsBeforeBossEligible: 12,
    hazardDamageMultiplier: 1.6,
  },
  {
    id: 'tier50',
    name: '심연의 보고',
    label: '50단어 던전',
    description: '가장 깊은 곳 — 충분히 준비한 사람을 위한 어휘의 시험대입니다.',
    wordLimit: 50,
    barrierWords: 8,
    minEventsBeforeBossEligible: 20,
    hazardDamageMultiplier: 2.4,
  },
]

// ---------------------------------------------------------------------------
// Battle
// ---------------------------------------------------------------------------

export const battleBalance = {
  /** Number of spell cards visible in the player's hand at once. */
  visibleHandSize: 3,
  /** Default seconds the player has to answer an enemy attack. Configurable for a11y/testing. */
  defaultEnemyTimerSeconds: 12,
  /** Damage dealt to the player when correctly defending (heavily reduced, not zero). */
  defendedDamageFraction: 0.15,
  /**
   * The counter window, as a share of the answer clock.
   *
   * Answer correctly with more than half the time still on the clock and the
   * blow is turned back: no damage taken, and the foe takes a hit of its
   * own. Answer correctly after that and it is an ordinary block — reduced
   * damage, as before. Wrong, or out of time, and it lands in full.
   *
   * Half is deliberately generous. The point is to reward knowing a word
   * outright rather than reconstructing it, and someone who knows a word
   * answers it in a couple of seconds out of twelve; someone who is working
   * it out uses most of the clock. The window separates those two without
   * asking anyone to hurry a word they know.
   */
  counterWindow: 0.5,
  /**
   * What a counter hits for, as a share of an ordinary attack with that word.
   *
   * Less than a full attack, because a counter costs no turn — it happens
   * during the foe's own. Worth enough that a well-known deck turns a long
   * defensive stretch into progress rather than merely survival.
   */
  counterDamageFraction: 0.6,
  /** A boss hits this much harder than an ordinary foe of the same tier. */
  bossDamageMultiplier: 1.4,

  /**
   * How many defense prompts a single enemy attack can demand. One prompt
   * is the common case; multi-prompt attacks are the pressure spike.
   */
  minDefensePrompts: 1,
  maxDefensePrompts: 2,
  /** Chance an ordinary enemy attack asks for more than one word. */
  multiPromptChance: 0.25,
  /** Bosses lean harder on multi-word attacks. */
  bossMultiPromptChance: 0.55,
  bossMaxDefensePrompts: 3,

  /**
   * What a foe above your level does to its questions.
   *
   * These are the second half of being outmatched — the first is that your
   * words land for less. Together they mean the answer to "this thing is too
   * strong for me" is to know the words better or to come back stronger,
   * never just to grind out a longer fight.
   */
  outmatchedMultiPromptBonus: 0.45,
  /** Added to the prompt ceiling once a foe is this far above you. */
  outmatchedExtraPromptAt: 0.5,
  /** At full outmatch, how often defending asks you to produce the Korean. */
  outmatchedHardDirectionChance: 0.8,

  /** Money awarded for defeating an ordinary enemy. */
  enemyMoneyReward: 12,
  /** Chance a defeated ordinary enemy drops a consumable. */
  enemyItemDropChance: 0.3,
}

// ---------------------------------------------------------------------------
// Random events
// ---------------------------------------------------------------------------

// Event types, weights, direction modifiers and per-event balance now live
// in config/dungeonEvents.ts. Re-exported here so the many modules that
// already import DungeonEventType from '@/config/balance' keep working.
export type { DungeonEventType } from './dungeonEvents'
export { baseEventWeights, maxRepeatEventStreak } from './dungeonEvents'

// ---------------------------------------------------------------------------
// Answer tiles
// ---------------------------------------------------------------------------

export const tileBalance = {
  /**
   * Decoy tiles are scaled to the answer's length, then clamped — a
   * two-syllable word doesn't need eight decoys, and a long one shouldn't
   * flood the grid.
   */
  decoyRatio: 1,
  minDecoys: 3,
  maxDecoys: 8,
  /**
   * Options shown when the whole answer is one tile — the answer plus
   * decoys. Four is enough to make recall matter without turning the board
   * into a reading exercise.
   */
  wholeAnswerChoices: 4,
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

export const gameplayBalance = {
  /** Minimum notes-free Spell fields required to save. */
  requireNotes: false,
}

// ---------------------------------------------------------------------------
// Which word a run asks about next
// ---------------------------------------------------------------------------

/**
 * How often each word comes up while a run is going on.
 *
 * It used to be an even draw over the whole set, which has one bad property
 * that swamps every good one: the last word you have not met yet is as
 * likely as any of the ones you have, so with twenty words in the set it
 * takes about twenty Moves to meet the twentieth. The key waits on every
 * word being introduced, so that tail is the run standing still.
 *
 * So the draw is weighted, on two axes:
 *
 *   - A word not yet met outweighs one you have. That is what makes the set
 *     open up quickly rather than trickling out.
 *   - Among words you have met, getting one wrong raises it and getting it
 *     right lowers it. Answer well and the words you know fall away, which
 *     leaves the unmet ones a larger share of the draw and brings the key
 *     closer; answer badly and the ones you missed keep coming back, which
 *     is when they should.
 *
 * Numbers are relative to `seenBase`, so they can be read as multiples: a
 * word missed once is about three times as likely as one never attempted,
 * and one answered right twice is about a sixth as likely.
 */
export const wordPacing = {
  /** A word this run has never asked about. */
  unseen: 6,
  /** Met, but never actually answered — the Magic Room introduces words this way. */
  seenBase: 1,
  /** Added per wrong answer. */
  missWeight: 1.2,
  /** Taken off per right answer. */
  masteryDrop: 0.45,
  /** A word already known never falls out of the run entirely. */
  minSeen: 0.15,
  /** However badly it is going, no single word may take over the draw. */
  maxSeen: 4,
  /**
   * Applied to the word just asked.
   *
   * Mild on purpose. A word you just got wrong should come back soon — that
   * is the point — but the same word three prompts running reads as the
   * dungeon being stuck rather than as being drilled, and at a 3x miss
   * weight that is exactly what an undamped draw produces.
   */
  repeatDamp: 0.5,
} as const

