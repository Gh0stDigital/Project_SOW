import type { SpellSet } from '@/domain/spellSet'
import { makeId } from './idGen'

/** Spell Set management — pure reducer-style operations. Sets reference Spell IDs only. */

export function createSpellSet(sets: SpellSet[], name: string, spellIds: string[] = []): SpellSet[] {
  const now = new Date().toISOString()
  const set: SpellSet = {
    id: makeId('set'),
    name: name.trim() || '제목 없는 세트',
    spellIds: [...new Set(spellIds)],
    createdAt: now,
    modifiedAt: now,
  }
  return [...sets, set]
}

export function renameSpellSet(sets: SpellSet[], id: string, name: string): SpellSet[] {
  return sets.map((s) => (s.id === id ? { ...s, name: name.trim() || s.name, modifiedAt: new Date().toISOString() } : s))
}

export function addSpellToSet(sets: SpellSet[], setId: string, spellId: string): SpellSet[] {
  return sets.map((s) => {
    if (s.id !== setId || s.spellIds.includes(spellId)) return s
    return { ...s, spellIds: [...s.spellIds, spellId], modifiedAt: new Date().toISOString() }
  })
}

export function removeSpellFromSet(sets: SpellSet[], setId: string, spellId: string): SpellSet[] {
  return sets.map((s) => {
    if (s.id !== setId) return s
    return { ...s, spellIds: s.spellIds.filter((id) => id !== spellId), modifiedAt: new Date().toISOString() }
  })
}

export function deleteSpellSet(sets: SpellSet[], id: string): SpellSet[] {
  return sets.filter((s) => s.id !== id)
}

/** Removes a Spell ID from every set — call when a Spell is deleted from the Compendium. */
export function pruneSpellFromAllSets(sets: SpellSet[], spellId: string): SpellSet[] {
  return sets.map((s) => ({
    ...s,
    spellIds: s.spellIds.filter((id) => id !== spellId),
    modifiedAt: s.spellIds.includes(spellId) ? new Date().toISOString() : s.modifiedAt,
  }))
}

export function getSpellSet(sets: SpellSet[], id: string): SpellSet | undefined {
  return sets.find((s) => s.id === id)
}

/**
 * The marker a run carries when the player wants the dungeon's words chosen
 * for them.
 *
 * Kept as a set id rather than as a separate flag so everything that already
 * stores a chosen set — the saved last selection, the setup screen's state —
 * carries it without knowing what it means. It is resolved to a real set at
 * the moment a run starts, which is what makes the choice re-roll every run
 * instead of being decided once and remembered.
 */
export const RANDOM_SET_ID = '__random__'

/** Sets that actually have words in them; an empty set cannot carry a run. */
export function usableSets(sets: SpellSet[]): SpellSet[] {
  return sets.filter((s) => s.spellIds.length > 0)
}

/**
 * One set at random, or null when there is nothing to pick from.
 *
 * `exclude` is the set the last run used: with more than one to choose
 * between it is skipped, so asking for random twice does not hand back the
 * same words — which is the whole point of asking.
 */
export function pickRandomSet(
  sets: SpellSet[],
  random: () => number,
  exclude?: string | null,
): SpellSet | null {
  const usable = usableSets(sets)
  if (usable.length === 0) return null
  const choices = usable.length > 1 ? usable.filter((s) => s.id !== exclude) : usable
  const from = choices.length > 0 ? choices : usable
  return from[Math.min(from.length - 1, Math.floor(random() * from.length))]
}

// ---------------------------------------------------------------------------
// Combining sets
// ---------------------------------------------------------------------------

/**
 * The words several sets hold between them, each one once.
 *
 * Order follows the sets as they were picked, and within a set the order it
 * already had, so a merge reads as the parts laid end to end rather than as
 * a reshuffle. A word in two sets keeps its first position.
 */
export function mergedSpellIds(sets: SpellSet[], pickedIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const setId of pickedIds) {
    const set = sets.find((s) => s.id === setId)
    if (!set) continue
    for (const spellId of set.spellIds) {
      if (seen.has(spellId)) continue
      seen.add(spellId)
      out.push(spellId)
    }
  }
  return out
}

/**
 * How many distinct words a merge would come to.
 *
 * The number worth showing while picking, and the one people are surprised
 * by: two 25-word sets that overlap do not make 50.
 */
export function mergedCount(sets: SpellSet[], pickedIds: readonly string[]): number {
  return mergedSpellIds(sets, pickedIds).length
}

/**
 * A name for the result, made from its parts.
 *
 * Joined with "+" up to a point, then counted, because a merge of six sets
 * named after their topics produces a title nothing can render.
 */
export function mergedName(sets: SpellSet[], pickedIds: readonly string[], maxParts = 3): string {
  const names = pickedIds
    .map((id) => sets.find((s) => s.id === id)?.name)
    .filter((name): name is string => !!name)
  if (names.length === 0) return ''
  if (names.length <= maxParts) return names.join(' + ')
  return `${names.slice(0, maxParts).join(' + ')} 외 ${names.length - maxParts}개`
}

/**
 * The most words any combination of these sets could reach.
 *
 * What the ceiling is, so a screen can tell the difference between "pick
 * more sets" and "you do not own enough words for this tier, whatever you
 * pick" — the second being a trip to the word shop rather than a trip
 * through this screen.
 */
export function reachableWordCount(sets: SpellSet[]): number {
  return mergedCount(sets, sets.map((s) => s.id))
}
