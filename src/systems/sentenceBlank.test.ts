import { describe, expect, it } from 'vitest'
import { SENTENCE_BLANK, blankSentence, locateHeadword, stemOf, stemOverlap } from './sentenceBlank'

/**
 * Finding a headword inside its own sentence, with no metadata saying
 * where it is.
 *
 * Every case here is taken from the November deck, which is the shape the
 * vocabulary actually arrives in: seven sentences per word and not a word
 * of annotation. The irregulars are the point — if 역겹다 cannot find
 * 역겨워, the mode has nothing to ask about that word.
 */

describe('how much of a stem a chunk accounts for', () => {
  it('counts whole matching syllables', () => {
    expect(stemOverlap('딴짓하', '딴짓하느라')).toBe(3)
  })

  it('counts a syllable that keeps only its leading consonant as a half', () => {
    // 하 → 해 is the single most common thing an ending does, and it
    // changes the vowel, so the onset is all that survives.
    expect(stemOverlap('통하', '통해')).toBe(1.5)
  })

  it('counts a dropped final consonant as a half', () => {
    // ㅂ-irregular: 역겹 → 역겨워.
    expect(stemOverlap('역겹', '역겨워')).toBe(1.5)
  })

  it('stops at the first syllable that shares nothing', () => {
    expect(stemOverlap('통하', '학교에')).toBe(0)
  })

  it('does not run past the end of either side', () => {
    expect(stemOverlap('시사만평', '시사')).toBe(2)
    expect(stemOverlap('', '아무거나')).toBe(0)
  })
})

describe('the part of a headword that survives into a sentence', () => {
  it('drops 다 from a verb or adjective', () => {
    expect(stemOf('통하다')).toBe('통하')
    expect(stemOf('역겹다')).toBe('역겹')
  })

  it('leaves a noun whole, since what follows it is a particle', () => {
    expect(stemOf('시사만평')).toBe('시사만평')
  })

  it('leaves a one-character word alone', () => {
    expect(stemOf('다')).toBe('다')
  })
})

describe('blanking the headword out of its sentence', () => {
  const cases: [string, string, string][] = [
    // headword, sentence, expected answer — all from the November deck.
    ['딴짓하다', '나 지금 딴짓해.', '딴짓해'],
    ['딴짓하다', '딴짓하지 말고 공부하자.', '딴짓하지'],
    ['딴짓하다', '딴짓하느라 한국어 공부를 못 했어.', '딴짓하느라'],
    ['딴짓하다', '친구가 내가 공부할 때마다 딴짓한다고 하더라고.', '딴짓한다고'],
    ['통하다', '우리 둘은 말이 통해.', '통해'],
    ['통하다', '어제는 전화가 안 통했어.', '통했어'],
    ['통하다', '서로 말이 통하니까 같이 일하기 편해.', '통하니까'],
    ['역겹다', '그 냄새 진짜 역겨워.', '역겨워'],
    ['역겹다', '그 장면은 별로 역겹지 않았어.', '역겹지'],
    ['돈독하다', '우리 사이는 돈독해.', '돈독해'],
    ['돈독하다', '서로 믿고 지내니까 사이가 더 돈독해졌어.', '돈독해졌어'],
    ['달성하다', '드디어 목표를 달성했어.', '달성했어'],
    ['시사만평', '이건 시사만평이야.', '시사만평이야'],
    ['시사만평', '어제는 시사만평을 안 봤어.', '시사만평을'],
    ['폭동', '그건 폭동이야.', '폭동이야'],
    ['유통', '제품이 전국에 유통되면서 판매량이 늘었어.', '유통되면서'],
    ['해금', '어제는 새 캐릭터가 해금되지 않았어.', '해금되지'],
    ['무사히', '친구가 무사히 도착했어.', '무사히'],
  ]

  for (const [word, sentence, answer] of cases) {
    it(`finds ${answer} for ${word}`, () => {
      expect(blankSentence(sentence, word)?.answer).toBe(answer)
    })
  }

  it('covers a multi-word headword across both of its chunks', () => {
    // Blanking only 다녀 would leave 붙어 printed next to the gap, which
    // gives the answer away and asks half a question.
    const b = blankSentence('우리는 맨날 붙어 다녀.', '붙어 다니다')!
    expect(b.answer).toBe('붙어 다녀')
    expect(b.text).toBe(`우리는 맨날 ${SENTENCE_BLANK}.`)
  })

  it('leaves the sentence mark outside the blank', () => {
    // The tile board has no tile for a full stop, so the answer must not
    // contain one.
    const b = blankSentence('나 지금 딴짓해.', '딴짓하다')!
    expect(b.answer).toBe('딴짓해')
    expect(b.text).toBe(`나 지금 ${SENTENCE_BLANK}.`)
  })

  it('keeps a comma that follows the blank in the sentence', () => {
    const b = blankSentence('말이 잘 안 통했는데, 나중엔 괜찮았어.', '통하다')!
    expect(b.answer).toBe('통했는데')
    expect(b.text).toBe(`말이 잘 안 ${SENTENCE_BLANK}, 나중엔 괜찮았어.`)
  })

  it('prefers the longer form when a bare stem also appears', () => {
    const b = blankSentence('딴짓 말고 딴짓하느라 바빴어.', '딴짓하다')!
    expect(b.answer).toBe('딴짓하느라')
  })

  it('keeps the untouched sentence alongside the blanked one', () => {
    const b = blankSentence('우리 둘은 말이 통해.', '통하다')!
    expect(b.sentence).toBe('우리 둘은 말이 통해.')
    expect(b.text).not.toBe(b.sentence)
  })

  it('returns null when the sentence never uses the word', () => {
    // A deck may paraphrase rather than use the headword; the caller falls
    // back to the ordinary question for that word.
    expect(blankSentence('오늘 날씨가 좋네요.', '시사만평')).toBeNull()
    expect(locateHeadword('오늘 날씨가 좋네요.', '시사만평')).toBeNull()
  })

  it('returns null for an empty sentence or an empty headword', () => {
    expect(blankSentence('', '통하다')).toBeNull()
    expect(blankSentence('우리 둘은 말이 통해.', '')).toBeNull()
  })

  it('does not match a word that merely starts with the same syllable', () => {
    // 통하다 must not be found in 통계 — one syllable of a two-syllable
    // stem is below the bar, and the second shares nothing.
    expect(blankSentence('통계를 봤어.', '통하다')).toBeNull()
  })

  it('still finds the word when the sentence splits it around 안', () => {
    // 어제는 딴짓 안 했어: only 딴짓 is left to find, and two whole
    // syllables is evidence enough. The blank asks for less than the
    // other six levels do, which is the deck's shape, not a failure.
    expect(blankSentence('어제는 딴짓 안 했어.', '딴짓하다')?.answer).toBe('딴짓')
  })

  it('needs a one-syllable stem to match outright', () => {
    // Half of 가 is most of the alphabet.
    expect(blankSentence('고기를 먹었어.', '가다')).toBeNull()
  })
})
