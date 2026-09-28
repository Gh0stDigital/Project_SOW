import type { Spell } from '@/domain/spell'
import { spellAccuracy } from '@/domain/spell'
import type { SpellSet } from '@/domain/spellSet'

export type RecordsSortKey =
  | 'charge'
  | 'accuracy'
  | 'mostPracticed'
  | 'mostMissed'
  | 'recentlyPracticed'
  | 'alphabetical'

export function sortSpells(spells: Spell[], key: RecordsSortKey): Spell[] {
  const arr = [...spells]
  switch (key) {
    // There used to be a separate 'level' sort as well — a one-way rank
    // that disagreed with this meter. Charge is the only measure now.
    case 'charge':
      return arr.sort((a, b) => b.charge - a.charge || spellAccuracy(b) - spellAccuracy(a))
    case 'accuracy':
      return arr.sort((a, b) => spellAccuracy(b) - spellAccuracy(a))
    case 'mostPracticed':
      return arr.sort((a, b) => b.timesEncountered - a.timesEncountered)
    case 'mostMissed':
      return arr.sort((a, b) => b.incorrectAnswers - a.incorrectAnswers)
    case 'recentlyPracticed':
      return arr.sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))
    case 'alphabetical':
    default:
      return arr.sort((a, b) => a.korean.localeCompare(b.korean))
  }
}

export function filterSpellsBySet(spells: Spell[], set: SpellSet | null): Spell[] {
  if (!set) return spells
  const idSet = new Set(set.spellIds)
  return spells.filter((s) => idSet.has(s.id))
}
