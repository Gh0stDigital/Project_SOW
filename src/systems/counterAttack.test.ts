import { describe, expect, it } from 'vitest'
import type { BattleState } from '@/domain/battle'
import { battleBalance, spellBalance } from '@/config/balance'
import {
  beginEnemyChallenge,
  defenseDamage,
  defenseOutcomeFor,
  resolveDefensePrompt,
  spawnEnemy,
  startBattle,
} from './battleEngine'
import { createSpell } from './spellFactory'
import { damageForSpell } from './spellProgression'
import { findWorld } from './worldRegistry'

/**
 * Answering a defence fast enough to turn it back.
 *
 * Defending used to have one axis — right or wrong — so a word you knew
 * outright and a word you reconstructed with half a second to spare were
 * worth exactly the same. The clock now separates them: answer inside the
 * counter window and the blow is turned back on the attacker and costs you
 * nothing; answer after it and it is an ordinary block; be wrong or run out
 * of time and it lands in full.
 */

const world = findWorld('dragon-king-palace')!
const TIMER = 12

function deck() {
  return ['학교', '사랑', '먹다'].map((k, i) => createSpell({ korean: k, english: `w${i}`, }))
}

/** A battle sitting on its first defence prompt, with the clock as given. */
function defending(remaining: number, spells = deck()): { state: BattleState; spells: ReturnType<typeof deck> } {
  const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
  // rng fixed low so the attack asks for exactly one word.
  const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0.99, {}, 0)
  return {
    state: { ...asked, timer: { totalSeconds: TIMER, remainingSeconds: remaining, running: true } },
    spells,
  }
}

const answerTo = (state: BattleState, spells: ReturnType<typeof deck>) => {
  const challenge = state.activeChallenge!
  const spell = spells.find((s) => s.id === challenge.spellId)!
  return { spell, text: challenge.direction === 'eng_to_kor' ? spell.korean : spell.english }
}

describe('which band an answer falls in', () => {
  it('counters when most of the clock is still running', () => {
    expect(defenseOutcomeFor(true, false, 12, 12)).toBe('countered')
    expect(defenseOutcomeFor(true, false, 7, 12)).toBe('countered')
  })

  it('blocks when the answer came after the window closed', () => {
    expect(defenseOutcomeFor(true, false, 6, 12)).toBe('blocked')
    expect(defenseOutcomeFor(true, false, 1, 12)).toBe('blocked')
  })

  it('treats exactly half as too slow, so the window is the faster half', () => {
    expect(defenseOutcomeFor(true, false, 6, 12)).toBe('blocked')
  })

  it('hits on a wrong answer however fast it came', () => {
    expect(defenseOutcomeFor(false, false, 12, 12)).toBe('hit')
  })

  it('hits when the clock ran out', () => {
    expect(defenseOutcomeFor(true, true, 0, 12)).toBe('hit')
    expect(defenseOutcomeFor(false, true, 0, 12)).toBe('hit')
  })

  it('does not divide by a clock of zero', () => {
    expect(defenseOutcomeFor(true, false, 0, 0)).toBe('blocked')
  })
})

describe('what each band costs', () => {
  it('lets a counter through for nothing at all', () => {
    expect(defenseDamage(100, ['countered'])).toBe(0)
  })

  it('leaves a block at the reduced fraction it always was', () => {
    expect(defenseDamage(100, ['blocked'])).toBe(Math.round(100 * battleBalance.defendedDamageFraction))
  })

  it('lands a miss in full', () => {
    expect(defenseDamage(100, ['hit'])).toBe(100)
  })

  it('settles a multi-word attack prompt by prompt', () => {
    // Each prompt carries its own share, so half-answering an attack costs
    // about half of it rather than some blended fraction of the whole.
    expect(defenseDamage(100, ['countered', 'hit'])).toBe(50)
    expect(defenseDamage(100, ['countered', 'countered'])).toBe(0)
    expect(defenseDamage(120, ['countered', 'blocked', 'hit'])).toBe(Math.round(40 * 0.15 + 40))
  })

  it('orders the three bands the way the player would expect', () => {
    const countered = defenseDamage(100, ['countered'])
    const blocked = defenseDamage(100, ['blocked'])
    const hit = defenseDamage(100, ['hit'])
    expect(countered).toBeLessThan(blocked)
    expect(blocked).toBeLessThan(hit)
  })
})

describe('a counter in a real battle', () => {
  it('takes no damage and hurts the attacker', () => {
    const { state, spells } = defending(TIMER)
    const { spell, text } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, text, false, TIMER, 0, 1)

    expect(out.outcome).toBe('countered')
    expect(out.damageToTotem).toBe(0)
    expect(out.counterDamage).toBeGreaterThan(0)
    expect(out.state.enemy.currentHp).toBe(state.enemy.maxHp - out.counterDamage)
  })

  it('counters for a share of what that word would attack for', () => {
    const { state, spells } = defending(TIMER)
    const { spell, text } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, text, false, TIMER, 0, 1)
    // The word is answered correctly, so it gains a slot before it strikes.
    expect(out.counterDamage).toBe(
      Math.round(damageForSpell(out.resolution.spell, 1) * battleBalance.counterDamageFraction),
    )
    expect(out.counterDamage).toBeLessThan(damageForSpell(out.resolution.spell, 1))
  })

  it('hits harder for a stronger Totem, exactly as an attack would', () => {
    const weak = defending(TIMER)
    const strong = defending(TIMER)
    const a = answerTo(weak.state, weak.spells)
    const b = answerTo(strong.state, strong.spells)
    const weakHit = resolveDefensePrompt(weak.state, a.spell, a.text, false, TIMER, 0, 1).counterDamage
    const strongHit = resolveDefensePrompt(strong.state, b.spell, b.text, false, TIMER, 0, 4).counterDamage
    expect(strongHit).toBeGreaterThan(weakHit)
  })

  it('only softens the blow when the answer came late', () => {
    const { state, spells } = defending(1)
    const { spell, text } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, text, false, TIMER, 0, 1)

    expect(out.outcome).toBe('blocked')
    expect(out.counterDamage).toBe(0)
    expect(out.damageToTotem).toBeGreaterThan(0)
    expect(out.damageToTotem).toBeLessThan(state.enemy.damage)
    expect(out.state.enemy.currentHp).toBe(state.enemy.maxHp)
  })

  it('lands in full on a wrong answer, fast or not', () => {
    const { state, spells } = defending(TIMER)
    const { spell } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, '완전히 틀린 답', false, TIMER, 0, 1)

    expect(out.outcome).toBe('hit')
    expect(out.counterDamage).toBe(0)
    expect(out.damageToTotem).toBe(state.enemy.damage)
  })

  it('lands in full when the clock runs out', () => {
    const { state, spells } = defending(0)
    const { spell, text } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, text, true, TIMER, 0, 1)

    expect(out.outcome).toBe('hit')
    expect(out.counterDamage).toBe(0)
    expect(out.damageToTotem).toBe(state.enemy.damage)
  })

  it('ends the fight when a counter finishes the foe', () => {
    const { state, spells } = defending(TIMER)
    const { spell, text } = answerTo(state, spells)
    const nearlyDead: BattleState = { ...state, enemy: { ...state.enemy, currentHp: 1 } }
    const out = resolveDefensePrompt(nearlyDead, spell, text, false, TIMER, 0, 1)

    expect(out.state.enemy.currentHp).toBe(0)
    // Otherwise the player is left tapping through an enemy turn taken by a
    // foe that is already down.
    expect(out.state.phase).toBe('victory')
  })

  it('still fills the word charge, as any right answer does', () => {
    const { state, spells } = defending(TIMER)
    const { spell, text } = answerTo(state, spells)
    const out = resolveDefensePrompt(state, spell, text, false, TIMER, 0, 1)
    expect(out.resolution.chargeTo).toBe(spell.charge + spellBalance.chargeGainOnCorrect)
  })
})
