import { describe, expect, it } from 'vitest'
import type { Spell } from '@/domain/spell'
import { spellBalance, totemBalance } from '@/config/balance'
import { findWorld } from './worldRegistry'
import { beginPlayerChallenge, defenseDamage, resolvePlayerAttack, spawnEnemy, startBattle } from './battleEngine'
import { createSpell } from './spellFactory'
import { createTotem, recordTierCleared } from './totemManager'
import { damageForSpell } from './spellProgression'

/**
 * A Totem's level used to buy exactly one thing: HP. It could out-live a
 * deeper dungeon but never out-fight one, so the only route past a tier was
 * more studying — the same wall twice rather than a second axis.
 *
 * Knowledge decides whether the blow lands; the Totem decides what a landed
 * blow is worth. These are the two halves of that.
 */

function word(level: number, charge: number): Spell {
  return {
    ...createSpell({ korean: '검토', english: 'review' }),
    level,
    charge,
    maxCharge: spellBalance.maxCharge(level),
  }
}

describe('a Totem level is no longer only HP', () => {
  it('buys damage as well as survivability', () => {
    expect(totemBalance.might(10)).toBeGreaterThan(totemBalance.might(1))
    expect(totemBalance.might(500)).toBeGreaterThan(totemBalance.might(100))
    expect(totemBalance.mitigation(10)).toBeGreaterThan(totemBalance.mitigation(1))
    expect(totemBalance.maxHp(10)).toBeGreaterThan(totemBalance.maxHp(1))
  })

  it('leaves a level-1 Totem exactly as strong as the word it holds', () => {
    // might(1) has to be precisely 1, not merely close: the whole existing
    // balance of a first dungeon is the word's own damage.
    expect(totemBalance.might(1)).toBe(1)
    expect(totemBalance.mitigation(1)).toBe(0)
    const spell = word(3, 4)
    expect(damageForSpell(spell, totemBalance.might(1))).toBe(damageForSpell(spell))
  })

  it('never makes a Totem untouchable however high it goes', () => {
    expect(totemBalance.mitigation(totemBalance.maxLevel)).toBeLessThanOrEqual(0.45)
    expect(totemBalance.mitigation(9999)).toBeLessThanOrEqual(0.45)
  })
})

describe('might decides what a landed blow is worth', () => {
  it('raises a word\'s damage without touching the word', () => {
    const spell = word(4, 5)
    const weak = damageForSpell(spell, totemBalance.might(1))
    const strong = damageForSpell(spell, totemBalance.might(20))
    expect(strong).toBeGreaterThan(weak)
    expect(Math.round(strong / weak)).toBe(2)
  })

  it('reaches the enemy\'s HP bar, not just the number on the card', () => {
    // The formula being right is worth nothing if the battle does not use
    // it. This plays a real attack through the engine twice and compares
    // what the foe actually lost.
    const world = findWorld('dragon-king-palace')!
    const spell = word(5, 6)

    const hpLostWith = (might: number) => {
      // A foe at the shallow end of the first tier's band, so the fight is
      // about the multiplier rather than about the foe.
      const battle = startBattle(spawnEnemy(world, 'seed-1', 3), [spell.id], null)
      const asked = beginPlayerChallenge(battle, spell)
      // The challenge picks its own direction, so the right answer is
      // whichever side of the word it did not show.
      const answer = asked.activeChallenge!.direction === 'eng_to_kor' ? spell.korean : spell.english
      const outcome = resolvePlayerAttack(asked, spell, answer, might)
      expect(outcome.resolution.correct).toBe(true)
      return outcome.state.enemy.maxHp - outcome.state.enemy.currentHp
    }

    const weak = hpLostWith(totemBalance.might(1))
    const strong = hpLostWith(totemBalance.might(20))
    expect(weak).toBeGreaterThan(0)
    expect(strong).toBeGreaterThan(weak)
  })
})

describe('mitigation decides what a blow costs', () => {
  it('takes a share off the damage that gets through', () => {
    const plain = defenseDamage(40, 0, 1)
    const tough = defenseDamage(40, 0, 1, totemBalance.mitigation(20))
    expect(tough).toBeLessThan(plain)
  })

  it('leaves answering the larger of the two effects', () => {
    // A right answer from the weakest Totem must still beat a wrong answer
    // from the toughest one, or the game stops being about the words.
    const answeredByWeakling = defenseDamage(100, 1, 1, totemBalance.mitigation(1))
    const missedByVeteran = defenseDamage(100, 0, 1, 0.45)
    expect(answeredByWeakling).toBeLessThan(missedByVeteran)
  })

  it('ignores a nonsense share rather than healing the Totem', () => {
    expect(defenseDamage(40, 0, 1, -5)).toBe(defenseDamage(40, 0, 1))
    expect(defenseDamage(40, 0, 1, 5)).toBe(0)
  })
})

describe('what a Totem has cleared', () => {
  it('starts with nothing cleared', () => {
    expect(createTotem('Dolbae').clearedTiers).toEqual([])
  })

  it('records a clear', () => {
    expect(recordTierCleared(createTotem('Dolbae'), 'tier10').clearedTiers).toEqual(['tier10'])
  })

  it('does not record the same clear twice', () => {
    // The boss of a tier can be beaten again; the record is a set, not a
    // tally, and a repeat must not be able to push a tier it did not earn
    // into the list.
    const once = recordTierCleared(createTotem('Dolbae'), 'tier10')
    expect(recordTierCleared(once, 'tier10').clearedTiers).toEqual(['tier10'])
  })

  it('belongs to one Totem rather than to the save', () => {
    const veteran = recordTierCleared(createTotem('Dolbae'), 'tier10')
    const recruit = createTotem('Dolbae')
    expect(veteran.clearedTiers).toEqual(['tier10'])
    expect(recruit.clearedTiers).toEqual([])
  })
})
