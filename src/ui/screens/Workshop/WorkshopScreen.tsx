import { useState } from 'react'
import { useUiStore } from '@/state/uiStore'
import { TopBar } from '@/ui/components/TopBar'
import { SellCounter } from './SellCounter'
import { ForgeBench } from './ForgeBench'
import { WORKSHOP_NAME } from '@/systems/blacksmith'

type Bench = 'sell' | 'forge'

/**
 * The blacksmith's workshop: two counters in one room.
 *
 * Header held, body scrolling — the same arrangement as the Compendium, and
 * for the same reason: the smith stays at the top of the list you are
 * reading, and the way between his two counters never scrolls out of reach.
 */
export function WorkshopScreen() {
  const goTo = useUiStore((s) => s.goTo)
  const [bench, setBench] = useState<Bench>('sell')

  return (
    <div className="screen compendium-screen">
      <div className="compendium-header">
        <TopBar title={WORKSHOP_NAME} onBack={() => goTo('menu')} />
        <div className="btn-row compendium-tabs">
          <button
            className={`btn btn-sm ${bench === 'sell' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setBench('sell')}
          >
            팔기
          </button>
          <button
            className={`btn btn-sm ${bench === 'forge' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setBench('forge')}
          >
            토템 주조
          </button>
        </div>
      </div>

      <div className="screen-body">{bench === 'sell' ? <SellCounter /> : <ForgeBench />}</div>
    </div>
  )
}
