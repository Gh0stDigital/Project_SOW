import { describe, it, expect } from 'vitest'
import {
  addMaterial,
  removeMaterial,
  countOfMaterial,
  describeBag,
  bagValue,
  sellPrice,
  rollMaterialDrop,
  rollMaterialDrops,
  rollMaterialChance,
} from './materials'
import { checkForge, payForRecipe, forgeProgress } from './forge'
import { forgeRecipeFor, provisionalRecipe } from '@/config/forging'
import { allMaterialDefs, getMaterialDef, materialsForTier, findMaterialDef } from '@/config/materials'
import { smithSpeech } from './blacksmith'
import { dungeonTiers } from '@/config/balance'
import { assetKeys } from '@/config/assets'
import { isTotemUnlocked, STARTING_TOTEM_KEY } from '@/config/progression'
import type { MaterialEntry } from '@/domain/material'
import { applyRewardBundle } from './dungeonSession'
import { createEmptyRunStats } from '@/domain/dungeon'
import type { DungeonRunState } from '@/domain/dungeon'

/** The smallest run shape applyRewardBundle touches. */
function startingStats(): DungeonRunState {
  return { stats: createEmptyRunStats() } as DungeonRunState
}

/** A sequence-backed rng, so a "random" roll is a written-down one. */
function seq(values: number[]): () => number {
  let i = 0
  return () => values[i++ % values.length]
}

describe('the material bag', () => {
  it('stacks rather than piling up duplicate entries', () => {
    let bag: MaterialEntry[] = []
    bag = addMaterial(bag, 'river_pebble')
    bag = addMaterial(bag, 'river_pebble', 3)
    expect(bag).toHaveLength(1)
    expect(countOfMaterial(bag, 'river_pebble')).toBe(4)
  })

  it('drops a stack when the last one goes', () => {
    let bag = addMaterial([], 'shell_shard', 2)
    bag = removeMaterial(bag, 'shell_shard', 2)
    expect(bag).toHaveLength(0)
    expect(countOfMaterial(bag, 'shell_shard')).toBe(0)
  })

  it('never goes negative, however much is taken', () => {
    const bag = removeMaterial(addMaterial([], 'damp_moss', 1), 'damp_moss', 99)
    expect(bag).toHaveLength(0)
  })

  it('leaves the bag alone for a non-positive quantity', () => {
    const bag = addMaterial([], 'river_pebble', 2)
    expect(addMaterial(bag, 'river_pebble', 0)).toBe(bag)
    expect(removeMaterial(bag, 'river_pebble', 0)).toBe(bag)
  })

  it('leaves stacks it has no definition for out of every listing', () => {
    const bag: MaterialEntry[] = [
      { materialId: 'river_pebble', quantity: 2 },
      { materialId: 'a_material_from_a_later_build', quantity: 5 },
    ]
    expect(describeBag(bag).map((s) => s.def.id)).toEqual(['river_pebble'])
    // And it is worth nothing rather than NaN.
    expect(bagValue(bag)).toBe(getMaterialDef('river_pebble').value * 2)
  })

  it('prices a whole stack at its unit price times the count', () => {
    const def = getMaterialDef('dragon_scale')
    expect(sellPrice(def, 7)).toBe(def.value * 7)
    expect(sellPrice(def, 0)).toBe(0)
  })
})

describe('what the tiers give up', () => {
  it('gives every tier something to drop', () => {
    for (const tier of dungeonTiers) {
      expect(materialsForTier(tier.id).length).toBeGreaterThan(0)
    }
  })

  /**
   * The selling stock only.
   *
   * The crafting line — meteor iron, hanji, ink, the world memories — falls
   * at every depth on purpose: a recipe asks for *more* of them rather than
   * for rarer ones, so the difference between a slime and a Ryu is how long
   * you keep at it, not which tier you can survive. The graded stock below
   * is what makes a deep run pay better.
   */
  const graded = (tier: 'tier10' | 'tier25' | 'tier50') =>
    materialsForTier(tier).filter((d) => d.tiers.length === 1)

  it('never drops a deep selling material in the shallows', () => {
    expect(graded('tier10').some((d) => graded('tier50').includes(d))).toBe(false)
  })

  it('pays better the deeper the tier', () => {
    const best = (tier: 'tier10' | 'tier25' | 'tier50') =>
      Math.max(...graded(tier).map((d) => d.value))
    expect(best('tier25')).toBeGreaterThan(best('tier10'))
    expect(best('tier50')).toBeGreaterThan(best('tier25'))
  })

  it('only ever rolls something that tier actually has', () => {
    for (const tier of dungeonTiers) {
      const allowed = new Set(materialsForTier(tier.id).map((d) => d.id))
      for (let i = 0; i < 200; i++) {
        const rolled = rollMaterialDrop(tier.id)
        expect(rolled).not.toBeNull()
        expect(allowed.has(rolled!)).toBe(true)
      }
    }
  })

  it('walks the weighted table in order', () => {
    const table = materialsForTier('tier10')
    // A roll of 0 lands on the first entry; a roll of almost 1 on the last.
    expect(rollMaterialDrop('tier10', undefined, seq([0]))).toBe(table[0].id)
    expect(rollMaterialDrop('tier10', undefined, seq([0.999999]))).toBe(table[table.length - 1].id)
  })

  it('rolls a chance drop only when the chance passes', () => {
    // First number is the chance gate, second picks from the table.
    expect(rollMaterialChance('tier10', 0.5, undefined, seq([0.9, 0]))).toBeNull()
    expect(rollMaterialChance('tier10', 0.5, undefined, seq([0.1, 0]))).not.toBeNull()
    // A zero chance never drops, whatever the roll.
    expect(rollMaterialChance('tier10', 0, undefined, seq([0]))).toBeNull()
  })

  it('gives a boss as many as it was asked for', () => {
    expect(rollMaterialDrops('tier50', 3, undefined, seq([0.1])).length).toBe(3)
    expect(rollMaterialDrops('tier50', 0)).toEqual([])
  })

  it('names a real material in every definition it ships', () => {
    for (const def of allMaterialDefs) {
      expect(findMaterialDef(def.id)).toBe(def)
      expect(def.value).toBeGreaterThan(0)
    }
  })
})

describe('reading a recipe', () => {
  const recipe = {
    ingredients: [
      { materialId: 'river_pebble', quantity: 4 },
      { materialId: 'shell_shard', quantity: 2 },
    ],
    money: 30,
    provisional: true,
  }

  it('reports every line, not just the first that fails', () => {
    const check = checkForge(recipe, [], 0)
    expect(check.ingredients).toHaveLength(2)
    expect(check.ingredients.map((i) => i.short)).toEqual([4, 2])
    expect(check.canForge).toBe(false)
  })

  it('counts what is carried against what is needed', () => {
    const bag = addMaterial(addMaterial([], 'river_pebble', 5), 'shell_shard', 1)
    const check = checkForge(recipe, bag, 30)
    expect(check.ingredients[0]).toMatchObject({ have: 5, short: 0, met: true })
    expect(check.ingredients[1]).toMatchObject({ have: 1, short: 1, met: false })
    expect(check.materialsMet).toBe(false)
    expect(check.moneyMet).toBe(true)
    expect(check.canForge).toBe(false)
  })

  it('holds the materials against the money separately', () => {
    const bag = addMaterial(addMaterial([], 'river_pebble', 4), 'shell_shard', 2)
    const short = checkForge(recipe, bag, 29)
    expect(short.materialsMet).toBe(true)
    expect(short.moneyMet).toBe(false)
    expect(short.canForge).toBe(false)
    // Exactly the fee is enough — the fee is a price, not a minimum balance.
    expect(checkForge(recipe, bag, 30).canForge).toBe(true)
  })

  it('refuses a recipe naming a material this build does not have', () => {
    const bad = { ingredients: [{ materialId: 'nonexistent', quantity: 1 }], money: 0, provisional: true }
    const check = checkForge(bad, addMaterial([], 'nonexistent', 99), 100)
    expect(check.ingredients[0].met).toBe(false)
    expect(check.canForge).toBe(false)
  })

  it('reads progress off how much of the list is in hand', () => {
    expect(forgeProgress(checkForge(recipe, [], 0))).toBe(0)
    const half = addMaterial([], 'river_pebble', 3)
    expect(forgeProgress(checkForge(recipe, half, 0))).toBeCloseTo(3 / 6)
    const full = addMaterial(addMaterial([], 'river_pebble', 9), 'shell_shard', 9)
    // Surplus does not push it past full.
    expect(forgeProgress(checkForge(recipe, full, 0))).toBe(1)
  })
})

describe('paying for a forge', () => {
  const recipe = {
    ingredients: [{ materialId: 'dragon_scale', quantity: 3 }],
    money: 20,
    provisional: true,
  }

  it('takes the materials and the fee when it goes through', () => {
    const bag = addMaterial([], 'dragon_scale', 5)
    const out = payForRecipe(recipe, bag, 50)
    expect(out.forged).toBe(true)
    expect(countOfMaterial(out.bag, 'dragon_scale')).toBe(2)
    expect(out.money).toBe(30)
  })

  it('takes nothing at all when anything is short', () => {
    const bag = addMaterial([], 'dragon_scale', 2)
    const out = payForRecipe(recipe, bag, 1000)
    expect(out.forged).toBe(false)
    expect(countOfMaterial(out.bag, 'dragon_scale')).toBe(2)
    expect(out.money).toBe(1000)
  })

  it('takes nothing when only the money is short', () => {
    const bag = addMaterial([], 'dragon_scale', 3)
    const out = payForRecipe(recipe, bag, 19)
    expect(out.forged).toBe(false)
    expect(countOfMaterial(out.bag, 'dragon_scale')).toBe(3)
    expect(out.money).toBe(19)
  })

  it('does not hand back the same array it was given', () => {
    const bag = addMaterial([], 'dragon_scale', 1)
    expect(payForRecipe(recipe, bag, 0).bag).not.toBe(bag)
  })
})

describe('the provisional price list', () => {
  const portraits = assetKeys('totems')

  it('prices every portrait in the folder', () => {
    for (const key of portraits) {
      const recipe = forgeRecipeFor(key)
      expect(recipe.ingredients.length).toBeGreaterThan(0)
      expect(recipe.money).toBeGreaterThan(0)
    }
  })

  it('only ever asks for materials that exist', () => {
    for (const key of portraits) {
      for (const ing of forgeRecipeFor(key).ingredients) {
        expect(findMaterialDef(ing.materialId)).toBeDefined()
        expect(ing.quantity).toBeGreaterThan(0)
      }
    }
  })

  it('asks for each material at most once', () => {
    for (const key of portraits) {
      const ids = forgeRecipeFor(key).ingredients.map((i) => i.materialId)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  it('gives the same portrait the same price every time it is asked', () => {
    for (const key of portraits) {
      expect(forgeRecipeFor(key)).toEqual(forgeRecipeFor(key))
    }
  })

  it('is not moved by how the portrait key is spelled', () => {
    // A rename from `totem_Dolbae` to `Dolbae` must not reprice the Totem.
    expect(provisionalRecipe('Dolbae')).toEqual(provisionalRecipe('totem_dolbae'))
    expect(provisionalRecipe('Dolbae')).toEqual(provisionalRecipe('DOLBAE'))
  })

  it('says out loud that it is provisional', () => {
    for (const key of portraits) {
      expect(forgeRecipeFor(key).provisional).toBe(true)
    }
  })
})

describe('what forging opens', () => {
  it('starts with only the one portrait the game gives you', () => {
    expect(isTotemUnlocked(STARTING_TOTEM_KEY)).toBe(true)
    const others = assetKeys('totems').filter((key) => !isTotemUnlocked(key))
    expect(others.length).toBeGreaterThan(0)
  })

  it('opens a portrait once it has been forged', () => {
    const locked = assetKeys('totems').find((key) => !isTotemUnlocked(key))!
    expect(isTotemUnlocked(locked, [locked])).toBe(true)
    // And only that one.
    const stillLocked = assetKeys('totems').filter((k) => !isTotemUnlocked(k, [locked]))
    expect(stillLocked).not.toContain(locked)
  })

  it('still refuses a key that names no art, forged or not', () => {
    expect(isTotemUnlocked('no_such_portrait_at_all', ['no_such_portrait_at_all'])).toBe(false)
  })
})

describe('what the smith says', () => {
  it('sends you back to the dungeon when the bag is empty', () => {
    const speech = smithSpeech({ at: 'sell', stacks: [], total: 0, earnedThisVisit: 0 })
    expect(speech.mood).toBe('idle')
    expect(speech.line).toContain('던전')
  })

  it('names the takings after a sale', () => {
    const speech = smithSpeech({ at: 'sell', stacks: [], total: 0, earnedThisVisit: 42 })
    expect(speech.line).toContain('42')
    expect(speech.mood).toBe('pleased')
  })

  it('points at the treasure when there is treasure to point at', () => {
    const treasure = { def: getMaterialDef('crown_fragment'), quantity: 1 }
    const speech = smithSpeech({ at: 'sell', stacks: [treasure], total: 130, earnedThisVisit: 0 })
    expect(speech.hint).toContain(treasure.def.name)
  })

  it('warns against selling materials when none of it is treasure', () => {
    const material = { def: getMaterialDef('dragon_scale'), quantity: 2 }
    const speech = smithSpeech({ at: 'sell', stacks: [material], total: 28, earnedThisVisit: 0 })
    expect(speech.hint).toContain('주조')
  })

  it('counts what he could strike right now', () => {
    const speech = smithSpeech({ at: 'forge', designs: 6, affordable: 2, forged: 1 })
    expect(speech.line).toContain('2')
    expect(speech.mood).toBe('pleased')
  })

  it('refuses over materials and over money differently', () => {
    const recipe = { ingredients: [{ materialId: 'dragon_scale', quantity: 3 }], money: 20, provisional: true }
    const noMaterials = smithSpeech({
      at: 'recipe',
      name: '아무개',
      check: checkForge(recipe, [], 1000),
      provisional: true,
      known: false,
    })
    expect(noMaterials.mood).toBe('refusing')
    expect(noMaterials.line).toContain('모자라')

    const noMoney = smithSpeech({
      at: 'recipe',
      name: '아무개',
      check: checkForge(recipe, addMaterial([], 'dragon_scale', 3), 5),
      provisional: true,
      known: false,
    })
    expect(noMoney.mood).toBe('refusing')
    expect(noMoney.line).toContain('20')
  })

  it('says the price is not final when it is not', () => {
    const recipe = { ingredients: [], money: 0, provisional: true }
    const ready = smithSpeech({
      at: 'recipe',
      name: '아무개',
      check: checkForge(recipe, [], 0),
      provisional: true,
      known: false,
    })
    expect(ready.mood).toBe('pleased')
    expect(ready.hint).toContain('임시')
  })
})

describe('a run carries its materials home', () => {
  it('folds a reward bundle s materials into the run total', () => {
    const run = startingStats()
    const after = applyRewardBundle(run, {
      money: 10,
      totemXp: 0,
      itemIds: ['healing_herb'],
      materialIds: ['river_pebble', 'river_pebble', 'crown_fragment'],
      lines: [],
    })
    expect(after.stats.materialsCollected).toEqual(['river_pebble', 'river_pebble', 'crown_fragment'])
    // And does not mix the two bags up.
    expect(after.stats.itemsCollected).toEqual(['healing_herb'])
  })

  it('keeps what was already carried', () => {
    const once = applyRewardBundle(startingStats(), {
      money: 0, totemXp: 0, itemIds: [], materialIds: ['damp_moss'], lines: [],
    })
    const twice = applyRewardBundle(once, {
      money: 0, totemXp: 0, itemIds: [], materialIds: ['shell_shard'], lines: [],
    })
    expect(twice.stats.materialsCollected).toEqual(['damp_moss', 'shell_shard'])
  })

  it('starts a run carrying nothing', () => {
    expect(startingStats().stats.materialsCollected).toEqual([])
  })
})
