import { useState } from 'react'
import { usePersistentStore } from '@/state/persistentStore'
import { SmithCounter } from '@/ui/components/SmithCounter'
import { AvatarFrame } from '@/ui/components/AvatarFrame'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { Bar } from '@/ui/components/Bar'
import { UiIcon } from '@/ui/components/UiIcon'
import { assetKeys } from '@/config/assets'
import { forgeRecipeFor } from '@/config/forging'
import { getMaterialDef } from '@/config/materials'
import { checkForge, forgeProgress } from '@/systems/forge'
import { nameFromAvatarKey } from '@/systems/totemManager'
import { loreFor } from '@/config/totemLore'
import { resolvedKey } from '@/config/assets'

/**
 * The forging half of the workshop — and the only place locked Totems are
 * shown at all.
 *
 * They used to sit greyed out in the Totem screen's roster panel, under a
 * line saying they were locked and nothing about how to open them. A lock
 * with no price on it is just a closed door; here every design carries what
 * it costs, so an unbuilt Totem is a shopping list rather than a refusal.
 */
export function ForgeBench() {
  const materials = usePersistentStore((s) => s.materials)
  const money = usePersistentStore((s) => s.money)
  const forgedKeys = usePersistentStore((s) => s.forgedTotemKeys)
  const isPortraitUnlocked = usePersistentStore((s) => s.isPortraitUnlocked)
  const forgeTotem = usePersistentStore((s) => s.forgeTotem)

  const [open, setOpen] = useState<string | null>(null)
  const [justForged, setJustForged] = useState<string | null>(null)

  const designs = assetKeys('totems').map((key) => {
    const recipe = forgeRecipeFor(key)
    const check = checkForge(recipe, materials, money)
    return { key, recipe, check, owned: isPortraitUnlocked(key) }
  })
  const affordable = designs.filter((d) => d.check.canForge).length

  const picked = designs.find((d) => d.key === open) ?? null

  return (
    <div className="list">
      <SmithCounter
        place={{ at: 'forge', designs: designs.length, affordable, forged: forgedKeys.length }}
      />

      <div className="workshop-purse">
        <span>
          <UiIcon name="money" size={15} /> {money}
        </span>
        <span className="faint">도안 {designs.length}개 · 지금 벼릴 수 있음 {affordable}개</span>
      </div>

      {justForged && (
        <div className="feedback-banner correct">
          🔨 {justForged} — 벼려 냈습니다. 지금부터 이 토템으로 플레이합니다.
        </div>
      )}

      <div className="forge-grid">
        {designs.map(({ key, check, owned }) => (
          <button key={key} className="forge-design" onClick={() => setOpen(key)}>
            <AvatarFrame assetKey={key} alt={key} size="tile" />
            <span className="forge-design-name">{nameFromAvatarKey(key)}</span>
            <span className={`forge-design-state${check.canForge ? ' ready' : ''}`}>
              {check.canForge ? '벼릴 수 있음' : owned ? '보유 중' : '재료 부족'}
            </span>
            <Bar value={Math.round(forgeProgress(check) * 100)} max={100} kind="xp" thin />
          </button>
        ))}
      </div>

      {picked && (
        <SlidePanel title={nameFromAvatarKey(picked.key)} onClose={() => setOpen(null)}>
          <div className="forge-sheet-head">
            <AvatarFrame assetKey={picked.key} alt={picked.key} size="tile" />
            <div>
              <div className="forge-sheet-kind">{loreFor(resolvedKey('totems', picked.key)).kind}</div>
              <p className="faint">{loreFor(resolvedKey('totems', picked.key)).description}</p>
            </div>
          </div>

          <h3>필요한 재료</h3>
          <div className="list">
            {picked.check.ingredients.map((ing) => {
              const def = getMaterialDef(ing.materialId)
              return (
                <div key={ing.materialId} className={`recipe-line${ing.met ? ' met' : ''}`}>
                  <span className="material-icon" aria-hidden="true">
                    {def.icon}
                  </span>
                  <span className="recipe-name">{def.name}</span>
                  <span className={`recipe-count${ing.met ? ' met' : ''}`}>
                    {ing.have}/{ing.quantity}
                  </span>
                  {ing.met ? (
                    <span className="recipe-mark">✓</span>
                  ) : (
                    <span className="faint recipe-short">{ing.short}개 부족</span>
                  )}
                </div>
              )
            })}
            <div className={`recipe-line${picked.check.moneyMet ? ' met' : ''}`}>
              <span className="material-icon" aria-hidden="true">
                <UiIcon name="money" size={16} />
              </span>
              <span className="recipe-name">삯</span>
              <span className={`recipe-count${picked.check.moneyMet ? ' met' : ''}`}>
                {picked.check.haveMoney}/{picked.check.money}
              </span>
              {picked.check.moneyMet ? (
                <span className="recipe-mark">✓</span>
              ) : (
                <span className="faint recipe-short">{picked.check.money - picked.check.haveMoney}냥 부족</span>
              )}
            </div>
          </div>

          {/* Said plainly rather than hidden, because it is true and the
              player is about to spend a dungeon's worth of digging on it. */}
          {picked.recipe.provisional && (
            <p className="faint">※ 이 도안의 가격은 아직 임시입니다 — 나중에 조정될 수 있습니다.</p>
          )}

          <p className="faint">
            벼린 토템은 레벨 1부터 시작하며, 생명력을 가득 채운 채로 자기만의 기록을 쌓아 갑니다.
            {picked.owned ? ' 이미 가진 도안이라도 다시 벼려 한 기 더 기를 수 있습니다.' : ''}
          </p>

          <button
            className="btn btn-primary btn-block"
            disabled={!picked.check.canForge}
            onClick={() => {
              const made = forgeTotem(picked.key)
              if (!made) return
              setJustForged(made.name)
              setOpen(null)
            }}
          >
            {picked.check.canForge ? '🔨 주조하기' : '재료가 모자랍니다'}
          </button>
        </SlidePanel>
      )}
    </div>
  )
}
