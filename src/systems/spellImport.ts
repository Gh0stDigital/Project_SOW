/**
 * Batch Spell Word import/export — pure text parsing, no React/state.
 *
 * Accepts loosely-formatted text (pasted from Notes, a spreadsheet export,
 * or a plain .txt/.csv file) and turns it into a per-line report the UI can
 * preview before committing anything.
 *
 * The short form is still the quickest way in:
 *
 *   korean, english
 *   korean, english, notes
 *
 * A header row unlocks the full structured form, in any column order:
 *
 *   word, word type, definition 1, definition 2, definition 3,
 *   sample sentence, sample translation, sample sentence targets,
 *   sample sentence 2, sample translation 2, sample sentence 2 targets,
 *   derived verb, present, past, future, notes
 *
 * The two target columns carry Combo mode's data in the form
 * `dictionaryForm=surfaceForm|dictionaryForm=surfaceForm` — which words
 * appear in that sentence and the exact shape each one takes. Both are
 * optional; a list written before Combo existed is unaffected.
 *
 * Element is never imported — it is derived from Word Type (see
 * config/wordTypes.ts), so an Element column in a re-imported export is
 * read and discarded rather than trusted.
 *
 * The delimiter is auto-detected from the file's first row (tab, pipe,
 * " - ", or comma) and then applied to every row, so a straight paste from
 * a spreadsheet (tab-separated) works exactly the same as a hand-typed
 * comma list. Blank lines are ignored and lines starting with # are treated
 * as comments.
 *
 * One corner: the pipe is both a possible row delimiter and what separates
 * Combo targets within a cell, so a pipe-delimited file cannot carry a
 * pipe-separated target cell. comboTargets.ts accepts a semicolon there
 * for that case.
 */

import type { Spell } from '@/domain/spell'
import { definitionsOf } from '@/domain/spell'
import {
  allWordTypes,
  elementDefFor,
  showsConjugations,
  type WordType,
} from '@/config/wordTypes'
import { validateNewSpell, type NewSpellInput } from './spellFactory'
import type { SpellEditInput } from './spellCompendium'

export type ImportRowStatus = 'ok' | 'error' | 'duplicate'

export interface ImportRow {
  line: number
  raw: string
  korean: string
  english: string
  notes: string
  /** Everything parsed for this row, ready to create a Spell from. */
  input: NewSpellInput
  status: ImportRowStatus
  message?: string
  /**
   * For a word already in the Compendium: which entry it is, and what this
   * file would add to it. Absent when the file adds nothing the entry is
   * missing, so a row that carries one is a row worth re-importing.
   */
  fill?: { spellId: string; patch: SpellEditInput }
}

export interface ImportResult {
  rows: ImportRow[]
  ok: ImportRow[]
  errors: ImportRow[]
  duplicates: ImportRow[]
  /** Duplicates that would fill a blank on the entry already saved. */
  fills: ImportRow[]
  /** Which columns a header row mapped, for the preview to report. */
  headerColumns: string[] | null
}

// Tried in order; the first delimiter that splits a line into 2+ fields wins.
// Tab first since that's what pasting a spreadsheet selection produces.
const DELIMITERS: (string | RegExp)[] = ['\t', '|', /\s+-\s+/, ',']

/** Canonical column keys the parser understands. */
type ColumnKey =
  | 'korean'
  | 'wordType'
  | 'english'
  | 'definition2'
  | 'definition3'
  | 'sampleSentence'
  | 'sampleTranslation'
  | 'sampleSentence2'
  | 'sampleTranslation2'
  | 'sampleTargets'
  | 'sampleTargets2'
  | 'derivedVerb'
  | 'presentForm'
  | 'pastForm'
  | 'futureForm'
  | 'notes'
  | 'ignore'

/** Header spellings accepted for each column, all lowercased. */
const COLUMN_ALIASES: Record<string, ColumnKey> = {
  // The Korean names, which are what the app's own form calls these fields.
  // Leaving them out meant a header written in the language of the interface
  // was not recognised as a header at all: the file fell back to the short
  // positional form, every column past the third was dropped, and the header
  // row itself was imported as a word.
  '단어': 'korean',
  '한국어': 'korean',
  '낱말': 'korean',
  '품사': 'wordType',
  '뜻': 'english',
  '뜻 1': 'english',
  '의미': 'english',
  '영어': 'english',
  '뜻 2': 'definition2',
  '뜻2': 'definition2',
  '뜻 3': 'definition3',
  '뜻3': 'definition3',
  '예문': 'sampleSentence',
  '예시': 'sampleSentence',
  '예문 1': 'sampleSentence',
  '예문 번역': 'sampleTranslation',
  '번역': 'sampleTranslation',
  '예문 2': 'sampleSentence2',
  '예문 번역 2': 'sampleTranslation2',
  '콤보 대상': 'sampleTargets',
  '콤보 대상 2': 'sampleTargets2',
  '파생 동사': 'derivedVerb',
  '파생동사': 'derivedVerb',
  '현재형': 'presentForm',
  '과거형': 'pastForm',
  '미래형': 'futureForm',
  '메모': 'notes',
  '비고': 'notes',
  '속성': 'ignore',

  korean: 'korean',
  kor: 'korean',
  word: 'korean',
  term: 'korean',
  headword: 'korean',

  'word type': 'wordType',
  wordtype: 'wordType',
  type: 'wordType',
  'part of speech': 'wordType',

  english: 'english',
  eng: 'english',
  meaning: 'english',
  definition: 'english',
  'definition 1': 'english',
  definition1: 'english',
  def1: 'english',

  'definition 2': 'definition2',
  definition2: 'definition2',
  def2: 'definition2',
  'definition 3': 'definition3',
  definition3: 'definition3',
  def3: 'definition3',

  'sample sentence': 'sampleSentence',
  sample: 'sampleSentence',
  sentence: 'sampleSentence',
  example: 'sampleSentence',
  'sample sentence 1': 'sampleSentence',
  example1: 'sampleSentence',
  'sample sentence translation': 'sampleTranslation',
  'sample translation': 'sampleTranslation',
  translation: 'sampleTranslation',
  'sample sentence translation 1': 'sampleTranslation',

  // A second example, which study lists routinely carry.
  'sample sentence 2': 'sampleSentence2',
  sample2: 'sampleSentence2',
  sentence2: 'sampleSentence2',
  example2: 'sampleSentence2',
  'sample sentence translation 2': 'sampleTranslation2',
  'sample translation 2': 'sampleTranslation2',
  translation2: 'sampleTranslation2',

  // Combo target metadata. Absent from every list written before Combo
  // mode, and absence is not an error — see systems/comboTargets.ts.
  'sample sentence targets': 'sampleTargets',
  'sample targets': 'sampleTargets',
  targets: 'sampleTargets',
  'sample sentence 1 targets': 'sampleTargets',
  'sample sentence targets 1': 'sampleTargets',
  'sample sentence 2 targets': 'sampleTargets2',
  'sample sentence targets 2': 'sampleTargets2',
  'sample targets 2': 'sampleTargets2',
  targets2: 'sampleTargets2',

  'derived verb': 'derivedVerb',
  derivedverb: 'derivedVerb',
  'hada verb': 'derivedVerb',

  present: 'presentForm',
  'present form': 'presentForm',
  past: 'pastForm',
  'past form': 'pastForm',
  future: 'futureForm',
  'future form': 'futureForm',
  'future/intention': 'futureForm',
  'future/prediction': 'futureForm',

  notes: 'notes',
  note: 'notes',

  // Derived, never imported — accepted in a header so a round-tripped
  // export parses cleanly, then discarded.
  element: 'ignore',
}

/**
 * Word-type spellings accepted in the Word Type column.
 *
 * Three families, all still accepted: the stable ids (what export writes),
 * the English names (what older exports wrote, and what a file written
 * before the interface was translated contains), and the Korean names now
 * shown in the app. Dropping any of them would strand files people already
 * have, which is why export moved to ids rather than following the display
 * language around.
 */
const WORD_TYPE_ALIASES: Record<string, WordType> = {
  noun: 'noun',
  // Korean names, as displayed in the app.
  '명사': 'noun',
  '동사': 'action_verb',
  '형용사': 'descriptive_verb',
  '부사': 'adverb',
  '표현': 'expression',
  '표현 / 관용구': 'expression',
  '표현/관용구': 'expression',
  '관용구': 'expression',
  '문법': 'grammar',
  '문법 / 조사': 'grammar',
  '문법/조사': 'grammar',
  '조사': 'grammar',
  n: 'noun',
  'action verb': 'action_verb',
  action_verb: 'action_verb',
  action: 'action_verb',
  verb: 'action_verb',
  v: 'action_verb',
  'descriptive verb': 'descriptive_verb',
  'descriptive verb/adjective': 'descriptive_verb',
  'descriptive verb / adjective': 'descriptive_verb',
  descriptive_verb: 'descriptive_verb',
  descriptive: 'descriptive_verb',
  adjective: 'descriptive_verb',
  adj: 'descriptive_verb',
  adverb: 'adverb',
  adv: 'adverb',
  expression: 'expression',
  'expression/phrase': 'expression',
  'expression / phrase': 'expression',
  phrase: 'expression',
  grammar: 'grammar',
  'grammar/particle': 'grammar',
  'grammar / particle': 'grammar',
  particle: 'grammar',
}

/**
 * Reduces a header cell or a word-type value to a key.
 *
 * Everything that is only punctuation or spacing goes: case, spaces,
 * underscores, slashes, hyphens. `sampleSentence`, `sample sentence`,
 * `Sample_Sentence` and `SAMPLE SENTENCE` are one word written four ways,
 * and a table that knows only one of them is a table that will be wrong
 * again next month.
 *
 * That is exactly how the examples went missing a second time: the aliases
 * held `sample sentence`, the file said `sampleSentence`, and the column
 * was read as one to ignore. The same miss turned `actionVerb` and
 * `descriptiveVerb` into unknown word types, so every verb in the list came
 * in as a noun — and the word type is where an entry's Element comes from.
 */
function aliasKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_\-/.()]+/g, '')
}

/** Builds a lookup keyed by aliasKey(), so every spelling finds its column. */
function normalizeAliases<T>(aliases: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [spelling, value] of Object.entries(aliases)) out[aliasKey(spelling)] = value
  return out
}

const COLUMN_LOOKUP = normalizeAliases(COLUMN_ALIASES)
const WORD_TYPE_LOOKUP = normalizeAliases(WORD_TYPE_ALIASES)

export function parseWordType(value: string): WordType | null {
  const key = aliasKey(value)
  if (!key) return null
  return WORD_TYPE_LOOKUP[key] ?? null
}

/**
 * Splits one line on a single-character delimiter, honouring quotes.
 *
 * Anything a spreadsheet exports quotes the fields that contain the
 * delimiter — and a sample sentence contains a comma more often than not.
 * Without this, `물,"water, aqua",...` became four fields and every column
 * after the first shifted one to the left, which is how a sentence ended up
 * in a field nothing reads. A doubled quote inside a quoted field is a
 * literal quote, as in RFC 4180.
 */
function splitQuoted(line: string, delimiter: string): string[] {
  const out: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
    } else if (ch === '"' && field.trim() === '') {
      quoted = true
      field = ''
    } else if (ch === delimiter) {
      out.push(field)
      field = ''
    } else field += ch
  }
  out.push(field)
  return out
}

/**
 * Splits a line into fields, untrimmed.
 *
 * The surrounding spaces are kept because a field may still have to be
 * glued back to its neighbour below, and `마셨습니다, 아주` rejoined from
 * trimmed halves comes back as `마셨습니다,아주`. Every caller trims what it
 * finally uses.
 */
function splitOn(line: string, delimiter: string | RegExp): string[] {
  if (typeof delimiter === 'string') return splitQuoted(line, delimiter)
  return line.split(delimiter)
}

/**
 * Picks one delimiter for the whole file, from its first row.
 *
 * It used to be chosen per line, which meant a line was split by whatever
 * happened to appear in it: a sentence containing ' - ' was torn in half on
 * that, in a file that was otherwise commas. The first row decides, and
 * every row after it is read the same way.
 */
function detectDelimiter(lines: string[]): string | RegExp {
  const first = lines.map((l) => l.trim()).find((l) => l && !l.startsWith('#'))
  if (!first) return ','
  for (const delimiter of DELIMITERS) {
    if (splitOn(first, delimiter).length >= 2) return delimiter
  }
  return ','
}

/**
 * Reads a header row into a column map. Returns null when the row isn't a
 * header, in which case the short positional form applies.
 */
function parseHeader(fields: string[]): ColumnKey[] | null {
  if (fields.length < 2) return null
  const mapped = fields.map((f) => COLUMN_LOOKUP[aliasKey(f)])
  // A header must name the headword column and at least one definition;
  // anything less is data, not a header.
  if (!mapped.includes('korean')) return null
  if (!mapped.includes('english')) return null
  return mapped.map((m) => m ?? 'ignore')
}

/**
 * Which column an unquoted delimiter most likely broke.
 *
 * The tail of the row is the usual answer and used to be the only one, but
 * it is wrong for exactly the file this game asks people to write: a list
 * with the example sentence in the middle and its translation after it.
 * Rejoining onto the end there truncated the sentence *and* corrupted the
 * translation. The sentence is far and away the most likely cell to hold a
 * comma, so it is asked first; the guess is reported on the row either way,
 * since with two free-text columns the file itself is ambiguous.
 */
function surplusColumn(columns: ColumnKey[]): number {
  const sentence = columns.indexOf('sampleSentence')
  if (sentence >= 0) return sentence
  const notes = columns.indexOf('notes')
  if (notes >= 0) return notes
  return columns.length - 1
}

/** Column names as the preview reports them, matching the app's own form. */
const COLUMN_LABELS: Partial<Record<ColumnKey, string>> = {
  korean: '단어',
  english: '뜻',
  sampleSentence: '예문',
  sampleTranslation: '예문 번역',
  sampleSentence2: '예문 2',
  sampleTranslation2: '예문 번역 2',
  sampleTargets: '콤보 대상',
  sampleTargets2: '콤보 대상 2',
  notes: '메모',
}

/**
 * Fields a re-import is allowed to fill in on an entry that already exists.
 *
 * `korean` is not one of them — it is what matched the two entries in the
 * first place. Neither is `wordType`: an entry imported without one holds
 * the default, and the default is indistinguishable from a deliberate
 * choice, so changing it would quietly overwrite a decision the player may
 * have made by hand.
 */
const FILLABLE = [
  'english',
  'definition2',
  'definition3',
  'sampleSentence',
  'sampleTranslation',
  'sampleSentence2',
  'sampleTranslation2',
  'sampleTargets',
  'sampleTargets2',
  'derivedVerb',
  'presentForm',
  'pastForm',
  'futureForm',
  'notes',
] as const

/**
 * What this file would add to an entry the player already has.
 *
 * Only blanks are filled, never anything already written: importing the
 * same list twice must not undo an edit made in the app afterwards. Returns
 * null when there is nothing to add, which is what keeps an ordinary
 * re-import of an unchanged file from offering to do anything at all.
 *
 * This exists because of how the sentences went missing: a list imported
 * through the broken parser produced entries with the right word and
 * meaning and an empty example, and the only way back was to delete every
 * one of them and start again. Re-importing the same file now repairs them
 * in place.
 *
 * `retype` is the one thing that overwrites rather than fills. The same
 * broken import also dropped the 품사 column, so every entry it made holds
 * the default type — and the type is what an entry's Element is derived
 * from, which is not a cosmetic detail. It stays off unless asked for,
 * because a blank cannot be told from a choice.
 */
export function fillFromImport(
  existing: Spell,
  input: NewSpellInput,
  retype = false,
): SpellEditInput | null {
  const patch: SpellEditInput = {}
  let any = false
  for (const field of FILLABLE) {
    const incoming = (input[field] ?? '').trim()
    if (!incoming) continue
    if ((existing[field] ?? '').trim()) continue
    patch[field] = incoming
    any = true
  }
  if (retype && input.wordType && input.wordType !== existing.wordType) {
    patch.wordType = input.wordType
    any = true
  }
  return any ? patch : null
}

/** Whether this file disagrees with an entry's saved word type. */
export function retypesAnything(result: ImportResult, existingSpells: Spell[]): boolean {
  const byKorean = new Map(existingSpells.map((sp) => [sp.korean.trim().toLowerCase(), sp]))
  return result.duplicates.some((row) => {
    const saved = byKorean.get(row.korean.trim().toLowerCase())
    return !!saved && !!row.input.wordType && row.input.wordType !== saved.wordType
  })
}

/**
 * Parses raw import text into a row-by-row report. `existingSpells` is used
 * only to flag duplicates (by exact Korean word match, case-insensitive) —
 * nothing is created here, this is preview-only.
 */
export function parseImportText(
  text: string,
  existingSpells: Spell[],
  options: { retype?: boolean } = {},
): ImportResult {
  const existingByKorean = new Map(existingSpells.map((s) => [s.korean.trim().toLowerCase(), s]))
  const seenInBatch = new Set<string>()
  const rows: ImportRow[] = []

  const lines = text.split(/\r?\n/)
  const delimiter = detectDelimiter(lines)
  let columns: ColumnKey[] | null = null
  let headerSeen = false

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    const lineNumber = idx + 1
    if (!line || line.startsWith('#')) return

    let fields = splitOn(line, delimiter)

    // Only the first non-comment row may be a header.
    if (!headerSeen) {
      headerSeen = true
      const parsed = parseHeader(fields)
      if (parsed) {
        columns = parsed
        return
      }
    }

    /**
     * A row with more fields than the header has columns: an unquoted
     * delimiter inside one of the cells. Put it back together.
     */
    let surplusInto: ColumnKey | null = null
    if (columns && typeof delimiter === 'string' && fields.length > columns.length) {
      const extra = fields.length - columns.length
      const at = surplusColumn(columns)
      surplusInto = columns[at]
      fields = [
        ...fields.slice(0, at),
        fields.slice(at, at + extra + 1).join(delimiter),
        ...fields.slice(at + extra + 1),
      ]
    }

    fields = fields.map((f) => f.trim())

    const get = (key: ColumnKey): string => {
      if (!columns) return ''
      const i = columns.indexOf(key)
      return i >= 0 ? (fields[i] ?? '') : ''
    }

    // Structured (header-mapped) or short positional form.
    const korean = columns ? get('korean') : (fields[0] ?? '')
    const english = columns ? get('english') : (fields[1] ?? '')
    const notes = columns ? get('notes') : (fields[2] ?? '')

    const rawType = columns ? get('wordType') : ''
    const wordType = parseWordType(rawType)
    const derivedVerb = columns ? get('derivedVerb') : ''

    const input: NewSpellInput = {
      korean,
      english,
      notes,
      ...(wordType ? { wordType } : {}),
      definition2: columns ? get('definition2') : '',
      definition3: columns ? get('definition3') : '',
      sampleSentence: columns ? get('sampleSentence') : '',
      sampleTranslation: columns ? get('sampleTranslation') : '',
      sampleSentence2: columns ? get('sampleSentence2') : '',
      sampleTranslation2: columns ? get('sampleTranslation2') : '',
      sampleTargets: columns ? get('sampleTargets') : '',
      sampleTargets2: columns ? get('sampleTargets2') : '',
      derivedVerb,
      presentForm: columns ? get('presentForm') : '',
      pastForm: columns ? get('pastForm') : '',
      futureForm: columns ? get('futureForm') : '',
    }

    const base = { line: lineNumber, raw: line, korean, english, notes, input }
    const validation = validateNewSpell({ korean, english })

    if (validation.length > 0) {
      const missing = validation.map((e) => (e.field === 'english' ? '뜻' : '단어')).join(', ')
      rows.push({
        ...base,
        status: 'error',
        message: fields.length < 2 ? '열을 두 개 찾지 못했습니다 — 구분자를 확인하세요.' : `${missing}이(가) 비어 있습니다.`,
      })
      return
    }

    // Things worth saying out loud rather than doing silently. An
    // unrecognised word type decides the entry's Element; a rejoined row was
    // a guess, and the player is the only one who can confirm it.
    const notes_: string[] = []
    if (rawType.trim() && !wordType) {
      notes_.push(`알 수 없는 품사 "${rawType}" — 기본값으로 넣습니다. 가져온 뒤 고치세요.`)
    }
    if (surplusInto) {
      notes_.push(
        `칸보다 ${delimiter === '\t' ? '탭' : `"${String(delimiter)}"`}이(가) 많습니다 — 남은 부분을 ` +
          `${COLUMN_LABELS[surplusInto] ?? '마지막'} 칸에 이어 붙였습니다. 구분자가 들어간 칸은 따옴표로 감싸 주세요.`,
      )
    }
    const message = notes_.length > 0 ? notes_.join(' ') : undefined

    const key = korean.trim().toLowerCase()
    const already = existingByKorean.get(key)
    if (already || seenInBatch.has(key)) {
      const patch = already ? fillFromImport(already, input, options.retype === true) : null
      rows.push({
        ...base,
        status: 'duplicate',
        ...(patch ? { fill: { spellId: already!.id, patch } } : {}),
        message: patch
          ? `이미 도감에 있습니다 — 비어 있는 칸 ${Object.keys(patch).length}개를 채울 수 있습니다.`
          : '이미 도감에 있습니다 — 건너뜁니다.',
      })
      return
    }

    seenInBatch.add(key)
    rows.push({ ...base, status: 'ok', message })
  })

  return {
    rows,
    ok: rows.filter((r) => r.status === 'ok'),
    errors: rows.filter((r) => r.status === 'error'),
    duplicates: rows.filter((r) => r.status === 'duplicate'),
    fills: rows.filter((r) => r.fill),
    headerColumns: columns,
  }
}

export function importRowsToInputs(rows: ImportRow[]): NewSpellInput[] {
  return rows.map((r) => r.input)
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const EXPORT_HEADER = [
  'word',
  'word type',
  'element',
  'definition 1',
  'definition 2',
  'definition 3',
  'sample sentence',
  'sample sentence translation',
  'sample sentence targets',
  'sample sentence 2',
  'sample sentence translation 2',
  'sample sentence 2 targets',
  'derived verb',
  'present',
  'past',
  'future',
  'notes',
]

/** Quotes a CSV cell only when it needs it. */
function csvCell(value: string): string {
  const v = value ?? ''
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

/**
 * The player's whole Compendium as CSV, in the same shape the importer
 * reads back. Element is written for the reader's benefit and ignored on
 * re-import, since it is always derived from Word Type.
 */
export function exportSpellsToCsv(spells: Spell[]): string {
  const rows = spells.map((s) => {
    const forms = showsConjugations(s.wordType, s.derivedVerb)
    return [
      s.korean,
      // Ids, not display labels — a file exported in one language has to
      // import in another, and labels move when the app is translated.
      s.wordType,
      elementDefFor(s.wordType).id,
      s.english,
      s.definition2,
      s.definition3,
      s.sampleSentence,
      s.sampleTranslation,
      s.sampleTargets,
      s.sampleSentence2,
      s.sampleTranslation2,
      s.sampleTargets2,
      s.derivedVerb,
      forms ? s.presentForm : '',
      forms ? s.pastForm : '',
      forms ? s.futureForm : '',
      s.notes,
    ].map(csvCell)
  })
  return [EXPORT_HEADER.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/** One-line summary of an entry's meanings, for compact previews. */
export function definitionSummary(spell: Spell): string {
  return definitionsOf(spell).join(', ')
}

/**
 * A downloadable example file in the exact format parseImportText()
 * expects — a header row plus filled-in sample rows covering a verb, an
 * adverb and a noun with a derived 하다 verb. CSV so it opens straight
 * into Excel/Sheets/Numbers, but it's just plain text.
 *
 * The two target columns are what Combo mode reads: each names the words
 * inside its sentence and the exact form each one takes there. They are
 * optional — a list without them imports exactly as it always did, and its
 * words simply stay unavailable for Combo questions.
 */
export const IMPORT_TEMPLATE_CSV = [
  EXPORT_HEADER.join(','),
  '전달하다,동사,,to deliver,to convey,to pass along,내용을 담당자에게 전달했어요.,I passed the information along to the person in charge.,전달하다=전달했어요,들은 내용을 그대로 팀에 전달했어요.,I passed on exactly what I heard to the team.,듣다=들은|전달하다=전달했어요,,전달해요,전달했어요,전달할 거예요,',
  '괜히,부사,,for no reason,needlessly,unnecessarily,괜히 걱정했어요.,I worried for no reason.,괜히=괜히|걱정하다=걱정했어요,,,,,,,,',
  '검토,명사,,review,examination,consideration,,,,,,,검토하다,검토해요,검토했어요,검토할 거예요,',
  '안녕하세요,표현/관용구,,hello,,,,,,,,,,,,,common greeting',
].join('\n')

/** The short two-column form, for players who just want a quick list. */
export const IMPORT_TEMPLATE_SIMPLE_CSV = [
  'word,definition 1,notes',
  '안녕하세요,hello,common greeting',
  '감사합니다,thank you,polite form',
  '사랑,love,',
].join('\n')

export { allWordTypes }
