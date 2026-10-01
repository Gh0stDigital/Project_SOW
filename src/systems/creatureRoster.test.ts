import { describe, expect, it } from 'vitest'
import {
  CREATURE_PREFIX,
  creatureExists,
  creatureKey,
  creatureKeyForImage,
  creatureName,
  creatureRoster,
  creatureStartingLevel,
  isCreatureKey,
  parseCreatureKey,
} from './creatureTotems'
import { bossSlot, findWorld, nameFromSlot } from './worldRegistry'
import { spawnBoss, spawnEnemy, spawnMimic } from './battleEngine'
import { bossSlotFor, bossesOfWorld, castWorldIds } from '@/config/bosses'
import { startingLevelFor } from '@/config/creatures'
import { createTotem, nameFromAvatarKey } from './totemManager'
import { isTotemUnlocked } from '@/config/progression'
import { creatureRecipe, forgeRecipeFor } from '@/config/forging'
import { payForRecipe, recipeForTotemKey, startingLevelForKey } from './forge'
import { getMaterialDef } from '@/config/materials'
import { dungeonTiers, totemBalance } from '@/config/balance'

const DKP = 'dragon-king-palace'
const world = findWorld(DKP)!

/**
 * The bestiary is a roster of characters.
 *
 * Nothing separated a Totem from a foe except which folder its art sat in,
 * so meeting one is now what puts it in the blacksmith's window — and a
 * creature arrives at the level its kind starts at, which is the whole
 * reason to go and find one rather than raise a portrait from scratch.
 */

describe('a world fields a boss per tier', () => {
  it('casts all three depths of the Dragon King\'s Palace', () => {
    expect(bossSlotFor(DKP, 'tier10')).toBe('minotaur')
    expect(bossSlotFor(DKP, 'tier25')).toBe('waterDragonRyu')
    expect(bossSlotFor(DKP, 'tier50')).toBe('dragonWarriorWarden')
  })

  it('ships the art for every boss it casts', () => {
    for (const worldId of castWorldIds) {
      const pack = findWorld(worldId)
      expect(pack).toBeDefined()
      for (const slot of bossesOfWorld(worldId)) {
        expect(pack!.bosses).toContain(slot)
      }
    }
  })

  it('gives each tier a different boss', () => {
    const cast = dungeonTiers.map((t) => bossSlotFor(DKP, t.id))
    expect(new Set(cast).size).toBe(cast.length)
  })

  it('uses the cast boss rather than the seeded pick', () => {
    for (const tier of dungeonTiers) {
      // Whatever seed is handed in, a cast tier answers with its own boss.
      for (const seed of ['a', 'b', 'zzz', 'boss-12345']) {
        expect(bossSlot(world, seed, tier.id)).toEqual({
          folder: 'bosses',
          slot: bossSlotFor(DKP, tier.id),
        })
      }
    }
  })

  it('falls back to the seeded pick for a world nobody has cast', () => {
    const uncast = findWorld('starter')!
    const picked = bossSlot(uncast, 'seed', 'tier10')
    expect(picked).not.toBeNull()
    expect([...uncast.bosses, ...uncast.enemies]).toContain(picked!.slot)
  })

  it('names the boss after its art rather than calling them all 보스 수호자', () => {
    const boss = spawnBoss(world, 'seed', 40, 'tier25')
    expect(boss.name).toBe(nameFromSlot('waterDragonRyu'))
    expect(boss.image).toEqual({ folder: 'bosses', slot: 'waterDragonRyu' })
  })
})

describe('the creature key', () => {
  it('round-trips', () => {
    const key = creatureKey({ worldId: DKP, folder: 'enemies', slot: 'slime' })
    expect(key.startsWith(CREATURE_PREFIX)).toBe(true)
    expect(parseCreatureKey(key)).toEqual({ worldId: DKP, folder: 'enemies', slot: 'slime' })
  })

  it('leaves an ordinary portrait key alone', () => {
    expect(isCreatureKey('Dolbae')).toBe(false)
    expect(parseCreatureKey('Dolbae')).toBeNull()
    expect(parseCreatureKey(null)).toBeNull()
  })

  it('refuses a folder you do not fight in', () => {
    expect(parseCreatureKey(`${CREATURE_PREFIX}${DKP}/locations/entrance`)).toBeNull()
    expect(parseCreatureKey(`${CREATURE_PREFIX}${DKP}/events/trap1`)).toBeNull()
    expect(parseCreatureKey(`${CREATURE_PREFIX}${DKP}/npcs/anyone`)).toBeNull()
  })

  it('refuses a malformed one rather than guessing', () => {
    expect(parseCreatureKey(`${CREATURE_PREFIX}just-a-world`)).toBeNull()
    expect(parseCreatureKey(`${CREATURE_PREFIX}${DKP}/enemies`)).toBeNull()
    expect(parseCreatureKey(`${CREATURE_PREFIX}/enemies/slime`)).toBeNull()
  })

  it('knows which art this build actually has', () => {
    expect(creatureExists(creatureKey({ worldId: DKP, folder: 'enemies', slot: 'slime' }))).toBe(true)
    expect(creatureExists(creatureKey({ worldId: DKP, folder: 'enemies', slot: 'nothing' }))).toBe(false)
    expect(creatureExists(creatureKey({ worldId: 'no-such-world', folder: 'enemies', slot: 'slime' }))).toBe(false)
    // The warden moved to the bosses folder; its old address is dead.
    expect(creatureExists(creatureKey({ worldId: DKP, folder: 'enemies', slot: 'warden' }))).toBe(false)
    expect(creatureExists(creatureKey({ worldId: DKP, folder: 'bosses', slot: 'dragonWarriorWarden' }))).toBe(true)
  })

  it('reads a name off the slot', () => {
    expect(creatureName(creatureKey({ worldId: DKP, folder: 'bosses', slot: 'waterDragonRyu' }))).toBe(
      'Water Dragon Ryu',
    )
    // And the Totem naming goes through it rather than mangling the path.
    expect(nameFromAvatarKey(creatureKey({ worldId: DKP, folder: 'enemies', slot: 'slime' }))).toBe('Slime')
  })
})

describe('what a creature is worth', () => {
  const lv = (folder: 'enemies' | 'bosses', slot: string) =>
    creatureStartingLevel(creatureKey({ worldId: DKP, folder, slot })).level

  it('starts the four that were named where they were told to', () => {
    expect(lv('enemies', 'slime')).toBe(10)
    expect(lv('bosses', 'dragonWarriorWarden')).toBe(25)
    expect(lv('bosses', 'minotaur')).toBe(35)
    expect(lv('bosses', 'waterDragonRyu')).toBe(50)
  })

  it('is not moved by how the slot is spelled', () => {
    expect(startingLevelFor(DKP, 'bosses', 'water_dragon_ryu').level).toBe(50)
    expect(startingLevelFor(DKP, 'bosses', 'WaterDragonRyu').level).toBe(50)
  })

  it('says when a level is a guess rather than a decision', () => {
    expect(startingLevelFor(DKP, 'enemies', 'slime').provisional).toBe(false)
    expect(startingLevelFor(DKP, 'enemies', 'goblin').provisional).toBe(true)
  })

  it('guesses an unlisted one from where it was met', () => {
    const guess = startingLevelFor(DKP, 'enemies', 'goblin')
    expect(guess.level).toBeGreaterThan(0)
    // An underling is guessed shallower than a boss of the same world.
    expect(guess.level).toBeLessThan(startingLevelFor(DKP, 'bosses', 'something_new').level)
  })

  it('charges for the levels it skips', () => {
    const cost = (slot: string, level: number) => {
      const r = creatureRecipe(slot, level)
      return r.money + r.ingredients.reduce((sum, i) => sum + getMaterialDef(i.materialId).value * i.quantity, 0)
    }
    expect(cost('waterDragonRyu', 50)).toBeGreaterThan(cost('minotaur', 35))
    expect(cost('minotaur', 35)).toBeGreaterThan(cost('slime', 10))
  })

  it('asks for materials from its own depth, not from a hash of its name', () => {
    // A level-5 goblin wanting dragon horns was the bug: the totals scaled
    // with level but the shelf did not, so a deep creature could be bought
    // with a sack of shallow junk and a shallow one could not be bought at all.
    const shallow = creatureRecipe('goblin', 5).ingredients.map((i) => getMaterialDef(i.materialId))
    const deep = creatureRecipe('waterDragonRyu', 50).ingredients.map((i) => getMaterialDef(i.materialId))
    expect(shallow.every((d) => d.tiers.includes('tier10'))).toBe(true)
    expect(deep.some((d) => d.tiers.includes('tier50'))).toBe(true)
  })

  it('prices the same creature the same way every time', () => {
    expect(creatureRecipe('minotaur', 35)).toEqual(creatureRecipe('minotaur', 35))
  })
})

describe('meeting one is what puts it in the window', () => {
  it('records the foe you are about to fight', () => {
    const enemy = spawnEnemy(world, 'seed', 5)
    const key = creatureKeyForImage(DKP, enemy.image)
    expect(key).not.toBeNull()
    expect(parseCreatureKey(key!)!.folder).toBe('enemies')
    expect(creatureExists(key!)).toBe(true)
  })

  it('records a boss', () => {
    const boss = spawnBoss(world, 'seed', 10, 'tier10')
    const key = creatureKeyForImage(DKP, boss.image)
    expect(parseCreatureKey(key!)).toEqual({ worldId: DKP, folder: 'bosses', slot: 'minotaur' })
  })

  it('records nothing for a Mimic, which fights dressed as a chest', () => {
    const mimic = spawnMimic(world, 'seed', 5)
    expect(mimic.image.folder).toBe('events')
    expect(creatureKeyForImage(DKP, mimic.image)).toBeNull()
  })

  it('lists the roster deepest first, and drops art this build lost', () => {
    const seen = [
      creatureKey({ worldId: DKP, folder: 'enemies', slot: 'slime' }),
      creatureKey({ worldId: DKP, folder: 'bosses', slot: 'waterDragonRyu' }),
      creatureKey({ worldId: DKP, folder: 'bosses', slot: 'minotaur' }),
      creatureKey({ worldId: DKP, folder: 'enemies', slot: 'deleted_art' }),
    ]
    const roster = creatureRoster(seen)
    expect(roster.map(creatureName)).toEqual(['Water Dragon Ryu', 'Minotaur', 'Slime'])
  })

  it('does not list the same creature twice however often it is met', () => {
    const key = creatureKey({ worldId: DKP, folder: 'enemies', slot: 'slime' })
    expect(creatureRoster([key, key, key])).toEqual([key])
  })
})

describe('wearing one', () => {
  const ryu = creatureKey({ worldId: DKP, folder: 'bosses', slot: 'waterDragonRyu' })

  it('is never unlocked until it has been forged', () => {
    expect(isTotemUnlocked(ryu)).toBe(false)
    expect(isTotemUnlocked(ryu, [ryu])).toBe(true)
  })

  it('does not open just because some portrait was forged', () => {
    expect(isTotemUnlocked(ryu, ['Dolbae', 'Silver Knight'])).toBe(false)
  })

  it('does not open a portrait just because a creature was forged', () => {
    // Both directions: a creature key must not resolve loosely onto the
    // portrait folder's fallback, which would unlock a face nobody earned.
    const locked = ['Silver Knight', 'TheExplorer'].filter((k) => !isTotemUnlocked(k))
    for (const key of locked) expect(isTotemUnlocked(key, [ryu])).toBe(false)
  })

  it('refuses a creature whose art this build does not have', () => {
    const ghost = creatureKey({ worldId: DKP, folder: 'enemies', slot: 'deleted_art' })
    expect(isTotemUnlocked(ghost, [ghost])).toBe(false)
  })

  it('arrives already grown, with the health of its level', () => {
    const totem = createTotem(creatureName(ryu), ryu, creatureStartingLevel(ryu).level)
    expect(totem.level).toBe(50)
    expect(totem.maxHp).toBe(totemBalance.maxHp(50))
    expect(totem.currentHp).toBe(totem.maxHp)
    expect(totem.experience).toBe(0)
    expect(totem.name).toBe('Water Dragon Ryu')
  })

  it('still raises a portrait at level 1', () => {
    expect(createTotem('Dolbae', 'Dolbae').level).toBe(1)
  })

  it('cannot be raised past the ceiling by a silly level', () => {
    expect(createTotem('x', ryu, 99999).level).toBe(totemBalance.maxLevel)
    expect(createTotem('x', ryu, -5).level).toBe(1)
  })
})

describe('what is shown is what is charged', () => {
  const ryu = creatureKey({ worldId: DKP, folder: 'bosses', slot: 'waterDragonRyu' })

  it('prices a creature by its own recipe, not by a portrait it resolves onto', () => {
    // The bug this is here for: forgeRecipeFor() routes a creature key
    // through the portrait folder, whose lookup answers an unknown key with
    // that folder's fallback — so a Ryu advertised at hundreds of coins was
    // handed over for the price of the first portrait in the directory.
    expect(recipeForTotemKey(ryu)).toEqual(creatureRecipe('waterDragonRyu', 50))
    expect(recipeForTotemKey(ryu)).not.toEqual(forgeRecipeFor(ryu))
  })

  it('leaves a portrait priced exactly as it was', () => {
    for (const key of ['Dolbae', 'Silver Knight']) {
      expect(recipeForTotemKey(key)).toEqual(forgeRecipeFor(key))
    }
  })

  it('charges what it showed', () => {
    const recipe = recipeForTotemKey(ryu)
    let bag = recipe.ingredients.map((i) => ({ materialId: i.materialId, quantity: i.quantity }))
    const paid = payForRecipe(recipe, bag, recipe.money)
    expect(paid.forged).toBe(true)
    // Exactly enough was exactly enough: nothing left over either way.
    expect(paid.money).toBe(0)
    expect(paid.bag).toEqual([])
  })

  it('refuses when one material short of the shown price', () => {
    const recipe = recipeForTotemKey(ryu)
    const short = recipe.ingredients.map((i, n) => ({
      materialId: i.materialId,
      quantity: n === 0 ? i.quantity - 1 : i.quantity,
    }))
    expect(payForRecipe(recipe, short, recipe.money).forged).toBe(false)
  })

  it('agrees with the bench about the level too', () => {
    expect(startingLevelForKey(ryu)).toBe(creatureStartingLevel(ryu).level)
    expect(startingLevelForKey('Dolbae')).toBe(1)
  })
})
