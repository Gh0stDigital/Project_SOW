import { describe, expect, it } from 'vitest'
import type { SpellSet } from '@/domain/spellSet'
import {
  createSpellSet,
  mergedCount,
  mergedName,
  mergedSpellIds,
  reachableWordCount,
} from './spellSetManager'
import { deepestTierForSize, dungeonTiers, minimumSetSize } from '@/config/balance'
import { keeperSpeech } from './wordShop'

/**
 * Combining sets into a new one.
 *
 * A tier asks for a set of its full size, and somebody who studies in
 * topic-sized bundles has the words already — just not in one pile. Without
 * this the only way into a deeper dungeon is to hand-build a fifty-word set
 * or to re-import vocabulary they have already trained, which is busywork
 * over words they know.
 */

function sets(spec: Record<string, string[]>): SpellSet[] {
  let out: SpellSet[] = []
  for (const [name, ids] of Object.entries(spec)) out = createSpellSet(out, name, ids)
  return out
}

const idOf = (all: SpellSet[], name: string) => all.find((s) => s.name === name)!.id

describe('merging', () => {
  it('lays the parts end to end', () => {
    const all = sets({ 동사: ['a', 'b'], 음식: ['c', 'd'] })
    expect(mergedSpellIds(all, [idOf(all, '동사'), idOf(all, '음식')])).toEqual(['a', 'b', 'c', 'd'])
  })

  it('follows the order the sets were picked in', () => {
    const all = sets({ 동사: ['a', 'b'], 음식: ['c', 'd'] })
    expect(mergedSpellIds(all, [idOf(all, '음식'), idOf(all, '동사')])).toEqual(['c', 'd', 'a', 'b'])
  })

  it('counts a word held by two sets once', () => {
    // The number people are surprised by: two 25s that overlap do not make
    // 50, which is why the screen shows the total rather than the sum.
    const all = sets({ 동사: ['a', 'b', 'c'], 음식: ['c', 'd'] })
    const picked = [idOf(all, '동사'), idOf(all, '음식')]
    expect(mergedSpellIds(all, picked)).toEqual(['a', 'b', 'c', 'd'])
    expect(mergedCount(all, picked)).toBe(4)
  })

  it('keeps a repeated word where it first appeared', () => {
    const all = sets({ 동사: ['a', 'b'], 음식: ['b', 'c'] })
    expect(mergedSpellIds(all, [idOf(all, '동사'), idOf(all, '음식')])).toEqual(['a', 'b', 'c'])
  })

  it('ignores a set id that names nothing', () => {
    const all = sets({ 동사: ['a'] })
    expect(mergedSpellIds(all, [idOf(all, '동사'), 'set_gone'])).toEqual(['a'])
  })

  it('merges nothing into nothing rather than throwing', () => {
    expect(mergedSpellIds(sets({}), [])).toEqual([])
    expect(mergedCount(sets({ 동사: ['a'] }), [])).toBe(0)
  })

  it('leaves the sets it read exactly as they were', () => {
    const all = sets({ 동사: ['a', 'b'], 음식: ['b', 'c'] })
    const before = JSON.stringify(all)
    mergedSpellIds(all, all.map((s) => s.id))
    expect(JSON.stringify(all)).toBe(before)
  })
})

describe('naming the result', () => {
  it('joins the parts', () => {
    const all = sets({ 동사: ['a'], 음식: ['b'] })
    expect(mergedName(all, [idOf(all, '동사'), idOf(all, '음식')])).toBe('동사 + 음식')
  })

  it('counts the rest once there are too many to read', () => {
    const all = sets({ 하나: ['a'], 둘: ['b'], 셋: ['c'], 넷: ['d'], 다섯: ['e'] })
    expect(mergedName(all, all.map((s) => s.id))).toBe('하나 + 둘 + 셋 외 2개')
  })

  it('has nothing to say about nothing', () => {
    expect(mergedName(sets({}), [])).toBe('')
  })
})

describe('what the bag could ever reach', () => {
  it('is every distinct word across every set', () => {
    const all = sets({ 동사: ['a', 'b'], 음식: ['b', 'c'], 색: ['d'] })
    expect(reachableWordCount(all)).toBe(4)
  })

  it('tells "pick more" apart from "you do not own enough"', () => {
    // The distinction the whole screen turns on: one is more ticking, the
    // other is a trip to the word shop.
    const small = sets({ 동사: ['a', 'b'], 음식: ['c'] })
    const tier25 = minimumSetSize(dungeonTiers[1])
    expect(reachableWordCount(small)).toBeLessThan(tier25)

    const plenty = sets({
      동사: Array.from({ length: 20 }, (_, i) => `v${i}`),
      음식: Array.from({ length: 20 }, (_, i) => `f${i}`),
    })
    expect(reachableWordCount(plenty)).toBeGreaterThanOrEqual(tier25)
  })

  it('is zero for a player with no sets at all', () => {
    expect(reachableWordCount(sets({}))).toBe(0)
  })
})

describe('what a set of this size can carry', () => {
  it('names the deepest tier it reaches', () => {
    for (const tier of dungeonTiers) {
      expect(deepestTierForSize(minimumSetSize(tier))?.id).toBe(tier.id)
    }
  })

  it('answers nothing below the shallowest floor', () => {
    expect(deepestTierForSize(minimumSetSize(dungeonTiers[0]) - 1)).toBeNull()
    expect(deepestTierForSize(0)).toBeNull()
  })

  it('does not call a tier-25 set deficient just because tier 50 exists', () => {
    const tier25 = minimumSetSize(dungeonTiers[1])
    expect(deepestTierForSize(tier25)?.id).toBe('tier25')
    expect(deepestTierForSize(tier25 + 1)?.id).toBe('tier25')
  })

  it('tops out at the deepest tier, however many words are brought', () => {
    expect(deepestTierForSize(10_000)?.id).toBe(dungeonTiers[dungeonTiers.length - 1].id)
  })
})

describe('what the keeper says while merging', () => {
  const speak = (picked: number, total: number, reachable: number, wanted = 25) =>
    keeperSpeech({ at: 'merge', picked, total, reachable, wanted })

  it('sends you for more words when no combination can reach it', () => {
    const said = speak(2, 12, 12, 25)
    expect(said.mood).toBe('concerned')
    expect(said.line).toContain('12')
    expect(said.hint).toContain('들여오셔야')
  })

  it('says that before anything about ticking more boxes', () => {
    // Priority matters: a player told "pick another" when no combination
    // can work will sit there trying them all.
    expect(speak(0, 0, 5, 25).mood).toBe('concerned')
  })

  it('asks for a second bundle when only one is ticked', () => {
    expect(speak(1, 10, 99, 25).line).toContain('하나만')
  })

  it('counts down what is still missing', () => {
    expect(speak(2, 18, 99, 25).line).toContain('7개가 더 필요')
  })

  it('says when it is enough', () => {
    const said = speak(3, 26, 99, 25)
    expect(said.mood).toBe('pleased')
    expect(said.line).toContain('26')
  })

  it('warns about the overlap, since that is what makes the count surprising', () => {
    expect(speak(2, 18, 99, 25).hint).toContain('겹치면')
  })
})
