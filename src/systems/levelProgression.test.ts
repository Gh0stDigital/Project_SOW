import { describe, expect, it } from 'vitest'
import type { ActiveModifier, DirectionChoice } from '@/domain/dungeon'
import { battleBalance, powerBalance, totemBalance } from '@/config/balance'
import { levelDirections } from '@/config/dungeonEvents'
import { activeLevelBias, addModifier, describeModifier } from './directionModifiers'
import { beginEnemyChallenge, defensePromptCount, spawnEnemy, startBattle } from './battleEngine'
import { createSpell } from './spellFactory'
import { findWorld } from './worldRegistry'
import { addTotemExperience, createTotem } from './totemManager'

/**
 * The climb, and the two things that steer it.
 *
 * A level is the game's only immediate reward for repetition, so the
 * question these cover is not whether levelling works but whether it stays
 * worth doing all the way to 500 — and whether the player has any hand on
 * what they meet on the way.
 */

describe('a level stays worth earning all the way up', () => {
  it('pays for a kill by the level of what was killed', () => {
    expect(totemBalance.xpForEnemy(100)).toBeGreaterThan(totemBalance.xpForEnemy(10))
    expect(totemBalance.xpForEnemy(500)).toBeGreaterThan(totemBalance.xpForEnemy(100))
    expect(totemBalance.xpForBoss(50)).toBeGreaterThan(totemBalance.xpForEnemy(50))
  })

  it('costs about the same number of same-level kills at every depth', () => {
    // This is what makes 500 levels reachable. A flat reward against a
    // rising cost would have meant hundreds of kills a level past the first
    // world; a flat cost against a rising reward would have handed out the
    // late levels in seconds.
    for (const level of [1, 10, 50, 100, 300, 499]) {
      const kills = totemBalance.xpToNextLevel(level) / totemBalance.xpForEnemy(level)
      expect(kills, `level ${level} costs ${kills.toFixed(1)} kills`).toBeGreaterThan(2)
      expect(kills, `level ${level} costs ${kills.toFixed(1)} kills`).toBeLessThan(6)
    }
  })

  it('can actually be climbed to the cap', () => {
    // Walked rather than asserted: a curve that stalls somewhere in the
    // middle would satisfy any amount of arithmetic about its ends.
    let totem = createTotem('Dolbae')
    let kills = 0
    while (totem.level < totemBalance.maxLevel && kills < 20_000) {
      totem = addTotemExperience(totem, totemBalance.xpForEnemy(totem.level)).totem
      kills++
    }
    expect(totem.level).toBe(totemBalance.maxLevel)
    expect(kills).toBeLessThan(20_000)
  })

  it('stops at the cap rather than climbing forever', () => {
    const maxed = { ...createTotem('Dolbae'), level: totemBalance.maxLevel, experience: 0 }
    const after = addTotemExperience(maxed, 10_000_000)
    expect(after.totem.level).toBe(totemBalance.maxLevel)
    expect(after.leveledUp).toBe(false)
  })

  it('grows HP with the level, which is what the level is mostly for', () => {
    expect(totemBalance.maxHp(500)).toBeGreaterThan(totemBalance.maxHp(100))
    expect(totemBalance.maxHp(100)).toBeGreaterThan(totemBalance.maxHp(10))
  })
})

describe('a fork in the path leans on what you meet', () => {
  const choiceOf = (id: string): DirectionChoice => {
    const effect = levelDirections.find((d) => d.id === id)!
    return {
      id: effect.id,
      label: effect.label,
      flavor: effect.flavor,
      weightDeltas: effect.weightDeltas,
      enemyLevelBias: effect.enemyLevelBias,
      durationMoves: effect.durationMoves,
    }
  }

  it('offers a way down and a way round', () => {
    const biases = levelDirections.map((d) => d.enemyLevelBias)
    expect(biases).toContain(1)
    expect(biases).toContain(-1)
  })

  it('carries the bias onto the run', () => {
    const active = addModifier([], choiceOf('dir_descent'))
    expect(activeLevelBias(active)).toBe(1)
  })

  it('reads as nothing at all when no path has been taken', () => {
    expect(activeLevelBias([])).toBe(0)
  })

  it('lets a later path overrule an earlier one rather than cancelling it out', () => {
    // Two paths pulling opposite ways would net to zero and leave the player
    // with no idea which one won.
    const deep = addModifier([], choiceOf('dir_descent'))
    const thenShallow = addModifier(deep, choiceOf('dir_shallows'))
    expect(activeLevelBias(thenShallow)).toBe(-1)
    expect(thenShallow.filter((m) => m.enemyLevelBias !== undefined)).toHaveLength(1)
  })

  it('never lets stacked effects push past what one path can ask for', () => {
    const stacked: ActiveModifier[] = [
      { id: 'a', label: 'a', weightDeltas: {}, enemyLevelBias: 1, movesRemaining: 3 },
      { id: 'b', label: 'b', weightDeltas: {}, enemyLevelBias: 1, movesRemaining: 3 },
      { id: 'c', label: 'c', weightDeltas: {}, enemyLevelBias: 1, movesRemaining: 3 },
    ]
    expect(activeLevelBias(stacked)).toBe(1)
  })

  it('tells the player which way it is pulling', () => {
    const active = addModifier([], choiceOf('dir_shallows'))
    expect(describeModifier(active[0])).toContain('적 레벨')
  })

  it('leaves an ordinary path\'s description alone', () => {
    const plain: ActiveModifier = { id: 'x', label: 'x', weightDeltas: { treasure: 10 }, movesRemaining: 3 }
    expect(describeModifier(plain)).not.toContain('적 레벨')
  })
})

describe('something above your level asks harder questions', () => {
  /**
   * One rng drives both the "does this attack ask for more than one word"
   * gate and "how many more", so a constant cannot exercise both: 0 passes
   * the gate but always takes the smallest extra. This scripts them.
   */
  const scripted = (...values: number[]) => {
    let i = 0
    return () => values[Math.min(i++, values.length - 1)]
  }
  const rngAlways = () => 0 // always takes the branch a chance guards

  it('raises the ceiling on how many words one attack can ask for', () => {
    // Gate passed, then the largest draw — so this is the worst an attack
    // can be rather than the average one.
    const even = defensePromptCount(false, 10, scripted(0, 0.999), 0)
    const outmatched = defensePromptCount(false, 10, scripted(0, 0.999), 1)
    expect(outmatched).toBeGreaterThan(even)
    expect(even).toBe(battleBalance.maxDefensePrompts)
  })

  it('demands more often, not only more', () => {
    // At a coin-flip roll an even fight mostly asks for one word; a fight
    // you are losing mostly asks for more.
    const roll = () => 0.5
    expect(defensePromptCount(false, 10, roll, 0)).toBe(battleBalance.minDefensePrompts)
    expect(defensePromptCount(false, 10, roll, 1)).toBeGreaterThan(battleBalance.minDefensePrompts)
  })

  it('never asks for more words than the run actually has', () => {
    for (const pool of [1, 2, 3]) {
      expect(defensePromptCount(false, pool, rngAlways, 1)).toBeLessThanOrEqual(pool)
    }
  })

  it('asks you to produce the Korean rather than recognise it', () => {
    const world = findWorld('dragon-king-palace')!
    const spells = ['학교', '사랑', '먹다'].map((k, i) => createSpell({ korean: k, english: `w${i}` }))
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)

    const directionsAt = (outmatched: number) => {
      const seen: string[] = []
      for (let i = 0; i < 200; i++) {
        const next = beginEnemyChallenge(battle, spells, 12, Math.random, {}, outmatched)
        if (next.activeChallenge) seen.push(next.activeChallenge.direction)
      }
      return seen.filter((d) => d === 'eng_to_kor').length
    }

    // An even fight always asks the easier way round, as it always has.
    expect(directionsAt(0)).toBe(0)
    expect(directionsAt(1)).toBeGreaterThan(100)
  })

  it('leaves an even or favourable fight exactly as it was', () => {
    const roll = () => 0.5
    expect(defensePromptCount(false, 10, roll, 0)).toBe(defensePromptCount(false, 10, roll))
    expect(defensePromptCount(true, 10, roll, 0)).toBe(defensePromptCount(true, 10, roll))
  })
})

describe('the power curve holds together', () => {
  it('never returns less than 1, whatever nonsense it is handed', () => {
    expect(powerBalance.scale(0)).toBe(1)
    expect(powerBalance.scale(-50)).toBe(1)
  })

  it('rises without ever falling', () => {
    let previous = 0
    for (let level = 1; level <= 500; level++) {
      const here = powerBalance.scale(level)
      expect(here).toBeGreaterThanOrEqual(previous)
      previous = here
    }
  })
})
