import { describe, expect, it } from 'vitest'
import { emptyCounter, keeperSpeech, type CounterState } from './wordShop'

/**
 * What the shopkeeper says, and when.
 *
 * The screen used to explain itself with one fixed paragraph above the box,
 * which said exactly the same thing whether the box was empty, full of good
 * rows, or full of nothing the parser could read. The keeper's job is to say
 * the one thing that is true right now — so these are about ordering and
 * about never going silent, not about the wording.
 */

const counter = (patch: Partial<CounterState> = {}): CounterState => ({
  ...emptyCounter(),
  ...patch,
})

describe('an empty counter is where the instructions live', () => {
  it('greets, and says what to actually do', () => {
    const speech = keeperSpeech(counter())
    expect(speech.mood).toBe('idle')
    expect(speech.hint).toBeTruthy()
    // The two ways in, and the shape of a line. This is the only place the
    // format is spelled out, so it has to be spelled out here.
    expect(speech.hint).toContain('붙여')
    expect(speech.hint).toMatch(/csv/i)
  })
})

describe('reading what was put on the counter', () => {
  it('is pleased by a file that reads cleanly', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 12, hasHeader: true, withExamples: 12 }))
    expect(speech.mood).toBe('pleased')
    expect(speech.line).toContain('12')
  })

  it('says how many were dropped when some cannot be read', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 9, errors: 3 }))
    expect(speech.mood).toBe('reading')
    expect(speech.line).toContain('9')
    expect(speech.line).toContain('3')
  })

  it('leads with the failure when nothing at all reads', () => {
    const speech = keeperSpeech(counter({ hasText: true, errors: 6 }))
    expect(speech.mood).toBe('concerned')
    // The separator is the thing that is actually wrong nine times in ten,
    // so the hint has to carry an example rather than a description.
    expect(speech.hint).toContain('안녕하세요')
  })

  it('distinguishes a file of known words from a file of nonsense', () => {
    const known = keeperSpeech(counter({ hasText: true, duplicates: 5 }))
    expect(known.mood).toBe('concerned')
    expect(known.line).toContain('5')
    expect(known.line).not.toBe(keeperSpeech(counter({ hasText: true, errors: 5 })).line)
  })

  it('offers the repair when a file adds nothing new but fills blanks', () => {
    const speech = keeperSpeech(counter({ hasText: true, fills: 4 }))
    expect(speech.mood).toBe('reading')
    expect(speech.line).toContain('4')
    expect(speech.hint).toContain('건드리지')
  })

  it('mentions skipped words when a file is part new and part known', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 7, duplicates: 2 }))
    expect(speech.line).toContain('7')
    expect(speech.line).toContain('2')
  })

  it('puts unreadable lines ahead of merely known ones', () => {
    // Both are true at once often enough; the one the player can act on is
    // the one that got dropped.
    const speech = keeperSpeech(counter({ hasText: true, ready: 5, errors: 2, duplicates: 4 }))
    expect(speech.line).toContain('2')
  })
})

describe('the hint on a clean file is spent on examples', () => {
  it('suggests a header row when the file has none', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 10, hasHeader: false }))
    expect(speech.hint).toContain('머리글')
  })

  it('points out that no row carries an example', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 0 }))
    expect(speech.hint).toContain('예문')
  })

  it('counts them when only some rows carry one', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 4 }))
    expect(speech.hint).toContain('4')
  })

  it('says nothing is missing when every row has one', () => {
    const speech = keeperSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 10 }))
    expect(speech.hint).toBeTruthy()
    expect(speech.hint).not.toContain('없')
  })
})

describe('after the sale', () => {
  it('reports what went into the ledger', () => {
    const speech = keeperSpeech(counter({ hasText: true, imported: 14 }))
    expect(speech.mood).toBe('done')
    expect(speech.line).toContain('14')
  })

  it('mentions the blanks it filled as well', () => {
    const speech = keeperSpeech(counter({ hasText: true, imported: 14, filled: 3 }))
    expect(speech.line).toContain('14')
    expect(speech.line).toContain('3')
  })

  it('still has something to say when only blanks were filled', () => {
    const speech = keeperSpeech(counter({ hasText: true, imported: 0, filled: 6 }))
    expect(speech.mood).toBe('done')
    expect(speech.line).toContain('6')
  })

  it('outranks whatever is still on the counter', () => {
    // The text stays in the box after a commit, so without this the keeper
    // would go back to describing a file that has already been taken.
    const speech = keeperSpeech(counter({ hasText: true, ready: 9, errors: 4, imported: 9 }))
    expect(speech.mood).toBe('done')
  })
})

describe('the keeper is never silent', () => {
  it('has a line for every combination the counter can reach', () => {
    const counts = [0, 1, 5]
    for (const hasText of [false, true]) {
      for (const ready of counts) {
        for (const fills of counts) {
          for (const duplicates of counts) {
            for (const errors of counts) {
              for (const imported of [null, 0, 3]) {
                const speech = keeperSpeech(
                  counter({ hasText, ready, fills, duplicates, errors, imported }),
                )
                expect(speech.line.length, JSON.stringify({ hasText, ready, fills, duplicates, errors, imported }))
                  .toBeGreaterThan(0)
                expect(['idle', 'reading', 'concerned', 'pleased', 'done']).toContain(speech.mood)
              }
            }
          }
        }
      }
    }
  })
})
