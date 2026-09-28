import type { Spell } from '@/domain/spell'
import { damageForSpell } from '@/systems/spellProgression'
import { assetKeyOrFlavor } from '@/config/assets'
import { elementDefFor } from '@/config/wordTypes'
import { spellBalance } from '@/config/balance'
import { AssetImage } from './AssetImage'
import { ElementIcon } from './ElementIcon'
import { Bar } from './Bar'

interface SpellCardProps {
  spell: Spell
  selected?: boolean
  disabled?: boolean
  /**
   * The word's first syllable, shown in place of the word itself while the
   * player is being asked to produce it. Absent on a card that may show its
   * word outright.
   */
  avatar?: string
  /** Boss-barrier state for this word, when a barrier is up. */
  barrierCleared?: boolean
  /**
   * The wielding Totem's damage multiplier, so the damage printed on the
   * card is the damage the card will actually do. Without it the number
   * would be the word's own, which stopped being the whole answer the moment
   * a Totem's level started counting for something.
   */
  might?: number
  onClick?: () => void
}

/** A single battle-hand Spell card: word, level, charge, potential damage. */
export function SpellCard({ spell, selected, disabled, avatar, barrierCleared, might = 1, onClick }: SpellCardProps) {
  const element = elementDefFor(spell.wordType)
  // The icon belongs to the element, not to the word: a fire word shows the
  // fire seal, here and in the list and anywhere else the word appears.
  const artKey = assetKeyOrFlavor('spells', element.id, spell.id)
  return (
    <div
      className={`spell-card element-${element.id}${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}${
        barrierCleared === true ? ' barrier-cleared' : barrierCleared === false ? ' barrier-pending' : ''
      }`}
      onClick={disabled ? undefined : onClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
    >
      {/* An attack card wears the word's first syllable and nothing else.
          It used to be the element's seal above two letters of the English,
          which in a hand of eight gave eight near-identical badges over
          eight pairs of initials — hard to tell apart, and the wrong
          language for a card in a Korean deck. The element is still on the
          card: it is the border colour, and it is in the meta row below. */}
      {avatar ? (
        <div className="card-avatar" lang="ko" aria-label={element.label}>
          {avatar}
        </div>
      ) : (
        <>
          <div className="art">
            <AssetImage category="spells" assetKey={artKey} alt={spell.korean} />
          </div>
          <div className="word">{spell.korean}</div>
        </>
      )}
      {barrierCleared !== undefined && (
        <div className={`card-barrier ${barrierCleared ? 'done' : 'pending'}`}>
          {barrierCleared ? '🛡️ 해제됨' : '🛡️ 필요함'}
        </div>
      )}
      <div className="meta">
        <span title={element.label}>
          {/* The charge meter is the whole of how well this word is known
              now — there is no separate rank sitting above it that only ever
              climbed. */}
          <ElementIcon element={element} size={14} /> ⚡{spell.charge}/{spellBalance.chargeSlots}
        </span>
        <span>피해 {damageForSpell(spell, might)}</span>
      </div>
      <Bar value={spell.charge} max={spellBalance.chargeSlots} kind="charge" thin />
    </div>
  )
}
