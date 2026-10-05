import { describe, expect, it } from 'vitest'
import type { Spell } from '@/domain/spell'
import {
  IMPORT_TEMPLATE_CSV,
  IMPORT_TEMPLATE_SIMPLE_CSV,
  exportSpellsToCsv,
  importRowsToInputs,
  parseImportText,
  parseWordType,
  retypesAnything,
} from './spellImport'
import { createSpell } from './spellFactory'

const NONE: Spell[] = []

describe('short two-column import (unchanged behaviour)', () => {
  it('still reads a bare korean,english list', () => {
    const result = parseImportText('안녕하세요, hello\n감사합니다, thank you', NONE)
    expect(result.ok).toHaveLength(2)
    expect(result.ok[0].korean).toBe('안녕하세요')
    expect(result.ok[0].english).toBe('hello')
    expect(result.headerColumns).toBeNull()
  })

  it('reads tab-separated paste and a notes column', () => {
    const result = parseImportText('사랑\tlove\ta noun', NONE)
    expect(result.ok).toHaveLength(1)
    expect(result.ok[0].input.notes).toBe('a noun')
  })

  it('skips blanks and comments, and reports missing fields', () => {
    const result = parseImportText('# a comment\n\n안녕하세요', NONE)
    expect(result.ok).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
  })

  it('flags duplicates against the compendium and within the batch', () => {
    const existing = [createSpell({ korean: '학교', english: 'school' })]
    const result = parseImportText('학교, school\n물, water\n물, water', existing)
    expect(result.duplicates).toHaveLength(2)
    expect(result.ok).toHaveLength(1)
  })

  it('parses the simple template it offers', () => {
    const result = parseImportText(IMPORT_TEMPLATE_SIMPLE_CSV, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok.length).toBeGreaterThan(0)
  })
})

describe('structured import', () => {
  const csv = [
    'word,word type,definition 1,definition 2,definition 3,sample sentence,sample sentence translation,derived verb,present,past,future,notes',
    '전달하다,Action Verb,to deliver,to convey,to pass along,내용을 전달했어요.,I passed it along.,,전달해요,전달했어요,전달할 거예요,',
    '괜히,Adverb,for no reason,needlessly,unnecessarily,괜히 걱정했어요.,I worried for no reason.,,,,,',
    '검토,Noun,review,examination,consideration,,,검토하다,검토해요,검토했어요,검토할 거예요,',
  ].join('\n')

  it('maps a header row and fills every field', () => {
    const result = parseImportText(csv, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(3)

    const verb = result.ok[0].input
    expect(verb.wordType).toBe('action_verb')
    expect(verb.definition2).toBe('to convey')
    expect(verb.definition3).toBe('to pass along')
    expect(verb.sampleSentence).toBe('내용을 전달했어요.')
    expect(verb.sampleTranslation).toBe('I passed it along.')
    expect(verb.presentForm).toBe('전달해요')
    expect(verb.futureForm).toBe('전달할 거예요')
  })

  it('reads a noun with a derived verb and its conjugations', () => {
    const noun = parseImportText(csv, NONE).ok[2].input
    expect(noun.wordType).toBe('noun')
    expect(noun.derivedVerb).toBe('검토하다')
    expect(noun.presentForm).toBe('검토해요')
  })

  it('accepts columns in any order', () => {
    const reordered = ['definition 1,word,word type', 'hello,안녕하세요,Expression/Phrase'].join('\n')
    const row = parseImportText(reordered, NONE).ok[0]
    expect(row.korean).toBe('안녕하세요')
    expect(row.english).toBe('hello')
    expect(row.input.wordType).toBe('expression')
  })

  it('reads Element in a header but never imports it', () => {
    const withElement = ['word,element,definition 1,word type', '학교,Fire,school,Noun'].join('\n')
    const row = parseImportText(withElement, NONE).ok[0]
    // Element is derived from the type — a bogus column cannot override it.
    expect(row.input.wordType).toBe('noun')
    expect(Object.keys(row.input)).not.toContain('element')
  })

  it('warns rather than silently defaulting an unknown word type', () => {
    const bad = ['word,word type,definition 1', '학교,Wizard,school'].join('\n')
    const row = parseImportText(bad, NONE).ok[0]
    expect(row.status).toBe('ok')
    // Names the type it did not recognise, so the fix is obvious after import.
    expect(row.message).toMatch(/알 수 없는 품사/)
    expect(row.message).toContain('Wizard')
    expect(row.input.wordType).toBeUndefined()
  })

  it('parses every word-type spelling it advertises', () => {
    expect(parseWordType('Action Verb')).toBe('action_verb')
    expect(parseWordType('descriptive verb / adjective')).toBe('descriptive_verb')
    expect(parseWordType('Adjective')).toBe('descriptive_verb')
    expect(parseWordType('Expression/Phrase')).toBe('expression')
    expect(parseWordType('Grammar / Particle')).toBe('grammar')
    expect(parseWordType('  Adverb ')).toBe('adverb')
    expect(parseWordType('wizard')).toBeNull()
    expect(parseWordType('')).toBeNull()
  })

  it('parses the full template it offers for download', () => {
    const result = parseImportText(IMPORT_TEMPLATE_CSV, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(4)
    expect(result.ok.map((r) => r.input.wordType)).toEqual(['action_verb', 'adverb', 'noun', 'expression'])
  })

  it('turns rows straight into creatable inputs', () => {
    const inputs = importRowsToInputs(parseImportText(csv, NONE).ok)
    const spells = inputs.map(createSpell)
    expect(spells[0].presentForm).toBe('전달해요')
    // The adverb's conjugation columns were empty and stay empty.
    expect(spells[1].presentForm).toBe('')
  })
})

describe('export', () => {
  const spells = [
    createSpell({
      korean: '전달하다',
      english: 'to deliver',
      definition2: 'to convey',
      wordType: 'action_verb',
      presentForm: '전달해요',
      pastForm: '전달했어요',
      futureForm: '전달할 거예요',
    }),
    createSpell({ korean: '검토', english: 'review', wordType: 'noun', derivedVerb: '검토하다', presentForm: '검토해요' }),
  ]

  it('writes a header and one row per entry, including the derived element', () => {
    const csv = exportSpellsToCsv(spells)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('element')
    expect(lines[1]).toContain('fire')
    expect(lines[2]).toContain('earth')
  })

  it('round-trips back through the importer', () => {
    const csv = exportSpellsToCsv(spells)
    const result = parseImportText(csv, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(2)
    expect(result.ok[0].input.wordType).toBe('action_verb')
    expect(result.ok[0].input.definition2).toBe('to convey')
    expect(result.ok[1].input.derivedVerb).toBe('검토하다')
    expect(result.ok[1].input.presentForm).toBe('검토해요')
  })

  it('quotes cells containing the delimiter', () => {
    const tricky = [createSpell({ korean: '음', english: 'well, um', wordType: 'expression' })]
    const csv = exportSpellsToCsv(tricky)
    expect(csv).toContain('"well, um"')
  })
})

describe('word type column stays language-independent', () => {
  // The interface is Korean, but a CSV is a file people keep. Translating
  // the display labels must not strand a file exported before the change,
  // nor one written by hand in either language.
  it('accepts the stable ids that export now writes', () => {
    expect(parseWordType('action_verb')).toBe('action_verb')
    expect(parseWordType('descriptive_verb')).toBe('descriptive_verb')
    expect(parseWordType('grammar')).toBe('grammar')
  })

  it('still accepts the English names older exports wrote', () => {
    expect(parseWordType('Action Verb')).toBe('action_verb')
    expect(parseWordType('Descriptive Verb / Adjective')).toBe('descriptive_verb')
    expect(parseWordType('Grammar / Particle')).toBe('grammar')
    expect(parseWordType('Noun')).toBe('noun')
  })

  it('accepts the Korean names the app now shows', () => {
    expect(parseWordType('명사')).toBe('noun')
    expect(parseWordType('동사')).toBe('action_verb')
    expect(parseWordType('형용사')).toBe('descriptive_verb')
    expect(parseWordType('부사')).toBe('adverb')
    expect(parseWordType('표현 / 관용구')).toBe('expression')
    expect(parseWordType('문법 / 조사')).toBe('grammar')
  })
})

/**
 * The four ways a real word list lost its sample sentence.
 *
 * Every one of these was reported as "the game never shows example
 * sentences". None of them was a bug in the game: the sentence never
 * survived the import, so there was nothing to show. The rendering was
 * correct the whole time, which is why it took three passes to find — the
 * fix belongs here, at the door, not at the screen.
 */
describe('a sample sentence survives the import', () => {
  const SENTENCE = '물을 마셨습니다.'

  it('reads a header written in Korean', () => {
    // The app's own form labels these fields 단어 / 뜻 / 예문, so a list
    // typed to match the interface used those words. The parser knew only
    // the English spellings, so the row was not recognised as a header at
    // all: the file dropped to the short positional form, everything past
    // the third column went out, and the header itself became a word whose
    // meaning was "뜻".
    const result = parseImportText(`단어,뜻,예문\n물,water,${SENTENCE}`, NONE)
    expect(result.headerColumns).not.toBeNull()
    expect(result.ok).toHaveLength(1)
    expect(result.ok[0].korean).toBe('물')
    expect(result.ok[0].input.sampleSentence).toBe(SENTENCE)
  })

  it('does not import the Korean header row as a word', () => {
    const result = parseImportText('단어,뜻,예문\n물,water,x', NONE)
    expect(result.rows.map((r) => r.korean)).not.toContain('단어')
  })

  it('maps every Korean column name, not just the three it needs', () => {
    const header = '단어,품사,뜻 1,뜻 2,예문,예문 번역,파생 동사,현재형,메모'
    const row = '검토,명사,review,examination,서류를 검토했어요.,I reviewed the documents.,검토하다,검토해요,work word'
    const [spell] = parseImportText(`${header}\n${row}`, NONE).ok
    expect(spell.input.wordType).toBe('noun')
    expect(spell.input.definition2).toBe('examination')
    expect(spell.input.sampleSentence).toBe('서류를 검토했어요.')
    expect(spell.input.sampleTranslation).toBe('I reviewed the documents.')
    expect(spell.input.derivedVerb).toBe('검토하다')
    expect(spell.input.presentForm).toBe('검토해요')
    expect(spell.notes).toBe('work word')
  })

  it('honours the quotes a spreadsheet puts around a cell with a comma', () => {
    // What every spreadsheet exports. Split naively, `"water, aqua"` became
    // two fields and every column after it shifted left by one, so the
    // sentence landed in a column nothing reads.
    const csv = `word,definition 1,sample sentence\n물,"water, aqua","${SENTENCE}"`
    const [spell] = parseImportText(csv, NONE).ok
    expect(spell.english).toBe('water, aqua')
    expect(spell.input.sampleSentence).toBe(SENTENCE)
  })

  it('reads a doubled quote inside a quoted cell as one quote', () => {
    const csv = 'word,definition 1,sample sentence\n물,water,"그는 ""물""이라고 했어요."'
    expect(parseImportText(csv, NONE).ok[0].input.sampleSentence).toBe('그는 "물"이라고 했어요.')
  })

  it('keeps the whole sentence when an unquoted comma splits it', () => {
    // Hand-typed lists are not quoted, and a Korean sentence has a comma in
    // it as often as an English one. Surplus fields belong to the last
    // column; without the rejoin everything after the comma was dropped.
    const csv = `word,definition 1,sample sentence\n물,water,물을 마셨습니다, 아주 많이.`
    expect(parseImportText(csv, NONE).ok[0].input.sampleSentence).toBe('물을 마셨습니다, 아주 많이.')
  })

  it('does not tear a sentence apart on a dash in a comma file', () => {
    // The delimiter used to be chosen per line, so a row containing ' - '
    // was split on that instead of on the commas the rest of the file used.
    // The first row decides for the whole file now.
    const csv = 'word,definition 1,sample sentence\n물,water,물 - 그것을 마셨습니다.'
    const [spell] = parseImportText(csv, NONE).ok
    expect(spell.korean).toBe('물')
    expect(spell.input.sampleSentence).toBe('물 - 그것을 마셨습니다.')
  })

  it('still reads the tab-separated paste a spreadsheet selection produces', () => {
    const tsv = `단어\t뜻\t예문\n물\twater\t${SENTENCE}`
    expect(parseImportText(tsv, NONE).ok[0].input.sampleSentence).toBe(SENTENCE)
  })

  it('reads a header past a UTF-8 byte order mark', () => {
    // What a spreadsheet writes when it saves CSV as UTF-8. The mark rides
    // on the first cell, so the mark plus 단어 has to still read as 단어.
    const csv = `﻿단어,뜻,예문\n물,water,${SENTENCE}`
    expect(parseImportText(csv, NONE).ok[0].input.sampleSentence).toBe(SENTENCE)
  })
})

/**
 * Re-importing a list to repair what a broken import left behind.
 *
 * The words were already in the Compendium with their examples missing, and
 * every row of a corrected file came back "already there — skipping". The
 * only way out was to delete the whole list by hand, so the importer fills
 * blanks on entries it recognises instead.
 */
describe('re-importing fills what is missing', () => {
  const existing = () => [
    createSpell({ korean: '물', english: 'water', wordType: 'noun' }),
  ]

  it('offers to fill an example that never made it in', () => {
    const before = existing()
    const result = parseImportText('단어,뜻,예문\n물,water,물을 마셨습니다.', before)
    expect(result.ok).toHaveLength(0)
    expect(result.fills).toHaveLength(1)
    expect(result.fills[0].fill!.spellId).toBe(before[0].id)
    expect(result.fills[0].fill!.patch).toEqual({ sampleSentence: '물을 마셨습니다.' })
  })

  it('never overwrites something already written', () => {
    // The player may have fixed a definition by hand since. Importing the
    // original file again must not undo it.
    const before = [createSpell({ korean: '물', english: 'water (drinking)', sampleSentence: '내 물.' })]
    const result = parseImportText('단어,뜻,예문\n물,water,물을 마셨습니다.', before)
    expect(result.fills).toHaveLength(0)
    expect(result.duplicates[0].fill).toBeUndefined()
  })

  it('has nothing to say about a file imported twice unchanged', () => {
    const before = [createSpell({ korean: '물', english: 'water', sampleSentence: '물을 마셨습니다.' })]
    const result = parseImportText('단어,뜻,예문\n물,water,물을 마셨습니다.', before)
    expect(result.fills).toHaveLength(0)
    expect(result.duplicates[0].message).toContain('건너뜁니다')
  })

  it('fills several blanks at once and leaves the rest alone', () => {
    const before = existing()
    const header = '단어,뜻,뜻 2,예문,예문 번역,메모'
    const row = '물,drink,water,물을 마셨습니다.,I drank water.,'
    const patch = parseImportText(`${header}\n${row}`, before).fills[0].fill!.patch
    expect(patch).toEqual({
      definition2: 'water',
      sampleSentence: '물을 마셨습니다.',
      sampleTranslation: 'I drank water.',
    })
    // 뜻 was already 'water'; the file says 'drink' and does not get to say so.
    expect(patch.english).toBeUndefined()
    // An empty cell is not a value — it must not blank out a note.
    expect(patch.notes).toBeUndefined()
  })

  it('leaves the word type alone', () => {
    // An entry imported without one holds the default, which is
    // indistinguishable from a choice the player made on purpose.
    const before = existing()
    const result = parseImportText('단어,품사,뜻,예문\n물,동사,water,물을 마셨습니다.', before)
    expect(result.fills[0].fill!.patch).toEqual({ sampleSentence: '물을 마셨습니다.' })
  })

  it('does not count a duplicate inside the same file as something to fill', () => {
    const result = parseImportText('단어,뜻,예문\n물,water,가.\n물,water,나.', NONE)
    expect(result.ok).toHaveLength(1)
    expect(result.duplicates).toHaveLength(1)
    expect(result.fills).toHaveLength(0)
  })
})

/**
 * A stray comma in a file nobody quoted.
 *
 * A hand-written list has an unquoted comma in it sooner or later, and a row
 * with more fields than columns cannot say which cell it came from. The
 * importer puts it back into the most likely one and says on the row that it
 * guessed, rather than silently dropping the tail as it used to.
 */
describe('an unquoted comma in a cell', () => {
  it('rejoins into the sentence rather than onto the end of the row', () => {
    // The shape this game asks people to write: the example in the middle,
    // its translation after it. Rejoining onto the end truncated the
    // sentence and corrupted the translation at the same time.
    const csv = '단어,품사,뜻,예문,예문 번역\n물,명사,water,물을 마셨습니다, 아주 많이.,I drank a lot of water.'
    const [spell] = parseImportText(csv, NONE).ok
    expect(spell.input.sampleSentence).toBe('물을 마셨습니다, 아주 많이.')
    expect(spell.input.sampleTranslation).toBe('I drank a lot of water.')
    expect(spell.input.wordType).toBe('noun')
  })

  it('says on the row that it had to guess', () => {
    const csv = '단어,품사,뜻,예문,예문 번역\n물,명사,water,물을 마셨습니다, 아주 많이.,I drank a lot of water.'
    const [spell] = parseImportText(csv, NONE).ok
    expect(spell.status).toBe('ok')
    expect(spell.message).toContain('예문')
    expect(spell.message).toContain('따옴표')
  })

  it('falls back to notes, then to the last column, when there is no example', () => {
    const noExample = parseImportText('word,definition 1,notes\n물,water,drink, cold', NONE).ok[0]
    expect(noExample.notes).toBe('drink, cold')

    const neither = parseImportText('word,definition 1,definition 2\n물,water,aqua, h2o', NONE).ok[0]
    expect(neither.input.definition2).toBe('aqua, h2o')
  })

  it('keeps a word type reading correctly in front of the broken cell', () => {
    // The rejoin must not shift the columns before it, or a file with one
    // stray comma silently changes every entry's Element.
    const csv = '단어,품사,뜻,예문\n먹다,동사,to eat,밥을 먹었어요, 많이.'
    const [spell] = parseImportText(csv, NONE).ok
    expect(spell.input.wordType).toBe('action_verb')
    expect(spell.english).toBe('to eat')
  })

  it('says nothing about a row that fits', () => {
    const csv = '단어,품사,뜻,예문\n먹다,동사,to eat,밥을 먹었어요.'
    expect(parseImportText(csv, NONE).ok[0].message).toBeUndefined()
  })

  it('still reports an unknown word type alongside the rejoin', () => {
    const csv = '단어,품사,뜻,예문\n먹다,zzz,to eat,밥을 먹었어요, 많이.'
    const message = parseImportText(csv, NONE).ok[0].message!
    expect(message).toContain('알 수 없는 품사')
    expect(message).toContain('따옴표')
  })
})

describe('correcting a word type the broken import never read', () => {
  // The same missing header dropped 품사 as well as 예문, so every entry it
  // made is a noun — and the type is what the entry's Element comes from.
  const saved = () => [createSpell({ korean: '먹다', english: 'to eat', wordType: 'noun' })]
  const FILE = '단어,품사,뜻,예문\n먹다,동사,to eat,밥을 먹었어요.'

  it('leaves the type alone unless asked', () => {
    const patch = parseImportText(FILE, saved()).fills[0].fill!.patch
    expect(patch.wordType).toBeUndefined()
    expect(patch.sampleSentence).toBe('밥을 먹었어요.')
  })

  it('corrects it when asked', () => {
    const patch = parseImportText(FILE, saved(), { retype: true }).fills[0].fill!.patch
    expect(patch.wordType).toBe('action_verb')
  })

  it('offers the choice only when the file actually disagrees', () => {
    const agrees = [createSpell({ korean: '먹다', english: 'to eat', wordType: 'action_verb' })]
    expect(retypesAnything(parseImportText(FILE, agrees), agrees)).toBe(false)
    expect(retypesAnything(parseImportText(FILE, saved()), saved())).toBe(true)
  })

  it('does not offer it for a file with no word type column', () => {
    const plain = 'word,definition 1\n먹다,to eat'
    expect(retypesAnything(parseImportText(plain, saved()), saved())).toBe(false)
  })

  it('finds something to do for an entry whose only fault is its type', () => {
    // Nothing to fill, so without the retype this row is a plain duplicate
    // and the file looks like it has nothing to offer.
    const complete = [createSpell({ korean: '먹다', english: 'to eat', sampleSentence: '밥을 먹었어요.' })]
    expect(parseImportText(FILE, complete).fills).toHaveLength(0)
    expect(parseImportText(FILE, complete, { retype: true }).fills).toHaveLength(1)
  })
})

/**
 * Header spellings that are the same word written differently.
 *
 * The aliases used to hold one spelling each, so a list headed
 * `sampleSentence` — the field's own name, and what a list exported from a
 * spreadsheet template looks like — matched nothing and was read as a
 * column to ignore. Matching on letters alone rather than on punctuation
 * and spacing is what stops this recurring with the next file.
 */
describe('a header written in any reasonable style', () => {
  const ROW = '물,water,물을 마셨습니다.'
  const sentenceOf = (header: string) =>
    parseImportText(`${header}\n${ROW}`, NONE).ok[0]?.input.sampleSentence

  it('reads camelCase, spaced, snake_case and shouted headers alike', () => {
    for (const header of [
      'word,definition1,sampleSentence',
      'word,definition 1,sample sentence',
      'word,definition_1,sample_sentence',
      'WORD,DEFINITION 1,SAMPLE SENTENCE',
      'Word, Definition 1, Sample Sentence',
      'word,definition-1,sample-sentence',
    ]) {
      expect(sentenceOf(header), header).toBe('물을 마셨습니다.')
    }
  })

  it('reads a word type written in any of the same styles', () => {
    for (const spelling of ['actionVerb', 'action verb', 'action_verb', 'ACTION VERB', 'Action-Verb']) {
      expect(parseWordType(spelling), spelling).toBe('action_verb')
    }
    for (const spelling of ['descriptiveVerb', 'descriptive verb', 'Descriptive Verb / Adjective']) {
      expect(parseWordType(spelling), spelling).toBe('descriptive_verb')
    }
  })

  it('does not let two different columns collapse onto one key', () => {
    // Normalising keys is only safe while no two spellings that mean
    // different things reduce to the same one.
    const header = 'sample sentence,sample sentence translation,sample sentence 2,sample sentence translation 2'
    const columns = parseImportText(`word,definition 1,${header}\n물,water,가,A,나,B`, NONE).headerColumns
    expect(columns).toEqual([
      'korean', 'english', 'sampleSentence', 'sampleTranslation', 'sampleSentence2', 'sampleTranslation2',
    ])
  })
})

describe('a word list that carries two examples per word', () => {
  const HEADER = 'word,wordType,definition1,sampleSentence,sampleSentenceTranslation,sampleSentence2,sampleSentenceTranslation2'
  const ROW = '안내,noun,guidance,직원이 안내해 줬어요.,The employee explained.,입구에서 좌석을 안내해 줬어요.,They showed me to my seat.'

  it('keeps both, in the columns the file names', () => {
    const [spell] = parseImportText(`${HEADER}\n${ROW}`, NONE).ok
    expect(spell.input.sampleSentence).toBe('직원이 안내해 줬어요.')
    expect(spell.input.sampleTranslation).toBe('The employee explained.')
    expect(spell.input.sampleSentence2).toBe('입구에서 좌석을 안내해 줬어요.')
    expect(spell.input.sampleTranslation2).toBe('They showed me to my seat.')
  })

  it('round-trips both back out through export', () => {
    const created = parseImportText(`${HEADER}\n${ROW}`, NONE).ok.map((r) => createSpell(r.input))
    const back = parseImportText(exportSpellsToCsv(created), NONE).ok[0]
    expect(back.input.sampleSentence2).toBe('입구에서 좌석을 안내해 줬어요.')
    expect(back.input.sampleTranslation2).toBe('They showed me to my seat.')
  })

  it('fills a missing second example on re-import without touching the first', () => {
    const saved = [createSpell({ korean: '안내', english: 'guidance', sampleSentence: '직원이 안내해 줬어요.' })]
    const patch = parseImportText(`${HEADER}\n${ROW}`, saved).fills[0].fill!.patch
    expect(patch.sampleSentence).toBeUndefined()
    expect(patch.sampleSentence2).toBe('입구에서 좌석을 안내해 줬어요.')
  })

  it('is happy with a list that has only one', () => {
    const [spell] = parseImportText('word,definition 1,sample sentence\n물,water,가.', NONE).ok
    expect(spell.input.sampleSentence).toBe('가.')
    expect(spell.input.sampleSentence2).toBe('')
  })
})

describe('the Combo target columns', () => {
  const HEADER =
    'word,wordType,definition1,sampleSentence,sampleSentenceTranslation,sampleSentenceTargets,sampleSentence2,sampleSentenceTranslation2,sampleSentence2Targets'
  const ROW =
    '나아지다,동사,to improve,계속 연습하면 한국어 실력이 나아질 거예요.,It will improve if you keep practising.,연습하다=연습하면|나아지다=나아질 거예요,실력이 조금씩 나아졌어요.,My ability improved little by little.,나아지다=나아졌어요'

  it('reads both target cells under the names the spec gives them', () => {
    const [row] = parseImportText(`${HEADER}\n${ROW}`, NONE).ok
    expect(row.input.sampleTargets).toBe('연습하다=연습하면|나아지다=나아질 거예요')
    expect(row.input.sampleTargets2).toBe('나아지다=나아졌어요')
  })

  it('keeps the pipes intact in a comma-delimited file', () => {
    // The pipe is also one of the delimiters the parser will split a row
    // on, so the header is what has to decide — not the cell contents.
    const [row] = parseImportText(`${HEADER}\n${ROW}`, NONE).ok
    expect(row.input.sampleTargets?.split('|')).toHaveLength(2)
    expect(row.korean).toBe('나아지다')
  })

  it('round-trips both cells back out through export', () => {
    const created = parseImportText(`${HEADER}\n${ROW}`, NONE).ok.map((r) => createSpell(r.input))
    const back = parseImportText(exportSpellsToCsv(created), NONE).ok[0]
    expect(back.input.sampleTargets).toBe('연습하다=연습하면|나아지다=나아질 거예요')
    expect(back.input.sampleTargets2).toBe('나아지다=나아졌어요')
  })

  it('accepts the Korean and spaced spellings of the headers too', () => {
    const [row] = parseImportText(
      'word,definition 1,sample sentence,sample sentence targets\n남다,to remain,시간이 남으면 좋아요.,남다=남으면',
      NONE,
    ).ok
    expect(row.input.sampleTargets).toBe('남다=남으면')
  })

  it('leaves a list written before Combo existed completely alone', () => {
    const old = 'word,wordType,definition1,sampleSentence,sampleSentenceTranslation\n물,명사,water,물을 마셨어요.,I drank water.'
    const result = parseImportText(old, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(1)
    expect(result.ok[0].input.sampleSentence).toBe('물을 마셨어요.')
    expect(result.ok[0].input.sampleTargets).toBe('')
    expect(result.ok[0].input.sampleTargets2).toBe('')
  })

  it('fills missing target data on re-import without touching the sentence', () => {
    // The whole reason the cells are fillable: a list imported before Combo
    // existed can be given its target data by re-importing the newer file.
    const saved = [
      createSpell({
        korean: '나아지다',
        english: 'to improve',
        sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
      }),
    ]
    const patch = parseImportText(`${HEADER}\n${ROW}`, saved).fills[0].fill!.patch
    expect(patch.sampleSentence).toBeUndefined()
    expect(patch.sampleTargets).toBe('연습하다=연습하면|나아지다=나아질 거예요')
  })

  it('ships target data in the downloadable template', () => {
    const result = parseImportText(IMPORT_TEMPLATE_CSV, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(4)
    const verb = result.ok[0]
    expect(verb.korean).toBe('전달하다')
    expect(verb.input.sampleTargets).toBe('전달하다=전달했어요')
    expect(verb.input.sampleSentence).toBe('내용을 담당자에게 전달했어요.')
    expect(verb.input.presentForm).toBe('전달해요')
    expect(result.ok[3].input.notes).toBe('common greeting')
  })
})
