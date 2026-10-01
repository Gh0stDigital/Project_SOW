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
import { hasAsset, resolvedKey } from './assets'
import { powerBalance } from './balance'

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
function flatten(key: string): string {
  const flat = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  return flat.startsWith('totem') ? flat.slice('totem'.length) : flat
}

function normalizeKey(key: string): string {
  return flatten(resolvedKey('totems', key) || key)
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
 * The shape of a recipe: which materials, how many, and the fee.
 *
 * `grade` picks the shelf the ingredients come off; `key` picks which of
 * them and how many, deterministically, so the same name always costs the
 * same thing across launches and across devices. A price that moved when
 * the page reloaded would be worse than no price at all.
 */
function recipeAtGrade(key: string, grade: number): ForgeRecipe {
  const h = hashOf(key)
  const g = Math.max(0, Math.min(GRADES.length - 1, grade))
  const tier = GRADES[g]
  // Unsigned shifts throughout. `>>` is signed, so a hash with its top bit
  // set shifts to a negative number, and a negative index into the grade
  // table is an undefined material — a recipe asking for nothing at all.
  const lead = tier[h % tier.length]
  const second = tier[(h >>> 3) % tier.length]
  const lower = GRADES[Math.max(0, g - 1)]
  const filler = lower[(h >>> 6) % lower.length]

  // Quantities land in a band that reads as a shopping list rather than as
  // a random number: more of the cheap thing, few of the rare one.
  const leadQty = 2 + (g === 2 ? 1 : 0) + ((h >>> 9) % 2)
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

/**
 * A recipe for a portrait nobody has priced yet.
 *
 * A portrait has no level to read a grade off — it starts at 1 like every
 * other — so the grade comes from the name as well, which spreads the
 * roster across the three shelves instead of making them all cost stones.
 */
export function provisionalRecipe(avatarKey: string): ForgeRecipe {
  // An art key resolves through the portrait registry so a rename keeps its
  // price; anything else is taken as written, because resolving it would
  // answer with a portrait that has nothing to do with it.
  const key = hasAsset('totems', avatarKey) ? normalizeKey(avatarKey) : flatten(avatarKey)
  return recipeAtGrade(key, hashOf(key) % GRADES.length)
}

/**
 * Which shelf a creature's ingredients come off, from where it starts.
 *
 * Read off the level rather than off the name, which is the whole
 * difference between a creature and a portrait. Hashing the name gave a
 * level-5 goblin a recipe of dragon horns and a level-35 minotaur one of
 * river pebbles — the totals scaled, so it was not cheap, but you could buy
 * something from the deep with a sack of shallow junk. A creature now costs
 * materials from its own depth.
 */
function gradeForLevel(startingLevel: number): number {
  if (startingLevel <= 10) return 0
  if (startingLevel < 50) return 1
  return 2
}

/**
 * What a creature costs on top of a portrait of the same name.
 *
 * A portrait starts at level 1 and has to be raised; a creature arrives
 * already grown, and the levels it skips are the thing being bought. The
 * multiplier is the same power curve the rest of the game is drawn at, so a
 * level-50 Ryu costs what fifty levels are worth rather than a number
 * somebody picked.
 */
function creatureMultiplier(startingLevel: number): number {
  return powerBalance.scale(Math.max(1, startingLevel))
}

/**
 * The recipe for a creature: its design's recipe, scaled by where it starts.
 *
 * Quantities and fee both climb, so a deep creature is a long dig as well as
 * an expensive one. Separate from forgeRecipeFor() because a creature key
 * names world art and carries a level with it; the base shape still comes
 * from the same deterministic derivation, keyed on the creature's own slot.
 */
export function creatureRecipe(slotKey: string, startingLevel: number): ForgeRecipe {
  // Flattened rather than resolved: a creature's slot names world art, and
  // resolvedKey() answers a key the totems folder does not hold with that
  // folder's fallback — which would have given every creature in the game
  // the same recipe as one portrait.
  const flat = flatten(slotKey)
  const base = authored[flat] ?? recipeAtGrade(flat, gradeForLevel(startingLevel))
  const mult = creatureMultiplier(startingLevel)
  return {
    ingredients: base.ingredients.map((i) => ({
      ...i,
      quantity: Math.max(1, Math.round(i.quantity * mult)),
    })),
    money: Math.round((base.money * mult) / 5) * 5,
    provisional: true,
  }
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
