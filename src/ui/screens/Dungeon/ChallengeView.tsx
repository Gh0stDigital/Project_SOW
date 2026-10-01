import { useMemo, useState } from 'react'
import type { Challenge } from '@/domain/challenge'
import type { TimerState } from '@/domain/battle'
import { Bar } from '@/ui/components/Bar'
import { ExampleSentence } from '@/ui/components/ExampleSentence'
import type { Spell } from '@/domain/spell'
import { battleBalance } from '@/config/balance'
import { buildTileChallenge, assembledText, type AnswerTile } from '@/systems/tileAssembly'

interface ChallengeViewProps {
  challenge: Challenge
  /** The correct answer, cut into tiles for the player to reassemble. */
  answer: string
  /** Other answers in this run — cut the same way to supply decoy tiles. */
  decoyPool: string[]
  onSubmit: (text: string) => void
  submitLabel?: string
  /**
   * The entry being asked about, so its example sentence can sit above the
   * prompt with the word itself cut out of it.
   */
  spell?: Spell | null
  /**
   * Countdown for a timed prompt, drawn inside the panel.
   *
   * It used to sit in the view behind this one, where the panel covered it:
   * the enemy would start counting down and the only thing on screen was
   * the question. A timer the player cannot see is not a timer.
   */
  timer?: TimerState | null
  /**
   * Draws the counter window on the timer.
   *
   * Only defending has one — answer inside it and the blow is turned back
   * instead of merely softened. A window the player cannot see is not a
   * window, so the bar is marked and the remaining time is labelled while
   * the chance is still live.
   */
  showCounterWindow?: boolean
}

/**
 * English↔Korean vocabulary prompt answered by tapping tiles into order,
 * rather than typing. Removes typo and synonym false-negatives (the target
 * is the player's own saved answer, spelled out) and means no keyboard
 * ever opens mid-dungeon.
 */
export function ChallengeView({
  challenge,
  answer,
  decoyPool,
  onSubmit,
  submitLabel = '정답',
  timer = null,
  spell = null,
  showCounterWindow = false,
}: ChallengeViewProps) {
  const asksForKorean = challenge.direction === 'eng_to_kor'
  const kind = asksForKorean ? 'korean' : 'english'
  // Rebuilt only when the challenge changes — not on every timer tick,
  // which would reshuffle the tiles under the player's finger.
  const board = useMemo(
    () => buildTileChallenge(answer, kind, decoyPool, Math.random),
    // Rebuilt when the prompt changes — not on every render, which would
    // reshuffle the tiles under the player's finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [challenge.id],
  )

  const [picked, setPicked] = useState<AnswerTile[]>([])

  // A multi-word enemy attack reuses this component for each prompt in the
  // volley, so the tiles placed for the previous word must be cleared when
  // the challenge changes — otherwise they linger in the answer row and the
  // new board can never be assembled.
  const [lastChallengeId, setLastChallengeId] = useState(challenge.id)
  if (lastChallengeId !== challenge.id) {
    setLastChallengeId(challenge.id)
    setPicked([])
  }

  const pickedIds = new Set(picked.map((t) => t.id))
  const assembled = assembledText(picked, board.joiner)

  function submit() {
    if (picked.length > 0) onSubmit(assembled)
  }

  return (
    <div className={`panel challenge-prompt${board.granularity === 'whole' ? ' choice-board' : ''}`}>
      {timer && (() => {
        const inWindow =
          showCounterWindow &&
          timer.totalSeconds > 0 &&
          timer.remainingSeconds / timer.totalSeconds > battleBalance.counterWindow
        return (
          <div className={`timer-row prompt-timer${inWindow ? ' counter-live' : ''}`}>
            <span>⏱ {Math.ceil(timer.remainingSeconds)}s</span>
            <div style={{ flex: 1, position: 'relative' }}>
              <Bar value={timer.remainingSeconds} max={timer.totalSeconds} kind="timer" thin />
              {showCounterWindow && (
                <span
                  className="counter-window-mark"
                  style={{ left: `${battleBalance.counterWindow * 100}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            {showCounterWindow && <span className="counter-window-tag">{inWindow ? '⚔ 반격' : '🛡 방어'}</span>}
          </div>
        )
      })()}
      {/* Above the word, not below the tiles.
          It is context for the question, and context read after the question
          has been answered is not context. Down at the bottom it sat under
          the thing the thumb was aiming at, which is where a glance does not
          go. */}
      <ExampleSentence spell={spell} mask={asksForKorean} />

      <div className="prompt-label">{asksForKorean ? '한국어로 번역하세요' : '영어로 번역하세요'}</div>
      <div className="prompt-word" lang={asksForKorean ? 'en' : 'ko'}>
        {challenge.prompt}
      </div>

      {/* What the player has built so far — tap a piece to take it back. */}
      <div className="tile-answer" lang={asksForKorean ? 'ko' : 'en'}>
        {picked.map((tile) => (
          <button
            key={tile.id}
            className="answer-tile placed"
            onClick={() => setPicked((p) => p.filter((t) => t.id !== tile.id))}
          >
            {tile.text}
          </button>
        ))}
        {Array.from({ length: Math.max(0, board.answerLength - picked.length) }, (_, i) => (
          <span key={`slot-${i}`} className="answer-slot" />
        ))}
      </div>

      <div className="tile-tray" lang={asksForKorean ? 'ko' : 'en'}>
        {board.tiles.map((tile) => (
          <button
            key={tile.id}
            className="answer-tile"
            disabled={pickedIds.has(tile.id)}
            onClick={() => setPicked((p) => [...p, tile])}
          >
            {tile.text}
          </button>
        ))}
      </div>

      <div className="tile-actions">
        <button className="btn btn-ghost btn-sm" disabled={picked.length === 0} onClick={() => setPicked([])}>
          지우기
        </button>
        <button className="btn btn-primary btn-sm" disabled={picked.length === 0} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
