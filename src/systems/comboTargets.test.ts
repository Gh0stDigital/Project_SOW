import { describe, expect, it } from 'vitest'
import { formatTargets, parseTargets } from './comboTargets'

/**
 * The older deck format's target cell.
 *
 * Decks are not written this way any more, but Compendiums built from
 * those files still hold the cells and comboSentence.ts still reads them,
 * so the parsing has to keep working.
 */

describe('reading a target cell', () => {
  it('parses the supplied pairs', () => {
    expect(parseTargets('연습하다=연습하면|나아지다=나아질 거예요')).toEqual([
      { dictionaryForm: '연습하다', surfaceForm: '연습하면' },
      { dictionaryForm: '나아지다', surfaceForm: '나아질 거예요' },
    ])
  })

  it('keeps a surface form that is several words long', () => {
    // 생각나다=생각이 안 나요 is the case that rules out splitting a sentence
    // into whitespace tokens: the answer is three of them.
    expect(parseTargets('생각나다=생각이 안 나요')).toEqual([
      { dictionaryForm: '생각나다', surfaceForm: '생각이 안 나요' },
    ])
  })

  it('accepts a semicolon, for a list whose rows are pipe-delimited', () => {
    expect(parseTargets('남다=남으면;공부하다=공부할 거예요')).toHaveLength(2)
  })

  it('drops malformed pieces instead of failing', () => {
    expect(parseTargets('연습하다|=남으면|남다=|남다=남으면')).toEqual([
      { dictionaryForm: '남다', surfaceForm: '남으면' },
    ])
  })

  it('reads an empty cell as no targets', () => {
    expect(parseTargets('')).toEqual([])
  })

  it('keeps only the first mapping for a repeated word', () => {
    expect(parseTargets('남다=남으면|남다=남아 있어요')).toEqual([
      { dictionaryForm: '남다', surfaceForm: '남으면' },
    ])
  })

  it('round-trips through formatTargets', () => {
    const raw = '연습하다=연습하면|나아지다=나아질 거예요'
    expect(formatTargets(parseTargets(raw))).toBe(raw)
  })
})
