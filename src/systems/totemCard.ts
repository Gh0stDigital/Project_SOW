import type { Spell } from '@/domain/spell'
import type { SpellSet } from '@/domain/spellSet'
import type { Totem } from '@/domain/totem'
import { type Element, elementFor } from '@/config/wordTypes'
import { loreFor } from '@/config/totemLore'
import { creatureWorldName, isCreatureKey } from './creatureTotems'

/** What a creature is, in place of a portrait's written kind. */
function creatureLoreKind(avatarKey: string): string {
  const where = creatureWorldName(avatarKey)
  return where ? `${where}의 것` : '잡아 본 것'
}

function creatureLoreText(avatarKey: string): string {
  const where = creatureWorldName(avatarKey)
  return where
    ? `${where}에서 마주쳤던 것입니다. 대장간에서 벼려 내 이제 당신 편에 섭니다.`
    : '던전에서 마주쳤던 것입니다. 대장간에서 벼려 내 이제 당신 편에 섭니다.'
}
import { resolvedKey } from '@/config/assets'

/**
 * A Totem as a monster card.
 *
 * Everything here is something the game already tracks rather than a stat
 * invented for the card: the level it really is, the attribute its own
 * equipped words lean towards, the size of the deck it carries. A card
 * showing made-up numbers is decoration; this one is a readout. The HP is
 * read straight off the Totem by the card itself, since it changes during
 * a run and nothing here needs to derive it.
 *
 * Pure: no React, no store.
 */

/** Yu-Gi-Oh tops out at twelve stars and so does the row of them. */
export const MAX_STARS = 12

export interface TotemCardData {
  name: string
  kind: string
  description: string
  level: number
  /** Stars to draw; the level is printed as well once it passes the cap. */
  stars: number
  /** The element the equipped words lean towards, or null with no deck. */
  element: Element | null
  /** Words in the equipped set. */
  deckSize: number
}

function dominantElement(spells: Spell[]): Element | null {
  if (spells.length === 0) return null
  const tally = new Map<Element, number>()
  for (const spell of spells) {
    const element = elementFor(spell.wordType)
    tally.set(element, (tally.get(element) ?? 0) + 1)
  }
  // Ties go to the element that appears first in the deck, which keeps the
  // attribute steady instead of flipping as words are added and removed.
  let best: Element | null = null
  let bestCount = 0
  for (const spell of spells) {
    const element = elementFor(spell.wordType)
    const count = tally.get(element) ?? 0
    if (count > bestCount) {
      best = element
      bestCount = count
    }
  }
  return best
}

export function equippedSpells(totem: Totem, spells: Spell[], sets: SpellSet[]): Spell[] {
  const set = sets.find((s) => s.id === totem.equippedSpellSetId)
  if (!set) return []
  return set.spellIds
    .map((id) => spells.find((sp) => sp.id === id))
    .filter((sp): sp is Spell => !!sp)
}

export function totemCard(totem: Totem, spells: Spell[], sets: SpellSet[]): TotemCardData {
  const deck = equippedSpells(totem, spells, sets)
  // Through the same resolution the portrait itself goes through, so the
  // words on the card belong to the face on it.
  //
  // A creature is the exception: its key names world art, and resolvedKey()
  // answers a key the portrait folder does not hold with that folder's
  // fallback — so a minotaur would have been handed a stranger's biography.
  // It gets its own line instead, which is all there is to say about a thing
  // you fought and then wore.
  const lore = isCreatureKey(totem.avatarKey)
    ? { kind: creatureLoreKind(totem.avatarKey), description: creatureLoreText(totem.avatarKey) }
    : loreFor(resolvedKey('totems', totem.avatarKey))
  return {
    name: totem.name,
    kind: lore.kind,
    // A description written on this Totem wins over the portrait's, so a
    // player who names their own character can describe them too.
    description: totem.description?.trim() || lore.description,
    level: totem.level,
    stars: Math.max(1, Math.min(MAX_STARS, totem.level)),
    element: dominantElement(deck),
    deckSize: deck.length,
  }
}
