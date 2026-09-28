import type { DungeonRunState } from '@/domain/dungeon'
import type { Totem } from '@/domain/totem'
import { describeModifier } from '@/systems/directionModifiers'
import { GiveUpButton } from './GiveUpButton'
import { usePersistentStore } from '@/state/persistentStore'
import { UiIcon } from './UiIcon'

interface RunHudProps {
  run: DungeonRunState
  totem: Totem
  /** Short label for the mode the player is currently in. */
  modeLabel: string
}

/**
 * The always-on run readout: what mode you're in, how deep you are, your
 * 생명력 and money, whether the key and Boss Door are accounted for,
 * and which Direction biases are still running. Kept to two compact rows so
 * it can sit above every dungeon state without changing the layout.
 */
export function RunHud({ run, totem, modeLabel }: RunHudProps) {
  // Money is the player's purse now, not this Totem's pocket.
  const money = usePersistentStore((s) => s.money)
  return (
    <div className="run-hud">
      <div className="run-hud-row">
        <span className="run-hud-mode">{modeLabel}</span>
        <span className="run-hud-turn">{run.turn}턴</span>
        <span className="run-hud-life" title="생명력">
          {'◆'.repeat(Math.max(0, totem.lifePoints))}
          <span className="faint">{'◇'.repeat(Math.max(0, totem.maxLifePoints - totem.lifePoints))}</span>
        </span>
        <span className="run-hud-money">
          <UiIcon name="money" size={13} /> {money}
        </span>
        <GiveUpButton />
      </div>

      <div className="run-hud-row secondary">
        <span className={`run-hud-chip ${run.keyFound ? 'on' : 'off'}`}>
          <UiIcon name="key" size={12} /> {run.keyFound ? ' 열쇠 있음' : ' 열쇠 없음'}
        </span>
        <span className={`run-hud-chip ${run.bossDoorFound ? 'on' : 'off'}`}>
          {run.bossDoorFound ? '🚪 문 발견' : '🚪 문 미발견'}
        </span>
        {run.modifiers.length === 0 ? (
          <span className="run-hud-chip faint">길 효과 없음</span>
        ) : (
          run.modifiers.map((m) => (
            <span key={m.id} className="run-hud-chip mod" title={m.label}>
              {describeModifier(m)} · {m.movesRemaining}
            </span>
          ))
        )}
      </div>
    </div>
  )
}
