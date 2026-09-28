import type { Totem } from '@/domain/totem'
import { AvatarFrame } from './AvatarFrame'
import { Bar } from './Bar'
import { useDamageFlash } from '@/ui/hooks/useDamageFlash'
import { usePersistentStore } from '@/state/persistentStore'
import { UiIcon } from './UiIcon'

interface TotemPanelProps {
  totem: Totem
  effectText?: string
  /** Smaller footprint for screens tight on vertical space (e.g. Dungeon config). */
  compact?: boolean
}

export function TotemPanel({ totem, effectText, compact }: TotemPanelProps) {
  // Money is the player's purse now, not this Totem's pocket.
  const money = usePersistentStore((s) => s.money)
  // Watching HP here covers every way the player can be hurt, in the dungeon
  // and in battle alike, since this panel is on screen for both.
  const hit = useDamageFlash(totem.currentHp)

  return (
    <div className={`totem-panel${compact ? ' compact' : ''}${hit ? ' is-hit' : ''}`}>
      <span className="totem-panel-tag">내 토템</span>
      <AvatarFrame assetKey={totem.avatarKey} alt={totem.name} size={compact ? 'hud' : 'setup'} hit={hit} />
      <div className="stats">
        <div className="name-row">
          <span className="name">{totem.name}</span>
          <span className="muted">Lv {totem.level}</span>
        </div>
        <div className="hp-row">
          <span>
            <UiIcon name="heart" size={13} /> {totem.currentHp}/{totem.maxHp}
          </span>
          <div style={{ flex: 1 }}>
            <Bar value={totem.currentHp} max={totem.maxHp} kind="hp" thin />
          </div>
        </div>
        <div className="hp-row">
          <span>
            <UiIcon name="money" size={13} /> {money}
          </span>
          {effectText && <span className="faint">{effectText}</span>}
        </div>
      </div>
    </div>
  )
}
