export interface GameSettings {
  /** Music and ambience level, 0-1. */
  musicVolume: number
  /** Sound effects level, 0-1. */
  sfxVolume: number
  /** Silences everything without losing the two levels above. */
  muted: boolean
  /** Seconds allowed to answer an enemy attack. Configurable for a11y/testing. */
  enemyTimerSeconds: number
  /** Typewriter reveal speed, characters per second. */
  typewriterCharsPerSecond: number
}

export const defaultSettings: GameSettings = {
  musicVolume: 0.6,
  sfxVolume: 0.85,
  muted: false,
  enemyTimerSeconds: 12,
  typewriterCharsPerSecond: 38,
}
