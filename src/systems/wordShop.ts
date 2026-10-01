/**
 * The Compendium's keeper, and what they say wherever you are in it.
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
 * They are not only at the import counter. The Compendium is their shop —
 * the shelves of words, the sets bundled for a run, the desk where one is
 * written out — and they have something to say in each of those places,
 * because each one has a question the player is actually asking: how many
 * have I got, why can I not take this set into a dungeon, what does this
 * form need before it will save. The same face and the same bubble in every
 * room is what makes it one shop rather than four screens.
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
export function counterSpeech(state: CounterState): KeeperSpeech {
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

// ---------------------------------------------------------------------------
// Everywhere else in the Compendium
// ---------------------------------------------------------------------------

/**
 * Where in the shop the player is standing, and the few facts the keeper
 * would notice from there.
 *
 * A closed set of places rather than a bag of optional fields, so adding a
 * room to the Compendium forces a line to go with it instead of silently
 * inheriting somebody else's.
 */
export type CompendiumPlace =
  /** At the counter, bringing words in. */
  | { at: 'shop'; counter: CounterState }
  /** Among the shelves — the list of every word known. */
  | {
      at: 'words'
      total: number
      /** How many the current search leaves visible. */
      shown: number
      searching: boolean
      /** Of the total, how many carry no example sentence. */
      withoutExample: number
    }
  /** Among the bundles — the spell sets. */
  | {
      at: 'sets'
      sets: number
      /** Sets holding too few words to take into the shallowest dungeon. */
      belowMinimum: number
      /** How many words a set needs before a dungeon will accept it. */
      minimumForDungeon: number
    }
  /** At the desk, writing one word out. */
  | { at: 'editor'; isNew: boolean; hasHeadword: boolean; hasMeaning: boolean; hasExample: boolean }
  /** At the bench, bundling a set. */
  | { at: 'setEditor'; picked: number; available: number; minimumForDungeon: number; isNew: boolean }
  /** Tying several bundles into one, to carry a deeper dungeon. */
  | {
      at: 'merge'
      /** How many sets are ticked. */
      picked: number
      /** Distinct words those sets hold between them. */
      total: number
      /** The most any combination of the player's sets could reach. */
      reachable: number
      /** What the deepest tier they have opened asks for. */
      wanted: number
    }

/** What the keeper says in whichever part of the Compendium is open. */
export function keeperSpeech(place: CompendiumPlace): KeeperSpeech {
  switch (place.at) {
    case 'shop':
      return counterSpeech(place.counter)
    case 'words':
      return shelfSpeech(place)
    case 'sets':
      return bundleSpeech(place)
    case 'editor':
      return deskSpeech(place)
    case 'setEditor':
      return benchSpeech(place)
    case 'merge':
      return mergeSpeech(place)
  }
}

/**
 * Tying bundles together.
 *
 * The one thing worth saying clearly here is the difference between "pick
 * another" and "you do not own enough words for this, whatever you pick" —
 * the second is a trip to the counter, not more ticking, and a player who
 * cannot tell the two apart will sit here trying combinations that cannot
 * work.
 */
function mergeSpeech(place: Extract<CompendiumPlace, { at: 'merge' }>): KeeperSpeech {
  if (place.reachable < place.wanted) {
    return {
      mood: 'concerned',
      line: `가진 낱말을 다 합쳐도 ${place.reachable}개입니다.`,
      hint: `${place.wanted}개짜리 던전에는 모자랍니다 — 낱말을 더 들여오셔야 합니다.`,
    }
  }
  if (place.picked === 0) {
    return {
      mood: 'idle',
      line: '묶음을 골라 주세요. 고른 것들을 하나로 묶어 새 세트로 드립니다.',
      hint: '이미 익힌 낱말을 쓰시는 것이니, 다시 들여올 필요는 없습니다.',
    }
  }
  if (place.picked === 1) {
    return {
      mood: 'reading',
      line: `${place.total}개. 하나만으로는 묶을 것이 없습니다.`,
      hint: '둘 이상 고르셔야 합쳐집니다.',
    }
  }
  if (place.total >= place.wanted) {
    return {
      mood: 'pleased',
      line: `${place.total}개 — 충분합니다.`,
      hint: '같은 낱말이 겹치면 한 번만 셉니다.',
    }
  }
  return {
    mood: 'reading',
    line: `${place.total}개. ${place.wanted - place.total}개가 더 필요합니다.`,
    hint: '같은 낱말이 겹치면 한 번만 세니, 생각보다 적게 모일 수 있습니다.',
  }
}

function shelfSpeech(place: Extract<CompendiumPlace, { at: 'words' }>): KeeperSpeech {
  if (place.total === 0) {
    return {
      mood: 'idle',
      line: '장부가 아직 비어 있습니다. 낱말이 있어야 던전에 가져갈 것도 있지요.',
      hint: '낱말 상점에서 목록을 한 번에 들여오시거나, 직접 한 낱말씩 적어 넣으세요.',
    }
  }
  if (place.searching) {
    if (place.shown === 0) {
      return {
        mood: 'concerned',
        line: '그런 낱말은 장부에 없군요.',
        hint: '한국어로도, 뜻으로도 찾을 수 있습니다.',
      }
    }
    return { mood: 'reading', line: `${place.shown}개 찾았습니다.`, hint: null }
  }
  if (place.withoutExample > 0) {
    return {
      mood: 'reading',
      line: `낱말 ${place.total}개를 맡고 있습니다.`,
      // The one thing on this screen the player can act on, and the reason
      // it matters is elsewhere in the game — so it says where.
      hint: `그중 ${place.withoutExample}개에 예문이 없습니다. 예문은 던전에서 단어를 물을 때 쓰입니다.`,
    }
  }
  return {
    mood: 'pleased',
    line: `낱말 ${place.total}개, 하나도 빠짐없이 예문까지 갖췄습니다.`,
    hint: null,
  }
}

function bundleSpeech(place: Extract<CompendiumPlace, { at: 'sets' }>): KeeperSpeech {
  if (place.sets === 0) {
    return {
      mood: 'idle',
      line: '묶어 둔 세트가 아직 없습니다.',
      hint: `던전은 세트 단위로 받습니다 — 낱말 ${place.minimumForDungeon}개 이상인 세트가 하나는 있어야 들어갈 수 있습니다.`,
    }
  }
  if (place.belowMinimum > 0) {
    return {
      mood: 'concerned',
      line: `세트 ${place.sets}개 중 ${place.belowMinimum}개는 낱말이 모자랍니다.`,
      hint: `가장 얕은 던전도 낱말 ${place.minimumForDungeon}개부터 받습니다.`,
    }
  }
  return {
    mood: 'pleased',
    line: `세트 ${place.sets}개, 모두 던전에 들고 갈 만합니다.`,
    hint: null,
  }
}

function deskSpeech(place: Extract<CompendiumPlace, { at: 'editor' }>): KeeperSpeech {
  const named = place.hasHeadword && place.hasMeaning
  if (!named) {
    if (!place.hasHeadword && !place.hasMeaning) {
      return {
        mood: 'idle',
        line: place.isNew ? '새 낱말이군요. 받아 적겠습니다.' : '고치시는 중이군요.',
        hint: '한국어와 뜻 1, 그 둘만 있으면 장부에 올릴 수 있습니다. 나머지는 언제든 나중에요.',
      }
    }
    return {
      mood: 'concerned',
      line: place.hasHeadword ? '뜻이 아직 비어 있습니다.' : '한국어 쪽이 아직 비어 있습니다.',
      hint: '이 둘은 꼭 있어야 합니다 — 던전이 물어볼 것과, 답으로 받아 줄 것이니까요.',
    }
  }
  if (!place.hasExample) {
    return {
      mood: 'reading',
      line: '이대로도 올릴 수 있습니다.',
      hint: '예문을 한 줄 적어 두시면 던전에서 이 낱말을 물을 때 함께 보여 줍니다.',
    }
  }
  return { mood: 'pleased', line: '예문까지 갖췄군요. 이대로면 훌륭합니다.', hint: null }
}

function benchSpeech(place: Extract<CompendiumPlace, { at: 'setEditor' }>): KeeperSpeech {
  if (place.available === 0) {
    return {
      mood: 'concerned',
      line: '묶을 낱말이 없습니다.',
      hint: '먼저 장부에 낱말을 채워 주세요.',
    }
  }
  if (place.picked === 0) {
    return {
      mood: 'idle',
      line: place.isNew ? '어떤 낱말을 묶으시겠습니까?' : '세트를 고쳐 보시지요.',
      hint: `던전에 들고 가려면 ${place.minimumForDungeon}개 이상 골라야 합니다.`,
    }
  }
  if (place.picked < place.minimumForDungeon) {
    const short = place.minimumForDungeon - place.picked
    return {
      mood: 'concerned',
      line: `${place.picked}개 골랐습니다 — ${short}개 더 있어야 던전에 들어갑니다.`,
      hint: null,
    }
  }
  return {
    mood: 'pleased',
    line: `${place.picked}개. 이만하면 던전에 들고 갈 수 있습니다.`,
    // Said once the set is usable rather than at the start, where it would
    // be one more rule to read before anything had been chosen.
    hint: '많이 담으면 여러 낱말을 골고루, 적게 담으면 같은 낱말을 자주 만납니다.',
  }
}
