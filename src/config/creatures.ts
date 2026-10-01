/**
 * What a creature is worth as a Totem.
 *
 * Everything you fight is a candidate. Meet one in a dungeon and it joins
 * the blacksmith's designs alongside the painted portraits, because the
 * bestiary is already a roster of characters — the only thing separating a
 * Totem from a foe was which folder its art happened to sit in.
 *
 * What makes them worth wanting is where they start. A forged portrait
 * begins at level 1 and has to be raised; a creature arrives already grown,
 * which is the whole appeal of fighting your way to one. It is also the
 * price: a level-50 Ryu costs a great deal more than a level-10 slime.
 *
 * NOTE ON THE NUMBERS. The four below are stated. Anything else is guessed
 * from where it was met, and says so — the same arrangement as the forge
 * recipes in config/forging.ts, and the same place to fill in when the real
 * numbers are decided.
 */

import { recommendedLevel, type DungeonTierId } from './balance'

/** Keys are the art slot, lowercased with separators dropped. */
function normalize(slot: string): string {
  return slot.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const STARTING_LEVELS: Record<string, number> = {
  slime: 10,
  // "Dragon warrior" — the palace guard. It has been a boss and an
  // underling and has been spelled three ways; every spelling resolves
  // here, so moving the file or renaming it does not silently reset a
  // decided level back to a guess.
  dragonguard: 25,
  dragonwarriorwarden: 25,
  dragonwarrior: 25,
  warden: 25,
  minotaur: 35,
  waterdragonryu: 50,
  ryu: 50,
}

/**
 * Creatures that are never a Totem, however many times you meet them.
 *
 * Not everything you fight is a character you could be. The Dragon King's
 * Spirit is an afterimage of a power rather than a thing with a body — the
 * blacksmith has nothing to strike it from — so it stays a fight and never
 * joins the roster, no matter how often the bottom of that world is cleared.
 */
const NEVER_FORGEABLE = new Set(['dragonkingspirit'])

export function isForgeableCreature(slot: string): boolean {
  return !NEVER_FORGEABLE.has(normalize(slot))
}

/** Which tier's midpoint an unlisted creature is guessed from. */
const GUESS_TIER: Record<string, DungeonTierId> = {
  enemies: 'tier10',
  bosses: 'tier25',
}

export interface CreatureLevel {
  level: number
  /** False once somebody has decided what this creature should really be. */
  provisional: boolean
}

/**
 * The level a creature arrives at.
 *
 * An unlisted one is guessed from the world it was met in and whether it
 * was an underling or a boss, so a world added later is playable rather
 * than empty, and the guess reads as a plausible number for where it came
 * from rather than as a constant.
 */
export function startingLevelFor(worldId: string, folder: string, slot: string): CreatureLevel {
  const stated = STARTING_LEVELS[normalize(slot)]
  if (stated !== undefined) return { level: stated, provisional: false }
  const tier = GUESS_TIER[folder] ?? 'tier10'
  return { level: Math.max(1, recommendedLevel(worldId, tier)), provisional: true }
}

/** Whether this creature's level is one somebody actually chose. */
export function hasStatedLevel(slot: string): boolean {
  return STARTING_LEVELS[normalize(slot)] !== undefined
}
