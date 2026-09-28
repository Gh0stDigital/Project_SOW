import { describe, expect, it } from 'vitest'
import type { Spell } from '@/domain/spell'
import { spellBalance } from '@/config/balance'
import { applyChargeDelta, damageForSpell, isFullyCharged } from './spellProgression'
import { recordChallengeOutcome } from './spellCompendium'
import { createSpell } from './spellFactory'
import { migrateSpell } from './spellMigration'

/**
 * A word's charge is slots, not a rank.
 *
 * One right answer fills a slot, one wrong answer empties one, and that is
 * the whole rule. There used to be a level as well, driven by an experience
 * bar that could only ever climb — two numbers for one idea, and the one the
 * player could not see was the one that decided damage. A word answered
 * wrong all evening still read as highly ranked.
 */

/** A word sitting at a given charge, as a save might hold it. */
function at(charge: number): Spell {
  return { ...createSpell({ korean: '검토', english: 'review' }), charge }
}

describe('one answer, one slot', () => {
  it('fills a slot when the answer is right', () => {
    expect(recordChallengeOutcome(at(3), true, 'attack').spell.charge).toBe(4)
  })

  it('empties exactly one slot when the answer is wrong', () => {
    // It used to take two off, which made a single slip cost twice what an
    // answer was worth and pushed the meter down faster than play could
    // lift it.
    expect(recordChallengeOutcome(at(3), false, 'attack').spell.charge).toBe(2)
    expect(spellBalance.chargeLossOnIncorrect).toBe(1)
  })

  it('moves by one whichever kind of prompt it was', () => {
    for (const context of ['attack', 'defense', 'challenge'] as const) {
      expect(recordChallengeOutcome(at(3), true, context).spell.charge).toBe(4)
      expect(recordChallengeOutcome(at(3), false, context).spell.charge).toBe(2)
    }
  })

  it('reports the move, so the run can show what filled up', () => {
    const result = recordChallengeOutcome(at(3), true, 'attack')
    expect(result.chargeFrom).toBe(3)
    expect(result.chargeTo).toBe(4)
    expect(result.newlyFull).toBe(false)
  })
})

describe('the ends of the meter', () => {
  it('stays put at full rather than overflowing', () => {
    const full = spellBalance.chargeSlots
    expect(recordChallengeOutcome(at(full), true, 'attack').spell.charge).toBe(full)
  })

  it('never falls below empty', () => {
    expect(recordChallengeOutcome(at(0), false, 'attack').spell.charge).toBe(0)
  })

  it('flags the answer that fills the last slot, and only that one', () => {
    const full = spellBalance.chargeSlots
    expect(recordChallengeOutcome(at(full - 1), true, 'attack').newlyFull).toBe(true)
    // Already full — the run should not congratulate the player twice.
    expect(recordChallengeOutcome(at(full), true, 'attack').newlyFull).toBe(false)
  })

  it('clamps a delta of any size to the meter', () => {
    expect(applyChargeDelta(at(2), 99).charge).toBe(spellBalance.chargeSlots)
    expect(applyChargeDelta(at(2), -99).charge).toBe(0)
  })

  it('calls a word mastered exactly when its meter is full', () => {
    // Two constants describing one thing, so they have to agree: a mastery
    // mark below the top would fire early and one above it never at all.
    expect(spellBalance.masteredAt).toBe(spellBalance.chargeSlots)
  })

  it('knows when a word is at full charge', () => {
    expect(isFullyCharged(at(spellBalance.chargeSlots))).toBe(true)
    expect(isFullyCharged(at(spellBalance.chargeSlots - 1))).toBe(false)
  })
})

describe('charge is what a word hits for', () => {
  it('rises with every slot', () => {
    for (let slot = 1; slot <= spellBalance.chargeSlots; slot++) {
      expect(damageForSpell(at(slot))).toBeGreaterThan(damageForSpell(at(slot - 1)))
    }
  })

  it('still lands for something at empty', () => {
    // Knowing a word badly is not the same as not having it.
    expect(damageForSpell(at(0))).toBeGreaterThan(0)
  })

  it('reads straight off the meter', () => {
    // The number on the card is the number the slots describe — no hidden
    // rank multiplying it behind the player's back.
    for (let slot = 0; slot <= spellBalance.chargeSlots; slot++) {
      expect(damageForSpell(at(slot))).toBe(spellBalance.damageForCharge(slot))
    }
  })

  it('is multiplied by the caster and by nothing else', () => {
    expect(damageForSpell(at(4), 2)).toBe(damageForSpell(at(4)) * 2)
    expect(damageForSpell(at(4), 1)).toBe(damageForSpell(at(4)))
  })

  it('answers sensibly for a charge outside the meter', () => {
    expect(spellBalance.damageForCharge(-5)).toBe(spellBalance.damageForCharge(0))
    expect(spellBalance.damageForCharge(999)).toBe(spellBalance.damageForCharge(spellBalance.chargeSlots))
  })
})

describe('a save written when a word had a level', () => {
  const legacy = () =>
    ({ ...at(0), level: 5, experience: 40, maxCharge: 13, charge: 9 }) as unknown as Spell

  it('takes the slots from the level, which is what decided damage', () => {
    expect(migrateSpell(legacy()).charge).toBe(5)
  })

  it('brings a level above the meter down to it', () => {
    const veteran = { ...at(0), level: 14, experience: 200, maxCharge: 31, charge: 28 } as unknown as Spell
    expect(migrateSpell(veteran).charge).toBe(spellBalance.chargeSlots)
  })

  it('drops the experience bar and the per-word ceiling entirely', () => {
    const migrated = migrateSpell(legacy()) as unknown as Record<string, unknown>
    expect(migrated.experience).toBeUndefined()
    expect(migrated.maxCharge).toBeUndefined()
    expect(migrated.level).toBeUndefined()
  })

  it('falls back to the stored charge when there was never a level', () => {
    const noLevel = { ...at(3) } as unknown as Record<string, unknown>
    delete noLevel.level
    expect(migrateSpell(noLevel as unknown as Spell).charge).toBe(3)
  })

  it('is idempotent — migrating twice changes nothing', () => {
    const once = migrateSpell(at(4))
    expect(migrateSpell(once)).toEqual(once)
  })
})
