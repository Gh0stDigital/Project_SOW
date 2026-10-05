import { useState } from 'react'
import { useUiStore } from '@/state/uiStore'
import { usePersistentStore } from '@/state/persistentStore'
import { useDungeonStore } from '@/state/dungeonStore'
import { TopBar } from '@/ui/components/TopBar'
import { WorldImage } from '@/ui/components/WorldImage'
import { playableWorlds, incompleteWorlds, resolveWorld } from '@/systems/worldRegistry'
import { TotemPanel } from '@/ui/components/TotemPanel'
import { BossPanel } from '@/ui/components/BossPanel'
import { SlidePanel } from '@/ui/components/SlidePanel'
import {
  dungeonTiers,
  enemyLevelRange,
  minimumSetSize,
  recommendedLevel,
  type DungeonTierId,
} from '@/config/balance'
import { deepestUnlockedTier, isTierUnlocked, isWorldUnlocked, tierRequirement } from '@/config/progression'
import { reachableWordCount } from '@/systems/spellSetManager'
import { hasComboData } from '@/systems/comboTargets'
import type { CombatMode } from '@/domain/combo'
import { buildDungeonConfig } from '@/systems/dungeonSession'
import { isUsable } from '@/systems/totemManager'
import { RANDOM_SET_ID, pickRandomSet, usableSets } from '@/systems/spellSetManager'
import { audio } from '@/systems/audioEngine'
import { curtain } from '@/state/transitionStore'
import { curtainTiming } from '@/config/transitions'
import { UiIcon } from '@/ui/components/UiIcon'

export function DungeonConfigScreen() {
  const goTo = useUiStore((s) => s.goTo)
  const goToErrand = useUiStore((s) => s.goToErrand)
  const totems = usePersistentStore((s) => s.totems)
  const activeTotemId = usePersistentStore((s) => s.activeTotemId)
  const spellSets = usePersistentStore((s) => s.spellSets)
  const allSpells = usePersistentStore((s) => s.spells)
  const lastSelection = usePersistentStore((s) => s.lastDungeonSelection)
  const setLastSelection = usePersistentStore((s) => s.setLastDungeonSelection)
  const beginDungeon = useDungeonStore((s) => s.beginDungeon)

  // A destroyed Totem can never start a run.
  const active = totems.find((t) => t.id === activeTotemId)
  const totem = active && isUsable(active) ? active : totems.find(isUsable)

  // Fall back to a set that could actually be used. A freshly raised Totem
  // has nothing equipped and a first run has nothing remembered, so both
  // pickers opened empty — and the run could not be started until you found
  // and set them, with the button that says so sitting off the bottom of the
  // screen. Picking the obvious choice when there is one is not a decision
  // taken away: both pickers are right there to change.
  const firstUsableSet = spellSets.find((s) => s.spellIds.length > 0)?.id ?? null
  const [totemSetId, setTotemSetId] = useState<string | null>(
    totem?.equippedSpellSetId ?? lastSelection.totemSpellSetId ?? firstUsableSet,
  )
  const [dungeonSetId, setDungeonSetId] = useState<string | null>(
    lastSelection.dungeonSpellSetId ?? totemSetId ?? firstUsableSet,
  )
  // Only worlds this save has opened, and only tiers this Totem has earned.
  // Both lists are the whole truth the screen works from — a locked world is
  // not in `worlds` at all, and a locked tier is listed but refused.
  const worlds = playableWorlds().filter((w) => isWorldUnlocked(w.id))
  const cleared = totem?.clearedTiers ?? []

  const [tierId, setTierId] = useState<DungeonTierId>(() =>
    isTierUnlocked(lastSelection.tierId, cleared) ? lastSelection.tierId : deepestUnlockedTier(cleared),
  )
  const [worldId, setWorldId] = useState<string | null>(() => worlds[0]?.id ?? null)
  /**
   * Normal or Combo, for this descent only.
   *
   * Remembered from the last run rather than defaulted every time: a player
   * who wants sentences wants them for more than one run. A save written
   * before Combo existed remembers nothing, which reads as Normal.
   */
  const [combatMode, setCombatMode] = useState<CombatMode>(lastSelection.combatMode ?? 'normal')

  /**
   * Which setting is open, if any.
   *
   * Every choice used to be laid out at once, which made the screen longer
   * every time a world or a tier was added — eight stacked sections to
   * scroll past to reach the button that starts the run. They are buttons
   * now: the screen shows what is currently chosen, and a tap opens the
   * choice over the top of it.
   */
  const [openSetting, setOpenSetting] = useState<
    null | 'world' | 'tier' | 'totemSet' | 'dungeonSet'
  >(null)
  const close = () => setOpenSetting(null)

  const totemSet = spellSets.find((s) => s.id === totemSetId) ?? null
  /**
   * The dungeon's words, or null when the player has asked for them to be
   * chosen at the start of each run. The marker is carried as a set id, so
   * the saved selection and this screen's state both hold it without
   * knowing what it means.
   */
  const dungeonRandom = dungeonSetId === RANDOM_SET_ID
  const dungeonSet = dungeonRandom ? null : spellSets.find((s) => s.id === dungeonSetId) ?? null
  const tier = dungeonTiers.find((t) => t.id === tierId)!
  /**
   * A set has to carry at least the tier's key requirement.
   *
   * Without a floor, the shortest possible run was also the best-paying one:
   * a one-word set met its only word immediately, faced a one-answer
   * barrier, and collected the tier's full rewards. The floor is exactly the
   * key requirement, since a smaller set could never open the Key Room at
   * all.
   */
  const minWords = minimumSetSize(tier)
  // A type guard, so narrowing survives the check at the call sites.
  const bigEnough = <T extends { spellIds: string[] },>(set: T | null | undefined): set is T =>
    !!set && set.spellIds.length >= minWords
  const randomPool = usableSets(spellSets).filter(bigEnough)
  /** A named set the player chose that cannot carry a run at this tier. */
  const chosenSetTooSmall =
    !dungeonRandom && !!dungeonSet && dungeonSet.spellIds.length < minWords

  // An unfinished world pack is listed below with what it still needs, so it
  // reads as work in progress rather than as a bug.
  const unfinished = incompleteWorlds()
  const locked = playableWorlds().filter((w) => !isWorldUnlocked(w.id))
  // resolveWorld() falls back to the first *playable* world, which is not
  // necessarily an unlocked one, so the fallback is taken from the unlocked
  // list instead.
  const world = worlds.find((w) => w.id === worldId) ?? worlds[0] ?? resolveWorld(worldId)
  const worldLocked = !world || !isWorldUnlocked(world.id)
  const tierLocked = !isTierUnlocked(tierId, cleared)

  // Short of words for this tier — the refusal that has a remedy. Covers
  // both the named-set case and the random one, since neither can start.
  const tooSmallForTier =
    (chosenSetTooSmall || (dungeonRandom && randomPool.length === 0)) && !tierLocked && !worldLocked
  // Two or more sets to tie together, and enough words between them to be
  // worth the trip. Otherwise the honest answer is more vocabulary, not a
  // rearrangement of what is there.
  const canCombine = spellSets.length >= 2 && reachableWordCount(spellSets) >= minWords

  /**
   * How many of this run's words Combo can actually ask a sentence about.
   *
   * Worth saying out loud before the run rather than discovering in the
   * fight: Combo needs target data in the vocabulary list, and a word
   * without it falls back to its normal question. A set imported before
   * Combo existed would otherwise look like a Combo run and play like a
   * normal one, with nothing on screen to explain why.
   */
  const comboReady = (dungeonSet?.spellIds ?? []).filter((id) => {
    const sp = allSpells.find((x) => x.id === id)
    return !!sp && hasComboData(sp)
  }).length

  const canStart =
    !!totem &&
    isUsable(totem) &&
    !!totemSet &&
    totemSet.spellIds.length > 0 &&
    (dungeonRandom ? randomPool.length > 0 : bigEnough(dungeonSet)) &&
    !!world &&
    !worldLocked &&
    !tierLocked

  function handleStart() {
    if (!totem || !totemSet || !world) return
    // The same two gates the button is disabled by, enforced again here: a
    // stale saved selection must not be able to start a run the player has
    // not earned.
    if (worldLocked || tierLocked) return
    // Rolled here rather than when the setting was chosen: the marker is
    // what gets saved, so every run re-rolls instead of the first pick
    // becoming the permanent answer.
    const chosen = dungeonRandom
      ? pickRandomSet(randomPool, Math.random, lastSelection.lastRandomSetId)
      : dungeonSet
    if (!bigEnough(chosen)) return
    setLastSelection({
      totemSpellSetId: totemSet.id,
      dungeonSpellSetId: dungeonSetId ?? chosen.id,
      tierId,
      combatMode,
      ...(dungeonRandom ? { lastRandomSetId: chosen.id } : {}),
    })
    const config = buildDungeonConfig(
      totem.id,
      totemSet.id,
      chosen.id,
      chosen.spellIds,
      tier,
      world.id,
      combatMode,
    )
    // The shrine sting first, then the screen goes dark on top of it, and the
    // dungeon is built behind the curtain. The dungeon's own music does not
    // start until the reveal has finished — useSoundtrack holds it — so the
    // sting plays into silence rather than being buried under a track
    // starting at the same instant.
    audio.play('shrine')
    void curtain({
      label: world.name,
      holdMs: curtainTiming.hold.dungeonEnter,
      onCovered: () => beginDungeon(config),
    })
  }

  return (
    <div className="screen screen-tight screen-scroll dungeon-config">
      <TopBar title="던전" onBack={() => goTo('menu')} />

      {!totem && (
        <div className="empty-state">
          <span className="glyph"><UiIcon name="totem" size={44} /></span>
          <p>
            지금 던전에 들어갈 수 있는 토템이 없습니다. 토템 화면에서 새로 기르세요.
          </p>
        </div>
      )}

      {spellSets.length === 0 && (
        <div className="empty-state">
          <span className="glyph"><UiIcon name="key" size={44} /></span>
          <p>던전에 들어가려면 주문 세트가 최소 하나 필요합니다. 도감에서 만드세요.</p>
        </div>
      )}

      {totem && spellSets.length > 0 && (
        <>
          {/* What this run is: where you are going, and who with. Every
              other choice is a button below, so this screen stays one
              screenful however many worlds and tiers exist.

              The tier's name used to be a heading above this window. It is
              a caption for the picture, so it reads better inside it — and
              a heading's worth of height is a heading's worth of scrolling
              on a short phone. */}
          <div className="scene-window compact">
            <WorldImage world={world} folder="locations" slot="entrance" alt="던전 입구" />
            <span className="scene-tag">{world?.name ?? tier.label}</span>
            <span className="scene-caption">{tier.name}</span>
          </div>

          {/* Who you are taking, and who is waiting. Side by side because
              the comparison is the decision — the panels were a Totem alone
              above a row of buttons, which said nothing about what the run
              was for. */}
          <div className="setup-pair">
            {/* Not `compact`: that variant carries its own padding, which
                lands at the same specificity as the pair's and later in the
                stylesheet, so it won and the two panels' rows sat eight
                pixels out of line with each other. The pair defines this
                panel's sizing. */}
            <TotemPanel totem={totem} />
            <BossPanel world={world} tierId={tierId} totemLevel={totem.level} />
          </div>

          <div className="setup-grid">
            <button className="setup-option" onClick={() => setOpenSetting('world')}>
              <span className="setup-option-label">세계</span>
              <span className="setup-option-value">{world?.name ?? '— 선택 —'}</span>
            </button>
            <button className="setup-option" onClick={() => setOpenSetting('tier')}>
              <span className="setup-option-label">던전 등급</span>
              <span className="setup-option-value">{tier.label}</span>
            </button>
            <button
              className="setup-option"
              data-warn={totemSet && totemSet.spellIds.length > 0 ? undefined : true}
              onClick={() => setOpenSetting('totemSet')}
            >
              <span className="setup-option-label">전투 덱</span>
              <span className="setup-option-value">
                {totemSet ? `${totemSet.name} (${totemSet.spellIds.length})` : '— 선택 —'}
              </span>
            </button>
            <button
              className="setup-option"
              data-warn={dungeonRandom ? (randomPool.length > 0 ? undefined : true) : bigEnough(dungeonSet) ? undefined : true}
              onClick={() => setOpenSetting('dungeonSet')}
            >
              <span className="setup-option-label">성향 (단어)</span>
              <span className="setup-option-value">
                {dungeonRandom
                  ? `무작위 (세트 ${randomPool.length}개 중)`
                  : dungeonSet
                    ? `${dungeonSet.name} (${dungeonSet.spellIds.length})`
                    : '— 선택 —'}
              </span>
            </button>

            {/* How the run will ask its questions. Everything else about it
                — the foes, the damage, the clock, what a word earns — is
                the same either way; only the question changes. */}
            <div className="mode-switch" role="group" aria-label="전투 방식">
              <button
                data-selected={combatMode === 'normal'}
                aria-pressed={combatMode === 'normal'}
                onClick={() => setCombatMode('normal')}
              >
                <span className="mode-name">일반</span>
                <span className="mode-note faint">단어 하나씩</span>
              </button>
              <button
                data-selected={combatMode === 'combo'}
                aria-pressed={combatMode === 'combo'}
                onClick={() => setCombatMode('combo')}
              >
                <span className="mode-name">콤보</span>
                <span className="mode-note faint">문장 속 활용형</span>
              </button>
            </div>
          </div>

          {/* Combo leans on data the vocabulary list has to carry, so what
              it can actually ask about is said here rather than found out
              in the first fight. */}
          {combatMode === 'combo' && !dungeonRandom && dungeonSet && (
            <p className={`setup-summary ${comboReady === 0 ? 'warn' : 'faint'}`}>
              {comboReady === 0
                ? '이 세트에는 콤보 예문 정보가 없습니다 — 일반 문제로 나옵니다'
                : `콤보 문장 가능 ${comboReady}/${dungeonSet.spellIds.length}개 · 나머지는 일반 문제`}
            </p>
          )}

          {dungeonSet && chosenSetTooSmall && (
            // A set that cannot carry the tier is told what it is short of
            // rather than what the run would be like — the old line read
            // "9 of 9 words will be used", which describes a run this tier
            // will not start.
            <p className="setup-summary warn">
              이 등급은 단어 {tier.wordLimit}개가 필요합니다 — {tier.wordLimit - dungeonSet.spellIds.length}개
              모자랍니다
            </p>
          )}
          {dungeonRandom && randomPool.length > 0 && (
            <p className="faint setup-summary">시작할 때마다 세트를 하나 고릅니다</p>
          )}
          {/* What the panels above do not say.
 *
              The Totem and the boss are side by side up there with their
              levels and the matchup between them, so a line repeating the
              Totem's level and a verdict was saying it twice — and a second
              line of small print is a second line to scroll past. What is
              left is the band the ordinary foes roll in, which no panel
              shows, and the shape of the run. */}
          {world && !chosenSetTooSmall && (
            <p className="faint setup-summary">
              적 레벨 {enemyLevelRange(world.id, tierId)[0]}–{enemyLevelRange(world.id, tierId)[1]} · 단어{' '}
              {tier.wordLimit}개 전부를 익혀야 열쇠 · 보스 결계 {tier.barrierWords}개
            </p>
          )}

          {openSetting === 'world' && (
            <SlidePanel title="세계" onClose={close}>
              <div className="tier-card-list">
                {worlds.map((w) => (
                  <button
                    key={w.id}
                    className="tier-card stacked"
                    data-selected={world?.id === w.id}
                    onClick={() => {
                      setWorldId(w.id)
                      close()
                    }}
                  >
                    <div className="tier-card-name">{w.name}</div>
                    <div className="tier-card-meta faint">
                      {w.enemies.length}종의 적 · {w.npcs.length}명의 인물
                    </div>
                    {w.description && <div className="tier-card-meta faint">{w.description}</div>}
                  </button>
                ))}
                {/* Finished worlds this save has not opened yet. Shown so the
                    game reads as somewhere with more in it, rather than as a
                    game with one world in it. */}
                {locked.map((w) => (
                  <button key={w.id} className="tier-card stacked" disabled>
                    <div className="tier-card-name">🔒 {w.name}</div>
                    <div className="tier-card-meta faint">아직 열리지 않은 세계입니다.</div>
                  </button>
                ))}
              </div>
              {unfinished.length > 0 && (
                // Shown to whoever is building a world, not hidden away in a
                // console they may never open.
                <div className="world-unfinished">
                  {unfinished.map((w) => (
                    <div key={w.id} className="world-unfinished-item">
                      <span className="label">{w.name} — 미완성</span>
                      <span className="faint">
                        {w.missing.slice(0, 3).join(', ')}
                        {w.missing.length > 3 ? ` 외 ${w.missing.length - 3}개` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SlidePanel>
          )}

          {openSetting === 'tier' && (
            <SlidePanel title="던전 등급" onClose={close}>
              <div className="tier-card-list">
                {dungeonTiers.map((t) => {
                  const unlocked = isTierUnlocked(t.id, cleared)
                  const required = tierRequirement(t.id)
                  const requiredTier = dungeonTiers.find((d) => d.id === required)
                  return (
                    <button
                      key={t.id}
                      className="tier-card stacked"
                      data-selected={tierId === t.id}
                      // Listed but refused: a locked tier is something to aim
                      // at, so hiding it would hide the reason to go back down
                      // and finish the one above it.
                      disabled={!unlocked}
                      onClick={() => {
                        setTierId(t.id)
                        close()
                      }}
                    >
                      <div className="tier-card-name">
                        {unlocked ? t.name : `🔒 ${t.name}`}
                      </div>
                      <div className="tier-card-meta faint">{t.label}</div>
                      {unlocked ? (
                        <>
                          <div className="tier-card-meta faint">{t.description}</div>
                          <div className="tier-card-meta faint">
                            단어 {t.wordLimit}개 · 보스 ~{t.minEventsBeforeBossEligible}개 사건
                          </div>
                          <div className="tier-card-meta faint">
                            적 레벨 {enemyLevelRange(world?.id ?? '', t.id)[0]}–
                            {enemyLevelRange(world?.id ?? '', t.id)[1]} · 권장 토템 Lv{' '}
                            {recommendedLevel(world?.id ?? '', t.id)}
                          </div>
                        </>
                      ) : (
                        <div className="tier-card-meta faint">
                          {requiredTier
                            ? `${requiredTier.name}의 보스를 먼저 쓰러뜨려야 열립니다.`
                            : '아직 열리지 않았습니다.'}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            </SlidePanel>
          )}

          {openSetting === 'totemSet' && (
            <SlidePanel title="전투 덱" onClose={close}>
              <p className="faint">토템이 공격에 사용하는 주문 세트입니다.</p>
              <SpellSetList
                sets={spellSets}
                selectedId={totemSetId}
                onPick={(id) => {
                  setTotemSetId(id)
                  close()
                }}
              />
            </SlidePanel>
          )}

          {openSetting === 'dungeonSet' && (
            <SlidePanel title="성향 (단어)" onClose={close}>
              <p className="faint">던전이 이번 판에 가르칠 단어들입니다. 보스의 방벽도 여기서 만들어집니다.</p>
              <div className="tier-card-list">
                {/* Not a set but a promise to pick one, so it sits above the
                    list rather than in it. */}
                <button
                  className="tier-card stacked"
                  data-selected={dungeonRandom}
                  disabled={randomPool.length === 0}
                  onClick={() => {
                    setDungeonSetId(RANDOM_SET_ID)
                    close()
                  }}
                >
                  <div className="tier-card-name">🎲 무작위</div>
                  <div className="tier-card-meta faint">
                    {randomPool.length === 0
                      ? '고를 수 있는 세트가 없습니다'
                      : `시작할 때마다 ${randomPool.length}개 중에서 고릅니다`}
                  </div>
                </button>
              </div>
              <SpellSetList
                sets={spellSets}
                selectedId={dungeonSetId}
                onPick={(id) => {
                  setDungeonSetId(id)
                  close()
                }}
              />
            </SlidePanel>
          )}

          {/* 8. Enter dungeon. Pinned to the bottom of the screen rather than
              placed after the settings: this screen grows every time a world
              is added, and the button that starts the run is the one thing
              that must never end up below the fold. */}
          <div className="dungeon-start">
            <button className="btn btn-primary btn-block" data-sfx="none" disabled={!canStart} onClick={handleStart}>
              던전 입장
            </button>
            {!canStart && (
              <p className="faint">
                {chosenSetTooSmall && dungeonSet
                  ? `성향 세트에 단어가 ${minWords}개 이상 필요합니다 (지금 ${dungeonSet.spellIds.length}개).`
                  : dungeonRandom && randomPool.length === 0
                    ? `단어 ${minWords}개 이상인 세트가 없습니다.`
                    : tierLocked
                      ? '이 등급은 아직 열리지 않았습니다 — 한 단계 위의 보스를 먼저 쓰러뜨리세요.'
                      : worldLocked
                        ? '이 세계는 아직 열리지 않았습니다.'
                        : '두 역할 모두에 비어 있지 않은 주문 세트를 골라야 계속할 수 있습니다.'}
              </p>
            )}
            {/* The fix, offered where the problem is found.
 *
                Being short of words for a tier is the one refusal on this
                screen with a remedy that is not on it — and the remedy is
                two screens away, which is most of the reason it went
                unused. Combining sets you already study from beats
                re-importing vocabulary you have already trained. Only shown
                when there is something to combine. */}
            {!canStart && tooSmallForTier && canCombine && (
              <button
                className="btn btn-ghost btn-block"
                onClick={() => goToErrand('compendium', 'merge')}
              >
                세트 합쳐서 {minWords}개 만들기
              </button>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/** The spell-set list, identical in both set pickers. */
function SpellSetList({
  sets,
  selectedId,
  onPick,
}: {
  sets: { id: string; name: string; spellIds: string[] }[]
  selectedId: string | null
  onPick: (id: string) => void
}) {
  if (sets.length === 0) return <p className="faint">주문 세트가 없습니다 — 도감에서 먼저 만드세요.</p>
  return (
    <div className="tier-card-list">
      {sets.map((set) => (
        <button
          key={set.id}
          className="tier-card stacked"
          data-selected={selectedId === set.id}
          // An empty set cannot carry a run, so it is listed but not usable.
          disabled={set.spellIds.length === 0}
          onClick={() => onPick(set.id)}
        >
          <div className="tier-card-name">{set.name}</div>
          <div className="tier-card-meta faint">
            {set.spellIds.length === 0 ? '비어 있음' : `단어 ${set.spellIds.length}개`}
          </div>
        </button>
      ))}
    </div>
  )
}
