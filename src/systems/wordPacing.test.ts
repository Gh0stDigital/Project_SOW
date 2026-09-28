import { describe, expect, it } from 'vitest'
import { drawShares, pickRunWord, wordWeight } from './wordStats'
import { emptyWordStats } from '@/domain/dungeon'
import type { WordRunStats } from '@/domain/dungeon'

const stats = (id: string, o: Partial<WordRunStats> = {}): WordRunStats => ({
  ...emptyWordStats(id),
  ...o,
})
const seen = (id: string, correct = 0, incorrect = 0) =>
  stats(id, { introduced: true, correct, incorrect })

/** A deterministic rng, so a distribution can be counted rather than guessed. */
function lcg(seed = 12345) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('how much of the draw each word holds', () => {
  it('puts a word never met ahead of any word already met', () => {
    // The whole reason for weighting: the last unmet word used to be as
    // likely as any other, so meeting it took as many Moves as the set is
    // long, and the key waits on it.
    expect(wordWeight(undefined)).toBeGreaterThan(wordWeight(seen('a')))
    expect(wordWeight(stats('a'))).toBeGreaterThan(wordWeight(seen('a')))
  })

  it('raises a word each time it is missed', () => {
    expect(wordWeight(seen('a', 0, 1))).toBeGreaterThan(wordWeight(seen('a')))
    expect(wordWeight(seen('a', 0, 2))).toBeGreaterThan(wordWeight(seen('a', 0, 1)))
  })

  it('lowers a word each time it is answered', () => {
    expect(wordWeight(seen('a', 1))).toBeLessThan(wordWeight(seen('a')))
    expect(wordWeight(seen('a', 2))).toBeLessThan(wordWeight(seen('a', 1)))
  })

  it('never drops a known word out of the run, or lets a missed one take it over', () => {
    expect(wordWeight(seen('a', 99))).toBeGreaterThan(0)
    expect(wordWeight(seen('a', 0, 99))).toBeLessThan(wordWeight(undefined) * 2)
  })

  it('damps the word the last prompt used', () => {
    const pool = ['a', 'b']
    const s = { a: seen('a'), b: seen('b') }
    expect(drawShares(pool, s, 'a').a).toBeLessThan(drawShares(pool, s).a)
  })

  it('still lets a missed word come straight back', () => {
    // Damped, not excluded: a word just got wrong is the one most worth
    // asking again, so it stays ahead of the words already known.
    const pool = ['missed', 'known']
    const s = { missed: seen('missed', 0, 1), known: seen('known', 1) }
    const shares = drawShares(pool, s, 'missed')
    expect(shares.missed).toBeGreaterThan(shares.known)
  })
})

describe('answering well brings the unmet words forward', () => {
  const pool = Array.from({ length: 10 }, (_, i) => `w${i}`)
  const withLast = (make: (id: string) => WordRunStats) => {
    const s: Record<string, WordRunStats> = {}
    for (const id of pool.slice(0, 9)) s[id] = make(id)
    // pool[9] is never introduced — the last word the run is waiting on.
    return s
  }

  it('gives the unmet word a bigger share the better the others have gone', () => {
    const allWrong = drawShares(pool, withLast((id) => seen(id, 0, 1))).w9
    const neutral = drawShares(pool, withLast((id) => seen(id))).w9
    const allRight = drawShares(pool, withLast((id) => seen(id, 2))).w9
    expect(allWrong).toBeLessThan(neutral)
    expect(neutral).toBeLessThan(allRight)
  })

  it('finds the last unmet word far sooner than an even draw would', () => {
    // The complaint this exists for: one word left to meet, and it takes
    // forever. An even draw over ten words averages ten draws.
    const s = withLast((id) => seen(id, 1))
    const rng = lcg()
    let total = 0
    const runs = 400
    for (let r = 0; r < runs; r++) {
      let draws = 1
      while (pickRunWord(pool, s, rng) !== 'w9' && draws < 200) draws++
      total += draws
    }
    const average = total / runs
    expect(average).toBeLessThan(4)
  })

  it('still reaches every word in the set', () => {
    const s = withLast((id) => seen(id, 2))
    const rng = lcg(999)
    const hit = new Set<string>()
    for (let i = 0; i < 4000; i++) hit.add(pickRunWord(pool, s, rng)!)
    expect(hit.size).toBe(pool.length)
  })
})

describe('drawing a word at all', () => {
  it('has nothing to draw from an empty pool', () => {
    expect(pickRunWord([], {}, () => 0.5)).toBeNull()
  })

  it('returns the only word there is, damped or not', () => {
    expect(pickRunWord(['a'], { a: seen('a', 5) }, () => 0.99, 'a')).toBe('a')
  })

  it('stays inside the pool when random returns exactly 1', () => {
    expect(['a', 'b']).toContain(pickRunWord(['a', 'b'], {}, () => 1))
  })
})
