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
    <div className="screen compendium-screen">
      {/* The way out and the way between the two halves of the Compendium
          both live up here, out of the scrolling area entirely.

          They used to scroll with the list, which sliced them in half on
          the way past the top edge — a row of half-buttons above a pinned
          shopkeeper, and no way back without scrolling to the top first.
          Held still, they never cut, and you can change tabs from wherever
          you happen to be in the list. */}
      <div className="compendium-header">
        <TopBar title={title} onBack={() => goTo('menu')} />

        {subScreen === null && (
          <div className="btn-row compendium-tabs">
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
      </div>

      <div className="screen-body">
        {tab === 'spells' ? <SpellListTab onSubScreen={setSubScreen} /> : <SpellSetsTab />}
      </div>
    </div>
  )
}
