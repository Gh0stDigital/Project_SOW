import { useState } from 'react'
import type { SpellSet } from '@/domain/spellSet'
import { usePersistentStore } from '@/state/persistentStore'
import { SpellSetEditor } from './SpellSetEditor'
import { SpellSetMerge } from './SpellSetMerge'
import { ShopKeeper } from '@/ui/components/ShopKeeper'
import { deepestTierForSize, dungeonTiers, minimumSetSize } from '@/config/balance'

interface SpellSetsTabProps {
  /** Opens straight onto the merge screen — see CompendiumScreen. */
  startMerging?: boolean
}

export function SpellSetsTab({ startMerging = false }: SpellSetsTabProps = {}) {
  const spellSets = usePersistentStore((s) => s.spellSets)
  const [editing, setEditing] = useState<'new' | SpellSet | null>(null)
  const [merging, setMerging] = useState(startMerging)

  // The shallowest tier's floor, which is the one that decides whether a set
  // can be taken anywhere at all.
  const minimum = minimumSetSize(dungeonTiers[0])
  // Two or more to tie together. With one set there is nothing to combine,
  // and offering it anyway is a button that can only disappoint.
  const canMerge = spellSets.length >= 2

  if (merging) {
    return <SpellSetMerge onDone={() => setMerging(false)} onCancel={() => setMerging(false)} />
  }

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

      <div className="btn-row">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => setEditing('new')}>
          + 새 주문 세트
        </button>
        {canMerge && (
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setMerging(true)}>
            세트 합치기
          </button>
        )}
      </div>

      {spellSets.map((set) => {
        // What this set can actually carry, rather than a pass/fail against
        // the shallowest tier. A 25-word set is not "too small" — it is a
        // tier-25 set, and saying otherwise to somebody who has opened
        // tier 50 is both discouraging and untrue.
        const reaches = deepestTierForSize(set.spellIds.length)
        return (
          <button key={set.id} className="card row" onClick={() => setEditing(set)} style={{ width: '100%', textAlign: 'left' }}>
            <div>
              <div style={{ fontWeight: 700 }}>{set.name}</div>
              <div className={reaches ? 'faint' : 'faint warn'}>
                주문 {set.spellIds.length}개
                {reaches ? ` · ${reaches.label}까지` : ` · 던전에는 ${minimum}개부터`}
              </div>
            </div>
            <span className="faint">편집 →</span>
          </button>
        )
      })}
    </div>
  )
}
