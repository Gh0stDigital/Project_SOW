import { useState } from 'react'
import { useUiStore } from '@/state/uiStore'
import { findNewContent, hasNewContent } from '@/systems/newContent'
import { allWorlds } from '@/systems/worldRegistry'
import { assetKeys, optionalAsset } from '@/config/assets'
import { nameFromSlot } from '@/systems/worldRegistry'
import { usePersistentStore } from '@/state/persistentStore'
import { TotemPortrait } from '@/ui/components/TotemPortrait'
import { Bar } from '@/ui/components/Bar'
import { totemBalance } from '@/config/balance'
import { AudioSettings } from '@/ui/components/AudioSettings'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { UiIcon } from '@/ui/components/UiIcon'

/** Each entry names the interface icon it is drawn with. */
const menuItems = [
  { screen: 'compendium' as const, icon: 'book' as const, label: '주문 불러오기 / 도감', desc: '주문 단어와 주문 세트를 만들고 정리합니다.' },
  { screen: 'totem' as const, icon: 'totem' as const, label: '토템', desc: '토템을 확인하고 전투용 주문 세트를 장착합니다.' },
  { screen: 'workshop' as const, icon: 'anvil' as const, label: '대장간', desc: '재료와 보물을 팔고, 새 토템을 주조합니다.' },
  { screen: 'dungeon' as const, icon: 'key' as const, label: '던전', desc: '던전을 설정하고 탐험을 시작합니다.' },
  { screen: 'records' as const, icon: 'chart' as const, label: '기록', desc: '모든 주문 단어와 학습 통계를 살펴봅니다.' },
]

export function MainMenuScreen() {
  // Money is the player's purse now, not this Totem's pocket.
  const money = usePersistentStore((s) => s.money)
  const goTo = useUiStore((s) => s.goTo)
  const returnToTitle = useUiStore((s) => s.returnToTitle)
  const totem = usePersistentStore((s) => s.totems.find((t) => t.id === s.activeTotemId))
  const seenContent = usePersistentStore((s) => s.seenContent)
  const acknowledgeNewContent = usePersistentStore((s) => s.acknowledgeNewContent)

  // What has appeared since the player last looked. The build already knows
  // the full catalogue; this is only about what they have been told.
  const fresh = findNewContent(allWorlds, assetKeys('totems'), seenContent)
  const spellCount = usePersistentStore((s) => s.spells.length)
  const titleArt = optionalAsset('ui', 'title')
  const [soundOpen, setSoundOpen] = useState(false)
  const muted = usePersistentStore((s) => s.settings.muted)

  return (
    <div className="screen">
      {/* The two controls that are about the app rather than about the game,
          kept in the corner and out of the column.

          The sound panel was put here first, for the reason it still is: a
          row of sliders is worth reaching occasionally and not worth the
          height it costs on every visit. Leaving the title exit at the foot
          of the column had the same problem in the end — it sat below a
          flexible spacer, so every destination added to the menu pushed it
          further down, and on a short phone it went off the bottom of a
          screen that cannot scroll. Up here nothing can push it anywhere. */}
      <div className="menu-corner">
        <button className="menu-corner-btn" data-sfx="cancel" onClick={returnToTitle} title="타이틀 화면으로">
          ← 타이틀
        </button>
        <button
          className="menu-corner-btn icon"
          data-sfx="none"
          onClick={() => setSoundOpen(true)}
          title="소리 설정"
          aria-label="소리 설정"
        >
          {muted ? '🔇' : '🔊'}
        </button>
      </div>

      {soundOpen && (
        <SlidePanel title="소리" onClose={() => setSoundOpen(false)}>
          <AudioSettings />
        </SlidePanel>
      )}
      {hasNewContent(fresh) && (
        <button className="new-content-notice" onClick={acknowledgeNewContent}>
          <span className="new-content-title">✦ 새로운 내용이 추가되었습니다</span>
          {fresh.worlds.length > 0 && (
            <span className="new-content-line">새 세계 · {fresh.worlds.map((w) => w.name).join(', ')}</span>
          )}
          {fresh.totems.length > 0 && (
            <span className="new-content-line">새 토템 · {fresh.totems.map(nameFromSlot).join(', ')}</span>
          )}
          <span className="faint new-content-dismiss">눌러서 확인</span>
        </button>
      )}

      {/* The logo replaces the icon and the text title outright. Until the
          art exists the menu keeps its written title, so a missing file is a
          plainer menu rather than a blank one. */}
      {titleArt ? (
        <div className="menu-title has-art">
          <img src={titleArt} alt="Sound of Worlds" className="menu-title-art" draggable={false} />
        </div>
      ) : (
        <div className="menu-title">
          <span className="glyph">🔮</span>
          <h1>Sound of Worlds</h1>
          <p className="muted">언어 학습 던전 크롤러</p>
        </div>
      )}

      {totem && (
        <button className="totem-banner" onClick={() => goTo('totem')}>
          <span className="totem-banner-tag">내 토템</span>
          <TotemPortrait assetKey={totem.avatarKey} alt={totem.name} className="avatar-img avatar-hero" />
          <div className="totem-banner-body">
            <div className="name-row">
              <span className="name">{totem.name}</span>
              <span className="muted">Lv {totem.level}</span>
            </div>
            <div className="hp-row">
              <span>
                <UiIcon name="heart" size={13} /> {totem.currentHp}/{totem.maxHp}
              </span>
              <div style={{ flex: 1 }}>
                <Bar value={totem.currentHp} max={totem.maxHp} kind="hp" thin />
              </div>
            </div>
            <div className="hp-row">
              <span>
                <UiIcon name="exp" size={13} /> {totem.experience}/{totemBalance.xpToNextLevel(totem.level)}
              </span>
              <div style={{ flex: 1 }}>
                <Bar value={totem.experience} max={totemBalance.xpToNextLevel(totem.level)} kind="xp" thin />
              </div>
            </div>
            <div className="totem-banner-foot faint">
              <UiIcon name="money" size={13} /> {money} · 아는 주문 {spellCount}개
            </div>
          </div>
        </button>
      )}

      <div className="menu-list">
        {menuItems.map((item) => (
          <button key={item.screen} className="menu-item" onClick={() => goTo(item.screen)}>
            <span className="icon">
              <UiIcon name={item.icon} size={34} />
            </span>
            <div>
              <div className="label">{item.label}</div>
              <div className="desc">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ flex: 1 }} />

      <p className="faint menu-foot" style={{ textAlign: 'center' }}>
        완전 오프라인 · 진행 상황은 이 기기에 저장됩니다
      </p>
    </div>
  )
}
