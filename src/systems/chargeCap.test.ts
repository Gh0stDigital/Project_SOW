import { describe, expect, it } from 'vitest'
import type { Spell } from '@/domain/spell'
import { spellBalance } from '@/config/balance'
import { addExperience, damageForSpell } from './spellProgression'
import { recordChallengeOutcome } from './spellCompendium'
import { createSpell } from './spellFactory'
import { migrateSpell } from './spellMigration'

/**
 * A word's level is how far it is charged, not how far it has grown: it
 * climbs on a right answer, falls on a wrong one, and stops at a ceiling.
 * These cover the ceiling and what happens to a save that predates it.
 */

/** A word sitting at an arbitrary level, as a save might hold it. */
function at(level: number, charge = 0): Spell {
  return {
    ...createSpell({ korean: '검토', english: 'review' }),
    level,
    charge,
    maxCharge: spellBalance.maxCharge(level),
  }
}

describe('the ceiling on a word', () => {
  it('stops at the cap however much more it is answered', () => {
    let spell = at(spellBalance.maxLevel)
    for (let i = 0; i < 200; i++) spell = addExperience(spell, 50).spell
    expect(spell.level).toBe(spellBalance.maxLevel)
  })

  it('reports no level-up once it is already at the top', () => {
    // The results screen calls a word "newly mastered" off this flag, so a
    // capped word must stop claiming to have gone up.
    const result = addExperience(at(spellBalance.maxLevel), 500)
    expect(result.leveledUp).toBe(false)
    expect(result.toLevel).toBe(spellBalance.maxLevel)
  })

  it('keeps putting out its full effect at the cap', () => {
    // Staying put is not the same as falling off: a word held at the top
    // still hits for what the top is worth.
    const full = { ...at(spellBalance.maxLevel), charge: spellBalance.maxCharge(spellBalance.maxLevel) }
    expect(damageForSpell(full)).toBeGreaterThan(damageForSpell(at(spellBalance.maxLevel)))
    expect(damageForSpell(full)).toBe(
      Math.round(spellBalance.baseDamage(spellBalance.maxLevel) * 1.5),
    )
  })

  it('leaves the top of the damage range close to what an enemy can absorb', () => {
    // The point of the cap. Ordinary foes hold 36-42 HP whatever the tier,
    // and the old ceiling of 20 put a charged word at 102 — every fight one
    // hit, decided by how long the word had been studied rather than by
    // anything else. This is the guard on that, not a precise target.
    const charged = Math.round(spellBalance.baseDamage(spellBalance.maxLevel) * 1.5)
    expect(charged).toBeLessThan(60)
  })
})

describe('charge falls on a wrong answer and climbs on a right one', () => {
  it('climbs when the answer is right', () => {
    const before = at(3, 4)
    const after = recordChallengeOutcome(before, true, 'attack').spell
    expect(after.charge).toBeGreaterThan(before.charge)
  })

  it('falls when the answer is wrong', () => {
    const before = at(3, 4)
    const after = recordChallengeOutcome(before, false, 'attack').spell
    expect(after.charge).toBeLessThan(before.charge)
  })

  it('stays put at full charge rather than overflowing', () => {
    const max = spellBalance.maxCharge(3)
    const after = recordChallengeOutcome(at(3, max), true, 'attack').spell
    expect(after.charge).toBe(max)
  })

  it('never falls below empty', () => {
    const after = recordChallengeOutcome(at(3, 0), false, 'attack').spell
    expect(after.charge).toBe(0)
  })
})

describe('a save written under the old ceiling', () => {
  it('brings a word above the cap back down to it', () => {
    const migrated = migrateSpell(at(14, 20))
    expect(migrated.level).toBe(spellBalance.maxLevel)
  })

  it('brings its charge capacity down with it', () => {
    // maxCharge is stored on the word rather than derived on read, so a
    // level-14 word carries a capacity no level-7 word could have. Left
    // alone it would keep hitting for more than the cap allows.
    const migrated = migrateSpell(at(14, 20))
    expect(migrated.maxCharge).toBe(spellBalance.maxCharge(spellBalance.maxLevel))
    expect(migrated.charge).toBeLessThanOrEqual(migrated.maxCharge)
  })

  it('leaves a word already inside the cap exactly as it was', () => {
    const inside = at(4, 6)
    const migrated = migrateSpell(inside)
    expect(migrated.level).toBe(4)
    expect(migrated.charge).toBe(6)
    expect(migrated.maxCharge).toBe(spellBalance.maxCharge(4))
  })

  it('repairs a word with no level at all rather than dropping it to zero', () => {
    // Level 0 would mean no damage and no charge capacity, which is not a
    // state the game has any way back out of.
    const broken = { ...at(1), level: 0, charge: 0, maxCharge: 0 } as Spell
    expect(migrateSpell(broken).level).toBe(1)
    expect(migrateSpell(broken).maxCharge).toBe(spellBalance.maxCharge(1))
  })
})
