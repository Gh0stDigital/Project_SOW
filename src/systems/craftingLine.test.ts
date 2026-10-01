import { describe, expect, it } from 'vitest'
import { creatureRecipe } from '@/config/forging'
import {
  allMaterialDefs,
  findMaterialDef,
  getMaterialDef,
  materialsForTier,
  materialsFromBoss,
} from '@/config/materials'
import { bagValue, bossMaterialDrops, isSellable, rollMaterialDrop, sellPrice } from './materials'
import { recipeForTotemKey } from './forge'
import { creatureKey } from './creatureTotems'
import { bossSlotFor } from '@/config/bosses'
import { dungeonTiers } from '@/config/balance'
import { getAsset, hasAsset } from '@/config/assets'

const DKP = 'dragon-king-palace'
const key = (folder: 'enemies' | 'bosses', slot: string) => creatureKey({ worldId: DKP, folder, slot })

/** A recipe as {materialId: quantity}, which is how it was written down. */
function asList(slot: string, level: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const i of creatureRecipe(slot, level).ingredients) out[i.materialId] = i.quantity
  return out
}

describe('the four stated recipes', () => {
  it('builds a slime', () => {
    expect(asList('slime', 10)).toEqual({
      meteor_iron: 1,
      hanji: 1,
      red_ink: 2,
      memory_dragon_king_palace: 1,
    })
  })

  it('builds a dragon warrior', () => {
    expect(asList('DragonGuard', 25)).toEqual({
      meteor_iron: 2,
      hanji: 1,
      red_ink: 2,
      memory_dragon_king_palace: 2,
    })
  })

  it('builds a minotaur', () => {
    expect(asList('minotaur', 35)).toEqual({
      meteor_iron: 3,
      hanji: 1,
      red_ink: 2,
      memory_dragon_king_palace: 2,
    })
  })

  it('builds Ryu, lantern and all', () => {
    expect(asList('waterDragonRyu', 50)).toEqual({
      meteor_iron: 5,
      hanji: 2,
      red_ink: 4,
      memory_dragon_king_palace: 2,
      core_lantern_of_ryu: 1,
    })
  })

  it('takes the written numbers as written, not scaled by level', () => {
    // The level multiplier exists to make a *guess* scale with what it is
    // buying. Applying it to numbers somebody chose would mean the sheet
    // showed something other than what was decided.
    expect(creatureRecipe('minotaur', 35)).toEqual(creatureRecipe('minotaur', 1))
    expect(creatureRecipe('waterDragonRyu', 50)).toEqual(creatureRecipe('waterDragonRyu', 500))
  })

  it('charges no smith\'s fee, because none was asked for', () => {
    for (const slot of ['slime', 'DragonGuard', 'minotaur', 'waterDragonRyu']) {
      expect(creatureRecipe(slot, 10).money).toBe(0)
    }
  })

  it('stops calling them provisional', () => {
    for (const slot of ['slime', 'DragonGuard', 'minotaur', 'waterDragonRyu']) {
      expect(creatureRecipe(slot, 10).provisional).toBe(false)
    }
  })

  it('is what the workshop prices and the store charges', () => {
    expect(recipeForTotemKey(key('bosses', 'waterDragonRyu'))).toEqual(
      creatureRecipe('waterDragonRyu', 50),
    )
    expect(recipeForTotemKey(key('enemies', 'slime'))).toEqual(creatureRecipe('slime', 10))
  })

  it('only ever names materials that exist', () => {
    for (const slot of ['slime', 'DragonGuard', 'minotaur', 'waterDragonRyu']) {
      for (const i of creatureRecipe(slot, 10).ingredients) {
        expect(findMaterialDef(i.materialId)).toBeDefined()
        expect(i.quantity).toBeGreaterThan(0)
      }
    }
  })

  it('asks more of the deeper creature', () => {
    const total = (slot: string) =>
      creatureRecipe(slot, 10).ingredients.reduce((sum, i) => sum + i.quantity, 0)
    expect(total('slime')).toBeLessThan(total('DragonGuard'))
    expect(total('DragonGuard')).toBeLessThan(total('minotaur'))
    expect(total('minotaur')).toBeLessThan(total('waterDragonRyu'))
  })
})

describe('the crafting line falls everywhere', () => {
  const spine = ['meteor_iron', 'hanji', 'red_ink']

  it('drops at every tier, so depth is not what gates a recipe', () => {
    for (const tier of dungeonTiers) {
      const ids = materialsForTier(tier.id, DKP).map((d) => d.id)
      for (const id of spine) expect(ids).toContain(id)
    }
  })

  it('can only be rolled from the tables it belongs to', () => {
    for (const tier of dungeonTiers) {
      const allowed = new Set(materialsForTier(tier.id, DKP).map((d) => d.id))
      for (let i = 0; i < 300; i++) {
        expect(allowed.has(rollMaterialDrop(tier.id, DKP)!)).toBe(true)
      }
    }
  })
})

describe('a world memory belongs to its world', () => {
  const memory = 'memory_dragon_king_palace'

  it('falls in the Dragon King\'s Palace', () => {
    expect(materialsForTier('tier10', DKP).map((d) => d.id)).toContain(memory)
  })

  it('falls nowhere else', () => {
    for (const other of ['parasite-garden', 'profane-prison', 'starter']) {
      expect(materialsForTier('tier10', other).map((d) => d.id)).not.toContain(memory)
      expect(materialsForTier('tier50', other).map((d) => d.id)).not.toContain(memory)
    }
  })

  it('is listed for a caller with no world in hand, rather than vanishing', () => {
    // The catalogue screens and the tests have no run to ask.
    expect(materialsForTier('tier10').map((d) => d.id)).toContain(memory)
  })

  it('is never rolled in a world it does not belong to', () => {
    for (let i = 0; i < 300; i++) {
      expect(rollMaterialDrop('tier25', 'parasite-garden')).not.toBe(memory)
    }
  })
})

describe("a core memory comes from the thing that carries it", () => {
  const lantern = 'core_lantern_of_ryu'

  it('is what Ryu leaves behind', () => {
    expect(bossMaterialDrops('waterDragonRyu')).toEqual([lantern])
    expect(materialsFromBoss('waterDragonRyu').map((d) => d.id)).toEqual([lantern])
  })

  it('is tied to the boss the tier actually fields', () => {
    expect(getMaterialDef(lantern).fromBoss).toBe(bossSlotFor(DKP, 'tier25'))
  })

  it('comes from nobody else', () => {
    for (const slot of ['minotaur', 'DragonGuard', 'slime', 'goblin']) {
      expect(bossMaterialDrops(slot)).toEqual([])
    }
  })

  it('is never in an ordinary drop table, at any tier or world', () => {
    for (const tier of dungeonTiers) {
      expect(materialsForTier(tier.id, DKP).map((d) => d.id)).not.toContain(lantern)
      expect(materialsForTier(tier.id).map((d) => d.id)).not.toContain(lantern)
    }
  })

  it('is never rolled, however many times the table is asked', () => {
    for (const tier of dungeonTiers) {
      for (let i = 0; i < 300; i++) {
        expect(rollMaterialDrop(tier.id, DKP)).not.toBe(lantern)
      }
    }
  })

  it('means Ryu cannot be forged without beating Ryu', () => {
    const needs = creatureRecipe('waterDragonRyu', 50).ingredients.map((i) => i.materialId)
    expect(needs).toContain(lantern)
  })
})

describe('the catalogue stays coherent', () => {
  it('gives every material a name, an icon and a price', () => {
    for (const def of allMaterialDefs) {
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.icon.length).toBeGreaterThan(0)
      expect(def.value).toBeGreaterThan(0)
    }
  })

  it('leaves no two materials sharing an id', () => {
    const ids = allMaterialDefs.map((d) => d.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives a boss-only material no drop weight, so nothing can roll it', () => {
    for (const def of allMaterialDefs) {
      if (def.fromBoss) expect(def.dropWeight).toBe(0)
    }
  })
})

describe('the crafting line has its art', () => {
  it('ships a picture for every material a stated recipe asks for', () => {
    const asked = new Set(
      ['slime', 'DragonGuard', 'minotaur', 'waterDragonRyu'].flatMap((slot) =>
        creatureRecipe(slot, 10).ingredients.map((i) => i.materialId),
      ),
    )
    for (const id of asked) expect(hasAsset('materials', id)).toBe(true)
  })

  it('still has an emoji behind every one, for anything not yet drawn', () => {
    // MaterialIcon falls back to it, so a material added tomorrow is
    // listed rather than blank.
    for (const def of allMaterialDefs) expect(def.icon.length).toBeGreaterThan(0)
  })

  it('resolves each picture to its own file, not to a neighbour', () => {
    const files = new Set<string>()
    for (const id of ['meteor_iron', 'hanji', 'red_ink', 'memory_dragon_king_palace', 'core_lantern_of_ryu']) {
      expect(hasAsset('materials', id)).toBe(true)
      files.add(getAsset('materials', id))
    }
    expect(files.size).toBe(5)
  })
})

describe('a core memory is a key, not stock', () => {
  const lantern = getMaterialDef('core_lantern_of_ryu')

  it('is refused at the counter', () => {
    expect(isSellable(lantern)).toBe(false)
    expect(sellPrice(lantern, 1)).toBe(0)
    expect(sellPrice(lantern, 9)).toBe(0)
  })

  it('does not inflate what the bag is said to be worth', () => {
    expect(bagValue([{ materialId: 'core_lantern_of_ryu', quantity: 3 }])).toBe(0)
  })

  it('leaves everything else sellable', () => {
    for (const def of allMaterialDefs) {
      if (def.id === 'core_lantern_of_ryu') continue
      expect(isSellable(def)).toBe(true)
      expect(sellPrice(def, 2)).toBe(def.value * 2)
    }
  })
})
