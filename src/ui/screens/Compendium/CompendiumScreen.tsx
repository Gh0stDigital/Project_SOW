import { useState } from 'react'
import { useUiStore } from '@/state/uiStore'
import { TopBar } from '@/ui/components/TopBar'
import { SpellListTab } from './SpellListTab'
import { SpellSetsTab } from './SpellSetsTab'
import { SHOP_NAME } from '@/systems/wordShop'

type Tab = 'spells' | 'sets'

export function CompendiumScreen() {
  const goTo = useUiStore((s) => s.goTo)
  const [tab, setTab] = useState<Tab>('spells')
  /**
   * Which full-screen sub-panel the spells tab has opened, if any.
   *
   * The tab row is hidden while one is up. The word shop in particular is
   * meant to read as somewhere you have walked into, and a row of tabs
   * sitting over the counter says you are still filing paperwork; the
   * screen's own title follows for the same reason.
   */
  const [subScreen, setSubScreen] = useState<null | 'shop' | 'editor'>(null)

  const title = subScreen === 'shop' ? SHOP_NAME : '도감'

  return (
    <div className="screen screen-scroll">
      <TopBar title={title} onBack={() => goTo('menu')} />

      {subScreen === null && (
        <div className="btn-row">
          <button
            className={`btn btn-sm ${tab === 'spells' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('spells')}
          >
            주문 단어
          </button>
          <button
            className={`btn btn-sm ${tab === 'sets' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setTab('sets')}
          >
            주문 세트
          </button>
        </div>
      )}

      {tab === 'spells' ? <SpellListTab onSubScreen={setSubScreen} /> : <SpellSetsTab />}
    </div>
  )
}
