import { useEffect, useState } from 'react'
import type { DungeonState } from '@/domain/dungeon'
import { useDungeonStore, challengedCount, wordsNeededThisRun } from '@/state/dungeonStore'
import { usePersistentStore } from '@/state/persistentStore'
import { canEnterBoss } from '@/systems/dungeonSession'
import { sceneSlotFor, sceneKindForEvent } from '@/config/scenes'
import { WorldImage } from '@/ui/components/WorldImage'
import { resolveWorld } from '@/systems/worldRegistry'
import { SceneBackdrop } from '@/ui/components/SceneBackdrop'
import { TypewriterText } from '@/ui/components/TypewriterText'
import { DungeonProgressTrack } from '@/ui/components/DungeonProgressTrack'
import { TotemPanel } from '@/ui/components/TotemPanel'
import { MoveRollModal } from '@/ui/components/MoveRollModal'
import { RunHud } from '@/ui/components/RunHud'
import { ChallengeView } from './ChallengeView'
import { ExampleSentence } from '@/ui/components/ExampleSentence'
import { WordInfoPanel } from './WordInfoPanel'
import { ItemPanel } from './ItemPanel'
import { StatusPanel } from './StatusPanel'
import { StandbyActions } from './StandbyActions'
import { MagicRoomView } from './MagicRoomView'
import { RestAreaView } from './RestAreaView'
import {
  BossDoorNotice,
  DirectionChoices,
  KeyRoomView,
  RewardSummary,
  TreasureChoice,
} from './EventActionViews'

const modeLabels: Record<DungeonState, string> = {
  DungeonSetup: '준비',
  Standby: '대기',
  Rolling: '이동 중',
  ResolvingEvent: '이벤트',
  VocabularyInput: '응답 중',
  Battle: '전투',
  Rest: '쉼터',
  BossBattle: '보스 전투',
  Results: '결과',
  Defeat: '패배',
}

/**
 * The non-battle half of a dungeon run: Standby, the dice roll, and every
 * event that isn't combat. Which of those is on screen is decided by the
 * run's explicit state plus its event stage — this component never decides
 * for itself what is legal, it only renders what the store says is current.
 */
export function ExploreView() {
  const run = useDungeonStore((s) => s.run)!
  const stage = useDungeonStore((s) => s.stage)
  const puzzle = useDungeonStore((s) => s.puzzle)
  const rolling = useDungeonStore((s) => s.rolling)
  const activePanel = useDungeonStore((s) => s.activePanel)

  const openPanel = useDungeonStore((s) => s.openPanel)
  const closePanel = useDungeonStore((s) => s.closePanel)
  const move = useDungeonStore((s) => s.move)
  const finishRoll = useDungeonStore((s) => s.finishRoll)
  const acknowledgeEvent = useDungeonStore((s) => s.acknowledgeEvent)
  const attemptTreasure = useDungeonStore((s) => s.attemptTreasure)
  const leaveTreasure = useDungeonStore((s) => s.leaveTreasure)
  const submitEventAnswer = useDungeonStore((s) => s.submitEventAnswer)
  const guessSyllable = useDungeonStore((s) => s.guessSyllable)
  const finishMagicRoom = useDungeonStore((s) => s.finishMagicRoom)
  const chooseDirection = useDungeonStore((s) => s.chooseDirection)
  const takeKey = useDungeonStore((s) => s.takeKey)
  const openRestArea = useDungeonStore((s) => s.openRestArea)
  const leaveRest = useDungeonStore((s) => s.leaveRest)
  const buyRest = useDungeonStore((s) => s.buyRest)
  const talkToNpc = useDungeonStore((s) => s.talkToNpc)
  const npcSaid = useDungeonStore((s) => s.npcSaid)
  const askEnterBossDoor = useDungeonStore((s) => s.askEnterBossDoor)
  const cancelEnterBossDoor = useDungeonStore((s) => s.cancelEnterBossDoor)
  const enterBossDoor = useDungeonStore((s) => s.enterBossDoor)
  const confirmingBoss = useDungeonStore((s) => s.confirmingBoss)
  const useItem = useDungeonStore((s) => s.useItem)
  const tickEventTimer = useDungeonStore((s) => s.tickEventTimer)

  const allSpells = usePersistentStore((s) => s.spells)
  const totems = usePersistentStore((s) => s.totems)
  const spellSets = usePersistentStore((s) => s.spellSets)
  const inventory = usePersistentStore((s) => s.inventory)
  const charsPerSecond = usePersistentStore((s) => s.settings.typewriterCharsPerSecond)

  const totem = totems.find((t) => t.id === run.config.totemId)!
  const totemSet = spellSets.find((s) => s.id === run.config.totemSpellSetId) ?? null
  const event = run.currentEvent

  // Dialogue must finish revealing before its buttons appear, so a tap
  // meant for the text can't land on an action.
  //
  // Keyed on the event and whether outcome text has replaced the intro —
  // deliberately NOT on the stage, so advancing within one event (reading
  // a chest, then choosing to open it) doesn't retype the same lines.
  const showingOutcome = run.lastOutcomeText.length > 0
  const dialogueLines = showingOutcome
    ? run.lastOutcomeText
    : event
      ? event.bodyText
      : run.standbyNotice
        ? [run.standbyNotice]
        : []
  const dialogueKey = `${event?.id ?? run.standbyNotice ?? 'none'}:${showingOutcome ? 'outcome' : 'intro'}`
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const dialogueRevealed = revealedKey === dialogueKey

  const [rollSettled, setRollSettled] = useState(false)

  // The trap countdown. Paused whenever a panel is open or the tab is
  // hidden, and torn down the moment the timer clears — so exactly one
  // event timer can ever be running.
  const timerRunning = !!run.eventTimer?.running && !activePanel
  useEffect(() => {
    if (!timerRunning) return
    const id = window.setInterval(() => tickEventTimer(0.25), 250)
    return () => window.clearInterval(id)
  }, [timerRunning, tickEventTimer])
  const introduced = challengedCount(run)
  // The track counts toward what actually opens the key, not toward the
  // whole word list. With a fixed requirement a bar filling to "8 of 50"
  // would read as a run barely started when it is about to end.
  const total = wordsNeededThisRun(run)

  const inStandby = run.state === 'Standby' && !rolling
  const challengeSpell = event?.challenge
    ? allSpells.find((sp) => sp.id === event.challenge!.spellId)
    : undefined
  const asksForKorean = event?.challenge?.direction === 'eng_to_kor'
  const answersInRun = run.config.dungeonWordIds
    .map((id) => allSpells.find((sp) => sp.id === id))
    .filter((sp): sp is (typeof allSpells)[number] => !!sp)

  const answeringChallenge =
    run.state === 'VocabularyInput' && !!event?.challenge && !!challengeSpell && stage !== 'trap_result' && stage !== 'treasure_result' && stage !== 'reward'
  // Inside an event (either still reading it, or answering//resolving it).
  const inEvent = run.state === 'ResolvingEvent' || run.state === 'VocabularyInput'

  // The backdrop follows the situation rather than the run, so it changes
  // every move. Seeded by event id (stable for the length of an event) and,
  // in Standby, by turn — so consecutive corridors aren't the same picture.
  const world = resolveWorld(run.config.worldId)
  const sceneSlot = !world
    ? null
    : run.state === 'Rest'
      ? sceneSlotFor(world, 'rest', 'rest')
      : event && !inStandby && !rolling
        ? sceneSlotFor(world, sceneKindForEvent(event.type), event.id)
        : sceneSlotFor(world, 'standby', String(run.turn))

  return (
    <div
      className="screen"
      // Anything that asks the player to commit to an answer or a path is
      // an "answering mode" and sheds the same non-essential chrome; a
      // four-way fork simply does not fit beside a scene image on a short
      // phone, and the paths carry their own flavor text.
      data-challenge={
        answeringChallenge || stage === 'magic_room' || stage === 'direction_choice' ? 'true' : undefined
      }
      data-mode={run.state === 'Rest' ? 'rest' : undefined}
    >
      <RunHud run={run} totem={totem} modeLabel={modeLabels[run.state]} />

      <DungeonProgressTrack challenged={introduced} total={total} bossUnlocked={run.keyFound} />

      {/* The scene window is always on screen — every state, every prompt. */}
      <div className="scene-window dungeon">
        <SceneBackdrop world={world} slot={sceneSlot} alt="던전 배경" />
        {event && !inStandby && !rolling && (
          // Keyed by event *and* by the art it is showing. The id alone was
          // not enough: an event that changes its own picture keeps its id,
          // so React reused the element, the sprite-arrive animation never
          // replayed, and a chest that had just been unlocked swapped to the
          // open one on a hard cut — which read as it not having opened at
          // all.
          <div
            key={`${event.id}:${event.image.slot}`}
            className="explore-event-overlay"
            data-asset={event.image.slot}
          >
            <WorldImage world={world} folder={event.image.folder} slot={event.image.slot} alt={event.title} />
          </div>
        )}
        <span className="scene-tag">{inStandby || rolling ? '대기' : (event?.title ?? '대기')}</span>
        {/* The narration is its own window inside the scene, sitting over the
            lower part of the art. Keeping it here rather than as a sibling
            below buys back its whole height for the player's options. It is
            deliberately NOT unmounted while the die is in the air — the text
            carries on through the roll and is replaced once the roll lands. */}
        <div className="dialogue-slot in-scene">
          {dialogueLines.length > 0 && run.state !== 'Rest' && (
            <TypewriterText
              key={dialogueKey}
              lines={dialogueLines}
              charsPerSecond={charsPerSecond}
              onRevealed={() => setRevealedKey(dialogueKey)}
            />
          )}
        </div>

        {rolling && <MoveRollModal resultTitle={null} onSettled={() => setRollSettled(true)} />}
      </div>

      <TotemPanel totem={totem} compact />

      {/* ---- Action slot: exactly one of these is live at a time ---- */}

      {rolling && (
        <button
          className="btn btn-primary btn-block"
          disabled={!rollSettled}
          onClick={() => {
            setRollSettled(false)
            finishRoll()
          }}
        >
          {rollSettled ? '계속 →' : '주사위를 굴립니다…'}
        </button>
      )}

      {inStandby && (
        <StandbyActions
          canEnterBoss={canEnterBoss(run)}
          bossDoorFound={run.bossDoorFound}
          keyFound={run.keyFound}
          restAreaFound={run.restAreaFound}
          onMove={move}
          onCheckTotem={() => openPanel('status')}
          onCheckWords={() => openPanel('words')}
          onUseItem={() => openPanel('items')}
          onEnterBoss={askEnterBossDoor}
          onReturnToRest={openRestArea}
        />
      )}

      {run.state === 'Rest' && (
        <RestAreaView
          totem={totem}
          usesSoFar={run.restUses}
          npcs={run.restNpcs}
          world={world}
          said={npcSaid}
          onTalk={talkToNpc}
          onRest={buyRest}
          onLeave={leaveRest}
        />
      )}

      {inEvent && dialogueRevealed && !answeringChallenge && (
        <>
          {(stage === 'intro' || stage === 'treasure_choice') && event?.type === 'treasure' && (
            <TreasureChoice onAttempt={attemptTreasure} onLeave={leaveTreasure} />
          )}

          {stage === 'direction_choice' && event?.directionChoices && (
            <DirectionChoices choices={event.directionChoices} onChoose={chooseDirection} />
          )}

          {stage === 'key_room' && <KeyRoomView onTake={takeKey} />}

          {stage === 'magic_room' && puzzle && (
            <MagicRoomView puzzle={puzzle} onGuess={guessSyllable} onFinish={finishMagicRoom} />
          )}

          {/* The sentence the player just answered against, now whole and
              translated. It is the half that teaches, and it could not be
              shown a moment ago without printing the answer.

              All three outcome stages, because which one a prompt lands on
              depends on how it went: a chest opened pays out and goes to
              'reward', the same chest failed goes to 'treasure_result'. An
              event that had no question leaves challengeSpell null and this
              renders nothing. */}
          {(stage === 'trap_result' || stage === 'treasure_result' || stage === 'reward') && (
            <ExampleSentence spell={challengeSpell} reveal />
          )}

          {/* Reward / plain outcome acknowledgements. */}
          {(stage === 'reward' || stage === 'treasure_result') &&
            (run.pendingReward ? (
              <RewardSummary reward={run.pendingReward} onContinue={acknowledgeEvent} />
            ) : (
              <button className="btn btn-primary btn-block" onClick={acknowledgeEvent}>
                계속 →
              </button>
            ))}

          {stage === 'trap_result' && (
            <button className="btn btn-primary btn-block" onClick={acknowledgeEvent}>
              계속 →
            </button>
          )}

          {stage === 'intro' &&
            event &&
            event.type !== 'treasure' &&
            (event.type === 'boss_door' ? (
              <BossDoorNotice keyFound={run.keyFound} onContinue={acknowledgeEvent} />
            ) : (
              <button className="btn btn-primary btn-block" onClick={acknowledgeEvent}>
                {event.type === 'battle' ? '⚔️ 싸우기' : '계속 →'}
              </button>
            ))}
        </>
      )}

      {answeringChallenge && (
        <ChallengeView
          challenge={event!.challenge!}
          answer={asksForKorean ? challengeSpell!.korean : challengeSpell!.english}
          decoyPool={answersInRun.map((sp) => (asksForKorean ? sp.korean : sp.english))}
          onSubmit={submitEventAnswer}
          submitLabel={event!.type === 'trap' ? '해제!' : '열기!'}
          timer={run.eventTimer}
          spell={challengeSpell}
        />
      )}

      <div style={{ flex: 1 }} />

      {/* Entering the boss is irreversible — there is no way back to
          exploration afterwards — so it takes an explicit confirmation. */}
      {confirmingBoss && (
        <div className="overlay-backdrop" onClick={cancelEnterBossDoor}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h2>보스의 문으로 들어갈까요?</h2>
            <p className="muted">
              열쇠는 한 번만 돌아갑니다. 이 던전 탐험으로는 돌아올 수 없고, 승리 아니면 패배로 끝납니다.
            </p>
            <button className="btn btn-danger btn-block" onClick={enterBossDoor}>
              ⚔️ 들어가기
            </button>
            <button className="btn btn-ghost btn-block" onClick={cancelEnterBossDoor}>
              아직 아님
            </button>
          </div>
        </div>
      )}

      {activePanel === 'words' && <WordInfoPanel run={run} battle={null} onClose={closePanel} />}
      {activePanel === 'items' && <ItemPanel inventory={inventory} onUse={useItem} onClose={closePanel} />}
      {activePanel === 'status' && (
        <StatusPanel totem={totem} run={run} totemSet={totemSet} challenged={introduced} onClose={closePanel} />
      )}
    </div>
  )
}
