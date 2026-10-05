import { describe, expect, it } from 'vitest'
import {
  COMBO_BLANK,
  buildComboPrompt,
  comboAnswerCorrect,
  comboPromptCorrect,
  dictionaryKeysOf,
  examplesOf,
  formatTargets,
  hasComboData,
  normalizeComboAnswer,
  parseTargets,
} from './comboTargets'
import { createSpell, type NewSpellInput } from './spellFactory'

/**
 * Combo mode's sentence layer.
 *
 * The thing worth guarding here is that no Korean is ever *derived*. Every
 * expected answer in these tests is a string the vocabulary list wrote
 * down, and a word whose list said nothing has to come back as null rather
 * than as a guess — that null is what sends the battle back to the normal
 * question for that word.
 */

const spell = (input: NewSpellInput) => createSpell(input)

const 나아지다 = () =>
  spell({
    korean: '나아지다',
    english: 'to improve',
    wordType: 'action_verb',
    sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
    sampleTranslation: 'If you keep practising your Korean will improve.',
    sampleTargets: '연습하다=연습하면|나아지다=나아질 거예요',
  })

const 연습하다 = () => spell({ korean: '연습하다', english: 'to practise', wordType: 'action_verb' })

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

describe('which entries Combo can ask about', () => {
  it('accepts an entry whose own form is findable in its sentence', () => {
    expect(hasComboData(나아지다())).toBe(true)
  })

  it('rejects an entry with no target data at all', () => {
    // Every word imported before Combo existed is in exactly this state.
    const old = spell({
      korean: '나아지다',
      english: 'to improve',
      sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
    })
    expect(hasComboData(old)).toBe(false)
    expect(buildComboPrompt(old)).toBeNull()
  })

  it('rejects a cell that names a form the sentence does not contain', () => {
    const typo = spell({
      korean: '나아지다',
      english: 'to improve',
      sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
      sampleTargets: '나아지다=나아져요',
    })
    expect(hasComboData(typo)).toBe(false)
    expect(buildComboPrompt(typo)).toBeNull()
  })

  it('rejects a cell that only names other words', () => {
    const other = spell({
      korean: '나아지다',
      english: 'to improve',
      sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
      sampleTargets: '연습하다=연습하면',
    })
    expect(hasComboData(other)).toBe(false)
  })

  it('ignores an example with a sentence but no targets', () => {
    const half = spell({
      korean: '남다',
      english: 'to remain',
      sampleSentence: '시간이 좀 남으면 공부할 거예요.',
      sampleTargets: '남다=남으면',
      sampleSentence2: '밥이 남았어요.',
      sampleTargets2: '',
    })
    expect(examplesOf(half)).toHaveLength(1)
  })

  it('matches a noun equipped in its plain form against a 하다 target', () => {
    // The list writes the word the sentence uses — 연습하다 — while the
    // entry is 연습 with a derived verb. Both are the same entry.
    const noun = spell({
      korean: '연습',
      english: 'practice',
      wordType: 'noun',
      derivedVerb: '연습하다',
      sampleSentence: '계속 연습하면 실력이 늘어요.',
      sampleTargets: '연습하다=연습하면',
    })
    expect(dictionaryKeysOf(noun)).toContain('연습하다')
    expect(hasComboData(noun)).toBe(true)
  })
})

describe('building a player Combo question', () => {
  it('blanks the selected word and expects the form the sentence uses', () => {
    const prompt = buildComboPrompt(나아지다())!
    expect(prompt.text).toBe(`계속 연습하면 한국어 실력이 ${COMBO_BLANK}.`)
    expect(prompt.blanks).toHaveLength(1)
    expect(prompt.blanks[0]).toMatchObject({
      dictionaryForm: '나아지다',
      surfaceForm: '나아질 거예요',
      primary: true,
    })
  })

  it('keeps the untouched sentence and its translation for afterwards', () => {
    const prompt = buildComboPrompt(나아지다())!
    expect(prompt.sentence).toBe('계속 연습하면 한국어 실력이 나아질 거예요.')
    expect(prompt.translation).toBe('If you keep practising your Korean will improve.')
  })

  it('leaves the rest of the sentence alone when nothing else is equipped', () => {
    const prompt = buildComboPrompt(나아지다(), { equipped: [나아지다()] })!
    expect(prompt.blanks).toHaveLength(1)
  })

  it('adds a second blank for another equipped word in the sentence', () => {
    const primary = 나아지다()
    const prompt = buildComboPrompt(primary, { equipped: [primary, 연습하다()], rng: () => 0 })!
    expect(prompt.text).toBe(`계속 ${COMBO_BLANK} 한국어 실력이 ${COMBO_BLANK}.`)
    expect(prompt.blanks.map((b) => b.surfaceForm)).toEqual(['연습하면', '나아질 거예요'])
  })

  it('orders the blanks the way the sentence reads, not the way targets are listed', () => {
    const primary = 나아지다()
    const prompt = buildComboPrompt(primary, { equipped: [primary, 연습하다()], rng: () => 0 })!
    // 나아지다 is the attack, so it is the primary blank, but it comes second
    // in the sentence — a typed answer has to line up with what is on screen.
    expect(prompt.blanks[0].primary).toBe(false)
    expect(prompt.blanks[1].primary).toBe(true)
  })

  it('attributes each extra blank to the equipped entry that earned it', () => {
    const primary = 나아지다()
    const practise = 연습하다()
    const prompt = buildComboPrompt(primary, { equipped: [primary, practise], rng: () => 0 })!
    const extra = prompt.blanks.find((b) => !b.primary)!
    expect(extra.spellId).toBe(practise.id)
    expect(prompt.blanks.find((b) => b.primary)!.spellId).toBe(primary.id)
  })

  it('never exceeds the blank cap', () => {
    const 떠오르다 = spell({
      korean: '떠오르다',
      english: 'to come to mind',
      wordType: 'action_verb',
      sampleSentence: '말할 때 필요한 단어가 바로 안 떠올라요. 정말 그래요. 자주 그래요. 매번 그래요.',
      sampleTargets: '말하다=말할|필요하다=필요한|떠오르다=떠올라요',
    })
    const equipped = [
      떠오르다,
      spell({ korean: '말하다', english: 'to say', wordType: 'action_verb' }),
      spell({ korean: '필요하다', english: 'to need', wordType: 'descriptive_verb' }),
    ]
    const prompt = buildComboPrompt(떠오르다, { equipped, rng: () => 0, maxBlanks: 2 })!
    expect(prompt.blanks).toHaveLength(2)
    expect(prompt.blanks.some((b) => b.primary)).toBe(true)
  })

  it('leaves enough Korean standing even when more words qualify', () => {
    // Three of the four words in this sentence are equipped and findable.
    // Blanking them all would leave a question with no grammar to read.
    const 생각나다 = spell({
      korean: '생각나다',
      english: 'to come to mind',
      wordType: 'action_verb',
      sampleSentence: '아는 단어인데 갑자기 생각이 안 나요.',
      sampleTargets: '알다=아는|생각나다=생각이 안 나요',
    })
    const equipped = [생각나다, spell({ korean: '알다', english: 'to know', wordType: 'action_verb' })]
    const prompt = buildComboPrompt(생각나다, { equipped, rng: () => 0 })!
    const blanked = prompt.blanks.reduce((n, b) => n + b.surfaceForm.length, 0)
    expect(blanked).toBeLessThanOrEqual(생각나다.sampleSentence.length * 0.5)
  })

  it('replaces a multi-word form whole', () => {
    const 생각나다 = spell({
      korean: '생각나다',
      english: 'to come to mind',
      wordType: 'action_verb',
      sampleSentence: '아는 단어인데 갑자기 생각이 안 나요.',
      sampleTargets: '생각나다=생각이 안 나요',
    })
    const prompt = buildComboPrompt(생각나다)!
    expect(prompt.text).toBe(`아는 단어인데 갑자기 ${COMBO_BLANK}.`)
    expect(prompt.blanks[0].surfaceForm).toBe('생각이 안 나요')
  })

  it('can draw on the second example', () => {
    const 남다 = spell({
      korean: '남다',
      english: 'to remain',
      wordType: 'action_verb',
      sampleSentence: '밥이 조금 남았어요.',
      sampleTargets: '남다=남았어요',
      sampleSentence2: '시간이 좀 남으면 한국어를 공부할 거예요.',
      sampleTargets2: '남다=남으면|공부하다=공부할 거예요',
    })
    const second = buildComboPrompt(남다, { rng: () => 0.99 })!
    expect(second.sentence).toBe('시간이 좀 남으면 한국어를 공부할 거예요.')
    expect(second.blanks[0].surfaceForm).toBe('남으면')
  })

  it('does not blank the same stretch twice when two targets share a form', () => {
    const 남다 = spell({
      korean: '남다',
      english: 'to remain',
      wordType: 'action_verb',
      sampleSentence: '시간이 남으면 좋겠어요.',
      sampleTargets: '남다=남으면|바라다=남으면',
    })
    const equipped = [남다, spell({ korean: '바라다', english: 'to hope', wordType: 'action_verb' })]
    const prompt = buildComboPrompt(남다, { equipped, rng: () => 0 })!
    expect(prompt.text.split(COMBO_BLANK)).toHaveLength(2)
    expect(prompt.blanks).toHaveLength(1)
  })

  it('gives an enemy prompt exactly one blank', () => {
    const primary = 나아지다()
    const prompt = buildComboPrompt(primary, { maxBlanks: 1, equipped: [primary, 연습하다()] })!
    expect(prompt.blanks).toHaveLength(1)
    expect(prompt.blanks[0].primary).toBe(true)
  })
})

describe('checking a typed Combo answer', () => {
  const blank = { dictionaryForm: '나아지다', surfaceForm: '나아질 거예요', spellId: 's', primary: true }

  it('accepts the exact form', () => {
    expect(comboAnswerCorrect('나아질 거예요', blank)).toBe(true)
  })

  it('forgives surrounding and doubled space', () => {
    expect(comboAnswerCorrect('  나아질   거예요 ', blank)).toBe(true)
  })

  it('forgives a sentence mark typed out of habit', () => {
    expect(comboAnswerCorrect('나아질 거예요.', blank)).toBe(true)
  })

  it('rejects another conjugation of the right word', () => {
    // The whole educational point of the mode: the player recalled the
    // vocabulary and missed the grammar the sentence asked for.
    expect(comboAnswerCorrect('나아져요', blank)).toBe(false)
    expect(comboAnswerCorrect('나아졌어요', blank)).toBe(false)
  })

  it('rejects the dictionary form', () => {
    expect(comboAnswerCorrect('나아지다', blank)).toBe(false)
  })

  it('rejects an empty answer', () => {
    expect(comboAnswerCorrect('', blank)).toBe(false)
    expect(comboAnswerCorrect('   ', blank)).toBe(false)
  })

  it('normalises only harmless differences', () => {
    expect(normalizeComboAnswer('  생각이  안   나요!  ')).toBe('생각이 안 나요')
  })
})

describe('checking a whole Combo question', () => {
  it('needs every blank right', () => {
    const primary = 나아지다()
    const prompt = buildComboPrompt(primary, { equipped: [primary, 연습하다()], rng: () => 0 })!
    expect(comboPromptCorrect(['연습하면', '나아질 거예요'], prompt)).toBe(true)
    expect(comboPromptCorrect(['연습해요', '나아질 거예요'], prompt)).toBe(false)
    expect(comboPromptCorrect(['연습하면', ''], prompt)).toBe(false)
  })

  it('rejects a short answer list', () => {
    const primary = 나아지다()
    const prompt = buildComboPrompt(primary, { equipped: [primary, 연습하다()], rng: () => 0 })!
    expect(comboPromptCorrect(['연습하면'], prompt)).toBe(false)
  })
})
