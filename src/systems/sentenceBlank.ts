/**
 * Finding a headword inside its own example sentence.
 *
 * Combo asks the player to produce a word the way a sentence needs it:
 * 통하다 typed back as 통했는데. For that the game has to know which part of
 * the sentence belongs to the word — and the vocabulary decks that matter
 * now carry seven sentences per word and no metadata saying so.
 *
 * It is still not a conjugation engine. Nothing here generates a Korean
 * form: it reads the sentence the deck already wrote and works out which
 * chunk of it is the headword wearing an ending. The answer is always a
 * string the deck itself contains, which is the rule that matters, because
 * the chunk it finds becomes the expected answer.
 *
 * What makes that possible without metadata is comparing *below* the
 * syllable. Korean inflection usually keeps the stem's leading consonant
 * and vowel and changes only what follows:
 *
 *   통하다   → 통해, 통했어, 통하니까   (하 → 해/했: ㅎ+ㅏ survives)
 *   역겹다   → 역겨워                  (겹 → 겨: ㄱ+ㅕ survives, ㅂ drops)
 *   딴짓하다 → 딴짓해, 딴짓한다고
 *
 * So a syllable that matches outright counts 1, a syllable that keeps the
 * stem syllable's initial and medial counts a half and ends the run, and
 * everything else ends the run at zero. On the November deck that picks
 * the right chunk in all 105 sentences.
 *
 * Pure: no React, no store.
 */

/** What a blank is drawn as. Matches exampleSentence.ts's marker. */
export const SENTENCE_BLANK = '____'

export interface BlankedSentence {
  /** The sentence with the located chunk replaced by SENTENCE_BLANK. */
  text: string
  /** The sentence untouched, for showing once the answer is in. */
  sentence: string
  /** Exactly what the player has to reproduce. */
  answer: string
  /** Where the answer sat in the sentence. */
  start: number
  end: number
}

const HANGUL_BASE = 0xac00
const HANGUL_END = 0xd7a3
const JUNG = 28

/** Leading consonant of a Hangul syllable, or null for anything else. */
function onset(ch: string): number | null {
  const code = ch.codePointAt(0) ?? 0
  if (code < HANGUL_BASE || code > HANGUL_END) return null
  return Math.floor((code - HANGUL_BASE) / (JUNG * 21))
}

/** Leading syllables that match outright. */
function wholePrefix(stem: string, token: string): number {
  const a = [...stem]
  const b = [...token]
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * How much of `stem` the start of `token` accounts for, in syllables.
 *
 * A whole syllable is 1. A syllable that keeps only the stem syllable's
 * leading consonant is a half and stops the count, since the ending has
 * taken over from there: 하 → 해 changes the vowel, 겹 → 겨 drops the final
 * consonant, and both keep the onset. Anything else stops it dead.
 */
export function stemOverlap(stem: string, token: string): number {
  let score = 0
  const a = [...stem]
  const b = [...token]
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i] === b[i]) {
      score += 1
      continue
    }
    const x = onset(a[i])
    const y = onset(b[i])
    if (x !== null && y !== null && x === y) score += 0.5
    break
  }
  return score
}

/**
 * The part of a headword that survives into a sentence.
 *
 * 하다 and 하다-like entries lose their 다; a noun keeps everything, since
 * what follows it is a particle rather than an ending.
 */
export function stemOf(word: string): string {
  const w = word.trim()
  return w.length > 1 && w.endsWith('다') ? w.slice(0, -1) : w
}

/**
 * Whether `token` accounts for enough of `stem` to be it wearing an ending.
 *
 * The bar is every syllable but the last, plus at least the last one's
 * leading consonant — so 통하 is found by 통해 (통 + half of 하) and not by
 * 통계, which shares only the first syllable and would otherwise drag the
 * blank onto an unrelated word. A one-syllable stem has to match outright
 * for the same reason: half of 가 is most of the alphabet.
 *
 * The one way past that bar is a run of whole syllables two or more long.
 * That is what a sentence splitting the word leaves behind — 딴짓하다 in
 * 어제는 딴짓 안 했어 — and two exact syllables is evidence where one is not.
 */
function matchesStem(stem: string, token: string): boolean {
  const length = [...stem].length
  if (length === 0) return false
  const score = stemOverlap(stem, token)
  if (score >= Math.max(1, length - 0.5)) return true
  return wholePrefix(stem, token) >= 2
}

interface Token {
  text: string
  start: number
  end: number
}

/** Sentence split into eojeol, with the offsets they sit at. */
function tokenize(sentence: string): Token[] {
  const out: Token[] = []
  const re = /\S+/gu
  let m: RegExpExecArray | null
  while ((m = re.exec(sentence)) !== null) {
    out.push({ text: m[0], start: m.index, end: m.index + m[0].length })
  }
  return out
}

// Trailing marks are the sentence's, not the word's: 딴짓해. must not ask
// the player for the full stop, and the tile board has no tile for one.
const TRAILING = /[.,!?;:…·"'”’」』\])}]+$/u
const LEADING = /^["'“‘「『([{]+/u

function trim(token: Token): Token {
  let { text, start, end } = token
  const lead = LEADING.exec(text)
  if (lead) {
    start += lead[0].length
    text = text.slice(lead[0].length)
  }
  const tail = TRAILING.exec(text)
  if (tail) {
    end -= tail[0].length
    text = text.slice(0, text.length - tail[0].length)
  }
  return { text, start, end }
}

/**
 * Where the headword sits in the sentence, or null when it cannot be found.
 *
 * A headword of several words — 붙어 다니다 — is looked for across that many
 * neighbouring chunks first, so the blank covers 붙어 다녀 rather than
 * leaving 붙어 printed beside the gap. Failing that, its last word is
 * looked for alone, which is what a sentence that drops the first part
 * leaves behind.
 */
export function locateHeadword(sentence: string, headword: string): Token | null {
  const tokens = tokenize(sentence).map(trim).filter((t) => t.text.length > 0)
  if (tokens.length === 0) return null

  const parts = headword.trim().split(/\s+/u).filter(Boolean)
  if (parts.length === 0) return null
  const stems = parts.map(stemOf)

  // A multi-word headword, matched across neighbouring chunks.
  if (stems.length > 1) {
    let best: { span: Token; score: number } | null = null
    for (let i = 0; i + stems.length <= tokens.length; i++) {
      let total = 0
      let ok = true
      for (let k = 0; k < stems.length; k++) {
        if (!matchesStem(stems[k], tokens[i + k].text)) {
          ok = false
          break
        }
        total += stemOverlap(stems[k], tokens[i + k].text)
      }
      if (!ok) continue
      const span = {
        text: sentence.slice(tokens[i].start, tokens[i + stems.length - 1].end),
        start: tokens[i].start,
        end: tokens[i + stems.length - 1].end,
      }
      if (!best || total > best.score) best = { span, score: total }
    }
    if (best) return best.span
  }

  // One chunk, scored against the headword's last word — the one that
  // carries the ending.
  const stem = stems[stems.length - 1]
  let best: { token: Token; score: number } | null = null
  for (const token of tokens) {
    if (!matchesStem(stem, token.text)) continue
    const score = stemOverlap(stem, token.text)
    // Ties go to the longer match: 딴짓하느라 over a bare 딴짓 elsewhere in
    // the same sentence.
    if (!best || score > best.score || (score === best.score && token.text.length > best.token.text.length)) {
      best = { token, score }
    }
  }
  return best ? best.token : null
}

/**
 * Blanks a headword out of one of its sentences, or returns null when the
 * sentence does not visibly contain it.
 *
 * Null is an ordinary answer: a deck may carry a sentence that paraphrases
 * the word rather than using it, and the caller falls back to the normal
 * question for that word.
 */
export function blankSentence(sentence: string, headword: string): BlankedSentence | null {
  const clean = (sentence ?? '').trim()
  if (!clean || !(headword ?? '').trim()) return null
  const found = locateHeadword(clean, headword)
  if (!found) return null
  return {
    text: clean.slice(0, found.start) + SENTENCE_BLANK + clean.slice(found.end),
    sentence: clean,
    answer: found.text,
    start: found.start,
    end: found.end,
  }
}
