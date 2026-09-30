import { useEffect, useState } from 'react'

/**
 * Reveals text a character at a time, the way a game's dialogue box does.
 *
 * Two things make this harder than a timer over a string, and both come from
 * where it is used — the keeper's bubble, whose line is recomputed on every
 * keystroke while somebody is pasting a word list into the box below her:
 *
 *   - A line that changes mid-keystroke must not restart the animation on
 *     each one. The incoming text is allowed to settle first, so typing into
 *     the counter is silent and the keeper speaks once the hand comes off
 *     the keyboard.
 *   - A reader who does not want to wait must be able to finish it. `skip()`
 *     drops the rest of the line in place, and the bubble wires it to a tap.
 *
 * Honours prefers-reduced-motion by handing back the whole string at once: a
 * character-by-character reveal is exactly the kind of motion that setting is
 * asking not to see.
 */

export interface TypewriterOptions {
  /** Milliseconds between characters. */
  speed?: number
  /** How long the incoming text must hold still before it starts. */
  settle?: number
}

export interface Typewriter {
  /** What to render right now. */
  shown: string
  /** True while characters are still arriving. */
  typing: boolean
  /** Finishes the line immediately. */
  skip: () => void
}

const NOOP = () => {}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useTypewriter(text: string, options: TypewriterOptions = {}): Typewriter {
  // 300ms holds through ordinary typing — a person entering a word list
  // rarely leaves a third of a second between keys — so she stays quiet
  // until the hand comes off and then speaks once.
  const { speed = 18, settle = 300 } = options
  // Read once. This is a preference, not a thing that changes mid-sentence,
  // and reading it in state keeps it out of the render path.
  const [instant] = useState(prefersReducedMotion)

  // The text actually being typed out, which lags `text` until it settles.
  const [target, setTarget] = useState(text)
  const [count, setCount] = useState(0)

  // Let a rapidly-changing line settle before committing to typing it. The
  // write happens in the timeout rather than in the effect body, so a render
  // is never triggered synchronously from here — and `target` is a dependency
  // rather than a ref, which terminates because the write makes the two equal
  // and the next run bails on the first line.
  useEffect(() => {
    if (text === target) return
    const id = window.setTimeout(() => {
      setTarget(text)
      setCount(0)
    }, Math.max(0, settle))
    return () => window.clearTimeout(id)
  }, [text, target, settle])

  // Reveal one character at a time.
  useEffect(() => {
    if (instant || count >= target.length) return
    const id = window.setTimeout(() => setCount((n) => Math.min(target.length, n + 1)), speed)
    return () => window.clearTimeout(id)
  }, [count, target, speed, instant])

  if (instant) return { shown: text, typing: false, skip: NOOP }
  return {
    shown: target.slice(0, count),
    typing: count < target.length,
    skip: () => setCount(target.length),
  }
}
