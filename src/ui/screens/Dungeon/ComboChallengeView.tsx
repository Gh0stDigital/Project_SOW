import { useEffect, useRef, useState } from 'react'
import type { Challenge } from '@/domain/challenge'
import type { ComboPrompt } from '@/domain/combo'
import type { TimerState } from '@/domain/battle'
import { COMBO_BLANK } from '@/systems/comboTargets'
import { Bar } from '@/ui/components/Bar'

interface ComboChallengeViewProps {
  challenge: Challenge
  /** The sentence, its gaps, and the forms they expect. */
  combo: ComboPrompt
  /** One answer per gap, in the order the gaps appear in the sentence. */
  onSubmit: (answers: string[]) => void
  submitLabel?: string
  timer?: TimerState | null
  /**
   * Whether to name the words and show the translation.
   *
   * On for an attack: the player chose the word the question was built
   * from, and a second gap has to be identifiable to be answerable. Off for
   * a defense, where the whole question is which word the sentence wants —
   * naming it, or translating the sentence, would be answering it.
   */
  hints?: boolean
}

/**
 * Combo mode's question: a Korean sentence with its gaps typed back in.
 *
 * Deliberately not the tile board. Tiles exist so that a normal prompt
 * cannot be lost to a typo, and because they spell the answer out they can
 * only ever ask for a string the player already has. The point of Combo is
 * the form — 나아질 거예요 rather than 나아져요 — and there is no way to offer
 * that as tiles without also offering the answer. So this one types, which
 * is the only place in the dungeon that opens a keyboard.
 *
 * The gaps are chips in the sentence and fields underneath. Inline inputs
 * read better on paper and worse on a phone: a multi-word form inside a
 * wrapping Korean sentence either squeezes to nothing or reflows the line
 * under the thumb on every keystroke. The chips keep the sentence legible
 * and fill in as they are answered, so it still reads as one sentence
 * being completed.
 */
export function ComboChallengeView({
  challenge,
  combo,
  onSubmit,
  submitLabel = '공격!',
  timer = null,
  hints = false,
}: ComboChallengeViewProps) {
  const [answers, setAnswers] = useState<string[]>(() => combo.blanks.map(() => ''))
  const [active, setActive] = useState(0)
  const fields = useRef<(HTMLInputElement | null)[]>([])

  // A volley reuses this component for each prompt, so what was typed for
  // the previous sentence must not survive into the next one.
  const [lastChallengeId, setLastChallengeId] = useState(challenge.id)
  if (lastChallengeId !== challenge.id) {
    setLastChallengeId(challenge.id)
    setAnswers(combo.blanks.map(() => ''))
    setActive(0)
  }

  useEffect(() => {
    fields.current[0]?.focus()
  }, [challenge.id])

  const ready = answers.every((a) => a.trim().length > 0)

  function set(index: number, value: string) {
    setAnswers((prev) => prev.map((a, i) => (i === index ? value : a)))
  }

  function submit() {
    if (ready) onSubmit(answers)
  }

  function onKeyDown(index: number, key: string) {
    if (key !== 'Enter') return
    if (index + 1 < combo.blanks.length) {
      setActive(index + 1)
      fields.current[index + 1]?.focus()
      return
    }
    submit()
  }

  // combo.text carries one marker per gap, in sentence order, so splitting
  // on it gives the Korean between the gaps.
  const segments = combo.text.split(COMBO_BLANK)

  return (
    <div className="panel challenge-prompt combo-prompt">
      {timer && (
        // No counter window drawn: a counter has to be answered inside the
        // first part of the clock, which a typed form cannot be, so Combo
        // does not offer one. See defenseOutcomeFor().
        <div className="timer-row prompt-timer">
          <span>⏱ {Math.ceil(timer.remainingSeconds)}s</span>
          <div style={{ flex: 1 }}>
            <Bar value={timer.remainingSeconds} max={timer.totalSeconds} kind="timer" thin />
          </div>
        </div>
      )}

      <div className="prompt-label">문장에 맞는 활용형을 쓰세요</div>

      <p className="combo-sentence" lang="ko">
        {segments.map((segment, i) => (
          <span key={`seg-${i}`}>
            {segment}
            {i < combo.blanks.length && (
              <button
                type="button"
                className="combo-gap"
                data-filled={answers[i]?.trim() ? true : undefined}
                data-active={active === i ? true : undefined}
                onClick={() => {
                  setActive(i)
                  fields.current[i]?.focus()
                }}
              >
                {/* Numbered only when there is more than one gap to tell
                    apart; a single gap is just a gap. */}
                {answers[i]?.trim() || (combo.blanks.length > 1 ? `${i + 1}` : '\u00a0')}
              </button>
            )}
          </span>
        ))}
      </p>

      {hints && combo.translation && <p className="combo-translation faint">{combo.translation}</p>}

      <div className="combo-fields">
        {combo.blanks.map((blank, i) => (
          <label key={`${challenge.id}-${i}`} className="combo-field" data-active={active === i ? true : undefined}>
            <span className="combo-field-label">
              {combo.blanks.length > 1 ? `${i + 1}. ` : ''}
              {hints ? blank.dictionaryForm : '빈칸'}
            </span>
            <input
              ref={(el) => {
                fields.current[i] = el
              }}
              lang="ko"
              type="text"
              inputMode="text"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={answers[i] ?? ''}
              onFocus={() => setActive(i)}
              onChange={(e) => set(i, e.target.value)}
              onKeyDown={(e) => onKeyDown(i, e.key)}
            />
          </label>
        ))}
      </div>

      <div className="tile-actions">
        <button
          className="btn btn-ghost btn-sm"
          disabled={answers.every((a) => a.length === 0)}
          onClick={() => {
            setAnswers(combo.blanks.map(() => ''))
            setActive(0)
            fields.current[0]?.focus()
          }}
        >
          지우기
        </button>
        <button className="btn btn-primary btn-sm" disabled={!ready} onClick={submit}>
          {submitLabel}
        </button>
      </div>
    </div>
  )
}
