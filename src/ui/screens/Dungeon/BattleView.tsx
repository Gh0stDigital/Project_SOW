import { useEffect, useState } from 'react'
import { useDungeonStore } from '@/state/dungeonStore'
import { usePersistentStore } from '@/state/persistentStore'
import { attackCardAvatar, outmatchedBy, selectableSpellIds } from '@/systems/battleEngine'
import { isFullyCleared, remainingCount, uncleared } from '@/systems/bossPlateau'
import { WorldImage } from '@/ui/components/WorldImage'
import { resolveWorld } from '@/systems/worldRegistry'
import { SceneBackdrop } from '@/ui/components/SceneBackdrop'
import { BarrierRoulette } from '@/ui/components/BarrierRoulette'
import { ExampleSentence } from '@/ui/components/ExampleSentence'
import { useDamageFlash } from '@/ui/hooks/useDamageFlash'
import { sceneSlotFor } from '@/config/scenes'
import { powerBalance } from '@/config/balance'
import { attackPower } from '@/systems/enemyLevel'
import { Bar } from '@/ui/components/Bar'
import { SpellCard } from '@/ui/components/SpellCard'
import { TotemPanel } from '@/ui/components/TotemPanel'
import { RunHud } from '@/ui/components/RunHud'
import { ChallengeView } from './ChallengeView'
import { ComboChallengeView } from './ComboChallengeView'
import { WordInfoPanel } from './WordInfoPanel'

export function BattleView() {
  const battle = useDungeonStore((s) => s.battle)!
  const run = useDungeonStore((s) => s.run)!
  const wordInfoOpen = useDungeonStore((s) => s.activePanel === 'words')
  const toggleWordInfo = useDungeonStore((s) => s.toggleWordInfo)
  const closePanel = useDungeonStore((s) => s.closePanel)
  const selectCard = useDungeonStore((s) => s.selectCard)
  const spinBarrier = useDungeonStore((s) => s.spinBarrier)
  const submitAttackAnswer = useDungeonStore((s) => s.submitAttackAnswer)
  const continueAfterPlayerResolve = useDungeonStore((s) => s.continueAfterPlayerResolve)
  const tickBattleTimer = useDungeonStore((s) => s.tickBattleTimer)
  const submitDefenseAnswer = useDungeonStore((s) => s.submitDefenseAnswer)
  const continueAfterEnemyResolve = useDungeonStore((s) => s.continueAfterEnemyResolve)
  const continueAfterVictory = useDungeonStore((s) => s.continueAfterVictory)
  const continueAfterDefeat = useDungeonStore((s) => s.continueAfterDefeat)

  const spells = usePersistentStore((s) => s.spells)
  const totem = usePersistentStore((s) => s.totems.find((t) => t.id === run.config.totemId))!

  // The enemy timer pauses whenever the tab is hidden or the Words panel is
  // open, so only ever one timer is actually counting down.
  const [documentVisible, setDocumentVisible] = useState(!document.hidden)
  useEffect(() => {
    const handler = () => setDocumentVisible(!document.hidden)
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [])

  useEffect(() => {
    if (battle.phase !== 'enemy_challenge' || !battle.timer?.running) return
    if (wordInfoOpen || !documentVisible) return
    const id = window.setInterval(() => tickBattleTimer(0.25), 250)
    return () => window.clearInterval(id)
  }, [battle.phase, battle.timer?.running, wordInfoOpen, documentVisible, tickBattleTimer])

  const challengeSpell = battle.activeChallenge
    ? spells.find((sp) => sp.id === battle.activeChallenge!.spellId)
    : undefined
  // The word that was just answered — activeChallenge is cleared the moment
  // a prompt resolves, and the resolve screen is where the sentence is
  // finally shown whole.
  const resolvedSpell = battle.lastChallenge
    ? spells.find((sp) => sp.id === battle.lastChallenge!.spellId)
    : undefined

  const asksForKorean = battle.activeChallenge?.direction === 'eng_to_kor'
  const answerFor = (sp: (typeof spells)[number]) => (asksForKorean ? sp.korean : sp.english)
  const decoyPool = run.config.dungeonWordIds
    .map((id) => spells.find((sp) => sp.id === id))
    .filter((sp): sp is (typeof spells)[number] => !!sp)
    .map(answerFor)

  // While a barrier is up the whole dungeon set stays selectable, so no
  // word can become unreachable and lock the fight.
  const handIds = selectableSpellIds(battle, battle.isBoss ? run.config.dungeonWordIds : null)
  const handSpells = handIds
    .map((id) => spells.find((s) => s.id === id))
    .filter((s): s is (typeof spells)[number] => !!s)

  const barrierUp = battle.isBoss && battle.plateau && !isFullyCleared(battle.plateau)
  const barrierLeft = battle.plateau ? remainingCount(battle.plateau) : 0
  const barrierTotal = battle.plateau?.length ?? 0
  // The reel's faces: the requirements still standing, in set order.
  const barrierWords = battle.plateau
    ? uncleared(battle.plateau)
        .map((id) => spells.find((sp) => sp.id === id))
        .filter((sp): sp is (typeof spells)[number] => !!sp)
    : []
  const lastLog = battle.log[battle.log.length - 1] ?? ''
  const answering = battle.phase === 'player_challenge' || battle.phase === 'enemy_challenge'

  const enemyHit = useDamageFlash(battle.enemy.currentHp)
  const outmatched = outmatchedBy(totem.level, battle.enemy.level)

  // A boss fight gets the boss room; ordinary fights get battle art.
  const world = resolveWorld(run.config.worldId)
  const sceneSlot = world
    ? sceneSlotFor(world, battle.isBoss ? 'boss_battle' : 'battle_screen', battle.enemy.name)
    : null

  return (
    <div className="screen" data-challenge={answering ? 'true' : undefined}>
      <div className="row">
        <span className="faint">{battle.isBoss ? '⚔️ 보스 전투' : `⚔️ ${battle.enemy.name}`}</span>
        {!answering && (
          <button className="btn btn-ghost btn-sm" onClick={toggleWordInfo}>
            ℹ️ 단어
          </button>
        )}
      </div>

      <RunHud run={run} totem={totem} modeLabel={battle.isBoss ? '보스 전투' : '전투'} />

      <div className="scene-window battle">
        <SceneBackdrop world={world} slot={sceneSlot} alt="던전 배경" />
        <div
          key={battle.enemy.image.slot}
          className={`battle-enemy-overlay${enemyHit ? ' is-hit' : ''}`}
          data-asset={battle.enemy.image.slot}
        >
          <WorldImage
            world={world}
            folder={battle.enemy.image.folder}
            slot={battle.enemy.image.slot}
            alt={battle.enemy.name}
          />
        </div>
        <span className="scene-tag">{battle.enemy.name}</span>

        {/* The barrier reads inside the window rather than under it.
            As a banner of its own it was three lines of text between the
            enemy and the hand, and on a boss — the one fight where the hand
            is longest — it pushed the cards off the bottom of the screen.
            It is the boss's state, so it belongs on the boss. */}
        {barrierUp && (
          <div className="scene-barrier">
            <span className="scene-barrier-title">🛡️ 방벽</span>
            <span className="scene-barrier-count">
              {barrierTotal - barrierLeft}/{barrierTotal}
            </span>
            <span className="scene-barrier-pips" aria-hidden="true">
              {battle.plateau?.map((r) => (
                <span key={r.spellId} className={`scene-barrier-pip${r.cleared ? ' done' : ''}`} />
              ))}
            </span>
          </div>
        )}
      </div>

      <div className="enemy-hp-row">
        <div className="row">
          <span>
            {battle.enemy.name}{' '}
            {/* The level, next to the name, because it is the number the
                player is really fighting. Marked when it is above theirs —
                that is the moment their words start landing short. */}
            <b className={outmatched > 0 ? 'enemy-level over' : 'enemy-level'}>Lv {battle.enemy.level}</b>
          </span>
          <span className="faint">
            {battle.enemy.currentHp}/{battle.enemy.maxHp} HP
          </span>
        </div>
        <Bar value={battle.enemy.currentHp} max={battle.enemy.maxHp} kind="hp" />
        {outmatched > 0 && (
          <p className="faint enemy-outmatch">
            내 토템보다 {battle.enemy.level - totem.level}레벨 높습니다 — 단어의 위력이{' '}
            {Math.round(powerBalance.efficiency(totem.level, battle.enemy.level) * 100)}%만 실립니다
          </p>
        )}
      </div>

      <TotemPanel totem={totem} compact />

      {/* Multi-prompt attacks show which word of the volley you're on. */}
      {battle.phase === 'enemy_challenge' && battle.defense && battle.defense.challenges.length > 1 && (
        <div className="defense-progress">
          단어 {battle.defense.challenges.length}개 중 {battle.defense.index + 1}번째
          <span className="defense-dots">
            {battle.defense.challenges.map((c, i) => (
              <span
                key={c.id}
                className={`defense-dot${
                  i < battle.defense!.results.length
                    ? battle.defense!.results[i]
                      ? ' hit'
                      : ' miss'
                    : i === battle.defense!.index
                      ? ' active'
                      : ''
                }`}
              />
            ))}
          </span>
        </div>
      )}

      {/* The barrier chooses for you. A fifty-word Dungeon Set turned the
          hand into a list too long to read, and this is the one fight where
          every word is selectable at once — so it becomes a spin instead. */}
      {battle.phase === 'player_select' && barrierUp && (
        <BarrierRoulette
          candidates={barrierWords}
          total={barrierTotal}
          onSpin={spinBarrier}
          onLanded={selectCard}
        />
      )}

      {battle.phase === 'player_select' && !barrierUp && (
        <>
          <p className="muted" style={{ textAlign: 'center' }}>
            공격에 사용할 주문 단어를 고르세요
          </p>
          <div className="hand-scroll">
            {handSpells.map((spell) => {
              const cleared = battle.plateau?.find((r) => r.spellId === spell.id)?.cleared
              return (
                <SpellCard
                  key={spell.id}
                  spell={spell}
                  avatar={attackCardAvatar(spell.korean)}
                  barrierCleared={barrierUp ? cleared : undefined}
                  might={attackPower(totem.level, battle.enemy.level)}
                  onClick={() => selectCard(spell.id)}
                />
              )
            })}
          </div>
          {handSpells.length === 0 && (
            <p className="faint" style={{ textAlign: 'center' }}>
              장착한 주문 단어가 없습니다 — 이 전투가 끝나면 토템 화면을 확인하세요.
            </p>
          )}
        </>
      )}

      {/* One question, two shapes. A Combo run's challenge carries the
          sentence it is really asking; everything else about the phase —
          when it appears, what it submits to, what happens after — is the
          same either way. A word with no target data arrives here without
          a `combo` field even in a Combo run, and is asked normally. */}
      {battle.phase === 'player_challenge' &&
        battle.activeChallenge &&
        challengeSpell &&
        (battle.activeChallenge.combo ? (
          <ComboChallengeView
            challenge={battle.activeChallenge}
            combo={battle.activeChallenge.combo}
            onSubmit={submitAttackAnswer}
            submitLabel="공격!"
            hints
          />
        ) : (
          <ChallengeView
            challenge={battle.activeChallenge}
            answer={answerFor(challengeSpell)}
            decoyPool={decoyPool}
            onSubmit={submitAttackAnswer}
            submitLabel="공격!"
            spell={challengeSpell}
            comboUnavailable={run.config.combatMode === 'combo'}
          />
        ))}

      {battle.phase === 'enemy_challenge' &&
        battle.activeChallenge &&
        challengeSpell &&
        (battle.activeChallenge.combo ? (
          // No hints on a defense: which word the sentence wants is the
          // question, so naming it or translating the sentence would be
          // answering it.
          <ComboChallengeView
            challenge={battle.activeChallenge}
            combo={battle.activeChallenge.combo}
            onSubmit={submitDefenseAnswer}
            submitLabel="방어!"
            timer={battle.timer}
          />
        ) : (
          <ChallengeView
            challenge={battle.activeChallenge}
            answer={answerFor(challengeSpell)}
            decoyPool={decoyPool}
            onSubmit={submitDefenseAnswer}
            submitLabel="방어!"
            timer={battle.timer}
            spell={challengeSpell}
            showCounterWindow
            comboUnavailable={run.config.combatMode === 'combo'}
          />
        ))}

      {battle.phase === 'player_resolve' && (
        <>
          <div className={`feedback-banner ${battle.lastResult ?? ''}`}>{lastLog}</div>
          <ExampleSentence spell={resolvedSpell} reveal />
          <button className="btn btn-primary btn-block" onClick={continueAfterPlayerResolve}>
            계속 →
          </button>
        </>
      )}

      {battle.phase === 'enemy_resolve' && (
        <>
          <div className={`feedback-banner ${battle.lastResult ?? ''}`}>{lastLog}</div>
          <ExampleSentence spell={resolvedSpell} reveal />
          <button className="btn btn-primary btn-block" onClick={continueAfterEnemyResolve}>
            계속 →
          </button>
        </>
      )}

      {battle.phase === 'victory' && (
        <>
          <div className="feedback-banner correct">
            🎉 {battle.enemy.name}을(를) 물리쳤습니다!
          </div>
          <button className="btn btn-primary btn-block" onClick={continueAfterVictory}>
            계속 →
          </button>
        </>
      )}

      {battle.phase === 'defeat' && (
        <>
          <div className="feedback-banner incorrect">💀 토템이 쓰러졌습니다…</div>
          <button className="btn btn-primary btn-block" onClick={continueAfterDefeat}>
            결과 보기
          </button>
        </>
      )}

      <div style={{ flex: 1 }} />

      {wordInfoOpen && <WordInfoPanel run={run} battle={battle} onClose={closePanel} />}
    </div>
  )
}
