import type { Totem } from '@/domain/totem'
import { restBalance, restPriceFor } from '@/config/dungeonEvents'

/**
 * Rest Area economics.
 *
 * Once discovered, a Rest Area stays available for the rest of the run and
 * can be revisited from Standby. Each use costs money and makes the next
 * use dearer; both the healing amount and the price curve come from
 * config/dungeonEvents.ts, never from the UI.
 *
 * Pure functions only.
 */

export interface RestQuote {
  /** Price of the use being offered right now. */
  price: number
  /** What the following use would cost, for the "next visit" hint. */
  nextPrice: number
  /** HP this use would actually restore, capped at the Totem's missing HP. */
  healAmount: number
  canAfford: boolean
  /** False when the Totem is already at full HP — nothing to buy. */
  needsHealing: boolean
  /** The one thing blocking a purchase, if any. */
  blockedReason: 'full_hp' | 'too_expensive' | null
}

export function quoteRest(totem: Totem, money: number, usesSoFar: number): RestQuote {
  const price = restPriceFor(usesSoFar)
  const nextPrice = restPriceFor(usesSoFar + 1)
  const missing = Math.max(0, totem.maxHp - totem.currentHp)
  // Never heal past max — the quote shows what the player would truly get.
  const healAmount = Math.min(missing, Math.round(totem.maxHp * restBalance.healFraction))
  const needsHealing = missing > 0
  // Money is the player's, not the Totem's, so it is passed in rather than
  // read off whoever happens to be carrying the healing.
  const canAfford = money >= price

  return {
    price,
    nextPrice,
    healAmount,
    canAfford,
    needsHealing,
    blockedReason: !needsHealing ? 'full_hp' : !canAfford ? 'too_expensive' : null,
  }
}

export function canRest(totem: Totem, money: number, usesSoFar: number): boolean {
  return quoteRest(totem, money, usesSoFar).blockedReason === null
}

export interface RestResult {
  totem: Totem
  spent: number
  healed: number
}

/**
 * Applies one rest. Returns the Totem unchanged (and spends nothing) if the
 * purchase isn't allowed, so a double-tap can never double-charge.
 */
export function applyRest(totem: Totem, money: number, usesSoFar: number): RestResult | null {
  const quote = quoteRest(totem, money, usesSoFar)
  if (quote.blockedReason !== null) return null
  return {
    // Only the healing happens here. The purse is the store's, so the caller
    // spends `spent` from it rather than this reaching into the player's
    // money from inside a pure function about one Totem's HP.
    totem: { ...totem, currentHp: Math.min(totem.maxHp, totem.currentHp + quote.healAmount) },
    spent: quote.price,
    healed: quote.healAmount,
  }
}
