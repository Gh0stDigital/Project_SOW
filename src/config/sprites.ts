/**
 * How art that has frames plays.
 *
 * One number, in one place, because every animated sprite in the game runs
 * off the same clock — see ui/hooks/useSpriteFrame.ts. Portraits idle; they
 * are not meant to read as motion so much as to stop reading as a
 * photograph, so the frames are slow.
 */
export const spriteTiming = {
  /** Milliseconds a frame is held. */
  frameMs: 420,
} as const
