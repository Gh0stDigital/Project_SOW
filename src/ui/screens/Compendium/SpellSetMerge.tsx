import { useState } from 'react'
import { usePersistentStore } from '@/state/persistentStore'
import { ShopKeeper } from '@/ui/components/ShopKeeper'
import { deepestTierForSize, dungeonTiers, minimumSetSize } from '@/config/balance'
import { deepestUnlockedTier } from '@/config/progression'
import { mergedCount, mergedName, mergedSpellIds, reachableWordCount } from '@/systems/spellSetManager'

interface SpellSetMergeProps {
  onDone: () => void
  onCancel: () => void
}

/**
 * Tying several sets into a new one.
 *
 * The problem it exists for: a tier asks for a set of its full size, and a
 * player who has been studying in topic-sized bundles — verbs, food, the
 * twenty words from last Tuesday — has the words already but not in one
 * pile. Without this the only way into a deeper dungeon is to build a
 * fifty-word set by hand, or to re-import words they have already trained,
 * which is busywork over vocabulary they know.
 *
 * It never changes the sets it reads. The parts stay exactly as they were,
 * because they are what the player actually studies from; the merge is an
 * additional bundle for carrying into a dungeon.
 */
export function SpellSetMerge({ onDone, onCancel }: SpellSetMergeProps) {
  const spellSets = usePersistentStore((s) => s.spellSets)
  const createSpellSet = usePersistentStore((s) => s.createSpellSet)
  const totem = usePersistentStore((s) => s.totems.find((t) => t.id === s.activeTotemId))

  const [picked, setPicked] = useState<string[]>([])
  const [name, setName] = useState('')
  const [named, setNamed] = useState(false)

  // What the deepest dungeon this Totem has opened asks for. That is the
  // number this screen is in aid of — not the shallowest tier's floor,
  // which anybody standing here has long since cleared.
  const deepestOpen = dungeonTiers.find((t) => t.id === deepestUnlockedTier(totem?.clearedTiers ?? []))
  const wanted = minimumSetSize(deepestOpen ?? dungeonTiers[0])

  const total = mergedCount(spellSets, picked)
  const reachable = reachableWordCount(spellSets)
  const suggested = mergedName(spellSets, picked)
  const reaches = deepestTierForSize(total)

  const toggle = (id: string) => {
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    )
  }

  const canMerge = picked.length >= 2 && total > 0

  return (
    <div className="list">
      <ShopKeeper place={{ at: 'merge', picked: picked.length, total, reachable, wanted }} />

      {/* The running total, which is the whole point of the screen: you are
          picking until a number is reached. Named after the tier it reaches
          rather than left as a bare count, since the count only matters
          against a threshold. */}
      <div className="merge-total">
        <span className="merge-total-count">{total}개</span>
        <span className="faint">
          {reaches ? `${reaches.label}까지 갈 수 있습니다` : `던전에는 ${minimumSetSize(dungeonTiers[0])}개부터`}
        </span>
      </div>

      <div className="list">
        {spellSets.map((set) => {
          const on = picked.includes(set.id)
          return (
            <button
              key={set.id}
              className={`card row merge-row${on ? ' picked' : ''}`}
              onClick={() => toggle(set.id)}
              style={{ width: '100%', textAlign: 'left' }}
            >
              <span className="merge-check" aria-hidden="true">
                {on ? '✓' : ''}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{set.name}</div>
                <div className="faint">주문 {set.spellIds.length}개</div>
              </div>
            </button>
          )
        })}
      </div>

      <div className="field">
        <label htmlFor="merge-name">새 세트 이름</label>
        <input
          id="merge-name"
          type="text"
          value={named ? name : suggested}
          placeholder="고른 묶음의 이름을 땁니다"
          onChange={(e) => {
            setNamed(true)
            setName(e.target.value)
          }}
        />
      </div>

      <p className="faint">
        고른 묶음은 그대로 남습니다. 겹치는 낱말은 한 번만 들어갑니다.
      </p>

      <div className="btn-row">
        <button className="btn btn-ghost" onClick={onCancel} data-sfx="cancel">
          취소
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!canMerge}
          onClick={() => {
            const ids = mergedSpellIds(spellSets, picked)
            if (ids.length === 0) return
            createSpellSet((named ? name : suggested).trim() || suggested, ids)
            onDone()
          }}
        >
          {canMerge ? `${total}개로 묶기` : '묶음을 둘 이상 고르세요'}
        </button>
      </div>
    </div>
  )
}
