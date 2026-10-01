import type { Totem } from '@/domain/totem'
import { totemBalance, type DungeonTierId } from '@/config/balance'
import { STARTING_TOTEM_KEY } from '@/config/progression'
import { makeId } from './idGen'
import { creatureName, isCreatureKey } from './creatureTotems'

/**
 * A readable name from a portrait key: `totem_silverKnight` -> "Silver
 * Knight". Used when raising a Totem from its portrait, so each one arrives
 * already named after the art rather than as another "토템".
 */
export function nameFromAvatarKey(avatarKey: string): string {
  // A creature carries its world and folder in its key, so the plain rules
  // below would read the whole path as a name.
  if (isCreatureKey(avatarKey)) return creatureName(avatarKey) || STARTING_TOTEM_KEY
  // The fallback portrait is a code concept, not somebody's artwork, so it
  // stands in for the Totem the game starts you as rather than for the word
  // "totem".
  if (avatarKey.toLowerCase() === 'default') return STARTING_TOTEM_KEY
  const base = avatarKey.replace(/^totem[_-]?/i, '')
  const words = base
    .replace(/[_-]+/g, ' ')
    // splitCamelCase -> split Camel Case
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
  if (!words) return STARTING_TOTEM_KEY
  return words
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Raises a new Totem. Each one is its own character — own name, level,
 * experience, HP, money, Life Points and record — so switching between them
 * swaps who you are playing, not just how you look.
 */
/**
 * The face a new Totem wears unless the player picks another.
 *
 * It used to be 'default', a key no art answers to — so the portrait was
 * resolved by the flavour fallback, which hashes the key and picks whatever
 * comes out. That landed on Dolbae, but by arithmetic rather than by
 * intent: adding one file to the folder would have silently changed who the
 * game starts you as.
 *
 * Re-exported from config/progression rather than spelled again here, since
 * the same portrait is the one thing a new save has unlocked.
 */
export const STARTING_AVATAR = STARTING_TOTEM_KEY

/**
 * Raises a Totem at a level.
 *
 * Portraits start at 1 and are raised; a creature arrives already grown,
 * which is the whole reason to fight your way to one. HP comes from the
 * level it starts at rather than from level 1, so a level-50 Ryu is a
 * level-50 Ryu from its first step rather than one with a novice's health
 * bar.
 */
export function createTotem(name: string, avatarKey = STARTING_AVATAR, startingLevel = 1): Totem {
  const level = Math.max(1, Math.min(totemBalance.maxLevel, Math.round(startingLevel)))
  return {
    id: makeId('totem'),
    name: name.trim() || STARTING_TOTEM_KEY,
    avatarKey,
    level,
    experience: 0,
    currentHp: totemBalance.maxHp(level),
    maxHp: totemBalance.maxHp(level),
    lifePoints: totemBalance.startingLifePoints,
    maxLifePoints: totemBalance.startingLifePoints,
    destroyed: false,
    equippedSpellSetId: null,
    clearedTiers: [],
    stats: {
      dungeonsCompleted: 0,
      bossesDefeated: 0,
      dungeonsFailed: 0,
      totalDamageDealt: 0,
      totalDamageTaken: 0,
    },
    createdAt: new Date().toISOString(),
  }
}

export interface TotemLevelUpResult {
  totem: Totem
  leveledUp: boolean
  fromLevel: number
  toLevel: number
}

export function addTotemExperience(totem: Totem, amount: number): TotemLevelUpResult {
  if (amount <= 0) return { totem, leveledUp: false, fromLevel: totem.level, toLevel: totem.level }
  let level = totem.level
  let experience = totem.experience + amount
  const fromLevel = level
  while (level < totemBalance.maxLevel && experience >= totemBalance.xpToNextLevel(level)) {
    experience -= totemBalance.xpToNextLevel(level)
    level += 1
  }
  const newMax = totemBalance.maxHp(level)
  const hpGain = newMax - totemBalance.maxHp(fromLevel)
  const next: Totem = {
    ...totem,
    level,
    experience,
    maxHp: newMax,
    // Leveling up heals by the HP gained, but never past the new max, and
    // never heals a totem that's mid-battle beyond what makes sense.
    currentHp: Math.min(newMax, totem.currentHp + Math.max(0, hpGain)),
  }
  return { totem: next, leveledUp: level > fromLevel, fromLevel, toLevel: level }
}

/**
 * Records that this Totem has beaten a tier's boss, which is what opens the
 * next tier. Idempotent: beating the same boss twice does not double-record.
 */
export function recordTierCleared(totem: Totem, tierId: DungeonTierId): Totem {
  if (totem.clearedTiers.includes(tierId)) return totem
  return { ...totem, clearedTiers: [...totem.clearedTiers, tierId] }
}

export function equipSpellSet(totem: Totem, spellSetId: string | null): Totem {
  return { ...totem, equippedSpellSetId: spellSetId }
}

export function applyDamage(totem: Totem, amount: number): Totem {
  const currentHp = Math.max(0, totem.currentHp - Math.max(0, Math.round(amount)))
  return {
    ...totem,
    currentHp,
    stats: { ...totem.stats, totalDamageTaken: totem.stats.totalDamageTaken + Math.max(0, Math.round(amount)) },
  }
}

export function heal(totem: Totem, amount: number): Totem {
  return { ...totem, currentHp: Math.min(totem.maxHp, totem.currentHp + Math.max(0, Math.round(amount))) }
}

export function fullyRestore(totem: Totem): Totem {
  return { ...totem, currentHp: totem.maxHp }
}

export function recordDamageDealt(totem: Totem, amount: number): Totem {
  return { ...totem, stats: { ...totem.stats, totalDamageDealt: totem.stats.totalDamageDealt + Math.max(0, amount) } }
}

// ---------------------------------------------------------------------------
// Life Points
// ---------------------------------------------------------------------------

export interface LifeLossResult {
  totem: Totem
  /** False when no Life Point was actually deducted (already at 0). */
  lifePointLost: boolean
  /** True only on the transition into permanent destruction. */
  becameDestroyed: boolean
}

/**
 * Applies a dungeon defeat: exactly one Life Point, never more, and never
 * from a totem that has already run out. At 0 the Totem is permanently
 * destroyed. HP is restored to full so a surviving Totem isn't left stuck
 * at 0 HP and unable to enter another dungeon.
 */
export function loseLifePoint(totem: Totem): LifeLossResult {
  if (totem.destroyed || totem.lifePoints <= 0) {
    return { totem: { ...totem, destroyed: true, lifePoints: 0 }, lifePointLost: false, becameDestroyed: false }
  }
  const lifePoints = totem.lifePoints - 1
  const destroyed = lifePoints <= 0
  return {
    totem: {
      ...totem,
      lifePoints,
      destroyed,
      // A destroyed Totem stays at 0 HP as a memorial; a surviving one is
      // patched up so the next run can actually begin.
      currentHp: destroyed ? 0 : totem.maxHp,
      stats: { ...totem.stats, dungeonsFailed: totem.stats.dungeonsFailed + 1 },
    },
    lifePointLost: true,
    becameDestroyed: destroyed,
  }
}

/** A Totem that can still be taken into a dungeon. */
export function isUsable(totem: Totem): boolean {
  return !totem.destroyed && totem.lifePoints > 0
}

