/**
 * Reading a vocabulary deck straight out of an .xlsx file.
 *
 * Decks are written in a spreadsheet, and the trip through "save as CSV"
 * is where they got damaged: these sentences are full of commas, so an
 * unquoted export tore rows apart in exactly the column that matters.
 * Reading the workbook itself removes the step.
 *
 * No library. An .xlsx is a zip of XML, the platform already has an
 * inflater in DecompressionStream, and the two parts worth reading have a
 * shape regular enough to scan. The alternative was a megabyte of
 * spreadsheet library inside a game that has to work offline.
 *
 * What this does NOT do is understand spreadsheets: no formulas, no dates,
 * no styles, no second worksheet. It reads the first sheet as text, which
 * is all a word list is.
 */

/** Rows of cell text from the workbook's first sheet, header row first. */
export interface SheetRows {
  rows: string[][]
}

// ---------------------------------------------------------------------------
// Zip
// ---------------------------------------------------------------------------

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

interface ZipEntry {
  name: string
  method: number
  compressedSize: number
  localHeaderOffset: number
}

function readCentralDirectory(view: DataView): ZipEntry[] {
  // The end-of-central-directory record is last, after a comment of
  // unknown length, so it is found by scanning back for its signature.
  let eocd = -1
  for (let i = view.byteLength - 22; i >= 0 && i >= view.byteLength - 22 - 0xffff; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('not a zip file')

  const count = view.getUint16(eocd + 10, true)
  let at = view.getUint32(eocd + 16, true)
  const entries: ZipEntry[] = []
  const decoder = new TextDecoder()
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) break
    const method = view.getUint16(at + 10, true)
    const compressedSize = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const extraLength = view.getUint16(at + 30, true)
    const commentLength = view.getUint16(at + 32, true)
    const localHeaderOffset = view.getUint32(at + 42, true)
    const name = decoder.decode(new Uint8Array(view.buffer, view.byteOffset + at + 46, nameLength))
    entries.push({ name, method, compressedSize, localHeaderOffset })
    at += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readEntry(buffer: ArrayBuffer, view: DataView, entry: ZipEntry): Promise<string> {
  // The local header repeats the name and extra fields at its own lengths,
  // which is what says where the data actually starts.
  const base = entry.localHeaderOffset
  const nameLength = view.getUint16(base + 26, true)
  const extraLength = view.getUint16(base + 28, true)
  const start = base + 30 + nameLength + extraLength
  const raw = new Uint8Array(buffer, start, entry.compressedSize)
  const bytes = entry.method === 0 ? raw : await inflate(raw)
  return new TextDecoder().decode(bytes)
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

/**
 * Matches an element whatever namespace prefix it carries.
 *
 * Excel writes <row>; other writers — including the one that produced the
 * November deck — write <x:row> against the same schema. A scanner that
 * only knows the unprefixed spelling reads such a workbook as empty, with
 * nothing to say it did.
 */
function tag(name: string, body: string): RegExp {
  return new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}\\b${body}`, 'g')
}

/** The text of a <v> or similar, prefix or not. */
function innerText(name: string, chunk: string): string | undefined {
  const re = new RegExp(`<(?:[A-Za-z0-9_.-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?${name}>`)
  return re.exec(chunk)?.[1]
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

export function decodeXmlText(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(parseInt(body.slice(2), 16))
    }
    if (body.startsWith('#')) return String.fromCodePoint(parseInt(body.slice(1), 10))
    return ENTITIES[body] ?? whole
  })
}

/** Every <t> inside a chunk, joined — a cell's text can be split by runs. */
function textOf(chunk: string): string {
  let out = ''
  const re = tag('t', '[^>]*?(\\/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?t>)')
  let m: RegExpExecArray | null
  while ((m = re.exec(chunk)) !== null) out += decodeXmlText(m[2] ?? '')
  return out
}

/** The workbook's shared string table, in index order. */
export function parseSharedStrings(xml: string): string[] {
  const out: string[] = []
  const re = tag('si', '[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?si>|<(?:[A-Za-z0-9_.-]+:)?si\\b[^>]*\\/>')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(textOf(m[1] ?? ''))
  return out
}

/** "AB12" -> 27. Column letters are base-26 with no zero. */
export function columnIndex(ref: string): number {
  let n = 0
  for (const ch of ref) {
    const code = ch.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

/** One sheet's cells as rows of text, with gaps filled in as ''. */
export function parseSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const rowRe = tag('row', '[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?row>|<(?:[A-Za-z0-9_.-]+:)?row\\b[^>]*\\/>')
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const body = rowMatch[1] ?? ''
    const cells: string[] = []
    const cellRe = tag('c', '([^>]*?)(?:\\/>|>([\\s\\S]*?)</(?:[A-Za-z0-9_.-]+:)?c>)')
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(body)) !== null) {
      const attrs = cellMatch[1] ?? ''
      const inner = cellMatch[2] ?? ''
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1] ?? ''
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n'
      let value = ''
      if (type === 's') {
        const index = innerText('v', inner)
        value = index !== undefined ? (shared[Number(index)] ?? '') : ''
      } else if (type === 'inlineStr') {
        value = textOf(inner)
      } else {
        // 'str' (a formula's cached text) and plain numbers both live in <v>.
        value = decodeXmlText(innerText('v', inner) ?? '')
      }
      const at = ref ? columnIndex(ref) : cells.length
      while (cells.length < at) cells.push('')
      cells[at] = value
    }
    rows.push(cells)
  }
  return rows
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

/** Reads the first worksheet of an .xlsx as rows of text. */
export async function readXlsx(data: ArrayBuffer): Promise<SheetRows> {
  const view = new DataView(data)
  const entries = readCentralDirectory(view)
  const find = (name: string) => entries.find((e) => e.name === name)

  // Excel names the first sheet sheet1.xml; other writers do not always,
  // so fall back to whichever worksheet sorts first.
  const sheetEntry =
    find('xl/worksheets/sheet1.xml') ??
    entries
      .filter((e) => /^xl\/worksheets\/[^/]+\.xml$/.test(e.name))
      .sort((a, b) => a.name.localeCompare(b.name))[0]
  if (!sheetEntry) throw new Error('no worksheet in workbook')

  const sharedEntry = find('xl/sharedStrings.xml')
  const shared = sharedEntry ? parseSharedStrings(await readEntry(data, view, sharedEntry)) : []
  return { rows: parseSheet(await readEntry(data, view, sheetEntry), shared) }
}

/**
 * The sheet as tab-separated text, which is what the existing importer
 * reads: one parser, one preview, one set of rules about headers and
 * duplicates. Tabs because these cells are full of commas and contain no
 * tabs, and a tab-delimited file needs no quoting at all.
 */
export function rowsToTsv(rows: string[][]): string {
  const width = rows.reduce((n, r) => Math.max(n, r.length), 0)
  return rows
    .filter((r) => r.some((c) => (c ?? '').trim().length > 0))
    .map((r) => {
      const padded = Array.from({ length: width }, (_, i) => (r[i] ?? '').replace(/[\t\r\n]+/g, ' ').trim())
      return padded.join('\t')
    })
    .join('\n')
}

export async function xlsxToImportText(data: ArrayBuffer): Promise<string> {
  return rowsToTsv((await readXlsx(data)).rows)
}
