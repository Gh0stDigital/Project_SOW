import type { DungeonRunState } from '@/domain/dungeon'
import type { BattleState } from '@/domain/battle'
import { definitionsOf } from '@/domain/spell'
import { elementDefFor } from '@/config/wordTypes'
import { ElementIcon } from '@/ui/components/ElementIcon'
import { usePersistentStore } from '@/state/persistentStore'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { Bar } from '@/ui/components/Bar'
import { spellBalance } from '@/config/balance'

interface WordInfoPanelProps {
  run: DungeonRunState
  battle: BattleState | null
  onClose: () => void
}

export function WordInfoPanel({ run, battle, onClose }: WordInfoPanelProps) {
  const spells = usePersistentStore((s) => s.spells)
  const spellSets = usePersistentStore((s) => s.spellSets)

  const dungeonSet = spellSets.find((s) => s.id === run.config.dungeonSpellSetId)
  const totemSet = spellSets.find((s) => s.id === run.config.totemSpellSetId)

  const dungeonSpells = run.config.dungeonWordIds.map((id) => spells.find((s) => s.id === id)).filter(Boolean)
  const totemSpells = (totemSet?.spellIds ?? []).map((id) => spells.find((s) => s.id === id)).filter(Boolean)

  return (
    <SlidePanel title="단어 정보" onClose={onClose}>
      {battle?.plateau && (
        <section>
          <h3>보스 결계</h3>
          <div className="list">
            {battle.plateau.map((req) => {
              const spell = spells.find((s) => s.id === req.spellId)
              return (
                <div key={req.spellId} className="word-chip">
                  <span className={`status-dot ${req.cleared ? 'done' : 'pending'}`} />
                  <span style={{ flex: 1 }}>{spell?.korean ?? '?'}</span>
                  <span className="faint">{req.cleared ? '완료' : '미완료'}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section>
        <h3>던전 주문 세트{dungeonSet ? ` — ${dungeonSet.name}` : ''}</h3>
        <div className="list">
          {dungeonSpells.map((spell) => (
            <div key={spell!.id} className="word-chip">
              <span className={`status-dot ${run.wordStats[spell!.id]?.introduced ? 'done' : 'pending'}`} />
              <span style={{ flex: 1 }}>
                {spell!.korean} <span className="faint">— {definitionsOf(spell!).join(', ')}</span>
              </span>
              <ElementIcon element={elementDefFor(spell!.wordType)} size={16} />
              <span className="faint">⚡{spell!.charge}</span>
              <div style={{ width: 40 }}>
                <Bar value={spell!.charge} max={spellBalance.chargeSlots} kind="charge" thin />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3>토템 주문 세트{totemSet ? ` — ${totemSet.name}` : ''}</h3>
        <div className="list">
          {totemSpells.map((spell) => (
            <div key={spell!.id} className="word-chip">
              <span style={{ flex: 1 }}>
                {spell!.korean} <span className="faint">— {definitionsOf(spell!).join(', ')}</span>
              </span>
              <ElementIcon element={elementDefFor(spell!.wordType)} size={16} />
              <span className="faint">⚡{spell!.charge}</span>
              <div style={{ width: 40 }}>
                <Bar value={spell!.charge} max={spellBalance.chargeSlots} kind="charge" thin />
              </div>
            </div>
          ))}
        </div>
      </section>
    </SlidePanel>
  )
}
