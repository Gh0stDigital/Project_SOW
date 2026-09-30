import { useState } from 'react'
import { usePersistentStore } from '@/state/persistentStore'
import { SmithCounter } from '@/ui/components/SmithCounter'
import { UiIcon } from '@/ui/components/UiIcon'
import { bagValue, describeBag, sellPrice } from '@/systems/materials'

/**
 * The selling half of the workshop.
 *
 * Every stack in the bag with what it is worth, and two ways to part with
 * it. Selling one at a time is the careful case — a material you are half
 * saving for a recipe — and selling a whole stack is the treasure case,
 * where there is nothing to think about.
 */
export function SellCounter() {
  const materials = usePersistentStore((s) => s.materials)
  const sellMaterial = usePersistentStore((s) => s.sellMaterial)
  const money = usePersistentStore((s) => s.money)

  // Reset per visit rather than per session: "here is 40 coins" should be
  // about this trip to the counter, not about every sale ever made.
  const [earned, setEarned] = useState(0)
  /**
   * Which stack's "sell the lot" is armed.
   *
   * Selling a whole stack of a material is the one irreversible tap on this
   * screen — the ingredients for a Totem can go in a thumb-slip, and the
   * only way back is another dungeon. So it asks once. Treasure is not
   * asked about: no recipe wants it, and stopping to confirm the sale of a
   * thing that exists to be sold is just a tap in the way.
   */
  const [arming, setArming] = useState<string | null>(null)

  const stacks = describeBag(materials)
  const total = bagValue(materials)

  const sell = (materialId: string, quantity: number) => {
    const got = sellMaterial(materialId, quantity)
    if (got > 0) setEarned((e) => e + got)
    setArming(null)
  }

  return (
    <div className="list">
      <SmithCounter place={{ at: 'sell', stacks, total, earnedThisVisit: earned }} sign />

      <div className="workshop-purse">
        <span>
          <UiIcon name="money" size={15} /> {money}
        </span>
        {stacks.length > 0 && <span className="faint">자루 전체 {total}냥</span>}
      </div>

      {stacks.length === 0 ? (
        <div className="empty-state">
          <span className="glyph">
            <UiIcon name="anvil" size={44} />
          </span>
          <p>팔 것이 없습니다 — 던전에서 재료와 보물을 주워 오세요.</p>
        </div>
      ) : (
        <div className="list">
          {stacks.map(({ def, quantity }) => (
            <div key={def.id} className={`card material-row kind-${def.kind}`}>
              <span className="material-icon" aria-hidden="true">
                {def.icon}
              </span>
              <div className="material-body">
                <div className="material-name">
                  {def.name}
                  <span className="material-tag">{def.kind === 'treasure' ? '보물' : '재료'}</span>
                  <span className="faint">×{quantity}</span>
                </div>
                <div className="faint material-desc">{def.description}</div>
                <div className="faint">
                  <UiIcon name="money" size={12} /> 개당 {def.value} · 전부 {sellPrice(def, quantity)}
                </div>
              </div>
              <div className="material-actions">
                <button className="btn btn-ghost btn-sm" onClick={() => sell(def.id, 1)}>
                  1개 팔기
                </button>
                <button
                  className={`btn btn-sm ${arming === def.id ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => {
                    // Treasure goes on the first tap; a material wants a
                    // second one, because it may be half a Totem.
                    if (def.kind === 'treasure' || arming === def.id) sell(def.id, quantity)
                    else setArming(def.id)
                  }}
                >
                  {arming === def.id ? `정말 ${quantity}개?` : '전부'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
