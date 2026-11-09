/**
 * Word types and their elements.
 *
 * A vocabulary entry's Element is *derived* from its Word Type rather than
 * stored alongside it. Two copies of the same fact drift apart the moment
 * one is written without the other, and the Element is never edited by
 * hand — so `elementFor()` is the single source of truth everywhere it is
 * displayed, exported or styled.
 */

export type WordType =
  | 'noun'
  | 'action_verb'
  | 'descriptive_verb'
  | 'adverb'
  | 'expression'
  | 'grammar'

export type Element = 'earth' | 'fire' | 'water' | 'wind' | 'lightning' | 'metal' | 'aether'

export interface WordTypeDef {
  id: WordType
  label: string
  /** Short form for chips and dense lists. */
  shortLabel: string
  element: Element
  /** True when this type conjugates on its own (verbs and adjectives). */
  conjugates: boolean
  /**
   * True when this type may carry a related 하다 verb (검토 → 검토하다),
   * which unlocks conjugation fields for the derived verb.
   */
  allowsDerivedVerb: boolean
  /** Label for the future field — intention for actions, prediction for states. */
  futureLabel: string
  hint: string
}

export interface ElementDef {
  id: Element
  label: string
  icon: string
  /** CSS custom-property name holding this element's accent colour. */
  colorVar: string
}

export const elementDefs: Record<Element, ElementDef> = {
  earth: { id: 'earth', label: '땅', icon: '🪨', colorVar: '--element-earth' },
  fire: { id: 'fire', label: '불', icon: '🔥', colorVar: '--element-fire' },
  water: { id: 'water', label: '물', icon: '💧', colorVar: '--element-water' },
  wind: { id: 'wind', label: '바람', icon: '🌬️', colorVar: '--element-wind' },
  lightning: { id: 'lightning', label: '번개', icon: '⚡', colorVar: '--element-lightning' },
  metal: { id: 'metal', label: '쇠', icon: '⚙️', colorVar: '--element-metal' },
  // Written by a deck rather than derived from a word type: nothing in
  // wordTypeDefs produces it. See elementOf() in domain/spell.ts.
  aether: { id: 'aether', label: '허공', icon: '✦', colorVar: '--element-aether' },
}

/** Whether a string names an Element, for reading one out of a deck. */
export function isElement(value: unknown): value is Element {
  return typeof value === 'string' && value in elementDefs
}

export const wordTypeDefs: Record<WordType, WordTypeDef> = {
  noun: {
    id: 'noun',
    label: '명사',
    shortLabel: '명사',
    element: 'earth',
    conjugates: false,
    allowsDerivedVerb: true,
    futureLabel: '미래/의도',
    hint: '사물, 사람, 장소, 개념 — 검토, 학교, 사랑.',
  },
  action_verb: {
    id: 'action_verb',
    label: '동사',
    shortLabel: '동사',
    element: 'fire',
    conjugates: true,
    allowsDerivedVerb: false,
    futureLabel: '미래/의도',
    hint: '행동을 나타내는 말 — 전달하다, 먹다, 가다.',
  },
  descriptive_verb: {
    id: 'descriptive_verb',
    label: '형용사',
    shortLabel: '형용사',
    element: 'water',
    conjugates: true,
    allowsDerivedVerb: false,
    futureLabel: '미래/추측',
    hint: '상태나 성질을 나타내는 말 — 좋다, 예쁘다, 바쁘다.',
  },
  adverb: {
    id: 'adverb',
    label: '부사',
    shortLabel: '부사',
    element: 'wind',
    conjugates: false,
    allowsDerivedVerb: false,
    futureLabel: '미래',
    hint: '어떻게, 언제, 얼마나 — 괜히, 빨리, 자주.',
  },
  expression: {
    id: 'expression',
    label: '표현 / 관용구',
    shortLabel: '관용구',
    element: 'lightning',
    conjugates: false,
    allowsDerivedVerb: true,
    futureLabel: '미래',
    hint: '굳어진 표현 — 안녕하세요, 잘 부탁드립니다.',
  },
  grammar: {
    id: 'grammar',
    label: '문법 / 조사',
    shortLabel: '문법',
    element: 'metal',
    conjugates: false,
    allowsDerivedVerb: false,
    futureLabel: '미래',
    hint: '조사나 문형 — 은/는, -고 싶다.',
  },
}

/** Ordered list for pickers — matches the order the types were specified in. */
export const allWordTypes: WordTypeDef[] = [
  wordTypeDefs.noun,
  wordTypeDefs.action_verb,
  wordTypeDefs.descriptive_verb,
  wordTypeDefs.adverb,
  wordTypeDefs.expression,
  wordTypeDefs.grammar,
]

/** The one place a Word Type becomes an Element. */
export function elementFor(wordType: WordType): Element {
  return wordTypeDefs[wordType].element
}

export function elementDefFor(wordType: WordType): ElementDef {
  return elementDefs[elementFor(wordType)]
}

export function isWordType(value: unknown): value is WordType {
  return typeof value === 'string' && value in wordTypeDefs
}

/**
 * Whether the Present/Past/Future fields apply.
 *
 * Verbs and adjectives always conjugate. A noun or phrase only does so once
 * a 하다 verb has been named for it — the conjugations then describe that
 * derived verb, not the headword.
 */
export function showsConjugations(wordType: WordType, derivedVerb: string): boolean {
  const def = wordTypeDefs[wordType]
  if (def.conjugates) return true
  return def.allowsDerivedVerb && derivedVerb.trim().length > 0
}

/**
 * The future field's label. A derived 하다 verb is an action verb, so it
 * takes the intention wording regardless of the headword's type.
 */
export function futureLabelFor(wordType: WordType, derivedVerb: string): string {
  const def = wordTypeDefs[wordType]
  if (!def.conjugates && derivedVerb.trim().length > 0) return '미래/의도'
  return def.futureLabel
}
