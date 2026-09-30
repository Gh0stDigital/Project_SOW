/**
 * The blacksmith, and what he says wherever you are standing in his shop.
 *
 * Same idea as the Compendium's keeper (systems/wordShop.ts): the help a
 * player needs at the workshop changes completely depending on whether
 * their bag is empty, half-full of stones they should be selling, or one
 * dragon horn short of a Totem — and a paragraph of instructions printed
 * over the top can only say one of those things. He says the one that is
 * true right now.
 *
 * Pure — no React, no store, no art. The screen renders whatever this
 * returns.
 */

import type { MaterialStack } from './materials'
import type { ForgeCheck } from './forge'

/** How his frame is drawn. One picture, four moods. */
export type SmithMood = 'idle' | 'working' | 'pleased' | 'refusing'

/**
 * A trade rather than a person, for the same reason the word-shop keeper is:
 * it reads correctly before anybody has drawn or named him.
 */
export const SMITH_NAME = '대장장이'

/** What the workshop is called — the screen's heading. */
export const WORKSHOP_NAME = '대장간'

/** The board over the forge. The trade, not the name. */
export const WORKSHOP_SIGN = '삽니다 · 벼립니다'

export interface SmithSpeech {
  line: string
  hint?: string
  mood: SmithMood
}

/** Where in the workshop the player is standing. */
export type WorkshopPlace =
  | {
      at: 'sell'
      /** Every stack in the bag, materials and treasures together. */
      stacks: readonly MaterialStack[]
      /** What the lot would fetch. */
      total: number
      /** Coins taken in this visit, so a sale gets an answer. */
      earnedThisVisit: number
    }
  | {
      at: 'forge'
      /** Portraits he can strike at all. */
      designs: number
      /** How many of them the player could pay for right now. */
      affordable: number
      /** How many have already been made. */
      forged: number
    }
  | {
      at: 'recipe'
      name: string
      check: ForgeCheck
      /** True when nobody has settled this design's real price yet. */
      provisional: boolean
      /** True when a Totem of this design has been struck before. */
      known: boolean
    }

function sellSpeech(place: Extract<WorkshopPlace, { at: 'sell' }>): SmithSpeech {
  if (place.earnedThisVisit > 0 && place.stacks.length === 0) {
    return {
      line: `${place.earnedThisVisit}냥. 자루가 비었군.`,
      hint: '더 가져오면 더 쳐주겠네.',
      mood: 'pleased',
    }
  }
  if (place.earnedThisVisit > 0) {
    return {
      line: `여기 ${place.earnedThisVisit}냥일세. 더 내놓을 텐가?`,
      hint: '재료는 주조에도 쓰이니, 다 팔기 전에 한 번 더 생각하게.',
      mood: 'pleased',
    }
  }
  if (place.stacks.length === 0) {
    return {
      line: '자루가 비었군. 던전에서 뭐라도 주워 오게.',
      hint: '상자와 보스가 재료를 내놓네. 깊이 들어갈수록 좋은 것이 나오지.',
      mood: 'idle',
    }
  }

  const treasures = place.stacks.filter((s) => s.def.kind === 'treasure')
  if (treasures.length > 0) {
    return {
      line: `전부 ${place.total}냥쯤 되겠군.`,
      // The one piece of advice the screen exists to give: treasure is
      // money and nothing else, materials are not.
      hint: `보물은 팔라고 있는 물건일세 — ${treasures[0].def.name} 같은 것 말이야.`,
      mood: 'working',
    }
  }
  return {
    line: `전부 ${place.total}냥쯤 되겠군.`,
    hint: '재료는 주조에 쓰이네. 쓸 데 없는 것만 팔게.',
    mood: 'working',
  }
}

function forgeSpeech(place: Extract<WorkshopPlace, { at: 'forge' }>): SmithSpeech {
  if (place.designs === 0) {
    return { line: '벼릴 도안이 하나도 없군.', mood: 'idle' }
  }
  if (place.affordable > 0) {
    return {
      line: `지금 당장 ${place.affordable}기는 벼릴 수 있네.`,
      hint: '고르게. 재료와 삯을 받고 그 자리에서 만들어 주지.',
      mood: 'pleased',
    }
  }
  if (place.forged > 0) {
    return {
      line: '재료가 모자라네. 다시 다녀오게.',
      hint: '도안을 눌러 보면 무엇이 얼마나 필요한지 적혀 있네.',
      mood: 'working',
    }
  }
  return {
    line: '토템을 벼려 주지. 재료만 가져오면 되네.',
    hint: '도안을 눌러 보면 무엇이 얼마나 필요한지 적혀 있네.',
    mood: 'working',
  }
}

function recipeSpeech(place: Extract<WorkshopPlace, { at: 'recipe' }>): SmithSpeech {
  const { check } = place
  if (check.canForge) {
    return {
      line: `${place.name}. 지금 바로 벼릴 수 있네.`,
      hint: place.provisional ? '값은 아직 임시일세. 나중에 달라질 수 있네.' : undefined,
      mood: 'pleased',
    }
  }
  if (!check.materialsMet) {
    const short = check.ingredients.filter((i) => !i.met)
    const first = short[0]
    return {
      line: short.length === 1 ? '하나가 모자라네.' : `${short.length}가지가 모자라네.`,
      hint: first ? `${first.quantity - first.have}개를 더 구해 오게.` : undefined,
      mood: 'refusing',
    }
  }
  return {
    line: `삯이 ${check.money}냥일세. ${check.haveMoney}냥으로는 모자라.`,
    hint: '보물을 팔면 금방 모일 걸세.',
    mood: 'refusing',
  }
}

export function smithSpeech(place: WorkshopPlace): SmithSpeech {
  switch (place.at) {
    case 'sell':
      return sellSpeech(place)
    case 'forge':
      return forgeSpeech(place)
    case 'recipe':
      return recipeSpeech(place)
  }
}
