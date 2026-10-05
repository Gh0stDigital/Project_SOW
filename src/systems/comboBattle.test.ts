import { describe, expect, it } from 'vitest'
import { battleBalance } from '@/config/balance'
import {
  beginEnemyChallenge,
  beginPlayerChallenge,
  resolveDefensePrompt,
  resolvePlayerAttack,
  spawnBoss,
  spawnEnemy,
  startBattle,
} from './battleEngine'
import { generateComboChallenge } from './challengeEngine'
import { COMBO_BLANK } from './comboTargets'
import { createSpell, type NewSpellInput } from './spellFactory'
import { findWorld } from './worldRegistry'

/**
 * Combo mode inside the battle it borrows.
 *
 * Everything these tests reach for — phases, the defense sequence, the
 * timer, the boss barrier, damage, the log — is the existing battle system
 * untouched. What is new is the question, and the things deliberately
 * switched off around it: the counter window, multi-prompt volleys, and any
 * credit for the second word in a sentence.
 */

const world = findWorld('dragon-king-palace')!
const TIMER = 12

const spell = (input: NewSpellInput) => createSpell(input)

const 나아지다 = () =>
  spell({
    korean: '나아지다',
    english: 'to improve',
    wordType: 'action_verb',
    sampleSentence: '계속 연습하면 한국어 실력이 나아질 거예요.',
    sampleTranslation: 'It will improve if you keep practising.',
    sampleTargets: '연습하다=연습하면|나아지다=나아질 거예요',
  })

const 연습하다 = () => spell({ korean: '연습하다', english: 'to practise', wordType: 'action_verb' })

/** A word with no target data — every entry imported before Combo existed. */
const plain = (korean: string) => spell({ korean, english: `${korean}-en` })

describe('a Combo attack', () => {
  it('asks the sentence instead of the word', () => {
    const attacker = 나아지다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, { equipped: [attacker] })
    expect(asking.phase).toBe('player_challenge')
    expect(asking.activeChallenge!.combo!.text).toBe(`계속 연습하면 한국어 실력이 ${COMBO_BLANK}.`)
  })

  it('falls back to the normal question for a word with no target data', () => {
    // A Combo run's pool is a mix. The word still has to be usable.
    const attacker = plain('학교')
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, { equipped: [attacker] })
    expect(asking.activeChallenge!.combo).toBeUndefined()
    expect(asking.activeChallenge!.prompt).toBe('학교-en')
  })

  it('is a normal question when no Combo context is passed at all', () => {
    const attacker = 나아지다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    expect(beginPlayerChallenge(battle, attacker).activeChallenge!.combo).toBeUndefined()
  })

  it('lands and deals damage when the sentence is completed', () => {
    const attacker = 나아지다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, { equipped: [attacker] })
    const out = resolvePlayerAttack(asking, attacker, ['나아질 거예요'])
    expect(out.resolution.correct).toBe(true)
    expect(out.damageDealt).toBeGreaterThan(0)
    expect(out.state.enemy.currentHp).toBeLessThan(out.state.enemy.maxHp)
  })

  it('misses when the player knows the word but not the form the sentence wants', () => {
    const attacker = 나아지다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, { equipped: [attacker] })
    const out = resolvePlayerAttack(asking, attacker, ['나아져요'])
    expect(out.resolution.correct).toBe(false)
    expect(out.damageDealt).toBe(0)
    // And the usual failed-attack behaviour: the card goes back, the fight
    // continues, nothing special happens because it was Combo.
    expect(out.state.phase).toBe('player_resolve')
    expect(out.state.lastResult).toBe('incorrect')
  })

  it('needs every gap, not just the word that was selected', () => {
    const attacker = 나아지다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, {
      equipped: [attacker, 연습하다()],
      rng: () => 0,
    })
    expect(asking.activeChallenge!.combo!.blanks).toHaveLength(2)
    expect(resolvePlayerAttack(asking, attacker, ['연습해요', '나아질 거예요']).resolution.correct).toBe(false)
    expect(resolvePlayerAttack(asking, attacker, ['연습하면', '나아질 거예요']).resolution.correct).toBe(true)
  })

  it('pays the selected word exactly what a normal answer pays it, and the other gap nothing', () => {
    // Two or three gaps per answer must not become two or three words'
    // worth of practice: Combo is a harder question about one word, not a
    // faster way through the Compendium.
    const attacker = 나아지다()
    const practise = 연습하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 10), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, { equipped: [attacker, practise], rng: () => 0 })
    const out = resolvePlayerAttack(asking, attacker, ['연습하면', '나아질 거예요'])
    expect(out.resolution.spell.id).toBe(attacker.id)
    expect(out.resolution.spell.charge).toBe(attacker.charge + 1)
    expect(out.resolution.spell.correctAttacks).toBe(attacker.correctAttacks + 1)
    // The second word is named on its gap, and that is all it gets.
    const extra = asking.activeChallenge!.combo!.blanks.find((b) => !b.primary)!
    expect(extra.spellId).toBe(practise.id)
    expect(practise.charge).toBe(0)
    expect(practise.timesEncountered).toBe(0)
  })

  it('clears a boss barrier requirement like any other correct attack', () => {
    const attacker = 나아지다()
    const pool = [attacker, plain('사랑'), plain('먹다')]
    const battle = startBattle(
      spawnBoss(world, 'seed', 20, 'tier10'),
      pool.map((s) => s.id),
      pool.map((s) => s.id),
    )
    const asking = beginPlayerChallenge(battle, attacker, { equipped: pool })
    const out = resolvePlayerAttack(asking, attacker, ['나아질 거예요'])
    expect(out.plateauCleared).toBe(true)
  })
})

describe('a Combo defense', () => {
  const pool = () => [나아지다(), 연습하다(), plain('학교')]

  it('asks a sentence with one gap', () => {
    const spells = pool()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    expect(asked.phase).toBe('enemy_challenge')
    expect(asked.activeChallenge!.combo!.blanks).toHaveLength(1)
  })

  it('never stacks prompts in one volley, even for a boss', () => {
    // A boss volley in Normal can ask for several words at once. In Combo
    // that would be several whole forms typed against one clock.
    const spells = pool()
    const battle = startBattle(spawnBoss(world, 'seed', 40, 'tier10'), spells.map((s) => s.id), null)
    for (const roll of [0, 0.5, 0.99]) {
      const asked = beginEnemyChallenge(battle, spells, TIMER, () => roll, {}, 1, { equipped: spells })
      expect(asked.defense!.challenges).toHaveLength(1)
    }
    // And the Normal volley it is standing in for still stacks.
    const normal = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 1)
    expect(normal.defense!.challenges.length).toBeGreaterThan(1)
  })

  it('blocks rather than counters, however fast the answer came', () => {
    const spells = [나아지다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    const full = { ...asked, timer: { totalSeconds: TIMER, remainingSeconds: TIMER, running: true } }
    const out = resolveDefensePrompt(full, spells[0], ['나아질 거예요'], false, TIMER)
    expect(out.outcome).toBe('blocked')
    expect(out.counterDamage).toBe(0)
    expect(out.damageToTotem).toBeGreaterThan(0)
  })

  it('still counters a normal prompt in the same battle', () => {
    // The counter is off for the Combo question, not for the game.
    const spells = [plain('학교')]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    expect(asked.activeChallenge!.combo).toBeUndefined()
    const full = { ...asked, timer: { totalSeconds: TIMER, remainingSeconds: TIMER, running: true } }
    const answer = asked.activeChallenge!.direction === 'eng_to_kor' ? '학교' : '학교-en'
    expect(resolveDefensePrompt(full, spells[0], answer, false, TIMER).outcome).toBe('countered')
  })

  it('takes the full hit on a wrong form', () => {
    const spells = [나아지다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    const out = resolveDefensePrompt(asked, spells[0], ['나아져요'], false, TIMER)
    expect(out.outcome).toBe('hit')
    expect(out.damageToTotem).toBe(asked.enemy.damage)
  })

  it('takes the full hit when the clock runs out', () => {
    const spells = [나아지다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    const out = resolveDefensePrompt(asked, spells[0], '', true, TIMER)
    expect(out.outcome).toBe('hit')
    expect(out.sequenceComplete).toBe(true)
  })

  it('falls back to a normal prompt for a pool word with no target data', () => {
    const spells = [plain('학교')]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, { equipped: spells })
    expect(asked.activeChallenge!.combo).toBeUndefined()
    expect(asked.activeChallenge!.context).toBe('defense')
  })

  it('leaves the counter window balance number alone', () => {
    expect(battleBalance.counterWindow).toBeGreaterThan(0)
  })
})

describe('the Combo question itself', () => {
  it('always asks the player to produce Korean', () => {
    const challenge = generateComboChallenge(나아지다(), 'attack')!
    expect(challenge.direction).toBe('eng_to_kor')
  })

  it('quotes the word, not the whole sentence, for the battle log', () => {
    const challenge = generateComboChallenge(나아지다(), 'attack')!
    expect(challenge.prompt).toBe('나아지다')
  })

  it('returns null for an entry Combo cannot ask about', () => {
    expect(generateComboChallenge(plain('학교'), 'attack')).toBeNull()
  })
})
