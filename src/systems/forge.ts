/**
 * Whether the blacksmith can make you the thing, and what it costs when he
 * does.
 *
 * Pure: takes a bag and a purse, hands back what the bag and purse would
 * become. The store applies the result; nothing here touches it.
 */

import type { MaterialEntry } from '@/domain/material'
import { creatureRecipe, forgeRecipeFor, type ForgeIngredient, type ForgeRecipe } from '@/config/forging'
import { findMaterialDef } from '@/config/materials'
import { countOfMaterial, removeMaterial } from './materials'
import { creatureStartingLevel, isCreatureKey, parseCreatureKey } from './creatureTotems'

/**
 * The recipe for anything the blacksmith can strike, portrait or creature.
 *
 * The one place that decides, because the screen that shows a price and the
 * store that charges it must not be able to disagree. They did: the bench
 * priced a creature with creatureRecipe() while the store paid
 * forgeRecipeFor(), which resolves a creature's key through the *portrait*
 * folder and answers with whatever that folder falls back to — so a Ryu
 * advertised at 305 coins and a bag of dragon horns was handed over for 35
 * and a few river stones.
 *
 * It lives here rather than in config/forging.ts because a creature's price
 * depends on its starting level, and reading that means knowing about
 * worlds — which is a system's business, not configuration's.
 */
export function recipeForTotemKey(avatarKey: string): ForgeRecipe {
  if (!isCreatureKey(avatarKey)) return forgeRecipeFor(avatarKey)
  const ref = parseCreatureKey(avatarKey)
  // A key that parses to nothing cannot name art either, so it will be
  // refused before it is paid for; pricing it as a portrait keeps the
  // function total rather than throwing on the way to that refusal.
  if (!ref) return forgeRecipeFor(avatarKey)
  return creatureRecipe(ref.slot, creatureStartingLevel(avatarKey).level)
}

/** The level a Totem struck from this key begins at. */
export function startingLevelForKey(avatarKey: string): number {
  return isCreatureKey(avatarKey) ? creatureStartingLevel(avatarKey).level : 1
}

export interface IngredientCheck extends ForgeIngredient {
  /** How many of it the player is carrying. */
  have: number
  /** Still to find. Zero once the line is satisfied. */
  short: number
  met: boolean
}

export interface ForgeCheck {
  ingredients: IngredientCheck[]
  money: number
  haveMoney: number
  /** Every ingredient line satisfied, whatever the money says. */
  materialsMet: boolean
  moneyMet: boolean
  /** Both. The only thing a forge button should look at. */
  canForge: boolean
}

/**
 * Reads a recipe against what the player has.
 *
 * Reports every line rather than stopping at the first failure, because the
 * workshop shows the whole list with the missing ones marked — "you need
 * four more of this" is the screen's entire job.
 *
 * An ingredient this build has no definition for counts as unmet and
 * impossible to meet. A recipe can only name a material that exists; if one
 * does not, refusing to forge is the safe answer rather than quietly
 * skipping the line and charging for the rest.
 */
export function checkForge(recipe: ForgeRecipe, bag: readonly MaterialEntry[], money: number): ForgeCheck {
  const ingredients = recipe.ingredients.map((ing) => {
    const known = findMaterialDef(ing.materialId) !== undefined
    const have = known ? countOfMaterial(bag, ing.materialId) : 0
    const short = Math.max(0, ing.quantity - have)
    return { ...ing, have, short, met: known && short === 0 }
  })
  const materialsMet = ingredients.every((i) => i.met)
  const moneyMet = money >= recipe.money
  return {
    ingredients,
    money: recipe.money,
    haveMoney: money,
    materialsMet,
    moneyMet,
    canForge: materialsMet && moneyMet,
  }
}

export interface ForgeOutcome {
  bag: MaterialEntry[]
  money: number
  forged: boolean
}

/**
 * Pays a recipe.
 *
 * Refuses as a whole when anything is short — a half-paid forge that takes
 * the materials and gives back nothing is the one outcome worth writing a
 * guard for — and returns the bag and purse untouched in that case.
 */
export function payForRecipe(
  recipe: ForgeRecipe,
  bag: readonly MaterialEntry[],
  money: number,
): ForgeOutcome {
  const check = checkForge(recipe, bag, money)
  if (!check.canForge) return { bag: [...bag], money, forged: false }

  let next = [...bag]
  for (const ing of recipe.ingredients) {
    next = removeMaterial(next, ing.materialId, ing.quantity)
  }
  return { bag: next, money: money - recipe.money, forged: true }
}

/** How far along the recipe is, 0..1 — for the bar on a locked Totem's card. */
export function forgeProgress(check: ForgeCheck): number {
  const lines = check.ingredients
  if (lines.length === 0) return check.moneyMet ? 1 : 0
  const got = lines.reduce((sum, i) => sum + Math.min(i.have, i.quantity), 0)
  const needed = lines.reduce((sum, i) => sum + i.quantity, 0)
  if (needed <= 0) return 1
  return Math.min(1, got / needed)
}
