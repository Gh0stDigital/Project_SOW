/**
 * How art that has frames plays.
 *
 * One number, in one place, because every animated sprite in the game runs
 * off the same clock — see ui/hooks/useSpriteFrame.ts. A frame a second:
 * portraits idle, and an idle is not meant to read as motion so much as to
 * stop the character reading as a photograph.
 */
export const spriteTiming = {
  /** Milliseconds a frame is held. */
  frameMs: 1000,
} as const
