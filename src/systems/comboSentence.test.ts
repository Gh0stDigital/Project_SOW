import { describe, expect, it } from 'vitest'
import { comboLevels, type SentenceLevelContext } from '@/config/comboLevels'
import {
  anchoredGap,
  buildComboQuestion,
  escalationChance,
  hasComboSentence,
  nearestLevel,
  sentenceLevelFor,
} from './comboSentence'
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

/** The same, with the roll pinned to a level, for tests about sentences. */
const atLevel = (level: number, patch: Partial<SentenceLevelContext> = {}): SentenceLevelContext => ({
  ...ctx(patch),
  // Each of the six steps is taken while the roll is below the chance, so
  // a threshold picks the level outright.
  rng: (() => {
    let taken = 0
    return () => (taken++ < level - 1 ? 0 : 1)
  })(),
})

/** A seeded generator, so a distribution test means the same thing twice. */
function lcg(seed = 1): () => number {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

/** How often each level comes up over many rolls of the same matchup. */
function spread(ctx: SentenceLevelContext, rolls = 20000): number[] {
  const rng = lcg(7)
  const counts = new Array(8).fill(0)
  for (let i = 0; i < rolls; i++) counts[sentenceLevelFor({ ...ctx, rng })] += 1
  return counts.map((n) => n / rolls)
}

describe('how hard a sentence the fight asks for', () => {
  it('uses the level gap, which is the rule in play', () => {
    expect(comboLevels.source).toBe('levelGap')
  })

  it('anchors the ratio, so two low levels are not a gulf', () => {
    // Unanchored, a Lv1 Totem meeting a Lv2 foe reads as twice its level
    // and was handed a paragraph on its first fight. The anchor is the
    // whole of the fix.
    expect(anchoredGap(1, 2)).toBeLessThan(1.2)
    expect(anchoredGap(1, 1)).toBe(1)
    // And it still says plainly when something is far above you.
    expect(anchoredGap(10, 100)).toBeGreaterThan(3)
  })

  it('does not divide by a Totem level of zero', () => {
    expect(() => anchoredGap(0, 10)).not.toThrow()
    expect(Number.isFinite(anchoredGap(0, 10))).toBe(true)
  })

  it('raises the chance of climbing as the foe outgrows you', () => {
    const chance = (t: number, e: number) => escalationChance(ctx({ totemLevel: t, enemyLevel: e }))
    expect(chance(20, 5)).toBeLessThan(chance(20, 20))
    expect(chance(20, 20)).toBeLessThan(chance(20, 40))
    expect(chance(20, 40)).toBeLessThan(chance(20, 90))
  })

  it('holds the chance steady past the ends of the table', () => {
    // Nothing below the first point or above the last, so a hopeless
    // matchup is not somehow harder than a merely terrible one.
    expect(escalationChance(ctx({ totemLevel: 90, enemyLevel: 1 }))).toBe(comboLevels.escalation[0].chance)
    const last = comboLevels.escalation[comboLevels.escalation.length - 1].chance
    expect(escalationChance(ctx({ totemLevel: 1, enemyLevel: 500 }))).toBe(last)
  })

  it('is a roll, not a lookup — the same matchup asks differently', () => {
    const rng = lcg(3)
    const even = { ...ctx({ totemLevel: 20, enemyLevel: 20 }), rng }
    const seen = new Set(Array.from({ length: 60 }, () => sentenceLevelFor(even)))
    expect(seen.size).toBeGreaterThan(2)
  })

  it('averages the middle of the deck for an even fight', () => {
    const d = spread(ctx({ totemLevel: 20, enemyLevel: 20 }))
    const mean = d.reduce((sum, p, level) => sum + p * level, 0)
    expect(mean).toBeGreaterThan(2.7)
    expect(mean).toBeLessThan(3.3)
  })

  it('almost never reaches the top of the ladder in a fair fight', () => {
    // The complaint this was built from: words were starting at level 7.
    // An even fight must essentially never do that.
    expect(spread(ctx({ totemLevel: 20, enemyLevel: 20 }))[7]).toBeLessThan(0.01)
    expect(spread(ctx({ totemLevel: 6, enemyLevel: 10 }))[7]).toBeLessThan(0.02)
    // Nor on a brand new Totem meeting the tier it starts in.
    expect(spread(ctx({ totemLevel: 1, enemyLevel: 2 }))[7]).toBeLessThan(0.01)
  })

  it('reaches it often once the gap is enormous', () => {
    const d = spread(ctx({ totemLevel: 10, enemyLevel: 50 }))
    expect(d[7]).toBeGreaterThan(0.15)
    expect(d[6] + d[7]).toBeGreaterThan(0.5)
  })

  it('tilts a boss upward without overriding the roll', () => {
    const plain = ctx({ totemLevel: 30, enemyLevel: 50 })
    const boss = ctx({ totemLevel: 30, enemyLevel: 50, isBoss: true })
    expect(escalationChance(boss)).toBeGreaterThan(escalationChance(plain))
    // Still a roll: the easy end stays reachable.
    expect(spread(boss)[1] + spread(boss)[2] + spread(boss)[3]).toBeGreaterThan(0.1)
  })

  it('never leaves the one-to-seven range', () => {
    const extreme = { ...ctx({ totemLevel: 1, enemyLevel: 999, isBoss: true }), rng: () => 0 }
    expect(sentenceLevelFor(extreme)).toBe(7)
    const gentle = { ...ctx({ totemLevel: 999, enemyLevel: 1 }), rng: () => 1 }
    expect(sentenceLevelFor(gentle)).toBe(1)
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
  it('blanks the word out of the level the roll landed on', () => {
    const q = buildComboQuestion(딴짓하다(), atLevel(3))!
    expect(q.level).toBe(3)
    expect(q.answer).toBe('딴짓하지')
    expect(q.text).toBe('____ 말고 공부하자.')
    expect(q.sentence).toBe('딴짓하지 말고 공부하자.')
    expect(q.translation).toBe('L3')
  })

  it('asks the hardest sentence when the roll climbs all the way', () => {
    const q = buildComboQuestion(딴짓하다(), atLevel(7))!
    expect(q.level).toBe(7)
    expect(q.answer).toBe('딴짓하느라')
  })

  it('asks the simplest sentence when it climbs not at all', () => {
    const q = buildComboQuestion(딴짓하다(), atLevel(1))!
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
