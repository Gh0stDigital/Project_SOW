/**
 * Inventory system — pure functions over InventoryEntry[] and the effects
 * of using an item. No React, no store access, no randomness except via an
 * injected rng, so every branch is deterministically testable.
 */

import type { InventoryEntry, ItemDef, ItemId } from '@/domain/item'
import type { Spell } from '@/domain/spell'
import type { Totem } from '@/domain/totem'
import { allItemDefs, getItemDef } from '@/config/items'
import { spellBalance } from '@/config/balance'
import { heal } from './totemManager'

export function addItem(inventory: InventoryEntry[], itemId: ItemId, quantity = 1): InventoryEntry[] {
  if (quantity <= 0) return inventory
  const existing = inventory.find((e) => e.itemId === itemId)
  if (existing) {
    return inventory.map((e) => (e.itemId === itemId ? { ...e, quantity: e.quantity + quantity } : e))
  }
  return [...inventory, { itemId, quantity }]
}

/** Removes one of an item, dropping the stack entirely when it hits zero. */
export function consumeItem(inventory: InventoryEntry[], itemId: ItemId): InventoryEntry[] {
  return inventory
    .map((e) => (e.itemId === itemId ? { ...e, quantity: e.quantity - 1 } : e))
    .filter((e) => e.quantity > 0)
}

export function countOf(inventory: InventoryEntry[], itemId: ItemId): number {
  return inventory.find((e) => e.itemId === itemId)?.quantity ?? 0
}

export function hasAnyItems(inventory: InventoryEntry[]): boolean {
  return inventory.some((e) => e.quantity > 0)
}

/** Applies a heal-type item to a Totem. Non-heal items return the Totem unchanged. */
export function applyItemToTotem(totem: Totem, def: ItemDef): Totem {
  if (def.effect.kind !== 'heal') return totem
  return heal(totem, Math.round(totem.maxHp * def.effect.fraction))
}

/**
 * Applies a charge-type item to the given deck Spells, clamped to the
 * charge ceiling every word shares. Non-charge items return the Spells unchanged.
 */
export function applyItemToSpells(spells: Spell[], deckSpellIds: string[], def: ItemDef): Spell[] {
  if (def.effect.kind !== 'charge') return spells
  const amount = def.effect.amount
  const inDeck = new Set(deckSpellIds)
  return spells.map((s) => {
    if (!inDeck.has(s.id)) return s
    return { ...s, charge: Math.min(spellBalance.chargeSlots, s.charge + amount) }
  })
}

/** Human-readable confirmation of what an item just did. */
export function itemUseText(def: ItemDef): string {
  switch (def.effect.kind) {
    case 'heal':
      return `${def.icon} ${def.name} used — HP restored.`
    case 'charge':
      return `${def.icon} ${def.name} 사용 — 덱이 충전으로 요동칩니다.`
    case 'escape':
      return `${def.icon} ${def.name} 사용 — 던전 밖으로 빠져나옵니다.`
  }
}

/** Weighted random pick from the drop table. Returns null if nothing can drop. */
export function rollItemDrop(rng: () => number = Math.random): ItemId | null {
  const droppable = allItemDefs.filter((d) => d.dropWeight > 0)
  const total = droppable.reduce((sum, d) => sum + d.dropWeight, 0)
  if (total <= 0) return null
  let roll = rng() * total
  for (const def of droppable) {
    roll -= def.dropWeight
    if (roll <= 0) return def.id
  }
  return droppable[droppable.length - 1].id
}

export { getItemDef }
