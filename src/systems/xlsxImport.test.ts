import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { columnIndex, decodeXmlText, parseSharedStrings, parseSheet, rowsToTsv, xlsxToImportText } from './xlsxImport'
import { parseImportText } from './spellImport'
import { createSpell } from './spellFactory'
import { blankSentence } from './sentenceBlank'
import type { Spell } from '@/domain/spell'

/**
 * A real deck, kept as a fixture rather than hand-written XML.
 *
 * Every assumption this reader makes — namespaced tags, inline strings,
 * skipped empty cells, commas inside sentences — came from this file, and
 * a workbook written by a different tool breaks them in ways no synthetic
 * sample would show.
 */
const DECK = new URL('./__fixtures__/november-deck.xlsx', import.meta.url)
const NONE: Spell[] = []

function deckBuffer(): ArrayBuffer {
  const b = readFileSync(DECK)
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

describe('the bits of XML a workbook is made of', () => {
  it('decodes the entities a spreadsheet writes', () => {
    expect(decodeXmlText('a &amp; b &lt;c&gt; &quot;d&quot; &apos;e&apos;')).toBe(`a & b <c> "d" 'e'`)
    expect(decodeXmlText('&#54620;&#44397;')).toBe('한국')
    expect(decodeXmlText('&#xD55C;')).toBe('한')
  })

  it('joins a shared string split across runs', () => {
    // Excel splits a cell wherever its formatting changes, so a sentence
    // read run by run comes back in pieces.
    const xml = '<sst><si><r><t>통하</t></r><r><t>다</t></r></si><si><t>학교</t></si></sst>'
    expect(parseSharedStrings(xml)).toEqual(['통하다', '학교'])
  })

  it('reads an empty shared string as empty rather than dropping it', () => {
    expect(parseSharedStrings('<sst><si><t/></si><si><t>물</t></si></sst>')).toEqual(['', '물'])
  })

  it('turns column letters into indexes', () => {
    expect(columnIndex('A1')).toBe(0)
    expect(columnIndex('Z9')).toBe(25)
    expect(columnIndex('AA1')).toBe(26)
    expect(columnIndex('AB12')).toBe(27)
  })

  it('puts a cell in the column its reference names, not the one it arrives in', () => {
    // A row skips empty cells entirely, so position in the file says
    // nothing about which column a value belongs to.
    const sheet = '<worksheet><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row></worksheet>'
    expect(parseSheet(sheet, ['단어', '뜻'])).toEqual([['단어', '', '뜻']])
  })

  it('reads an inline string and a plain number', () => {
    const sheet = '<worksheet><row><c r="A1" t="inlineStr"><is><t>물</t></is></c><c r="B1"><v>7</v></c></row></worksheet>'
    expect(parseSheet(sheet, [])).toEqual([['물', '7']])
  })
})

describe('turning a sheet into text the importer reads', () => {
  it('pads short rows so every column lines up', () => {
    expect(rowsToTsv([['word', 'def', 'notes'], ['물', 'water']])).toBe('word\tdef\tnotes\n물\twater\t')
  })

  it('drops blank rows', () => {
    expect(rowsToTsv([['word', 'def'], ['', ''], ['물', 'water']])).toBe('word\tdef\n물\twater')
  })

  it('flattens a newline inside a cell, which would otherwise end the row', () => {
    expect(rowsToTsv([['a', 'one\ntwo']])).toBe('a\tone two')
  })
})

describe('the November deck, read from the workbook itself', () => {
  const buffer = deckBuffer()

  it('imports every word with no errors', async () => {
    const text = await xlsxToImportText(buffer)
    const result = parseImportText(text, NONE)
    expect(result.errors).toHaveLength(0)
    expect(result.ok).toHaveLength(15)
  })

  it('keeps commas inside the sentences intact', async () => {
    // The reason for reading the workbook at all: these sentences are
    // full of commas, and a CSV export of them tore rows apart.
    const text = await xlsxToImportText(buffer)
    const spells = parseImportText(text, NONE).ok.map((r) => createSpell(r.input))
    const long = spells.find((s) => s.korean === '통하다')!
    expect(long.levelSentences[6]).toContain(',')
    expect(long.levelSentences[6].startsWith('처음엔')).toBe(true)
  })

  it('carries all seven levels for every word', async () => {
    const text = await xlsxToImportText(buffer)
    const spells = parseImportText(text, NONE).ok.map((r) => createSpell(r.input))
    for (const spell of spells) {
      expect(spell.levelSentences.filter(Boolean)).toHaveLength(7)
      expect(spell.levelTranslations.filter(Boolean)).toHaveLength(7)
    }
  })

  it('reads the element the deck names, Aether included', async () => {
    const text = await xlsxToImportText(buffer)
    const spells = parseImportText(text, NONE).ok.map((r) => createSpell(r.input))
    expect(spells.find((s) => s.korean === '딴짓하다')!.element).toBe('aether')
    expect(spells.find((s) => s.korean === '시사만평')!.element).toBe('earth')
    expect(spells.find((s) => s.korean === '통하다')!.element).toBe('fire')
  })

  it('can blank the headword out of all 105 sentences', async () => {
    // The whole mode rests on this: no deck column says where the word is.
    const text = await xlsxToImportText(buffer)
    const spells = parseImportText(text, NONE).ok.map((r) => createSpell(r.input))
    let found = 0
    let total = 0
    for (const spell of spells) {
      for (const sentence of spell.levelSentences.filter(Boolean)) {
        total++
        if (blankSentence(sentence, spell.korean)) found++
      }
    }
    expect(total).toBe(105)
    expect(found).toBe(105)
  })

  it('fills the plain example from level 1, so normal mode still shows one', async () => {
    const text = await xlsxToImportText(buffer)
    const spells = parseImportText(text, NONE).ok.map((r) => createSpell(r.input))
    const spell = spells.find((s) => s.korean === '딴짓하다')!
    expect(spell.sampleSentence).toBe('나 지금 딴짓해.')
    expect(spell.sampleSentence2).toBe('어제는 딴짓 안 했어.')
  })
})
