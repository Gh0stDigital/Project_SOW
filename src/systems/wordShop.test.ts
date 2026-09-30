import { describe, expect, it } from 'vitest'
import { counterSpeech, keeperSpeech, emptyCounter, type CompendiumPlace, type CounterState } from './wordShop'

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
    const speech = counterSpeech(counter())
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
    const speech = counterSpeech(counter({ hasText: true, ready: 12, hasHeader: true, withExamples: 12 }))
    expect(speech.mood).toBe('pleased')
    expect(speech.line).toContain('12')
  })

  it('says how many were dropped when some cannot be read', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 9, errors: 3 }))
    expect(speech.mood).toBe('reading')
    expect(speech.line).toContain('9')
    expect(speech.line).toContain('3')
  })

  it('leads with the failure when nothing at all reads', () => {
    const speech = counterSpeech(counter({ hasText: true, errors: 6 }))
    expect(speech.mood).toBe('concerned')
    // The separator is the thing that is actually wrong nine times in ten,
    // so the hint has to carry an example rather than a description.
    expect(speech.hint).toContain('안녕하세요')
  })

  it('distinguishes a file of known words from a file of nonsense', () => {
    const known = counterSpeech(counter({ hasText: true, duplicates: 5 }))
    expect(known.mood).toBe('concerned')
    expect(known.line).toContain('5')
    expect(known.line).not.toBe(counterSpeech(counter({ hasText: true, errors: 5 })).line)
  })

  it('offers the repair when a file adds nothing new but fills blanks', () => {
    const speech = counterSpeech(counter({ hasText: true, fills: 4 }))
    expect(speech.mood).toBe('reading')
    expect(speech.line).toContain('4')
    expect(speech.hint).toContain('건드리지')
  })

  it('mentions skipped words when a file is part new and part known', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 7, duplicates: 2 }))
    expect(speech.line).toContain('7')
    expect(speech.line).toContain('2')
  })

  it('puts unreadable lines ahead of merely known ones', () => {
    // Both are true at once often enough; the one the player can act on is
    // the one that got dropped.
    const speech = counterSpeech(counter({ hasText: true, ready: 5, errors: 2, duplicates: 4 }))
    expect(speech.line).toContain('2')
  })
})

describe('the hint on a clean file is spent on examples', () => {
  it('suggests a header row when the file has none', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 10, hasHeader: false }))
    expect(speech.hint).toContain('머리글')
  })

  it('points out that no row carries an example', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 0 }))
    expect(speech.hint).toContain('예문')
  })

  it('counts them when only some rows carry one', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 4 }))
    expect(speech.hint).toContain('4')
  })

  it('says nothing is missing when every row has one', () => {
    const speech = counterSpeech(counter({ hasText: true, ready: 10, hasHeader: true, withExamples: 10 }))
    expect(speech.hint).toBeTruthy()
    expect(speech.hint).not.toContain('없')
  })
})

describe('after the sale', () => {
  it('reports what went into the ledger', () => {
    const speech = counterSpeech(counter({ hasText: true, imported: 14 }))
    expect(speech.mood).toBe('done')
    expect(speech.line).toContain('14')
  })

  it('mentions the blanks it filled as well', () => {
    const speech = counterSpeech(counter({ hasText: true, imported: 14, filled: 3 }))
    expect(speech.line).toContain('14')
    expect(speech.line).toContain('3')
  })

  it('still has something to say when only blanks were filled', () => {
    const speech = counterSpeech(counter({ hasText: true, imported: 0, filled: 6 }))
    expect(speech.mood).toBe('done')
    expect(speech.line).toContain('6')
  })

  it('outranks whatever is still on the counter', () => {
    // The text stays in the box after a commit, so without this the keeper
    // would go back to describing a file that has already been taken.
    const speech = counterSpeech(counter({ hasText: true, ready: 9, errors: 4, imported: 9 }))
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
                const where = { hasText, ready, fills, duplicates, errors, imported }
                const speech = counterSpeech(counter(where))
                expect(speech.line.length, JSON.stringify(where)).toBeGreaterThan(0)
                expect(['idle', 'reading', 'concerned', 'pleased', 'done']).toContain(speech.mood)
              }
            }
          }
        }
      }
    }
  })

  it('has a line in every room of the Compendium', () => {
    // The point of a closed set of places: adding a room to the Compendium
    // should force a line to go with it rather than silently inheriting
    // somebody else's.
    const places: CompendiumPlace[] = []
    for (const total of [0, 1, 20]) {
      for (const shown of [0, 1, 20]) {
        for (const searching of [false, true]) {
          for (const withoutExample of [0, 1, 20]) {
            places.push({ at: 'words', total, shown, searching, withoutExample })
          }
        }
      }
    }
    for (const sets of [0, 1, 6]) {
      for (const belowMinimum of [0, 1, 6]) {
        places.push({ at: 'sets', sets, belowMinimum, minimumForDungeon: 8 })
      }
    }
    for (const isNew of [false, true]) {
      for (const hasHeadword of [false, true]) {
        for (const hasMeaning of [false, true]) {
          for (const hasExample of [false, true]) {
            places.push({ at: 'editor', isNew, hasHeadword, hasMeaning, hasExample })
          }
        }
      }
    }
    for (const picked of [0, 3, 8, 40]) {
      for (const available of [0, 50]) {
        for (const isNew of [false, true]) {
          places.push({ at: 'setEditor', picked, available, minimumForDungeon: 8, isNew })
        }
      }
    }
    places.push({ at: 'shop', counter: counter() })

    for (const place of places) {
      const speech = keeperSpeech(place)
      expect(speech.line.length, JSON.stringify(place)).toBeGreaterThan(0)
      expect(['idle', 'reading', 'concerned', 'pleased', 'done']).toContain(speech.mood)
    }
  })
})

describe('among the shelves', () => {
  it('sends an empty Compendium to the shop', () => {
    const speech = keeperSpeech({ at: 'words', total: 0, shown: 0, searching: false, withoutExample: 0 })
    expect(speech.mood).toBe('idle')
    expect(speech.hint).toContain('상점')
  })

  it('counts what a search turned up', () => {
    const speech = keeperSpeech({ at: 'words', total: 40, shown: 3, searching: true, withoutExample: 0 })
    expect(speech.line).toContain('3')
  })

  it('says so when a search finds nothing, and how else to look', () => {
    const speech = keeperSpeech({ at: 'words', total: 40, shown: 0, searching: true, withoutExample: 0 })
    expect(speech.mood).toBe('concerned')
    expect(speech.hint).toContain('뜻')
  })

  it('points at the words missing an example, and says why it matters', () => {
    const speech = keeperSpeech({ at: 'words', total: 40, shown: 40, searching: false, withoutExample: 12 })
    expect(speech.line).toContain('40')
    expect(speech.hint).toContain('12')
    expect(speech.hint).toContain('던전')
  })

  it('is pleased when every word carries one', () => {
    const speech = keeperSpeech({ at: 'words', total: 40, shown: 40, searching: false, withoutExample: 0 })
    expect(speech.mood).toBe('pleased')
  })
})

describe('among the bundles', () => {
  it('explains what a set is for when there are none', () => {
    const speech = keeperSpeech({ at: 'sets', sets: 0, belowMinimum: 0, minimumForDungeon: 8 })
    expect(speech.mood).toBe('idle')
    expect(speech.hint).toContain('8')
  })

  it('names how many sets are too small to take anywhere', () => {
    const speech = keeperSpeech({ at: 'sets', sets: 5, belowMinimum: 2, minimumForDungeon: 8 })
    expect(speech.mood).toBe('concerned')
    expect(speech.line).toContain('2')
    expect(speech.hint).toContain('8')
  })

  it('is pleased when every set could be taken into a dungeon', () => {
    const speech = keeperSpeech({ at: 'sets', sets: 5, belowMinimum: 0, minimumForDungeon: 8 })
    expect(speech.mood).toBe('pleased')
  })
})

describe('at the writing desk', () => {
  const desk = (patch: Partial<Extract<CompendiumPlace, { at: 'editor' }>> = {}) =>
    keeperSpeech({ at: 'editor', isNew: true, hasHeadword: false, hasMeaning: false, hasExample: false, ...patch })

  it('says up front what the two required fields are', () => {
    // This used to be discoverable only by pressing save and being refused.
    expect(desk().hint).toContain('뜻')
    expect(desk().mood).toBe('idle')
  })

  it('names whichever half is still missing', () => {
    expect(desk({ hasHeadword: true }).line).toContain('뜻')
    expect(desk({ hasMeaning: true }).line).toContain('한국어')
    expect(desk({ hasHeadword: true }).mood).toBe('concerned')
  })

  it('stops nagging once the entry could be saved', () => {
    const ready = desk({ hasHeadword: true, hasMeaning: true })
    expect(ready.mood).toBe('reading')
    expect(ready.hint).toContain('예문')
  })

  it('is pleased by an entry that carries its example', () => {
    expect(desk({ hasHeadword: true, hasMeaning: true, hasExample: true }).mood).toBe('pleased')
  })
})

describe('at the bundling bench', () => {
  const bench = (picked: number, available = 50) =>
    keeperSpeech({ at: 'setEditor', picked, available, minimumForDungeon: 8, isNew: true })

  it('sends you to fill the shelves first when there is nothing to bundle', () => {
    expect(bench(0, 0).mood).toBe('concerned')
  })

  it('states the floor before anything has been picked', () => {
    expect(bench(0).hint).toContain('8')
  })

  it('counts how many more are needed', () => {
    const speech = bench(3)
    expect(speech.mood).toBe('concerned')
    expect(speech.line).toContain('5')
  })

  it('confirms the set is usable, and only then explains the trade-off', () => {
    const speech = bench(20)
    expect(speech.mood).toBe('pleased')
    // Said once it is usable rather than at the start, where it would be one
    // more rule to read before anything had been chosen.
    expect(speech.hint).toContain('골고루')
  })
})
