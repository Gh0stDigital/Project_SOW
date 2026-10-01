/**
 * The material bag: what is in it, what falls into it, and what it fetches.
 *
 * Pure functions over MaterialEntry[] — no React, no store, and no
 * randomness except through an injected rng, so every branch is
 * deterministically testable.
 */

import type { MaterialDef, MaterialEntry, MaterialId } from '@/domain/material'
import type { DungeonTierId } from '@/config/balance'
import { findMaterialDef, materialsForTier, materialsFromBoss } from '@/config/materials'

export function addMaterial(bag: MaterialEntry[], materialId: MaterialId, quantity = 1): MaterialEntry[] {
  if (quantity <= 0) return bag
  const existing = bag.find((e) => e.materialId === materialId)
  if (existing) {
    return bag.map((e) => (e.materialId === materialId ? { ...e, quantity: e.quantity + quantity } : e))
  }
  return [...bag, { materialId, quantity }]
}

/**
 * Takes `quantity` off a stack, dropping it entirely at zero.
 *
 * Removing more than is there takes what is there — this is called from a
 * counter where the player names a number, and a bag that can go negative
 * is a bag that can be sold twice.
 */
export function removeMaterial(bag: MaterialEntry[], materialId: MaterialId, quantity = 1): MaterialEntry[] {
  if (quantity <= 0) return bag
  return bag
    .map((e) => (e.materialId === materialId ? { ...e, quantity: Math.max(0, e.quantity - quantity) } : e))
    .filter((e) => e.quantity > 0)
}

export function countOfMaterial(bag: readonly MaterialEntry[], materialId: MaterialId): number {
  return bag.find((e) => e.materialId === materialId)?.quantity ?? 0
}

/**
 * The bag as definitions, in catalogue order, with unknown ids dropped.
 *
 * A save can hold a stack this build has no definition for — art and
 * catalogue move at different speeds — and every screen that lists the bag
 * wants the same thing done about it: leave it out rather than render a
 * blank row.
 */
export interface MaterialStack {
  def: MaterialDef
  quantity: number
}

export function describeBag(bag: readonly MaterialEntry[]): MaterialStack[] {
  return bag.flatMap((e) => {
    const def = findMaterialDef(e.materialId)
    return def && e.quantity > 0 ? [{ def, quantity: e.quantity }] : []
  })
}

/** Whether the blacksmith will take this at all. */
export function isSellable(def: MaterialDef): boolean {
  return def.sellable !== false
}

/** What the blacksmith pays for `quantity` of one thing. */
export function sellPrice(def: MaterialDef, quantity = 1): number {
  if (!isSellable(def)) return 0
  return Math.max(0, Math.round(def.value * Math.max(0, quantity)))
}

/** What the whole bag would fetch, if every last thing in it were sold. */
export function bagValue(bag: readonly MaterialEntry[]): number {
  return describeBag(bag).reduce((sum, s) => sum + sellPrice(s.def, s.quantity), 0)
}

/**
 * Weighted pick from one tier's table. Null when that tier drops nothing,
 * which a tier with no materials assigned to it legitimately does.
 */
export function rollMaterialDrop(
  tierId: DungeonTierId,
  worldId?: string,
  rng: () => number = Math.random,
): MaterialId | null {
  const table = materialsForTier(tierId, worldId)
  const total = table.reduce((sum, d) => sum + d.dropWeight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const def of table) {
    roll -= def.dropWeight
    if (roll <= 0) return def.id
  }
  return table[table.length - 1].id
}

/** `count` independent rolls, for the drops that give more than one. */
export function rollMaterialDrops(
  tierId: DungeonTierId,
  count: number,
  worldId?: string,
  rng: () => number = Math.random,
): MaterialId[] {
  const out: MaterialId[] = []
  for (let i = 0; i < count; i++) {
    const id = rollMaterialDrop(tierId, worldId, rng)
    if (id) out.push(id)
  }
  return out
}

/** A drop that only happens `chance` of the time. */
export function rollMaterialChance(
  tierId: DungeonTierId,
  chance: number,
  worldId?: string,
  rng: () => number = Math.random,
): MaterialId | null {
  if (rng() >= chance) return null
  return rollMaterialDrop(tierId, worldId, rng)
}

/**
 * What a boss hands over on top of its ordinary drops.
 *
 * Guaranteed rather than rolled. A core memory is the reason that fight
 * exists for anyone building its Totem, and "beat Ryu and maybe get the
 * lantern" is a different, worse game than "beat Ryu and get the lantern".
 */
export function bossMaterialDrops(bossSlot: string): MaterialId[] {
  return materialsFromBoss(bossSlot).map((d) => d.id)
}
