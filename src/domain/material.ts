/**
 * What a dungeon leaves you carrying that is not a consumable.
 *
 * Two kinds share one bag, because they share every mechanic that matters:
 * both stack, both drop from the same chests, and both are sold over the
 * same counter at the blacksmith's.
 *
 *   - A *material* is an ingredient. It has a price, but its real use is in
 *     a forge recipe, so selling one is a decision.
 *   - A *treasure* is worth money and nothing else. No recipe asks for one,
 *     so there is never a reason to keep it beyond liking the look of it.
 *
 * Definitions — names, prices, which tiers drop them — live in
 * config/materials.ts. This file only describes the shapes.
 */

import type { DungeonTierId } from '@/config/balance'

export type MaterialKind = 'material' | 'treasure'

/**
 * Ids are strings rather than a closed union.
 *
 * The catalogue is going to grow every time a world does, and a union would
 * make each addition a type change rippling through saves, drop tables and
 * recipes. `isMaterialId` is the guard that keeps a save's unknown entry
 * from becoming an undefined lookup.
 */
export type MaterialId = string

export interface MaterialDef {
  id: MaterialId
  name: string
  /** Drawn when there is no art for it — same rule as the item icons. */
  icon: string
  description: string
  kind: MaterialKind
  /**
   * What the blacksmith pays for one, and what it is worth to the player
   * when weighing a sale against a recipe.
   */
  value: number
  /** Which dungeon tiers drop it. Empty means it never drops. */
  tiers: readonly DungeonTierId[]
  /** Relative weight within its tiers' drop tables. */
  dropWeight: number
  /**
   * The worlds this falls in. Absent means every world.
   *
   * A world's memory is the obvious case: the Dragon King's Palace yields
   * a memory of the Dragon King's Palace and nothing else does, which is
   * what makes a recipe asking for one a reason to go back there rather
   * than anywhere.
   */
  worlds?: readonly string[]
  /**
   * Whether the blacksmith will take it off you. Absent means yes.
   *
   * A core memory is a key, not stock: it is the one thing standing between
   * the player and a Totem they have fought for, and a tap on "sell" is a
   * very fast way to lose it. The smith refuses, which is simpler to
   * understand than a warning and impossible to get wrong.
   */
  sellable?: boolean
  /**
   * The boss art slot that drops this, if only one thing does.
   *
   * Such a material is kept out of the ordinary table entirely — it is not
   * a rare roll, it is the thing that particular guardian leaves behind.
   */
  fromBoss?: string
}

/** One stack in the player's bag. */
export interface MaterialEntry {
  materialId: MaterialId
  quantity: number
}
