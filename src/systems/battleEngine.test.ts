import { describe, expect, it } from 'vitest'
import { attackCardAvatar, defenseDamage } from './battleEngine'

describe('the face of an attack card', () => {
  it('is the first syllable of the Korean word', () => {
    expect(attackCardAvatar('안내')).toBe('안')
    expect(attackCardAvatar('먹다')).toBe('먹')
    expect(attackCardAvatar('안녕하세요')).toBe('안')
  })

  it('is one syllable however long the word is', () => {
    for (const word of ['물', '검토', '평평하다', '안녕하세요']) {
      expect([...attackCardAvatar(word)]).toHaveLength(1)
    }
  })

  it('stops short of the answer for anything longer than a syllable', () => {
    // The attack asks for the whole word. One syllable of two or more says
    // which card this is without saying what to type.
    for (const word of ['안내', '검토', '평평하다']) {
      expect(attackCardAvatar(word)).not.toBe(word)
    }
  })

  it('ignores whitespace around the word', () => {
    expect(attackCardAvatar('  물 ')).toBe('물')
  })

  it('has something to show for an empty word', () => {
    expect(attackCardAvatar('')).toBe('?')
    expect(attackCardAvatar('   ')).toBe('?')
  })

  it('does not split a character into half a surrogate pair', () => {
    // Not Korean, but a card face rendered as a replacement glyph is worse
    // than one rendered wrong, and word[0] would produce exactly that.
    expect(attackCardAvatar('𠮷野')).toBe('𠮷')
  })
})

describe('defense damage settles prompt by prompt', () => {
  it('runs from full damage when every prompt was missed to nothing when every one was countered', () => {
    expect(defenseDamage(100, ['hit'])).toBe(100)
    expect(defenseDamage(100, ['blocked'])).toBe(15)
    expect(defenseDamage(100, ['countered'])).toBe(0)
  })

  it('charges each prompt its own share of the attack', () => {
    expect(defenseDamage(100, ['hit', 'hit'])).toBe(100)
    expect(defenseDamage(100, ['hit', 'blocked'])).toBeGreaterThan(defenseDamage(100, ['blocked', 'blocked']))
    // Half the attack turned back, half let through reduced.
    expect(defenseDamage(100, ['countered', 'hit'])).toBe(50)
  })

  it('is nothing at all when there was nothing to answer', () => {
    expect(defenseDamage(100, [])).toBe(0)
  })
})
