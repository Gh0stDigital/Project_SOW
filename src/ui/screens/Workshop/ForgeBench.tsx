import { useState } from 'react'
import { usePersistentStore } from '@/state/persistentStore'
import { SmithCounter } from '@/ui/components/SmithCounter'
import { AvatarFrame } from '@/ui/components/AvatarFrame'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { Bar } from '@/ui/components/Bar'
import { UiIcon } from '@/ui/components/UiIcon'
import { assetKeys } from '@/config/assets'
import { creatureRoster, creatureWorldName, isCreatureKey } from '@/systems/creatureTotems'
import { getMaterialDef } from '@/config/materials'
import {
  checkForge,
  forgeProgress,
  recipeForTotemKey,
  startingLevelForKey,
  type ForgeCheck,
} from '@/systems/forge'
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
interface Design {
  key: string
  check: ForgeCheck
  owned: boolean
  level: number
}

/** One shelf of designs. Portraits and creatures render the same way. */
function Designs({ designs, onOpen }: { designs: Design[]; onOpen: (key: string) => void }) {
  return (
    <div className="forge-grid">
      {designs.map(({ key, check, owned, level }) => (
        <button key={key} className="forge-design" onClick={() => onOpen(key)}>
          <AvatarFrame assetKey={key} alt={nameFromAvatarKey(key)} size="tile" />
          <span className="forge-design-name">{nameFromAvatarKey(key)}</span>
          {/* The level is the whole pitch for a creature, so it is on the
              tile rather than only inside. A portrait starts at 1 like every
              other portrait and says nothing. */}
          {level > 1 && <span className="forge-design-level">Lv {level}부터</span>}
          <span className={`forge-design-state${check.canForge ? ' ready' : ''}`}>
            {check.canForge ? '벼릴 수 있음' : owned ? '보유 중' : '재료 부족'}
          </span>
          <Bar value={Math.round(forgeProgress(check) * 100)} max={100} kind="xp" thin />
        </button>
      ))}
    </div>
  )
}

export function ForgeBench() {
  const materials = usePersistentStore((s) => s.materials)
  const money = usePersistentStore((s) => s.money)
  const forgedKeys = usePersistentStore((s) => s.forgedTotemKeys)
  const isPortraitUnlocked = usePersistentStore((s) => s.isPortraitUnlocked)
  const forgeTotem = usePersistentStore((s) => s.forgeTotem)

  const seenCreatures = usePersistentStore((s) => s.seenCreatures)

  const [open, setOpen] = useState<string | null>(null)
  const [justForged, setJustForged] = useState<string | null>(null)

  const portraits = assetKeys('totems').map((key) => {
    const recipe = recipeForTotemKey(key)
    return { key, recipe, check: checkForge(recipe, materials, money), owned: isPortraitUnlocked(key), level: 1 }
  })
  // Everything the player has met in a dungeon, deepest first. A creature is
  // a design like any other here; what it costs and where it starts are the
  // only things that differ.
  const creatures = creatureRoster(seenCreatures).map((key) => {
    // Priced through the same resolver the store charges with — these two
    // disagreeing is how a Ryu once cost 35 coins instead of 305.
    const recipe = recipeForTotemKey(key)
    return {
      key,
      recipe,
      check: checkForge(recipe, materials, money),
      owned: isPortraitUnlocked(key),
      level: startingLevelForKey(key),
    }
  })
  const designs = [...portraits, ...creatures]
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

      <Designs designs={portraits} onOpen={setOpen} />

      {/* The bestiary, kept as its own shelf. A creature is not an
          alternative portrait — it arrives already grown, which is the whole
          reason to go and find one — and mixing the two would bury that
          under a grid of faces. */}
      <h3 className="forge-heading">잡아 본 것들</h3>
      {creatures.length === 0 ? (
        <p className="faint">
          아직 없습니다. 던전에서 마주친 적은 여기 도안으로 올라옵니다 — 쓰러뜨리지 않아도, 한 번 보기만 하면
          됩니다.
        </p>
      ) : (
        <Designs designs={creatures} onOpen={setOpen} />
      )}

      {picked && (
        <SlidePanel title={nameFromAvatarKey(picked.key)} onClose={() => setOpen(null)}>
          <div className="forge-sheet-head">
            <AvatarFrame assetKey={picked.key} alt={nameFromAvatarKey(picked.key)} size="tile" />
            <div>
              {/* A creature has no written lore — it is a thing you fought.
                  Resolving its key through the portrait folder would have
                  handed it somebody else's story, since resolvedKey()
                  answers an unknown key with that folder's fallback. */}
              {isCreatureKey(picked.key) ? (
                <>
                  <div className="forge-sheet-kind">잡아 본 것 · Lv {picked.level}부터</div>
                  <p className="faint">
                    {creatureWorldName(picked.key)}에서 마주친 것입니다. 벼려 내면 이 레벨부터 시작합니다 —
                    기르는 시간을 치르는 대신 재료로 값을 냅니다.
                  </p>
                </>
              ) : (
                <>
                  <div className="forge-sheet-kind">{loreFor(resolvedKey('totems', picked.key)).kind}</div>
                  <p className="faint">{loreFor(resolvedKey('totems', picked.key)).description}</p>
                </>
              )}
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
            벼린 토템은 레벨 {picked.level}부터 시작하며, 생명력을 가득 채운 채로 자기만의 기록을 쌓아
            갑니다.
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
