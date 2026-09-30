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
}

/** One stack in the player's bag. */
export interface MaterialEntry {
  materialId: MaterialId
  quantity: number
}
