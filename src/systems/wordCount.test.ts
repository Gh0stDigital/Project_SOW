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
  startDungeon,
  wordsNeededForKey,
} from './dungeonSession'

/**
 * What the size of your word list decides.
 *
 * It used to decide how long you were there. The Key Room waited on every
 * word in the pool being met and the boss barrier charged one correct answer
 * per word, while nothing paid a penny more for the extra half hour — so ten
 * words was a short run and fifty was the same run stretched. With no floor
 * either, a one-word set bought an instant key, a one-answer barrier and the
 * tier's full rewards, which made the shortest possible run the best-paying
 * one.
 *
 * Both gates are fixed per tier now, so the list decides *variety* instead:
 * a small set drills the same words over and over, a large one sweeps
 * across many, and both runs take about the same time.
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

describe('the key waits on a fixed number of words, not on all of them', () => {
  it('asks the tier\'s number however many words were brought', () => {
    for (const tier of dungeonTiers) {
      const small = runWith(tier.wordsToOpenKeyRoom, tier.id)
      const large = runWith(tier.wordLimit, tier.id)
      expect(wordsNeededForKey(small)).toBe(tier.wordsToOpenKeyRoom)
      expect(wordsNeededForKey(large)).toBe(tier.wordsToOpenKeyRoom)
    }
  })

  it('opens the Key Room once that many are met, with plenty still unmet', () => {
    const tier = tierOf('tier50')
    const run = runWith(tier.wordLimit, 'tier50')
    const justShort = introduce(run, tier.wordsToOpenKeyRoom - 1)
    expect(justShort.keyRoomUnlocked).toBe(false)

    const enough = introduce(run, tier.wordsToOpenKeyRoom)
    expect(enough.keyRoomUnlocked).toBe(true)
    // The point of the change: most of the set is still unseen and the run
    // is free to end anyway.
    expect(introducedCount(enough)).toBeLessThan(enough.config.dungeonWordIds.length)
  })

  it('makes a big list no longer to finish than a small one', () => {
    const tier = tierOf('tier50')
    const small = introduce(runWith(tier.wordsToOpenKeyRoom, 'tier50'), tier.wordsToOpenKeyRoom)
    const large = introduce(runWith(tier.wordLimit, 'tier50'), tier.wordsToOpenKeyRoom)
    expect(small.keyRoomUnlocked).toBe(true)
    expect(large.keyRoomUnlocked).toBe(true)
  })

  it('never asks for more words than the run actually holds', () => {
    // A saved selection, or a set the player emptied after choosing it,
    // must not leave a run with a key that can never appear.
    const undersized = runWith(3, 'tier50')
    expect(wordsNeededForKey(undersized)).toBe(3)
    expect(introduce(undersized, 3).keyRoomUnlocked).toBe(true)
  })

  it('never asks for none at all', () => {
    expect(wordsNeededForKey(runWith(1))).toBe(1)
  })
})

describe('the boss barrier is a fixed size too', () => {
  it('asks the tier\'s number rather than one per word in the pool', () => {
    for (const tier of dungeonTiers) {
      const run = runWith(tier.wordLimit, tier.id)
      expect(barrierWordCount(run)).toBe(tier.barrierWords)
      expect(barrierWordCount(run)).toBeLessThan(run.config.dungeonWordIds.length)
    }
  })

  it('stops the deepest dungeon demanding fifty right answers before the boss', () => {
    const run = runWith(50, 'tier50')
    expect(pickBarrierWords(run)).toHaveLength(tierOf('tier50').barrierWords)
  })

  it('draws only words the run has actually taught', () => {
    const tier = tierOf('tier50')
    const run = introduce(runWith(tier.wordLimit, 'tier50'), tier.wordsToOpenKeyRoom)
    const met = new Set(run.config.dungeonWordIds.filter((id) => run.wordStats[id]?.introduced))
    // With a big set and a fixed barrier, a blind draw would demand words
    // the dungeon never showed — which is a question about vocabulary the
    // run never offered to teach.
    for (const id of pickBarrierWords(run)) expect(met.has(id)).toBe(true)
  })

  it('falls back to unmet words rather than returning a short barrier', () => {
    const run = introduce(runWith(10, 'tier10'), 1)
    expect(pickBarrierWords(run)).toHaveLength(tierOf('tier10').barrierWords)
  })

  it('picks distinct words', () => {
    const run = introduce(runWith(25, 'tier25'), 12)
    const picked = pickBarrierWords(run)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('never asks for more than the pool holds', () => {
    const run = introduce(runWith(2, 'tier50'), 2)
    expect(pickBarrierWords(run)).toHaveLength(2)
  })
})

describe('a set has to be big enough to carry a run', () => {
  it('asks for exactly what the key needs', () => {
    for (const tier of dungeonTiers) {
      expect(minimumSetSize(tier)).toBe(tier.wordsToOpenKeyRoom)
    }
  })

  it('leaves no tier where the minimum cannot open its own key', () => {
    // The floor has to be at least the key requirement, or a set that
    // passes the check still strands the run.
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

  it('keeps a deeper tier asking for more words than a shallower one', () => {
    for (let i = 1; i < dungeonTiers.length; i++) {
      expect(dungeonTiers[i].wordsToOpenKeyRoom).toBeGreaterThan(dungeonTiers[i - 1].wordsToOpenKeyRoom)
      expect(dungeonTiers[i].barrierWords).toBeGreaterThan(dungeonTiers[i - 1].barrierWords)
    }
  })

  it('never asks for more words than the tier will even draw on', () => {
    for (const tier of dungeonTiers) {
      expect(tier.wordsToOpenKeyRoom).toBeLessThanOrEqual(tier.wordLimit)
    }
  })
})

describe('bringing more words changes the mix, not the length', () => {
  it('draws on more of a larger set while asking the same of the run', () => {
    const tier = tierOf('tier25')
    const drill = runWith(tier.wordsToOpenKeyRoom, 'tier25')
    const review = runWith(tier.wordLimit, 'tier25')
    // The wide set genuinely puts more words in play...
    expect(review.config.dungeonWordIds.length).toBeGreaterThan(drill.config.dungeonWordIds.length)
    // ...without asking for more before the run can end.
    expect(wordsNeededForKey(review)).toBe(wordsNeededForKey(drill))
    expect(barrierWordCount(review)).toBe(barrierWordCount(drill))
  })

  it('still caps what a single run will draw on', () => {
    const run = runWith(500, 'tier10')
    expect(run.config.dungeonWordIds).toHaveLength(tierOf('tier10').wordLimit)
  })
})
