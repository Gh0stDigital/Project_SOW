import { describe, expect, it } from 'vitest'
import {
  battleBalance,
  dungeonTiers,
  enemyLevelRange,
  powerBalance,
  recommendedLevel,
  spellBalance,
  totemBalance,
} from '@/config/balance'
import { findWorld } from './worldRegistry'
import { outmatchedBy, spawnBoss, spawnEnemy } from './battleEngine'
import { attackPower, enemyDamageForLevel, enemyHpForLevel, rollEnemyLevel } from './enemyLevel'
import { createSpell } from './spellFactory'
import { damageForSpell } from './spellProgression'

/**
 * What a deeper dungeon means.
 *
 * It used to mean more questions: ordinary foes held 36, 39 and 42 HP — six
 * points of difference across the whole game — and the boss held 80 plus
 * four per word in the pool, so the deepest boss was tough because the run
 * had read fifty words. Depth was a reading load.
 *
 * Now every foe rolls a level inside its world and tier's band, and one
 * power curve carries a Totem's damage, its HP, a foe's HP and a foe's
 * damage. The property worth guarding is not any constant but the shape: a
 * fight between equals is about the same length at level 3 as at level 300,
 * while the numbers themselves climb — and the gap between the two levels is
 * what actually decides anything.
 */

const world = findWorld('dragon-king-palace')!
const WORLD = 'dragon-king-palace'

/**
 * Correct answers to drop a foe, played the way a battle plays: a hand of
 * three words, each gaining a charge as it is used, all landing.
 *
 * Uses the real damage and power functions rather than restating them, so a
 * change to either shows up here as a change in pacing.
 */
function answersToKill(enemyLevel: number, totemLevel: number, wordLevel: number, chargeFraction = 0.5): number {
  const maxCharge = spellBalance.maxCharge(wordLevel)
  const hand = [0, 1, 2].map(() => ({
    ...createSpell({ korean: '검토', english: 'review' }),
    level: wordLevel,
    maxCharge,
    charge: Math.round(maxCharge * chargeFraction),
  }))
  const power = attackPower(totemLevel, enemyLevel)
  const hp = enemyHpForLevel(enemyLevel)
  let dealt = 0
  for (let answered = 1; answered <= 4000; answered++) {
    const card = hand[(answered - 1) % hand.length]
    dealt += damageForSpell(card, power)
    card.charge = Math.min(maxCharge, card.charge + 1)
    if (dealt >= hp) return answered
  }
  return Infinity
}

/** The word level a player at this depth plausibly carries. */
const wordAt = (level: number) => (level < 10 ? 2 : level < 50 ? 3 : level < 150 ? 4 : level < 300 ? 5 : 7)

const MATCHED_LEVELS = [1, 5, 10, 25, 50, 100, 150, 300, 500]

describe('a fight between equals is the same fight at every depth', () => {
  it('takes three to five correct answers, from level 1 to level 500', () => {
    for (const level of MATCHED_LEVELS) {
      const answers = answersToKill(level, level, wordAt(level))
      expect(answers, `level ${level} took ${answers} answers`).toBeGreaterThanOrEqual(3)
      expect(answers, `level ${level} took ${answers} answers`).toBeLessThanOrEqual(5)
    }
  })

  it('leaves the Totem about the same number of hits to spare at every depth', () => {
    for (const level of MATCHED_LEVELS) {
      const hits = Math.ceil(totemBalance.maxHp(level) / enemyDamageForLevel(level))
      expect(hits, `level ${level} survives ${hits} hits`).toBeGreaterThanOrEqual(4)
      expect(hits, `level ${level} survives ${hits} hits`).toBeLessThanOrEqual(8)
    }
  })

  it('still lets a level-1 Totem win its first fight', () => {
    // The tightest constraint in the game: a brand-new save has level-1
    // words at no charge and a level-1 Totem, and the only tier it can enter
    // holds foes up to level 10. If this stops being winnable there is
    // nowhere for a new player to start.
    for (const enemyLevel of [1, 3, 5]) {
      const answers = answersToKill(enemyLevel, 1, 1, 0)
      expect(answers, `a level-${enemyLevel} foe took ${answers} answers`).toBeLessThanOrEqual(12)
    }
  })
})

describe('the numbers climb, which is what levelling is for', () => {
  it('grows a maxed word\'s damage by more than twentyfold across the range', () => {
    const maxed = (level: number) =>
      Math.round(spellBalance.baseDamage(wordAt(level)) * 1.5 * powerBalance.scale(level))
    expect(maxed(500)).toBeGreaterThan(maxed(1) * 20)
    expect(maxed(100)).toBeGreaterThan(maxed(10))
  })

  it('grows a foe\'s HP alongside it, so the climb is scale and not advantage', () => {
    expect(enemyHpForLevel(500)).toBeGreaterThan(enemyHpForLevel(1) * 10)
    expect(totemBalance.maxHp(500)).toBeGreaterThan(totemBalance.maxHp(1) * 10)
  })

  it('keeps level 1 exactly where the old balance left it', () => {
    // scale(1) has to be precisely 1, or every starting number shifts.
    expect(powerBalance.scale(1)).toBe(1)
    expect(totemBalance.might(1)).toBe(1)
    expect(totemBalance.maxHp(1)).toBe(powerBalance.totemHpBase)
  })

  it('flattens the opening, where one level is a huge relative step', () => {
    // A raw power curve made level 10 over five times level 1 — and level 1
    // is exactly where every save starts, in a tier holding level-10 foes.
    expect(powerBalance.scale(10) / powerBalance.scale(1)).toBeLessThan(2)
  })
})

describe('charge is still the biggest thing in any single exchange', () => {
  it('outweighs what a level of Totem buys', () => {
    for (const level of [1, 50, 300]) {
      const cold = answersToKill(level, level, wordAt(level), 0)
      const maxed = answersToKill(level, level, wordAt(level), 1)
      expect(maxed, `level ${level}`).toBeLessThan(cold)
      expect(cold / maxed, `level ${level}`).toBeGreaterThanOrEqual(2)
    }
  })
})

describe('being out of your depth', () => {
  it('cuts how much of a word actually lands', () => {
    expect(powerBalance.efficiency(100, 100)).toBe(1)
    expect(powerBalance.efficiency(60, 100)).toBeLessThan(1)
    expect(powerBalance.efficiency(20, 100)).toBeLessThan(powerBalance.efficiency(60, 100))
  })

  it('gives no bonus for being over-levelled — only the power curve does', () => {
    expect(powerBalance.efficiency(300, 100)).toBe(1)
    expect(powerBalance.efficiency(101, 100)).toBe(1)
  })

  it('never throttles a word to nothing', () => {
    expect(powerBalance.efficiency(1, 9999)).toBe(powerBalance.minEfficiency)
    expect(powerBalance.efficiency(1, 9999)).toBeGreaterThan(0)
  })

  it('turns a short fight into a long one as the gap widens', () => {
    const even = answersToKill(100, 100, 4)
    const short = answersToKill(100, 60, 4)
    const hopeless = answersToKill(100, 20, 4)
    expect(short).toBeGreaterThan(even)
    expect(hopeless).toBeGreaterThan(short * 2)
  })

  it('is a wall rather than a grind, because the foe kills you first', () => {
    // The long fight is not the punishment — not surviving it is. A Totem
    // forty levels short needs three times as many answers and can absorb
    // barely half as many hits while it finds them.
    const perHit = enemyDamageForLevel(100)
    expect(Math.ceil(totemBalance.maxHp(100) / perHit)).toBeGreaterThan(
      Math.ceil(totemBalance.maxHp(40) / perHit),
    )
    expect(Math.ceil(totemBalance.maxHp(20) / perHit)).toBeLessThanOrEqual(4)
  })

  it('asks harder questions the further out of your depth you are', () => {
    expect(outmatchedBy(100, 100)).toBe(0)
    expect(outmatchedBy(300, 100)).toBe(0)
    expect(outmatchedBy(80, 100)).toBeGreaterThan(0)
    expect(outmatchedBy(50, 100)).toBeGreaterThan(outmatchedBy(80, 100))
    // Capped, so there is a worst case rather than an ever-steeper one.
    expect(outmatchedBy(1, 10_000)).toBe(1)
  })
})

describe('what a tier is now', () => {
  it('gives every world and tier a band of levels', () => {
    for (const tier of dungeonTiers) {
      const [low, high] = enemyLevelRange(WORLD, tier.id)
      expect(low).toBeGreaterThanOrEqual(1)
      expect(high).toBeGreaterThanOrEqual(low)
    }
  })

  it('makes each tier of a world deeper than the last', () => {
    for (let i = 1; i < dungeonTiers.length; i++) {
      const shallow = enemyLevelRange(WORLD, dungeonTiers[i - 1].id)
      const deep = enemyLevelRange(WORLD, dungeonTiers[i].id)
      expect(deep[1]).toBeGreaterThan(shallow[1])
      expect(recommendedLevel(WORLD, dungeonTiers[i].id)).toBeGreaterThan(
        recommendedLevel(WORLD, dungeonTiers[i - 1].id),
      )
    }
  })

  it('makes a later world deeper than the first at the same tier', () => {
    for (const tier of dungeonTiers) {
      expect(enemyLevelRange('parasite-garden', tier.id)[0]).toBeGreaterThan(
        enemyLevelRange(WORLD, tier.id)[1] - 1,
      )
    }
  })

  it('starts a brand-new save somewhere a level-1 Totem belongs', () => {
    expect(enemyLevelRange(WORLD, 'tier10')[0]).toBe(1)
  })

  it('answers for a world it has never heard of rather than leaving a run unplayable', () => {
    expect(enemyLevelRange('no-such-world', 'tier10')).toEqual(enemyLevelRange(WORLD, 'tier10'))
  })
})

describe('the foes a tier actually spawns', () => {
  it('builds them from their own level, not the tier', () => {
    for (const level of [1, 10, 100]) {
      const enemy = spawnEnemy(world, `seed-${level}`, level)
      expect(enemy.level).toBe(level)
      expect(enemy.maxHp).toBe(enemyHpForLevel(level))
      expect(enemy.currentHp).toBe(enemy.maxHp)
      expect(enemy.damage).toBe(enemyDamageForLevel(level))
    }
  })

  it('makes the boss the hardest thing down there', () => {
    const level = enemyLevelRange(WORLD, 'tier10')[1]
    const boss = spawnBoss(world, 'seed', level)
    const grunt = spawnEnemy(world, 'seed', level)
    expect(boss.level).toBe(level)
    expect(boss.maxHp).toBeGreaterThan(grunt.maxHp)
    expect(boss.damage).toBe(Math.round(grunt.damage * battleBalance.bossDamageMultiplier))
  })

  it('stops charging the boss by the size of the word pool', () => {
    // A tier's boss is the same boss whether the player brought ten words or
    // a thousand. The barrier is where the pool is felt.
    expect(spawnBoss(world, 'seed', 10).maxHp).toBe(spawnBoss(world, 'other-seed', 10).maxHp)
  })
})

describe('rolling a foe\'s level', () => {
  const range = [10, 50] as const

  it('never leaves the band', () => {
    for (let i = 0; i < 500; i++) {
      const level = rollEnemyLevel(range, Math.random)
      expect(level).toBeGreaterThanOrEqual(range[0])
      expect(level).toBeLessThanOrEqual(range[1])
    }
  })

  it('leans shallow, so the ordinary encounter is ordinary', () => {
    const rolls = Array.from({ length: 4000 }, () => rollEnemyLevel(range, Math.random))
    const mean = rolls.reduce((a, b) => a + b, 0) / rolls.length
    expect(mean).toBeLessThan((range[0] + range[1]) / 2)
  })

  it('shifts toward the deep end when a path asks it to', () => {
    const mean = (bias: number) => {
      const rolls = Array.from({ length: 4000 }, () => rollEnemyLevel(range, Math.random, bias))
      return rolls.reduce((a, b) => a + b, 0) / rolls.length
    }
    expect(mean(1)).toBeGreaterThan(mean(0))
    expect(mean(-1)).toBeLessThan(mean(0))
  })

  it('still never leaves the band under the strongest bias', () => {
    // A bias changes the odds of meeting something nasty; it must not be
    // able to invent something worse than the tier holds.
    for (const bias of [-1, 1, -5, 5]) {
      for (let i = 0; i < 300; i++) {
        const level = rollEnemyLevel(range, Math.random, bias)
        expect(level).toBeGreaterThanOrEqual(range[0])
        expect(level).toBeLessThanOrEqual(range[1])
      }
    }
  })

  it('handles a band with no width at all', () => {
    expect(rollEnemyLevel([7, 7], Math.random)).toBe(7)
  })
})
