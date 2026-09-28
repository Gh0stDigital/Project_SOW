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
   * The ceiling on a word's level.
   *
   * A level here is how far a word is charged, not how far it has grown. It
   * climbs on a right answer, falls on a wrong one, and once it reaches the
   * cap it stays there putting out its full effect — there is no rank beyond
   * this one to grind towards.
   *
   * It used to be 20, which made the word itself the game's power curve: a
   * word answered 90 times hit for 38 and one answered 333 times hit for 68,
   * against enemies who have between 36 and 42 HP whatever the tier. Past
   * roughly level 10 every ordinary fight was one hit, so the thing that
   * decided how a battle went was how long that word had been studied. 7
   * puts the top of the range next to the enemies who have to absorb it.
   */
  maxLevel: 7,
  /** XP required to go from level N to N+1 = base + perLevel * N. */
  xpToNextLevel(level: number): number {
    return 20 + level * 12
  },
  /** Charge cap grows with level. */
  maxCharge(level: number): number {
    return 5 + (level - 1) * 2
  },
  /** Charge gained on a correct answer. */
  chargeGainOnCorrect: 1,
  /** Charge lost on an incorrect answer (never below 0). */
  chargeLossOnIncorrect: 2,
  /** Base damage a spell can deal, before charge multiplier. */
  baseDamage(level: number): number {
    return 8 + level * 3
  },
  /**
   * Charge multiplier applied to base damage. 0 charge = 50% damage,
   * full charge = 150% damage. Linear in between.
   */
  chargeDamageMultiplier(charge: number, maxCharge: number): number {
    const ratio = maxCharge > 0 ? charge / maxCharge : 0
    return 0.5 + ratio
  },
  /** XP granted for a correct general-vocabulary challenge. */
  xpPerCorrectChallenge: 6,
  /** XP granted for a correct attack in battle. */
  xpPerCorrectAttack: 8,
  /** XP granted for a correct defense in battle. */
  xpPerCorrectDefense: 8,
  /** XP granted for a correct Plateau-clearing answer (on top of the above). */
  xpPerPlateauClear: 4,
  /** A Spell reaching this level during a run counts as "newly mastered" for results reporting. */
  masteryLevel: 3,
}

// ---------------------------------------------------------------------------
// Totem progression
// ---------------------------------------------------------------------------

export const totemBalance = {
  maxLevel: 50,
  /**
   * Life Points are the Totem's run-level lives. A dungeon defeat (HP
   * reaching 0) costs exactly one, never more; ordinary damage that leaves
   * HP above 0 costs none. At 0 Life Points the Totem is permanently
   * destroyed and can no longer be selected.
   */
  startingLifePoints: 3,
  xpToNextLevel(level: number): number {
    return 40 + level * 20
  },
  maxHp(level: number): number {
    return 40 + (level - 1) * 8
  },
  /**
   * How hard this Totem hits, as a multiplier on a word's damage.
   *
   * Knowing the word is what lands the blow; the Totem is what the blow is
   * worth. Before this, a Totem's level bought nothing but HP — it could
   * out-live a deeper dungeon but never out-fight one, so the only way past
   * a tier was more studying, which is the same wall twice rather than a
   * second axis.
   *
   * 6% a level, so the curve is legible from the level number: ×1.00 at 1,
   * ×1.54 at 10, ×2.14 at 20, ×3.94 at the cap. Deliberately smaller than
   * the swing a word's own charge gives (×0.5 to ×1.5), because the Totem is
   * the floor a player stands on and the word is what they do with it.
   */
  might(level: number): number {
    return 1 + (level - 1) * 0.06
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
  /** XP a Totem earns from a resolved dungeon event or battle action. */
  xpPerEvent: 4,
  xpPerBattleWin: 25,
  xpPerBossWin: 80,
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
  wordLimit: number
  /** Roughly how many non-boss events occur before the boss room can spawn. */
  minEventsBeforeBossEligible: number
  /** HP an ordinary foe of this tier holds. */
  enemyHp: number
  /** Damage one of its attacks does, before the Totem's mitigation. */
  enemyDamage: number
  /** HP this tier's boss holds. */
  bossHp: number
  /** Multiplies hazard damage — traps, which are not combatants. */
  hazardDamageMultiplier: number
  /**
   * The Totem level this tier is built around. Advisory: what stops a
   * level-1 Totem walking into the deepest dungeon is the clear-the-previous
   * -tier gate in config/progression.ts, not this number. This is what the
   * dungeon screen tells the player before they commit.
   */
  recommendedTotemLevel: number
}

/**
 * The three depths.
 *
 * They used to differ in two things: how many words the run drew from, and a
 * multiplier on enemy damage. Enemy HP was 36, 39 and 42 — a spread of six
 * points across the whole game — and boss HP was 80 plus four per word in
 * the pool. So a deeper tier did not mean tougher foes, it meant *more
 * questions*: the same enemies, more of them, and a boss barrier demanding
 * one right answer per word in a pool of fifty. Depth was a reading load.
 *
 * Now each tier states its own HP and damage outright. The numbers were
 * picked by simulating how many correct answers an ordinary fight takes for
 * a player who has actually reached that tier — three to five, at every
 * depth — so a deeper dungeon asks for a stronger Totem and better-charged
 * words rather than simply more of your evening. Boss HP is a flat number
 * per tier for the same reason: tied to the pool size it grew with the
 * reading, not the difficulty.
 */
export const dungeonTiers: DungeonTierDef[] = [
  {
    id: 'tier10',
    name: '속삭이는 숲의 골짜기',
    label: '10단어 던전',
    description: '부담 없는 첫 탐험 — 기초 어휘를 다지기에 좋습니다.',
    wordLimit: 10,
    minEventsBeforeBossEligible: 6,
    enemyHp: 42,
    enemyDamage: 7,
    bossHp: 120,
    hazardDamageMultiplier: 1,
    recommendedTotemLevel: 1,
  },
  {
    id: 'tier25',
    name: '가라앉은 지하 묘지',
    label: '25단어 던전',
    description: '익숙한 단어와 새 단어가 섞여 압박이 점점 커지는 긴 시험입니다.',
    wordLimit: 25,
    minEventsBeforeBossEligible: 12,
    enemyHp: 100,
    enemyDamage: 16,
    bossHp: 300,
    hazardDamageMultiplier: 1.6,
    recommendedTotemLevel: 8,
  },
  {
    id: 'tier50',
    name: '심연의 보고',
    label: '50단어 던전',
    description: '가장 깊은 곳 — 충분히 준비한 사람을 위한 어휘의 시험대입니다.',
    wordLimit: 50,
    minEventsBeforeBossEligible: 20,
    enemyHp: 220,
    enemyDamage: 28,
    bossHp: 640,
    hazardDamageMultiplier: 2.4,
    recommendedTotemLevel: 18,
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

