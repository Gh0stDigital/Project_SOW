import { useState } from 'react'
import { usePersistentStore } from '@/state/persistentStore'
import { Bar } from '@/ui/components/Bar'
import { spellBalance } from '@/config/balance'
import { AssetImage } from '@/ui/components/AssetImage'
import { assetKeyOrFlavor } from '@/config/assets'
import { SpellEditorForm } from './SpellEditorForm'
import { SpellImportPanel } from './SpellImportPanel'
import type { Spell } from '@/domain/spell'
import { definitionsOf } from '@/domain/spell'
import { elementDefFor, wordTypeDefs } from '@/config/wordTypes'
import { ElementIcon } from '@/ui/components/ElementIcon'
import { UiIcon } from '@/ui/components/UiIcon'
import { ShopKeeper } from '@/ui/components/ShopKeeper'

interface SpellListTabProps {
  /**
   * Called when a full-screen sub-panel opens or closes, so the Compendium
   * can get its tab row out of the way. The word shop is meant to read as a
   * place you have walked into; a row of tabs sitting over the counter says
   * you are still filing paperwork.
   */
  onSubScreen?: (screen: null | 'shop' | 'editor') => void
  /** Opened to import, rather than to browse — see CompendiumErrand. */
  startImporting?: boolean
}

export function SpellListTab({ onSubScreen, startImporting = false }: SpellListTabProps = {}) {
  const spells = usePersistentStore((s) => s.spells)
  const deleteSpell = usePersistentStore((s) => s.deleteSpell)
  const [editing, setEditing] = useState<'new' | 'import' | Spell | null>(startImporting ? 'import' : null)
  const [query, setQuery] = useState('')

  const leave = () => {
    setEditing(null)
    onSubScreen?.(null)
  }
  const enter = (next: 'new' | 'import' | Spell) => {
    setEditing(next)
    onSubScreen?.(next === 'import' ? 'shop' : 'editor')
  }

  if (editing === 'import') {
    return <SpellImportPanel onDone={leave} onCancel={leave} />
  }

  if (editing) {
    return <SpellEditorForm existing={editing === 'new' ? undefined : editing} onDone={leave} onCancel={leave} />
  }

  // Search covers every populated definition, not just the first.
  const q = query.trim().toLowerCase()
  const filtered = spells.filter(
    (s) => !q || s.korean.includes(query.trim()) || definitionsOf(s).some((d) => d.toLowerCase().includes(q)),
  )

  return (
    <div className="list">
      {/* The keeper stands in every part of the Compendium, not only at the
          import counter — this is their shop, and the shelves are the part
          of it the player spends most time in front of. */}
      <ShopKeeper
        place={{
          at: 'words',
          total: spells.length,
          shown: filtered.length,
          searching: q.length > 0,
          withoutExample: spells.filter((sp) => !sp.sampleSentence?.trim()).length,
        }}
      />

      <div className="btn-row">
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => enter('new')}>
          + 새 주문 단어
        </button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => enter('import')}>
          🛒 낱말 상점
        </button>
      </div>

      {spells.length > 0 && (
        <input
          type="text"
          placeholder="주문 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}

      {filtered.length === 0 && (
        <div className="empty-state">
          <span className="glyph"><UiIcon name="book" size={44} /></span>
          <p>{spells.length === 0 ? '아직 주문이 없습니다 — 첫 주문을 만들어 보세요!' : '결과가 없습니다.'}</p>
        </div>
      )}

      {filtered.map((spell) => {
        const artKey = assetKeyOrFlavor('spells', elementDefFor(spell.wordType).id, spell.id)
        return (
          <div key={spell.id} className="spell-card-list-item">
            <div className="thumb">
              <AssetImage category="spells" assetKey={artKey} alt={spell.korean} />
            </div>
            <div className="info" onClick={() => setEditing(spell)}>
              <div className="kor">
                {spell.korean}
                <span className={`element-chip element-${elementDefFor(spell.wordType).id}`}>
                  <ElementIcon element={elementDefFor(spell.wordType)} size={13} />{' '}
                  {wordTypeDefs[spell.wordType].shortLabel}
                </span>
              </div>
              {/* Blank optional definitions are dropped, never shown as empty rows. */}
              <div className="eng">{definitionsOf(spell).join(' · ')}</div>
              {/* The example is optional, so a compendium typed in quickly has
                  none — and a word with none shows no example in a dungeon.
                  Flagging it here is what makes that findable rather than
                  something the player notices mid-fight. */}
              {!spell.sampleSentence?.trim() && <div className="needs-example">예문 없음</div>}
              <div className="row" style={{ marginTop: 4 }}>
                <span className="faint">⚡{spell.charge}/{spellBalance.chargeSlots}</span>
                <div style={{ flex: 1 }}>
                  <Bar value={spell.charge} max={spellBalance.chargeSlots} kind="charge" thin />
                </div>
              </div>
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm(`"${spell.korean}"을(를) 삭제할까요? 되돌릴 수 없습니다.`)) deleteSpell(spell.id)
              }}
            >
              <UiIcon name="trash" size={18} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
