import { describe, expect, it } from 'vitest'
import { buildDungeonConfig, generateNextEvent, startDungeon } from './dungeonSession'
import { recordAttempt } from './wordStats'
import { createSpell } from './spellFactory'
import { dungeonTiers } from '@/config/balance'
import { playableWorlds } from './worldRegistry'

/**
 * The two rules that shape a run's rhythm, checked through the function a
 * Move actually calls rather than through the roller underneath it — the
 * wiring between the run's state and the roll is the part that breaks.
 */

const tier = dungeonTiers[0]
const worldId = playableWorlds()[0]?.id ?? 'dkp'

function lcg(seed = 4242) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

function freshRun(words: number) {
  const spells = Array.from({ length: words }, (_, i) =>
    createSpell({ korean: `단어${i}`, english: `word${i}` }),
  )
  const config = buildDungeonConfig('t', 's', 's', spells.map((s) => s.id), tier, worldId, 'normal', lcg())
  return { run: startDungeon(config), spells }
}

describe('a rest area already found', () => {
  it('never comes up again as an event', () => {
    const { run, spells } = freshRun(6)
    const rng = lcg()
    let current = { ...run, restAreaFound: true }
    const types: string[] = []
    for (let i = 0; i < 400; i++) {
      const next = generateNextEvent(current, spells, rng)
      types.push(next.run.currentEvent!.type)
      current = { ...next.run, restAreaFound: true }
    }
    expect(types).not.toContain('rest')
    // Still rolling a real spread rather than one type forever.
    expect(new Set(types).size).toBeGreaterThan(2)
  })

  it('does come up before it has been found', () => {
    const { run, spells } = freshRun(6)
    const rng = lcg()
    let current = run
    const types: string[] = []
    for (let i = 0; i < 400; i++) {
      const next = generateNextEvent(current, spells, rng)
      types.push(next.run.currentEvent!.type)
      // Deliberately not marking it found, so it stays in the table.
      current = { ...next.run, restAreaFound: false }
    }
    expect(types).toContain('rest')
  })
})

describe('meeting the last word of the set', () => {
  /**
   * Plays a run, answering every prompt the same way, until every word has
   * been met. Counts both moves and the prompts among them that actually
   * asked about a word — about half of moves do, the rest being battles,
   * forks and doors, so the prompts are the number that says anything about
   * the draw itself.
   */
  function toMeetEveryWord(words: number, correct: boolean, seed: number) {
    const { run, spells } = freshRun(words)
    const rng = lcg(seed * 31)
    let current = run
    let moves = 0
    let prompts = 0
    while (moves < 600) {
      moves++
      const next = generateNextEvent(current, spells, rng)
      current = next.run
      const spellId = current.currentEvent?.challenge?.spellId
      if (spellId) {
        prompts++
        current = { ...current, wordStats: recordAttempt(current.wordStats, spellId, 'event', correct) }
      }
      if (current.config.dungeonWordIds.every((id) => current.wordStats[id]?.introduced)) break
    }
    return { moves, prompts }
  }

  const seeds = Array.from({ length: 16 }, (_, i) => i + 1)
  const mean = (words: number, correct: boolean, of: 'moves' | 'prompts') =>
    seeds.map((s) => toMeetEveryWord(words, correct, s)[of]).reduce((a, b) => a + b, 0) / seeds.length

  /** Draws an even pick needs to see all n of something, 12 x H(12) ~= 37.2. */
  const couponCollector = (n: number) =>
    n * Array.from({ length: n }, (_, i) => 1 / (i + 1)).reduce((a, b) => a + b, 0)

  it('meets every word in far fewer prompts than an even draw would need', () => {
    // The complaint this exists for: one word left to meet and it takes
    // forever, with the key waiting on it. Measured against the even draw's
    // own number rather than a figure picked out of the air.
    const even = couponCollector(12)
    expect(mean(12, true, 'prompts')).toBeLessThan(even * 0.65)
  })

  it('takes longer when the answers are wrong than when they are right', () => {
    // Answer well and the words you know fall away, leaving the unmet ones a
    // bigger share of the draw; answer badly and the missed ones keep coming
    // back instead, which is when they should.
    expect(mean(12, true, 'prompts')).toBeLessThan(mean(12, false, 'prompts'))
  })

  it('still finishes a run of moves a player would actually sit through', () => {
    // Only about half of moves ask about a word at all, so this is the one
    // that tracks what the run feels like rather than what the draw does.
    expect(mean(12, true, 'moves')).toBeLessThan(40)
  })
})
