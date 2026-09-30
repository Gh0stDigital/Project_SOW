import { useState } from 'react'
import type { SpellSet } from '@/domain/spellSet'
import { usePersistentStore } from '@/state/persistentStore'
import { SpellSetEditor } from './SpellSetEditor'
import { ShopKeeper } from '@/ui/components/ShopKeeper'
import { dungeonTiers, minimumSetSize } from '@/config/balance'

export function SpellSetsTab() {
  const spellSets = usePersistentStore((s) => s.spellSets)
  const [editing, setEditing] = useState<'new' | SpellSet | null>(null)

  // The shallowest tier's floor, which is the one that decides whether a set
  // can be taken anywhere at all.
  const minimum = minimumSetSize(dungeonTiers[0])

  if (editing) {
    return (
      <SpellSetEditor
        existing={editing === 'new' ? undefined : editing}
        onDone={() => setEditing(null)}
        onCancel={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="list">
      <ShopKeeper
        place={{
          at: 'sets',
          sets: spellSets.length,
          belowMinimum: spellSets.filter((set) => set.spellIds.length < minimum).length,
          minimumForDungeon: minimum,
        }}
      />

      <button className="btn btn-primary btn-block" onClick={() => setEditing('new')}>
        + 새 주문 세트
      </button>

      {spellSets.map((set) => (
        <button key={set.id} className="card row" onClick={() => setEditing(set)} style={{ width: '100%', textAlign: 'left' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{set.name}</div>
            {/* Flagged on the row as well as in the keeper's line: the
                count alone does not say whether it is enough. */}
            <div className={set.spellIds.length < minimum ? 'faint warn' : 'faint'}>
              주문 {set.spellIds.length}개
              {set.spellIds.length < minimum ? ` · 던전에는 ${minimum}개부터` : ''}
            </div>
          </div>
          <span className="faint">편집 →</span>
        </button>
      ))}
    </div>
  )
}
