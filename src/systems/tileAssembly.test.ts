import { describe, it, expect } from 'vitest'
import { buildTileChallenge, granularityFor, segmentAnswer, assembledText } from './tileAssembly'
import { tileBalance } from '@/config/balance'

const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length] }

describe('granularityFor', () => {
  it('assembles Korean from syllables — that direction is the production practice', () => {
    expect(granularityFor('korean')).toBe('syllable')
  })

  it('keeps an English answer whole, however many words it is', () => {
    // There was a spelling mode that cut these into letters, chosen from a
    // setting on the dungeon screen. Both are gone: the game asks whether
    // you know the word, not whether you can type it.
    expect(granularityFor('english')).toBe('whole')
  })
})

describe('segmentAnswer whole', () => {
  it('is one piece, spaces intact', () => {
    expect(segmentAnswer('thank you', 'whole')).toEqual(['thank you'])
  })

  it('yields nothing for an empty answer rather than a blank tile', () => {
    expect(segmentAnswer('   ', 'whole')).toEqual([])
  })
})

describe('buildTileChallenge in choice mode', () => {
  const pool = ['water', 'mountain', 'book', 'road', 'door', 'star']

  it('offers the answer as a single tile among whole decoys', () => {
    const b = buildTileChallenge('apple', 'english', pool, seq([0.1, 0.6, 0.3, 0.9, 0.45]))
    expect(b.granularity).toBe('whole')
    expect(b.answerLength).toBe(1)
    expect(b.tiles.map((t) => t.text)).toContain('apple')
    for (const t of b.tiles) expect(t.text).not.toMatch(/^.$/)
  })

  it('offers the configured number of choices', () => {
    const b = buildTileChallenge('apple', 'english', pool, seq([0.2, 0.7, 0.4, 0.1]))
    expect(b.tiles).toHaveLength(tileBalance.wholeAnswerChoices)
  })

  it('assembles back to exactly the answer', () => {
    const b = buildTileChallenge('thank you', 'english', pool, seq([0.3, 0.8]))
    const correct = b.tiles.find((t) => t.text === 'thank you')!
    expect(assembledText([correct], b.joiner)).toBe('thank you')
  })

  it('never offers a decoy identical to the answer', () => {
    const b = buildTileChallenge('water', 'english', pool, seq([0.5, 0.2, 0.9, 0.1]))
    expect(b.tiles.filter((t) => t.text === 'water')).toHaveLength(1)
  })

  it('still builds a usable board when there are no decoys to draw on', () => {
    // A run with one word must not produce an unanswerable prompt.
    const b = buildTileChallenge('apple', 'english', [], seq([0.5]))
    expect(b.tiles.map((t) => t.text)).toEqual(['apple'])
    expect(b.answerLength).toBe(1)
  })

  it('leaves Korean prompts assembled from syllables', () => {
    const b = buildTileChallenge('사과', 'korean', ['물', '책'], seq([0.4, 0.7, 0.1]))
    expect(b.granularity).toBe('syllable')
    expect(b.answerLength).toBe(2)
  })
})

describe('there is no spelling mode left to fall into', () => {
  it('keeps a one-word English answer whole rather than cutting it up', () => {
    const b = buildTileChallenge('love', 'english', ['water', 'book'], seq([0.3, 0.6, 0.1, 0.8]))
    expect(b.granularity).toBe('whole')
    expect(b.answerLength).toBe(1)
    expect(b.tiles.some((t) => t.text === 'love')).toBe(true)
    // Not a single letter of it among the tiles.
    expect(b.tiles.every((t) => t.text.length > 1)).toBe(true)
  })
})
