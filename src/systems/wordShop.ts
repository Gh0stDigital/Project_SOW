/**
 * The word shop's keeper, and what they say while you are at the counter.
 *
 * Importing vocabulary used to be a form: a textarea, four rows of buttons,
 * and a paragraph of instructions above them that had to be read before
 * anything made sense — and which said the same thing whether the box was
 * empty, full of good rows, or full of nothing the parser could read.
 *
 * A shopkeeper answers that better than a paragraph does. They say the one
 * thing that is true right now: what to do when the counter is empty, what
 * they can see when something is on it, which lines they cannot read, and
 * what they are about to take. The help arrives while it is needed rather
 * than all at once before anything has happened.
 *
 * Pure — no React, no store, no art. The screen renders whatever this
 * returns.
 */

/**
 * What the keeper's portrait should be doing.
 *
 * Used for styling rather than for separate art: one portrait, framed
 * differently depending on whether they are waiting, reading, worried about
 * what they are reading, or pleased with it.
 */
export type KeeperMood = 'idle' | 'reading' | 'concerned' | 'pleased' | 'done'

/**
 * The name over the counter.
 *
 * A role rather than a person for now, so it reads correctly before anyone
 * has drawn or named them. Change this and the art in public/assets/shop
 * together.
 */
export const SHOP_KEEPER_NAME = '낱말 상인'

/** What the shop is called, shown as the screen's heading. */
export const SHOP_NAME = '낱말 상점'

/**
 * The board hung over the counter.
 *
 * Not the shop's name — the screen's title already carries that, and saying
 * it twice reads as a mistake rather than as signage. This is the trade,
 * which is what a real sign advertises. It promises nothing the game does
 * not do: words are taken in, and no money changes hands for them.
 */
export const SHOP_SIGN = '낱말, 받습니다'

/** Everything the keeper looks at before speaking. */
export interface CounterState {
  /** Something is on the counter — text pasted, or a file opened. */
  hasText: boolean
  /** Rows that would become new words. */
  ready: number
  /** Saved words this file could fill blanks on. */
  fills: number
  /** Rows naming a word already known that this file cannot improve. */
  duplicates: number
  /** Rows the parser could not read at all. */
  errors: number
  /** The file named its columns, so it can carry more than word and meaning. */
  hasHeader: boolean
  /** How many rows carry an example sentence. */
  withExamples: number
  /** Set once the import has actually been committed. */
  imported: number | null
  /** Blanks filled by that commit. */
  filled: number
}

export interface KeeperSpeech {
  mood: KeeperMood
  /** What they say — one or two short sentences. */
  line: string
  /** A practical note under it, or null when the line says enough. */
  hint: string | null
}

export function emptyCounter(): CounterState {
  return {
    hasText: false,
    ready: 0,
    fills: 0,
    duplicates: 0,
    errors: 0,
    hasHeader: false,
    withExamples: 0,
    imported: null,
    filled: 0,
  }
}

/**
 * What the keeper says about the counter as it stands.
 *
 * Ordered by what matters most to the player at that moment, not by how the
 * parser happens to classify rows: a file that reads as nothing needs the
 * format explained, a file that mostly reads needs its count, and the
 * awkward middle needs to know which lines were dropped.
 */
export function keeperSpeech(state: CounterState): KeeperSpeech {
  // 1. The sale is done.
  if (state.imported !== null) {
    if (state.imported === 0 && state.filled > 0) {
      return {
        mood: 'done',
        line: `새 낱말은 없었지만, 이미 있던 ${state.filled}개의 빈 칸을 채워 두었습니다.`,
        hint: '도감에서 바로 확인할 수 있습니다.',
      }
    }
    return {
      mood: 'done',
      line:
        state.filled > 0
          ? `낱말 ${state.imported}개를 장부에 올렸습니다. 있던 ${state.filled}개의 빈 칸도 채웠고요.`
          : `낱말 ${state.imported}개를 장부에 올렸습니다.`,
      hint: '이제 주문 세트로 묶어 던전에 가져갈 수 있습니다.',
    }
  }

  // 2. Nothing on the counter yet — this is where the instructions belong.
  if (!state.hasText) {
    return {
      mood: 'idle',
      line: '어서 오세요. 가져오신 낱말을 여기 올려 두시면 제가 살펴보겠습니다.',
      hint: '목록을 붙여 넣거나 .txt · .csv 파일을 여세요. 한 줄에 하나, 한국어를 먼저 쓰고 뜻을 씁니다.',
    }
  }

  // 3. Something is there, but none of it reads.
  if (state.ready === 0 && state.fills === 0) {
    if (state.duplicates > 0 && state.errors === 0) {
      return {
        mood: 'concerned',
        line: `${state.duplicates}개 모두 이미 장부에 있는 낱말입니다. 새로 올릴 것이 없군요.`,
        hint: '다른 목록을 올리거나, 아래에서 빈 칸 채우기를 켜 보세요.',
      }
    }
    return {
      mood: 'concerned',
      line: '죄송합니다 — 여기서는 낱말을 하나도 읽어 내지 못하겠습니다.',
      hint: '한국어와 뜻을 쉼표, 탭, 또는 세로줄로 나눠 주세요. 예: 안녕하세요, hello',
    }
  }

  // 4. Nothing new, but the file improves what is already known.
  if (state.ready === 0 && state.fills > 0) {
    return {
      mood: 'reading',
      line: `새 낱말은 없습니다만, 이미 있던 ${state.fills}개를 더 채워 넣을 수 있겠습니다.`,
      hint: '비어 있던 칸만 채웁니다 — 이미 적어 두신 것은 건드리지 않습니다.',
    }
  }

  // 5. Readable, with some of it dropped.
  if (state.errors > 0) {
    return {
      mood: 'reading',
      line: `${state.ready}개는 잘 읽었습니다. ${state.errors}줄은 알아보지 못했고요.`,
      hint: '읽지 못한 줄은 아래 목록에 빨갛게 표시했습니다. 그대로 가져가도 괜찮습니다.',
    }
  }

  // 6. Readable, with some already known.
  if (state.duplicates > 0) {
    return {
      mood: 'reading',
      line: `새 낱말 ${state.ready}개. ${state.duplicates}개는 이미 장부에 있어 건너뛰겠습니다.`,
      hint: state.fills > 0 ? `그중 ${state.fills}개는 빈 칸을 채울 수 있습니다.` : null,
    }
  }

  // 7. A clean file.
  return {
    mood: 'pleased',
    line: `좋습니다 — 낱말 ${state.ready}개, 전부 깨끗하게 읽힙니다.`,
    hint: hintForCleanFile(state),
  }
}

/**
 * The one thing worth mentioning about a file that is already fine.
 *
 * A clean import is the moment the player will actually read a suggestion,
 * so it is spent on the thing that most often goes missing: the example
 * sentences, which cannot be added later without redoing the file.
 */
function hintForCleanFile(state: CounterState): string | null {
  if (!state.hasHeader) {
    return '머리글 행(단어, 뜻, 예문…)을 붙이면 예문과 활용형까지 함께 가져올 수 있습니다.'
  }
  if (state.withExamples === 0) {
    return '예문이 있는 줄이 하나도 없군요. 던전에서 예문이 쓰이니, 있다면 넣어 두시는 편이 좋습니다.'
  }
  if (state.withExamples < state.ready) {
    return `${state.ready}개 중 ${state.withExamples}개에만 예문이 있습니다.`
  }
  return '예문까지 모두 갖췄습니다. 이대로면 던전에서 바로 쓸 수 있겠군요.'
}
