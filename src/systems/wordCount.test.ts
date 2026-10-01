import { describe, expect, it } from 'vitest'
import type { DungeonRunState } from '@/domain/dungeon'
import { introducedCount } from '@/domain/dungeon'
import { dungeonTiers, minimumSetSize, type DungeonTierId } from '@/config/balance'
import { findWorld } from './worldRegistry'
import {
  barrierWordCount,
  buildDungeonConfig,
  markWordIntroduced,
  pickBarrierWords,
  recordWordAttempt,
  startDungeon,
  wordsNeededForKey,
} from './dungeonSession'

/**
 * What the size of your word list decides: nothing. The tier decides.
 *
 * Three numbers used to be in play — how many words the run drew on, how
 * many it had to teach before the key, and how few a set could get away with
 * bringing — and the gaps between them were the problem. A tier-50 run
 * taught sixteen of its fifty and handed over the key; a set only had to
 * clear that lower bar, so the thinnest qualifying set was strictly the best
 * play, because nothing paid a penny more for a longer run.
 *
 * They are one number now. A set must carry the tier's full count, and the
 * key waits until every one of those words has been met at least once. So
 * the tier's name is the honest length of the run, and the only decision
 * left is which tier to walk into.
 */

const tierOf = (id: DungeonTierId) => dungeonTiers.find((t) => t.id === id)!

function runWith(wordCount: number, tierId: DungeonTierId = 'tier10'): DungeonRunState {
  const ids = Array.from({ length: wordCount }, (_, i) => `spell_${i}`)
  const config = buildDungeonConfig('totem', 'set', 'set', ids, tierOf(tierId), findWorld('dragon-king-palace')!.id)
  return startDungeon(config)
}

/** Meets `count` of the run's words, as the dungeon does as it teaches them. */
function introduce(run: DungeonRunState, count: number): DungeonRunState {
  let next = run
  for (const id of run.config.dungeonWordIds.slice(0, count)) next = markWordIntroduced(next, id)
  return next
}

/** Answers one of the run's words, right or wrong, `times` over. */
function answer(run: DungeonRunState, id: string, correct: boolean, times = 1): DungeonRunState {
  let next = run
  for (let i = 0; i < times; i++) next = recordWordAttempt(next, id, 'defense', correct)
  return next
}

describe('the key waits on the whole pool', () => {
  it('asks for every word the run drew', () => {
    for (const tier of dungeonTiers) {
      const run = runWith(tier.wordLimit, tier.id)
      expect(wordsNeededForKey(run)).toBe(tier.wordLimit)
      expect(wordsNeededForKey(run)).toBe(run.config.dungeonWordIds.length)
    }
  })

  it('stays shut while a single word is still unmet', () => {
    const tier = tierOf('tier50')
    const run = runWith(tier.wordLimit, 'tier50')
    const allButOne = introduce(run, tier.wordLimit - 1)
    expect(allButOne.keyRoomUnlocked).toBe(false)
    expect(introducedCount(allButOne)).toBe(tier.wordLimit - 1)

    const complete = introduce(run, tier.wordLimit)
    expect(complete.keyRoomUnlocked).toBe(true)
    // The point of the change: nothing in the pool goes untaught.
    expect(introducedCount(complete)).toBe(complete.config.dungeonWordIds.length)
  })

  it('makes a deeper tier a longer run, which is what its name says', () => {
    const lengths = dungeonTiers.map((t) => wordsNeededForKey(runWith(t.wordLimit, t.id)))
    for (let i = 1; i < lengths.length; i++) expect(lengths[i]).toBeGreaterThan(lengths[i - 1])
    expect(lengths).toEqual(dungeonTiers.map((t) => t.wordLimit))
  })

  it('never asks for more words than the run actually holds', () => {
    // The dungeon screen refuses an undersized set, so this is a guard for a
    // saved selection or a set emptied after it was chosen — such a run must
    // still be finishable rather than hold a key that can never appear.
    const undersized = runWith(3, 'tier50')
    expect(wordsNeededForKey(undersized)).toBe(3)
    expect(introduce(undersized, 3).keyRoomUnlocked).toBe(true)
  })

  it('never asks for none at all', () => {
    expect(wordsNeededForKey(runWith(1))).toBe(1)
  })
})

describe('a set must carry the tier', () => {
  it('asks for the tier\'s full count, not some lower bar', () => {
    for (const tier of dungeonTiers) {
      expect(minimumSetSize(tier)).toBe(tier.wordLimit)
    }
  })

  it('leaves no tier whose own minimum cannot open its key', () => {
    for (const tier of dungeonTiers) {
      const run = runWith(minimumSetSize(tier), tier.id)
      expect(introduce(run, minimumSetSize(tier)).keyRoomUnlocked).toBe(true)
    }
  })

  it('leaves room for the barrier inside the minimum set', () => {
    for (const tier of dungeonTiers) {
      expect(tier.barrierWords).toBeLessThanOrEqual(minimumSetSize(tier))
    }
  })

  it('keeps a deeper tier asking for more words and a bigger barrier', () => {
    for (let i = 1; i < dungeonTiers.length; i++) {
      expect(dungeonTiers[i].wordLimit).toBeGreaterThan(dungeonTiers[i - 1].wordLimit)
      expect(dungeonTiers[i].barrierWords).toBeGreaterThan(dungeonTiers[i - 1].barrierWords)
    }
  })
})

describe('the boss barrier is a fixed size', () => {
  it('asks the tier\'s number rather than one per word in the pool', () => {
    for (const tier of dungeonTiers) {
      const run = runWith(tier.wordLimit, tier.id)
      expect(barrierWordCount(run)).toBe(tier.barrierWords)
      expect(barrierWordCount(run)).toBeLessThan(run.config.dungeonWordIds.length)
    }
  })

  it('stops the deepest dungeon demanding fifty right answers before the boss', () => {
    expect(pickBarrierWords(runWith(50, 'tier50'))).toHaveLength(tierOf('tier50').barrierWords)
  })

  it('picks distinct words', () => {
    const run = introduce(runWith(25, 'tier25'), 25)
    const picked = pickBarrierWords(run)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('never asks for more than the pool holds', () => {
    expect(pickBarrierWords(introduce(runWith(2, 'tier50'), 2))).toHaveLength(2)
  })
})

describe('the barrier is made of what the run went worst', () => {
  /** A tier-10 run with every word met, so only performance separates them. */
  function taught(): DungeonRunState {
    return introduce(runWith(10, 'tier10'), 10)
  }

  it('leads with the word missed most often', () => {
    let run = taught()
    run = answer(run, 'spell_7', false, 4)
    run = answer(run, 'spell_3', false, 2)
    run = answer(run, 'spell_1', false, 1)
    for (const id of ['spell_0', 'spell_2', 'spell_4', 'spell_5']) run = answer(run, id, true, 3)

    expect(pickBarrierWords(run).slice(0, 3)).toEqual(['spell_7', 'spell_3', 'spell_1'])
  })

  it('counts a word missed as often as answered as struggled with', () => {
    let run = taught()
    run = answer(run, 'spell_2', true, 2)
    run = answer(run, 'spell_2', false, 2) // even — still a word you do not have
    run = answer(run, 'spell_8', true, 5)
    const picked = pickBarrierWords(run)
    expect(picked[0]).toBe('spell_2')
    // The barrier is four words and ranks the untested ones above a word
    // answered right five times, so the known one does not make it at all.
    expect(picked).not.toContain('spell_8')
  })

  it('puts a word only ever seen above one answered right repeatedly', () => {
    // Seen in a Magic Room and never produced is a weaker claim to knowing
    // it than three right answers, so the barrier wants it first.
    let run = runWith(10, 'tier10')
    run = markWordIntroduced(run, 'spell_4')
    for (const id of ['spell_0', 'spell_1', 'spell_2']) run = answer(run, id, true, 3)
    const picked = pickBarrierWords(run)
    expect(picked.indexOf('spell_4')).toBeLessThan(picked.indexOf('spell_0'))
  })

  it('ranks a clean run by accuracy, then by how little it was practised', () => {
    // Every word answered and every one mostly right, so nothing is
    // struggled with and nothing is merely seen — only this tier is in play.
    let run = taught()
    for (const id of run.config.dungeonWordIds) run = answer(run, id, true, 4)
    run = answer(run, 'spell_0', false, 1) // 4/5 — the lowest accuracy
    run = answer(run, 'spell_2', true, 2) // 6/4... still 100%, but most practised

    const picked = pickBarrierWords(run)
    // Lowest accuracy leads; among the rest, the least practised comes first
    // and the most practised is the last word the barrier would ever want.
    expect(picked[0]).toBe('spell_0')
    expect(picked).not.toContain('spell_2')
  })

  it('still fills a barrier for a run that got everything right', () => {
    let run = taught()
    for (const id of run.config.dungeonWordIds) run = answer(run, id, true, 2)
    const picked = pickBarrierWords(run)
    expect(picked).toHaveLength(tierOf('tier10').barrierWords)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('backs onto words the run never met rather than returning a short barrier', () => {
    const run = introduce(runWith(10, 'tier10'), 1)
    expect(pickBarrierWords(run)).toHaveLength(tierOf('tier10').barrierWords)
  })

  it('prefers any word the run touched over one it never met', () => {
    let run = runWith(10, 'tier10')
    run = answer(run, 'spell_9', true, 9)
    // spell_9 went perfectly, but it is the only word with any record at
    // all — a barrier would rather ask it than a word never shown.
    expect(pickBarrierWords(run)[0]).toBe('spell_9')
  })

  it('reads the run rather than the tier: same dungeon, different barriers', () => {
    let a = taught()
    let b = taught()
    a = answer(a, 'spell_1', false, 3)
    b = answer(b, 'spell_6', false, 3)
    expect(pickBarrierWords(a)[0]).toBe('spell_1')
    expect(pickBarrierWords(b)[0]).toBe('spell_6')
  })
})
