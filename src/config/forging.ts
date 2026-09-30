/**
 * What the blacksmith needs before he will forge a Totem for you.
 *
 * A recipe is materials plus a fee. Nothing here is a lock the player
 * cannot see: every portrait in the folder is displayed at the workshop
 * with its price list, so an unbuilt Totem reads as something to go and
 * dig for rather than as a blank.
 *
 * NOTE ON THE NUMBERS. These are provisional. The real per-Totem costs are
 * not decided yet, so rather than scatter guesses across the screens, every
 * recipe is either written out in `authored` below or derived from the
 * portrait's name by `provisionalRecipe`. When the true requirements are
 * settled, they go in `authored` and nothing else has to change — the
 * `provisional` flag on a recipe is what the workshop uses to say out loud
 * that a price is not final.
 */

import type { MaterialId } from '@/domain/material'
import { getMaterialDef } from './materials'
import { resolvedKey } from './assets'

export interface ForgeIngredient {
  materialId: MaterialId
  quantity: number
}

export interface ForgeRecipe {
  ingredients: readonly ForgeIngredient[]
  /** The smith's fee, on top of the materials. */
  money: number
  /** False once somebody has decided what this Totem should really cost. */
  provisional: boolean
}

/**
 * Keys are normalised the way the asset lookup normalises them — lowercase,
 * separators dropped, a `totem_` prefix ignored — so a recipe survives the
 * portrait being renamed from `totem_silverKnight` to `Silver Knight`.
 */
function normalizeKey(key: string): string {
  const resolved = resolvedKey('totems', key) || key
  const flat = resolved.toLowerCase().replace(/[^a-z0-9]/g, '')
  return flat.startsWith('totem') ? flat.slice('totem'.length) : flat
}

/**
 * Recipes somebody has actually decided on. Empty entries are the point:
 * this is the table to fill in, and everything not in it is guessed.
 */
const authored: Record<string, ForgeRecipe> = {}

/** The three grades a portrait can be guessed into, deepest last. */
const GRADES: readonly (readonly MaterialId[])[] = [
  ['river_pebble', 'shell_shard', 'damp_moss'],
  ['dragon_scale', 'coral_core', 'rusted_ingot'],
  ['abyss_pearl', 'sky_steel', 'dragon_horn'],
]

/** Stable, small, and good enough to spread six names over three grades. */
function hashOf(key: string): number {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return h
}

/**
 * A recipe for a portrait nobody has priced yet.
 *
 * Deterministic in the key, so the same Totem always costs the same thing
 * across launches and across devices — a price that moved when the page
 * reloaded would be worse than no price at all. The shape is always the
 * same: a deep ingredient, a shallower one to pad it out, and a fee.
 */
export function provisionalRecipe(avatarKey: string): ForgeRecipe {
  const key = normalizeKey(avatarKey)
  const h = hashOf(key)
  const grade = h % GRADES.length
  const tier = GRADES[grade]
  // Unsigned shifts throughout. `>>` is signed, so a hash with its top bit
  // set shifts to a negative number, and a negative index into the grade
  // table is an undefined material — a recipe asking for nothing at all.
  const lead = tier[h % tier.length]
  const second = tier[(h >>> 3) % tier.length]
  const lower = GRADES[Math.max(0, grade - 1)]
  const filler = lower[(h >>> 6) % lower.length]

  // Quantities land in a band that reads as a shopping list rather than as
  // a random number: more of the cheap thing, few of the rare one.
  const leadQty = 2 + (grade === 2 ? 1 : 0) + ((h >>> 9) % 2)
  const secondQty = lead === second ? 0 : 3 + ((h >>> 11) % 3)
  const fillerQty = filler === lead || filler === second ? 0 : 4 + ((h >>> 13) % 4)

  const ingredients = [
    { materialId: lead, quantity: leadQty },
    { materialId: second, quantity: secondQty },
    { materialId: filler, quantity: fillerQty },
  ].filter((i) => i.quantity > 0)

  // The fee is a fraction of what the materials alone are worth, so a
  // deeper Totem costs more coin as well as more digging without anybody
  // having to keep a second table of prices in step.
  const materialValue = ingredients.reduce(
    (sum, i) => sum + getMaterialDef(i.materialId).value * i.quantity,
    0,
  )
  const money = Math.round((materialValue * 0.4) / 5) * 5

  return { ingredients, money, provisional: true }
}

/** The recipe for a portrait: the authored one where there is one. */
export function forgeRecipeFor(avatarKey: string): ForgeRecipe {
  return authored[normalizeKey(avatarKey)] ?? provisionalRecipe(avatarKey)
}

export const forgeBalance = {
  /**
   * Whether forging a portrait you have already unlocked is allowed.
   *
   * It is: a Totem is a character, not a costume, and a second one of the
   * same design starting again at level 1 is a legitimate thing to want.
   * It costs the same recipe either way.
   */
  allowDuplicates: true,
}
