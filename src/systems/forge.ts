/**
 * Whether the blacksmith can make you the thing, and what it costs when he
 * does.
 *
 * Pure: takes a bag and a purse, hands back what the bag and purse would
 * become. The store applies the result; nothing here touches it.
 */

import type { MaterialEntry } from '@/domain/material'
import type { ForgeIngredient, ForgeRecipe } from '@/config/forging'
import { findMaterialDef } from '@/config/materials'
import { countOfMaterial, removeMaterial } from './materials'

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
