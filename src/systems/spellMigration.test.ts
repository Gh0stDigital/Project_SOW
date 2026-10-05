import { describe, expect, it } from 'vitest'
import type { Spell } from '@/domain/spell'
import { definitionsOf } from '@/domain/spell'
import { acceptableAnswers, editSpell } from './spellCompendium'
import { createSpell } from './spellFactory'
import { inferWordType, migrateSpell, migrateSpells } from './spellMigration'

/**
 * A save written before word types existed: korean/english/notes and the
 * progression counters, and nothing else.
 */
function legacySpell(korean: string, english: string): Spell {
  return {
    id: 'spell_legacy',
    korean,
    english,
    notes: 'an old note',
    altKorean: [],
    altEnglish: ['alt meaning'],
    // A save from when a word carried a level, an experience bar and a
    // per-word charge ceiling. All three collapsed into the slot meter.
    level: 4,
    experience: 12,
    charge: 3,
    maxCharge: 11,
    timesEncountered: 9,
    correctAnswers: 7,
    incorrectAnswers: 2,
    correctAttacks: 4,
    failedAttacks: 1,
    successfulDefenses: 3,
    failedDefenses: 1,
    timesEquipped: 2,
    createdAt: '2024-01-01T00:00:00.000Z',
    lastPracticedAt: '2024-02-01T00:00:00.000Z',
  } as unknown as Spell
}

describe('old-data compatibility', () => {
  it('fills in every new field with a safe default', () => {
    const migrated = migrateSpell(legacySpell('학교', 'school'))
    expect(migrated.definition2).toBe('')
    expect(migrated.definition3).toBe('')
    expect(migrated.sampleSentence).toBe('')
    expect(migrated.sampleTranslation).toBe('')
    expect(migrated.derivedVerb).toBe('')
    expect(migrated.presentForm).toBe('')
    expect(migrated.pastForm).toBe('')
    expect(migrated.futureForm).toBe('')
    expect(migrated.wordType).toBeTruthy()
  })

  it('preserves the original content and all progression stats', () => {
    const before = legacySpell('학교', 'school')
    const after = migrateSpell(before)
    expect(after.korean).toBe('학교')
    expect(after.english).toBe('school')
    expect(after.notes).toBe('an old note')
    expect(after.altEnglish).toEqual(['alt meaning'])
    // The level was what decided damage, so it is what the slots come from.
    expect(after.charge).toBe(4)
    expect(after.timesEncountered).toBe(9)
    expect(after.correctAttacks).toBe(4)
    expect(after.createdAt).toBe(before.createdAt)
    expect(after.lastPracticedAt).toBe(before.lastPracticedAt)
  })

  it('keeps a legacy entry answerable', () => {
    const migrated = migrateSpell(legacySpell('학교', 'school'))
    expect(acceptableAnswers(migrated, 'english')).toContain('school')
    expect(acceptableAnswers(migrated, 'korean')).toContain('학교')
    expect(definitionsOf(migrated)).toEqual(['school'])
  })

  it('infers a word type from the headword rather than leaving it unset', () => {
    expect(inferWordType('전달하다')).toBe('action_verb')
    expect(inferWordType('먹다')).toBe('action_verb')
    expect(inferWordType('학교')).toBe('noun')
    expect(inferWordType('사랑')).toBe('noun')
  })

  it('never overwrites a word type that is already stored', () => {
    const typed = { ...legacySpell('검토', 'review'), wordType: 'grammar' } as unknown as Spell
    expect(migrateSpell(typed).wordType).toBe('grammar')
  })

  it('is idempotent — migrating twice changes nothing', () => {
    const once = migrateSpell(legacySpell('학교', 'school'))
    expect(migrateSpell(once)).toEqual(once)
  })

  it('drops conjugations left behind by a type that no longer conjugates', () => {
    const stale = {
      ...legacySpell('학교', 'school'),
      wordType: 'noun',
      derivedVerb: '',
      presentForm: '학교해요',
    } as unknown as Spell
    expect(migrateSpell(stale).presentForm).toBe('')
  })

  it('migrates a whole collection', () => {
    const all = migrateSpells([legacySpell('학교', 'school'), legacySpell('전달하다', 'to deliver')])
    expect(all).toHaveLength(2)
    expect(all.every((s) => typeof s.wordType === 'string')).toBe(true)
  })

  it('tolerates a record with junk in the new fields', () => {
    const junk = {
      ...legacySpell('학교', 'school'),
      wordType: 'nonsense',
      definition2: 42,
      altEnglish: ['ok', 7, null],
    } as unknown as Spell
    const migrated = migrateSpell(junk)
    expect(migrated.wordType).toBe('noun')
    expect(migrated.definition2).toBe('')
    expect(migrated.altEnglish).toEqual(['ok'])
  })
})

describe('definitions and accepted answers', () => {
  const verb = createSpell({
    korean: '전달하다',
    english: 'to deliver',
    definition2: 'to convey',
    definition3: 'to pass along',
    wordType: 'action_verb',
    presentForm: '전달해요',
    pastForm: '전달했어요',
    futureForm: '전달할 거예요',
  })

  it('exposes every populated definition and no blank rows', () => {
    expect(definitionsOf(verb)).toEqual(['to deliver', 'to convey', 'to pass along'])
    const sparse = createSpell({ korean: '괜히', english: 'for no reason', definition3: '   ' })
    expect(definitionsOf(sparse)).toEqual(['for no reason'])
  })

  it('accepts every populated definition as a correct answer', () => {
    expect(acceptableAnswers(verb, 'english')).toEqual(['to deliver', 'to convey', 'to pass along'])
  })

  it('keeps conjugations for a verb', () => {
    expect(verb.presentForm).toBe('전달해요')
    expect(verb.futureForm).toBe('전달할 거예요')
  })

  it('drops conjugations for a type that cannot use them', () => {
    const adverb = createSpell({
      korean: '괜히',
      english: 'for no reason',
      wordType: 'adverb',
      presentForm: '괜히해요',
    })
    expect(adverb.presentForm).toBe('')
  })

  it('keeps conjugations for a noun that names a derived verb', () => {
    const noun = createSpell({
      korean: '검토',
      english: 'review',
      wordType: 'noun',
      derivedVerb: '검토하다',
      presentForm: '검토해요',
      pastForm: '검토했어요',
      futureForm: '검토할 거예요',
    })
    expect(noun.presentForm).toBe('검토해요')
    expect(noun.futureForm).toBe('검토할 거예요')
  })

  it('clears orphan conjugations when an edit changes the type', () => {
    const [edited] = editSpell([verb], verb.id, { wordType: 'noun' })
    expect(edited.wordType).toBe('noun')
    expect(edited.presentForm).toBe('')
    expect(edited.pastForm).toBe('')
    expect(edited.futureForm).toBe('')
    // The meanings survive the type change untouched.
    expect(definitionsOf(edited)).toEqual(['to deliver', 'to convey', 'to pass along'])
  })

  it('leaves untouched fields alone on a partial edit', () => {
    const [edited] = editSpell([verb], verb.id, { definition2: 'to forward' })
    expect(edited.english).toBe('to deliver')
    expect(edited.definition2).toBe('to forward')
    expect(edited.presentForm).toBe('전달해요')
  })
})

describe('a save written before Combo mode', () => {
  it('reads as having no target data rather than undefined', () => {
    const legacy = {
      id: 'spell_1',
      korean: '나아지다',
      english: 'to improve',
      sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
    } as unknown as Spell
    const migrated = migrateSpell(legacy)
    expect(migrated.sampleTargets).toBe('')
    expect(migrated.sampleTargets2).toBe('')
    // And the example it already had is untouched: an old save loses
    // nothing by Combo existing, it is simply not eligible for it.
    expect(migrated.sampleSentence).toBe('계속 연습하면 한국어 실력이 나아질 거예요.')
  })

  it('preserves target data once it has some', () => {
    const saved = {
      id: 'spell_2',
      korean: '남다',
      english: 'to remain',
      sampleSentence: '시간이 좀 남으면 공부할 거예요.',
      sampleTargets: '남다=남으면|공부하다=공부할 거예요',
    } as unknown as Spell
    expect(migrateSpell(saved).sampleTargets).toBe('남다=남으면|공부하다=공부할 거예요')
  })
})
