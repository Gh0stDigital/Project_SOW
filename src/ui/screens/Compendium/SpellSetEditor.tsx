import { useState } from 'react'
import type { SpellSet } from '@/domain/spellSet'
import { usePersistentStore } from '@/state/persistentStore'
import { ShopKeeper } from '@/ui/components/ShopKeeper'
import { dungeonTiers, minimumSetSize } from '@/config/balance'

interface SpellSetEditorProps {
  existing?: SpellSet
  onDone: () => void
  onCancel: () => void
}

export function SpellSetEditor({ existing, onDone, onCancel }: SpellSetEditorProps) {
  const spells = usePersistentStore((s) => s.spells)
  const createSpellSet = usePersistentStore((s) => s.createSpellSet)
  const renameSpellSet = usePersistentStore((s) => s.renameSpellSet)
  const addSpellToSet = usePersistentStore((s) => s.addSpellToSet)
  const removeSpellFromSet = usePersistentStore((s) => s.removeSpellFromSet)
  const deleteSpellSet = usePersistentStore((s) => s.deleteSpellSet)

  const minimum = minimumSetSize(dungeonTiers[0])
  const [name, setName] = useState(existing?.name ?? '')
  const [selected, setSelected] = useState<Set<string>>(new Set(existing?.spellIds ?? []))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    if (existing) {
      renameSpellSet(existing.id, name)
      for (const id of existing.spellIds) if (!selected.has(id)) removeSpellFromSet(existing.id, id)
      for (const id of selected) if (!existing.spellIds.includes(id)) addSpellToSet(existing.id, id)
    } else {
      createSpellSet(name || '이름 없는 세트', [...selected])
    }
    onDone()
  }

  return (
    <div className="list">
      {/* The keeper at the bench. The dungeon's floor on set size is the one
          thing this screen can be wrong about, so it is said while choosing
          rather than discovered at the dungeon door. */}
      <ShopKeeper
        place={{
          at: 'setEditor',
          picked: selected.size,
          available: spells.length,
          minimumForDungeon: minimum,
          isNew: !existing,
        }}
      />

      <div className="field">
        <label htmlFor="set-name">세트 이름</label>
        <input id="set-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 1과 동사" />
      </div>

      <h3>이 세트의 주문 ({selected.size})</h3>
      {spells.length === 0 && <p className="faint">먼저 주문 단어를 만든 뒤 여기에서 세트에 추가하세요.</p>}
      <div className="list">
        {spells.map((s) => (
          <label key={s.id} className="card row" style={{ cursor: 'pointer' }}>
            <span>
              <b>{s.korean}</b> <span className="faint">— {s.english}</span>
            </span>
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
          </label>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn btn-primary btn-block" onClick={handleSave}>
          {existing ? '변경 사항 저장' : '세트 만들기'}
        </button>
      </div>
      {existing && (
        <button
          className="btn btn-danger btn-block"
          onClick={() => {
            if (confirm(`"${existing.name}" 세트를 삭제할까요? 주문 자체는 삭제되지 않습니다.`)) {
              deleteSpellSet(existing.id)
              onDone()
            }
          }}
        >
          세트 삭제
        </button>
      )}
      <button className="btn btn-ghost btn-block" onClick={onCancel}>
        취소
      </button>
    </div>
  )
}
