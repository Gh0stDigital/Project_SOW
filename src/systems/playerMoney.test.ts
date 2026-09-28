import { describe, expect, it } from 'vitest'
import type { Totem } from '@/domain/totem'
import { restBalance } from '@/config/dungeonEvents'
import { applyRest, canRest, quoteRest } from './restArea'
import { createTotem } from './totemManager'

/**
 * Money belongs to the player, not to a Totem.
 *
 * It used to sit on each Totem, which made a wallet part of a character:
 * switching Totem switched purses, and a Totem destroyed for good took its
 * savings to the grave with it. Money buys rests now and will buy crafting
 * later, and neither of those belongs to one character.
 */

function hurt(hpFraction = 0.4): Totem {
  const totem = createTotem('Dolbae')
  return { ...totem, currentHp: Math.round(totem.maxHp * hpFraction) }
}

describe('a Totem no longer carries a purse', () => {
  it('is raised without one', () => {
    expect((createTotem('Dolbae') as unknown as Record<string, unknown>).money).toBeUndefined()
  })
})

describe('buying a rest spends the player purse', () => {
  it('is affordable or not according to what the player holds, not the Totem', () => {
    const totem = hurt()
    const price = restBalance.startingPrice
    expect(quoteRest(totem, price, 0).canAfford).toBe(true)
    expect(quoteRest(totem, price - 1, 0).canAfford).toBe(false)
  })

  it('reports being too poor as the reason it is blocked', () => {
    expect(quoteRest(hurt(), 0, 0).blockedReason).toBe('too_expensive')
    expect(canRest(hurt(), 0, 0)).toBe(false)
  })

  it('still refuses a rest a Totem does not need, however rich the player is', () => {
    const full = createTotem('Dolbae')
    expect(quoteRest(full, 99_999, 0).blockedReason).toBe('full_hp')
    expect(canRest(full, 99_999, 0)).toBe(false)
  })

  it('heals the Totem and reports the price for the caller to deduct', () => {
    const totem = hurt()
    const result = applyRest(totem, 999, 0)!
    expect(result.healed).toBeGreaterThan(0)
    expect(result.totem.currentHp).toBe(totem.currentHp + result.healed)
    expect(result.spent).toBe(restBalance.startingPrice)
  })

  it('leaves the purse out of the healing itself', () => {
    // applyRest is a pure function about one Totem's HP. The money is the
    // store's, so it says what to charge rather than reaching for it.
    const result = applyRest(hurt(), 999, 0)!
    expect((result.totem as unknown as Record<string, unknown>).money).toBeUndefined()
  })

  it('refuses rather than healing on credit', () => {
    expect(applyRest(hurt(), 0, 0)).toBeNull()
  })

  it('never heals past full', () => {
    const almost = { ...createTotem('Dolbae') }
    const nearlyWell = { ...almost, currentHp: almost.maxHp - 1 }
    const result = applyRest(nearlyWell, 999, 0)!
    expect(result.totem.currentHp).toBe(almost.maxHp)
    expect(result.healed).toBe(1)
  })

  it('charges more for each rest in a run', () => {
    const totem = hurt(0.1)
    const first = quoteRest(totem, 99_999, 0)
    const second = quoteRest(totem, 99_999, 1)
    expect(second.price).toBeGreaterThan(first.price)
    expect(first.nextPrice).toBe(second.price)
  })
})
