import { describe, expect, it } from 'vitest'
import type { DungeonTierDef } from '@/config/balance'
import { battleBalance, dungeonTiers, spellBalance, totemBalance } from '@/config/balance'
import { findWorld } from './worldRegistry'
import { spawnBoss, spawnEnemy } from './battleEngine'
import { createSpell } from './spellFactory'
import { damageForSpell } from './spellProgression'

/**
 * What a deeper dungeon means.
 *
 * It used to mean more questions. Ordinary foes held 36, 39 and 42 HP — six
 * points of difference across the whole game — and the boss held 80 plus
 * four per word in the pool, so the deepest boss was tough because the run
 * had read fifty words. The barrier already charges one right answer per
 * pool word, so depth was billed to the reading twice and to the fighting
 * not at all.
 *
 * Now each tier states its own numbers, and the numbers were chosen so an
 * ordinary fight is about the same length at every depth for a player who
 * has actually got there. That is the property worth guarding: not the
 * constants, but the shape.
 */

const world = findWorld('dragon-king-palace')!

/**
 * Correct answers to drop `hp`, played the way a battle plays: a hand of
 * three words, each gaining a charge as it is used, all landing.
 *
 * Uses the real damage function rather than restating it, so a change to the
 * charge curve shows up here as a change in pacing.
 */
function answersToKill(hp: number, wordLevel: number, totemLevel: number, chargeFraction = 0.5): number {
  const maxCharge = spellBalance.maxCharge(wordLevel)
  const hand = [0, 1, 2].map(() => ({
    ...createSpell({ korean: '검토', english: 'review' }),
    level: wordLevel,
    maxCharge,
    charge: Math.round(maxCharge * chargeFraction),
  }))
  const might = totemBalance.might(totemLevel)
  let dealt = 0
  for (let answered = 1; answered <= 500; answered++) {
    const card = hand[(answered - 1) % hand.length]
    dealt += damageForSpell(card, might)
    card.charge = Math.min(maxCharge, card.charge + 1)
    if (dealt >= hp) return answered
  }
  return Infinity
}

/** The word level a player who has reached this tier plausibly carries. */
const wordLevelAt: Record<string, number> = { tier10: 2, tier25: 4, tier50: 6 }

describe('the tiers are actually separated', () => {
  it('makes each one meaningfully tougher than the last, not six HP tougher', () => {
    for (let i = 1; i < dungeonTiers.length; i++) {
      const shallow = dungeonTiers[i - 1]
      const deep = dungeonTiers[i]
      expect(deep.enemyHp).toBeGreaterThan(shallow.enemyHp * 1.5)
      expect(deep.enemyDamage).toBeGreaterThan(shallow.enemyDamage)
      expect(deep.bossHp).toBeGreaterThan(shallow.bossHp)
      expect(deep.recommendedTotemLevel).toBeGreaterThan(shallow.recommendedTotemLevel)
    }
  })

  it('asks for a stronger Totem the deeper it goes', () => {
    // The gate. Without this a tier is only more reading, which is the thing
    // that was wrong with the old tiers.
    for (const tier of dungeonTiers) {
      expect(tier.recommendedTotemLevel).toBeGreaterThanOrEqual(1)
      expect(tier.recommendedTotemLevel).toBeLessThanOrEqual(totemBalance.maxLevel)
    }
  })

  it('puts the tier\'s own numbers on the foes it spawns', () => {
    for (const tier of dungeonTiers) {
      const enemy = spawnEnemy(world, `seed-${tier.id}`, tier)
      expect(enemy.maxHp).toBe(tier.enemyHp)
      expect(enemy.currentHp).toBe(tier.enemyHp)
      expect(enemy.damage).toBe(tier.enemyDamage)

      const boss = spawnBoss(world, `boss-${tier.id}`, tier)
      expect(boss.maxHp).toBe(tier.bossHp)
      expect(boss.damage).toBe(Math.round(tier.enemyDamage * battleBalance.bossDamageMultiplier))
      expect(boss.damage).toBeGreaterThan(enemy.damage)
    }
  })

  it('stops charging the boss by the size of the word pool', () => {
    // A tier's boss is the same boss whether the player brought a set of ten
    // words or a set of a thousand. The barrier is where the pool is felt.
    const tier = dungeonTiers[2]
    expect(spawnBoss(world, 'seed', tier).maxHp).toBe(tier.bossHp)
    expect(spawnBoss(world, 'seed', { ...tier, wordLimit: 500 } as DungeonTierDef).maxHp).toBe(tier.bossHp)
  })
})

describe('an ordinary fight is the same length at every depth', () => {
  it('takes three to five correct answers for a player who belongs there', () => {
    for (const tier of dungeonTiers) {
      const answers = answersToKill(tier.enemyHp, wordLevelAt[tier.id], tier.recommendedTotemLevel)
      expect(answers, `${tier.id} took ${answers} answers`).toBeGreaterThanOrEqual(3)
      expect(answers, `${tier.id} took ${answers} answers`).toBeLessThanOrEqual(5)
    }
  })

  it('rewards a well-charged word and punishes a cold one', () => {
    // The charge curve is what makes the same fight short or long, which is
    // the axis the player controls by studying rather than by levelling.
    for (const tier of dungeonTiers) {
      const level = wordLevelAt[tier.id]
      const cold = answersToKill(tier.enemyHp, level, tier.recommendedTotemLevel, 0)
      const hot = answersToKill(tier.enemyHp, level, tier.recommendedTotemLevel, 1)
      expect(hot).toBeLessThan(cold)
      expect(cold).toBeLessThanOrEqual(8)
    }
  })

  it('gives the boss the weight of a boss without turning it into a shift', () => {
    for (const tier of dungeonTiers) {
      const answers = answersToKill(tier.bossHp, wordLevelAt[tier.id], tier.recommendedTotemLevel)
      expect(answers, `${tier.id} boss took ${answers} answers`).toBeGreaterThanOrEqual(6)
      expect(answers, `${tier.id} boss took ${answers} answers`).toBeLessThanOrEqual(14)
    }
  })

  it('makes an under-levelled Totem feel it rather than merely slow it down', () => {
    // Entering tier50 at the Totem level tier10 expects should be a mistake
    // you notice in the first fight.
    const deep = dungeonTiers[dungeonTiers.length - 1]
    const shallow = dungeonTiers[0]
    const prepared = answersToKill(deep.enemyHp, wordLevelAt[deep.id], deep.recommendedTotemLevel)
    const underLevelled = answersToKill(deep.enemyHp, wordLevelAt[shallow.id], shallow.recommendedTotemLevel)
    expect(underLevelled).toBeGreaterThan(prepared * 2)
  })
})

describe('what the Totem can absorb at each depth', () => {
  it('leaves a prepared Totem several undefended hits and an unprepared one few', () => {
    for (const tier of dungeonTiers) {
      const prepared = totemBalance.maxHp(tier.recommendedTotemLevel)
      const perHit = Math.round(tier.enemyDamage * (1 - totemBalance.mitigation(tier.recommendedTotemLevel)))
      const hits = Math.ceil(prepared / perHit)
      expect(hits, `${tier.id} survives ${hits} hits`).toBeGreaterThanOrEqual(5)
      expect(hits, `${tier.id} survives ${hits} hits`).toBeLessThanOrEqual(12)
    }
  })

  it('makes the deepest tier lethal to a level-1 Totem', () => {
    const deep = dungeonTiers[dungeonTiers.length - 1]
    const hits = Math.ceil(totemBalance.maxHp(1) / Math.round(deep.enemyDamage * (1 - totemBalance.mitigation(1))))
    expect(hits).toBeLessThanOrEqual(3)
  })
})
