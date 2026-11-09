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
import { buildTileChallenge, assembledText } from './tileAssembly'
import { createSpell, type NewSpellInput } from './spellFactory'
import { findWorld } from './worldRegistry'

/**
 * Combo mode inside the battle it borrows.
 *
 * Everything reached for here — phases, the defense sequence, the timer,
 * the boss barrier, damage, the log — is the existing battle untouched.
 * What is new is the question, and the things deliberately switched off
 * around it: the counter window and multi-prompt volleys.
 */

const world = findWorld('dragon-king-palace')!
const TIMER = 12

const spell = (input: NewSpellInput) => createSpell(input)

const 딴짓하다 = () =>
  spell({
    korean: '딴짓하다',
    english: 'to go off-task',
    wordType: 'action_verb',
    levelSentences: [
      '나 지금 딴짓해.',
      '어제는 딴짓 안 했어.',
      '딴짓하지 말고 공부하자.',
      '나도 모르게 자꾸 딴짓하게 돼.',
      '딴짓하느라 한국어 공부를 못 했어.',
      '친구가 내가 공부할 때마다 딴짓한다고 하더라고.',
      '어제는 책상에 앉았는데 또 딴짓하느라 한 시간을 날려 버렸어.',
    ],
  })

const 통하다 = () =>
  spell({
    korean: '통하다',
    english: 'to connect',
    wordType: 'action_verb',
    levelSentences: ['우리 둘은 말이 통해.', '어제는 전화가 안 통했어.', '이 방법이 통할까?'],
  })

/** A word with nothing Combo can ask about. */
const plain = (korean: string) => spell({ korean, english: `${korean}-en` })

/** The Totem's level, which is half of what picks the sentence level. */
const combo = (totemLevel = 20) => ({ totemLevel })

describe('a Combo attack', () => {
  it('asks the sentence instead of the word', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    expect(asking.phase).toBe('player_challenge')
    expect(asking.activeChallenge!.combo!.text).toBe('____ 말고 공부하자.')
    expect(asking.activeChallenge!.combo!.answer).toBe('딴짓하지')
  })

  it('falls back to the normal question for a word with no sentence', () => {
    const attacker = plain('학교')
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo())
    expect(asking.activeChallenge!.combo).toBeUndefined()
    expect(asking.activeChallenge!.prompt).toBe('학교-en')
  })

  it('is a normal question when no Combo context is passed at all', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    expect(beginPlayerChallenge(battle, attacker).activeChallenge!.combo).toBeUndefined()
  })

  it('lands and deals damage when the right form is assembled', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    const out = resolvePlayerAttack(asking, attacker, '딴짓하지')
    expect(out.resolution.correct).toBe(true)
    expect(out.damageDealt).toBeGreaterThan(0)
  })

  it('misses when the player knows the word but not the form', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    const out = resolvePlayerAttack(asking, attacker, '딴짓해')
    expect(out.resolution.correct).toBe(false)
    expect(out.damageDealt).toBe(0)
    expect(out.state.phase).toBe('player_resolve')
  })

  it('refuses the dictionary form, which is the mistake the mode is for', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    expect(resolvePlayerAttack(asking, attacker, '딴짓하다').resolution.correct).toBe(false)
  })

  it('pays the word exactly what a normal answer pays it', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    const out = resolvePlayerAttack(asking, attacker, '딴짓하지')
    expect(out.resolution.spell.charge).toBe(attacker.charge + 1)
    expect(out.resolution.spell.correctAttacks).toBe(attacker.correctAttacks + 1)
  })

  it('clears a boss barrier requirement like any other correct attack', () => {
    const attacker = 딴짓하다()
    const pool = [attacker, plain('사랑'), plain('먹다')]
    const battle = startBattle(
      spawnBoss(world, 'seed', 20, 'tier10'),
      pool.map((s) => s.id),
      pool.map((s) => s.id),
    )
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    const answer = asking.activeChallenge!.combo!.answer
    expect(resolvePlayerAttack(asking, attacker, answer).plateauCleared).toBe(true)
  })

  it('asks a harder sentence of a foe that outclasses the Totem', () => {
    const attacker = 딴짓하다()
    const weak = startBattle(spawnEnemy(world, 'seed', 50), [attacker.id], null)
    expect(beginPlayerChallenge(weak, attacker, combo(20)).activeChallenge!.combo!.level).toBe(7)
    const strong = startBattle(spawnEnemy(world, 'seed', 5), [attacker.id], null)
    expect(beginPlayerChallenge(strong, attacker, combo(40)).activeChallenge!.combo!.level).toBe(1)
  })
})

describe('the answer on the tile board', () => {
  it('cuts the inflected form into one tile per syllable', () => {
    // No typing: Combo answers the same way the rest of the game does.
    const board = buildTileChallenge('딴짓하느라', 'korean', [], () => 0)
    expect(board.granularity).toBe('syllable')
    expect(board.answerLength).toBe(5)
  })

  it('reassembles into exactly what the sentence asked for', () => {
    const attacker = 딴짓하다()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), [attacker.id], null)
    const asking = beginPlayerChallenge(battle, attacker, combo(20))
    const answer = asking.activeChallenge!.combo!.answer
    const board = buildTileChallenge(answer, 'korean', [], () => 0)
    const inOrder = [...answer].map((ch) => board.tiles.find((t) => t.text === ch)!)
    expect(assembledText(inOrder, board.joiner)).toBe(answer)
    expect(resolvePlayerAttack(asking, attacker, assembledText(inOrder, board.joiner)).resolution.correct).toBe(true)
  })
})

describe('a Combo defense', () => {
  const pool = () => [딴짓하다(), 통하다(), plain('학교')]

  it('asks a sentence under the clock', () => {
    const spells = pool()
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, combo(20))
    expect(asked.phase).toBe('enemy_challenge')
    expect(asked.timer?.totalSeconds).toBe(TIMER)
  })

  it('never stacks prompts in one volley, even for a boss', () => {
    const spells = pool()
    const battle = startBattle(spawnBoss(world, 'seed', 40, 'tier10'), spells.map((s) => s.id), null)
    for (const roll of [0, 0.5, 0.99]) {
      expect(beginEnemyChallenge(battle, spells, TIMER, () => roll, {}, 1, combo(20)).defense!.challenges).toHaveLength(1)
    }
    // And the Normal volley it stands in for still stacks.
    expect(beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 1).defense!.challenges.length).toBeGreaterThan(1)
  })

  it('blocks rather than counters, however fast the answer came', () => {
    const spells = [딴짓하다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, combo(20))
    const full = { ...asked, timer: { totalSeconds: TIMER, remainingSeconds: TIMER, running: true } }
    const out = resolveDefensePrompt(full, spells[0], asked.activeChallenge!.combo!.answer, false, TIMER)
    expect(out.outcome).toBe('blocked')
    expect(out.counterDamage).toBe(0)
  })

  it('still counters a normal prompt in the same battle', () => {
    const spells = [plain('학교')]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, combo(20))
    expect(asked.activeChallenge!.combo).toBeUndefined()
    const full = { ...asked, timer: { totalSeconds: TIMER, remainingSeconds: TIMER, running: true } }
    const answer = asked.activeChallenge!.direction === 'eng_to_kor' ? '학교' : '학교-en'
    expect(resolveDefensePrompt(full, spells[0], answer, false, TIMER).outcome).toBe('countered')
  })

  it('takes the full hit on a wrong form', () => {
    const spells = [딴짓하다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, combo(20))
    const out = resolveDefensePrompt(asked, spells[0], '딴짓하다', false, TIMER)
    expect(out.outcome).toBe('hit')
    expect(out.damageToTotem).toBe(asked.enemy.damage)
  })

  it('takes the full hit when the clock runs out', () => {
    const spells = [딴짓하다()]
    const battle = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    const asked = beginEnemyChallenge(battle, spells, TIMER, () => 0, {}, 0, combo(20))
    const out = resolveDefensePrompt(asked, spells[0], '', true, TIMER)
    expect(out.outcome).toBe('hit')
    expect(out.sequenceComplete).toBe(true)
  })

  it('scales the enemy sentence by the gap, which is what was asked for', () => {
    const spells = [딴짓하다()]
    const even = startBattle(spawnEnemy(world, 'seed', 20), spells.map((s) => s.id), null)
    expect(beginEnemyChallenge(even, spells, TIMER, () => 0, {}, 0, combo(20)).activeChallenge!.combo!.level).toBe(3)
    const over = startBattle(spawnEnemy(world, 'seed', 60), spells.map((s) => s.id), null)
    expect(beginEnemyChallenge(over, spells, TIMER, () => 0, {}, 0, combo(20)).activeChallenge!.combo!.level).toBe(7)
  })

  it('leaves the counter window balance number alone', () => {
    expect(battleBalance.counterWindow).toBeGreaterThan(0)
  })
})

describe('the Combo question itself', () => {
  const level = { totemLevel: 20, enemyLevel: 20, isBoss: false, charge: 0 }

  it('always asks the player to produce Korean', () => {
    expect(generateComboChallenge(딴짓하다(), 'attack', level)!.direction).toBe('eng_to_kor')
  })

  it('quotes the word, not the whole sentence, for the battle log', () => {
    expect(generateComboChallenge(딴짓하다(), 'attack', level)!.prompt).toBe('딴짓하다')
  })

  it('returns null for an entry Combo cannot ask about', () => {
    expect(generateComboChallenge(plain('학교'), 'attack', level)).toBeNull()
  })
})
