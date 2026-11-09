import { describe, expect, it } from 'vitest'
import { comboLevels, type SentenceLevelContext } from '@/config/comboLevels'
import { buildComboQuestion, hasComboSentence, nearestLevel, sentenceLevelFor } from './comboSentence'
import { createSpell, type NewSpellInput } from './spellFactory'

/**
 * Choosing a sentence and cutting the word out of it.
 *
 * The difficulty curve is the part worth pinning down: it is the whole of
 * what being outmatched costs a player in Combo, and a curve that quietly
 * drifted would change every fight in the game.
 */

const spell = (input: NewSpellInput) => createSpell(input)

/** 딴짓하다 with all seven of its November-deck sentences. */
const 딴짓하다 = () =>
  spell({
    korean: '딴짓하다',
    english: 'to go off-task',
    wordType: 'action_verb',
    element: 'aether',
    levelSentences: [
      '나 지금 딴짓해.',
      '어제는 딴짓 안 했어.',
      '딴짓하지 말고 공부하자.',
      '나도 모르게 자꾸 딴짓하게 돼.',
      '딴짓하느라 한국어 공부를 못 했어.',
      '친구가 내가 공부할 때마다 딴짓한다고 하더라고.',
      '어제는 책상에 앉았는데 또 딴짓하느라 한 시간을 날려 버렸어.',
    ],
    levelTranslations: ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'],
  })

const ctx = (patch: Partial<SentenceLevelContext> = {}): SentenceLevelContext => ({
  totemLevel: 20,
  enemyLevel: 20,
  isBoss: false,
  charge: 0,
  ...patch,
})

describe('how hard a sentence the fight asks for', () => {
  it('uses the level gap, which is the rule in play', () => {
    expect(comboLevels.source).toBe('levelGap')
  })

  it('speaks simply when the foe is well below you', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 40, enemyLevel: 10 }))).toBe(1)
    expect(sentenceLevelFor(ctx({ totemLevel: 40, enemyLevel: 28 }))).toBe(2)
  })

  it('sits in the middle for an even fight', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 20 }))).toBe(3)
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 22 }))).toBe(3)
  })

  it('climbs as the foe outgrows you', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 26 }))).toBe(4)
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 31 }))).toBe(5)
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 36 }))).toBe(6)
  })

  it('asks its hardest of something twice your level', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 40 }))).toBe(7)
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 99 }))).toBe(7)
  })

  it('gives a boss a level over its numbers', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 20, enemyLevel: 20, isBoss: true }))).toBe(4)
  })

  it('never leaves the one-to-seven range', () => {
    expect(sentenceLevelFor(ctx({ totemLevel: 1, enemyLevel: 500, isBoss: true }))).toBe(7)
    expect(sentenceLevelFor(ctx({ totemLevel: 500, enemyLevel: 1 }))).toBe(1)
  })

  it('survives a totem level of zero without dividing by it', () => {
    expect(() => sentenceLevelFor(ctx({ totemLevel: 0, enemyLevel: 10 }))).not.toThrow()
    expect(sentenceLevelFor(ctx({ totemLevel: 0, enemyLevel: 10 }))).toBe(7)
  })
})

describe('picking from what the deck actually wrote', () => {
  const partial = () =>
    spell({
      korean: '통하다',
      english: 'to connect',
      wordType: 'action_verb',
      levelSentences: ['우리 둘은 말이 통해.', '어제는 전화가 안 통했어.', '이 방법이 통할까?'],
      levelTranslations: ['one', 'two', 'three'],
    })

  it('takes the level asked for when it exists', () => {
    expect(nearestLevel(딴짓하다(), 5)?.level).toBe(5)
  })

  it('falls to the nearest level a short deck has', () => {
    // Asking a three-level deck for level 7 must not ask it for nothing.
    expect(nearestLevel(partial(), 7)?.level).toBe(3)
  })

  it('breaks a tie downwards, towards the sentence still readable', () => {
    const gappy = spell({
      korean: '통하다',
      english: 'to connect',
      levelSentences: ['우리 둘은 말이 통해.', '', '', '', '서로 말이 통하니까 편해.'],
    })
    expect(nearestLevel(gappy, 3)?.level).toBe(1)
  })

  it('returns null for an entry with no sentences', () => {
    expect(nearestLevel(spell({ korean: '학교', english: 'school' }), 3)).toBeNull()
  })
})

describe('building the question', () => {
  it('blanks the word out of the level the fight asked for', () => {
    const q = buildComboQuestion(딴짓하다(), ctx({ totemLevel: 20, enemyLevel: 20 }))!
    expect(q.level).toBe(3)
    expect(q.answer).toBe('딴짓하지')
    expect(q.text).toBe('____ 말고 공부하자.')
    expect(q.sentence).toBe('딴짓하지 말고 공부하자.')
    expect(q.translation).toBe('L3')
  })

  it('asks a harder sentence of a foe that outclasses you', () => {
    const q = buildComboQuestion(딴짓하다(), ctx({ totemLevel: 20, enemyLevel: 44 }))!
    expect(q.level).toBe(7)
    expect(q.answer).toBe('딴짓하느라')
  })

  it('asks the simplest sentence of something far beneath you', () => {
    const q = buildComboQuestion(딴짓하다(), ctx({ totemLevel: 40, enemyLevel: 5 }))!
    expect(q.level).toBe(1)
    expect(q.answer).toBe('딴짓해')
  })

  it('still reads an older deck that names the form outright', () => {
    // No levelled sentences, but a target cell — the format decks used
    // before, and better evidence than working it out.
    const old = spell({
      korean: '나아지다',
      english: 'to improve',
      sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
      sampleTranslation: 'It will improve.',
      sampleTargets: '연습하다=연습하면|나아지다=나아질 거예요',
    })
    const q = buildComboQuestion(old, ctx())!
    expect(q.answer).toBe('나아질 거예요')
    expect(q.level).toBe(0)
  })

  it('falls back to a plain example when that is all there is', () => {
    const plain = spell({
      korean: '통하다',
      english: 'to connect',
      sampleSentence: '우리 둘은 말이 통해.',
    })
    expect(buildComboQuestion(plain, ctx())?.answer).toBe('통해')
  })

  it('returns null when nothing in the entry can carry a question', () => {
    const bare = spell({ korean: '학교', english: 'school' })
    expect(buildComboQuestion(bare, ctx())).toBeNull()
    expect(hasComboSentence(bare)).toBe(false)
  })

  it('returns null when the sentences never use the word', () => {
    const astray = spell({
      korean: '시사만평',
      english: 'editorial cartoon',
      levelSentences: ['오늘 날씨가 좋네요.'],
    })
    expect(buildComboQuestion(astray, ctx())).toBeNull()
  })

  it('reports a word as Combo-ready when any level works', () => {
    expect(hasComboSentence(딴짓하다())).toBe(true)
  })
})
