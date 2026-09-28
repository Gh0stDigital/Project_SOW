import { describe, expect, it } from 'vitest'
import { assetKeys, hasAsset } from './assets'
import { allWorlds } from '@/systems/worldRegistry'
import type { DungeonTierId } from './balance'
import { dungeonTiers } from './balance'
import {
  STARTING_TOTEM_KEY,
  STARTING_WORLD_ID,
  deepestUnlockedTier,
  isTierUnlocked,
  isTotemUnlocked,
  isWorldUnlocked,
  tierOrder,
  tierRequirement,
} from './progression'

/**
 * What a save starts with, and what it has to earn. Everything the game
 * ships was selectable from the first launch before this; these are the
 * locks, and the one rule that opens any of them.
 */

describe('the Totem you start as', () => {
  it('is Dolbae, and Dolbae names art that is really there', () => {
    expect(STARTING_TOTEM_KEY).toBe('Dolbae')
    expect(hasAsset('totems', STARTING_TOTEM_KEY)).toBe(true)
    expect(isTotemUnlocked(STARTING_TOTEM_KEY)).toBe(true)
  })

  it('is the only Totem available', () => {
    const others = assetKeys('totems').filter((key) => !isTotemUnlocked(key))
    // Every other portrait in the folder is locked. If this list is ever
    // empty the lock has quietly stopped locking anything.
    expect(others.length).toBeGreaterThan(0)
    expect(others).not.toContain(STARTING_TOTEM_KEY)
  })

  it('matches however the key happens to be spelled', () => {
    // The art registry resolves keys loosely, so the lock has to as well —
    // otherwise a save holding 'dolbae' would be told its own Totem is
    // locked and be reset to it.
    expect(isTotemUnlocked('dolbae')).toBe(true)
    expect(isTotemUnlocked('DOLBAE')).toBe(true)
  })

  it('locks a key that names nothing at all', () => {
    // resolvedKey() falls back rather than failing, and the fallback must
    // not read as "unlocked" for any junk key.
    expect(isTotemUnlocked('no_such_portrait_at_all')).toBe(false)
  })
})

describe('the world you start in', () => {
  it('is the first tier of the Dragon King\'s Palace', () => {
    expect(STARTING_WORLD_ID).toBe('dragon-king-palace')
    expect(isWorldUnlocked(STARTING_WORLD_ID)).toBe(true)
    expect(allWorlds.some((w) => w.id === STARTING_WORLD_ID)).toBe(true)
  })

  it('is the only world available', () => {
    const others = allWorlds.filter((w) => !isWorldUnlocked(w.id))
    expect(others.length).toBeGreaterThan(0)
    expect(others.map((w) => w.id)).not.toContain(STARTING_WORLD_ID)
  })
})

describe('the tiers open one at a time', () => {
  const [first, second, third] = tierOrder

  it('covers every tier the balance file defines, shallowest first', () => {
    expect([...tierOrder]).toEqual(dungeonTiers.map((t) => t.id))
    expect(first).toBe('tier10')
  })

  it('opens the first tier to a Totem that has cleared nothing', () => {
    expect(isTierUnlocked(first, [])).toBe(true)
    expect(tierRequirement(first)).toBeNull()
  })

  it('keeps the deeper tiers shut until the one above them is cleared', () => {
    expect(isTierUnlocked(second, [])).toBe(false)
    expect(isTierUnlocked(third, [])).toBe(false)
    expect(tierRequirement(second)).toBe(first)
    expect(tierRequirement(third)).toBe(second)
  })

  it('opens exactly one tier per clear, not all of them', () => {
    expect(isTierUnlocked(second, [first])).toBe(true)
    expect(isTierUnlocked(third, [first])).toBe(false)
    expect(isTierUnlocked(third, [first, second])).toBe(true)
  })

  it('will not let a clear out of order open the tier above it', () => {
    // A record holding only the deepest clear (a save edited, or a rule
    // changed later) must not make the middle tier look earned.
    expect(isTierUnlocked(second, [third])).toBe(false)
  })

  it('reads an unknown tier as locked rather than as open', () => {
    expect(isTierUnlocked('tier999' as DungeonTierId, [first, second])).toBe(false)
  })

  it('points a picker at the deepest tier actually earned', () => {
    expect(deepestUnlockedTier([])).toBe(first)
    expect(deepestUnlockedTier([first])).toBe(second)
    expect(deepestUnlockedTier([first, second])).toBe(third)
    // A gap in the record stops the walk where the gap is.
    expect(deepestUnlockedTier([second])).toBe(first)
  })
})
