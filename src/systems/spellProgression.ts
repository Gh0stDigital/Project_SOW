import type { Spell } from '@/domain/spell'
import { spellBalance, rewardBalance } from '@/config/balance'

/**
 * A word's charge: the one number that says how well it is known.
 *
 * There used to be a level driven by an experience bar as well, which could
 * only ever climb — so a word the player kept getting wrong still showed a
 * high rank while its charge sat at the bottom. Slots replaced both: right
 * fills one, wrong empties one, and the meter is the score.
 */

/** Adjusts charge by a delta, clamped to [0, chargeSlots]. */
export function applyChargeDelta(spell: Spell, delta: number): Spell {
  const charge = Math.max(0, Math.min(spellBalance.chargeSlots, spell.charge + delta))
  return { ...spell, charge }
}

/** Damage a Spell would deal right now, given its charge and the caster's might. */
export function damageForSpell(spell: Spell, might = 1): number {
  return Math.round(spellBalance.damageForCharge(spell.charge) * might)
}

/** True when a Spell is at full charge (bonus rewards apply). */
export function isFullyCharged(spell: Spell): boolean {
  return spell.charge >= spellBalance.chargeSlots
}

/** Money reward for a successful action involving this Spell. */
export function moneyReward(spell: Spell, base: number = rewardBalance.baseMoney): number {
  const bonus = isFullyCharged(spell) ? rewardBalance.fullChargeMoneyBonus : 1
  return Math.round(base * bonus)
}
