import { useEffect, useState } from 'react'
import { spriteTiming } from '@/config/sprites'

/**
 * Which frame of an animated sprite to draw right now.
 *
 * One clock for the whole game rather than a timer per picture. The Totem
 * screen can have a dozen portraits on it at once, and a dozen intervals
 * drifting apart means a dozen characters breathing out of step — which
 * reads as a glitch rather than as life. A single shared tick also means
 * the cost of animating is the same whether one portrait is on screen or
 * twenty.
 */

type Listener = (tick: number) => void

const listeners = new Set<Listener>()
let timer: ReturnType<typeof setInterval> | null = null
let tick = 0

function advance() {
  tick += 1
  for (const listener of listeners) listener(tick)
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  if (timer === null) {
    timer = setInterval(advance, spriteTiming.frameMs)
  }
  return () => {
    listeners.delete(listener)
    // Nothing on screen is animating: stop counting. A sprite that mounts
    // later starts from whatever the tick had reached, which is fine —
    // every frame of an idle is a valid place to start.
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
}

/**
 * True when the player has asked their system for less movement.
 *
 * Checked once per mount rather than watched: this is a setting people
 * change in system preferences, not mid-battle, and a listener per sprite
 * is the thing this hook exists to avoid.
 */
function prefersStillness(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * The index to draw, for a sprite of `count` frames.
 *
 * Returns 0 for anything that is not really animated — one frame, no
 * frames, or a player who would rather things held still — so the caller
 * can use the same code path either way.
 */
export function useSpriteFrame(count: number): number {
  const animated = count > 1 && !prefersStillness()
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!animated) return
    return subscribe((t) => setValue(t))
  }, [animated])

  return animated ? value % count : 0
}
