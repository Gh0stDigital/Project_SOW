import type { DungeonRunState } from '@/domain/dungeon'
import type { Totem } from '@/domain/totem'
import type { SpellSet } from '@/domain/spellSet'
import { totemBalance, dungeonTiers } from '@/config/balance'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { TotemPortrait } from '@/ui/components/TotemPortrait'
import { Bar } from '@/ui/components/Bar'
import { UiIcon } from '@/ui/components/UiIcon'
import { usePersistentStore } from '@/state/persistentStore'
import { wordsNeededThisRun } from '@/state/dungeonStore'

interface StatusPanelProps {
  totem: Totem
  run: DungeonRunState
  totemSet: SpellSet | null
  challenged: number
  onClose: () => void
}

export function StatusPanel({ totem, run, totemSet, challenged, onClose }: StatusPanelProps) {
  // Money is the player's purse now, not this Totem's pocket.
  const money = usePersistentStore((s) => s.money)
  const xpNeeded = totemBalance.xpToNextLevel(totem.level)
  const tier = dungeonTiers.find((t) => t.id === run.config.tierId)

  return (
    <SlidePanel title="상태" onClose={onClose}>
      <section className="status-hero">
        <div className="status-portrait">
          <TotemPortrait assetKey={totem.avatarKey} alt={totem.name} className="avatar-img avatar-hero" />
        </div>
        <div className="status-hero-body">
          <h2>{totem.name}</h2>
          <p className="muted">
            레벨 {totem.level} · ◆ 생명력 {totem.lifePoints}/{totem.maxLifePoints}
          </p>
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
              <UiIcon name="exp" size={13} /> {totem.experience}/{xpNeeded}
            </span>
            <div style={{ flex: 1 }}>
              <Bar value={totem.experience} max={xpNeeded} kind="xp" thin />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3>이번 탐험</h3>
        <div className="stats-grid">
          <div className="stat-tile">
            <div className="faint">던전</div>
            <div className="value">{tier?.label ?? run.config.tierId}</div>
          </div>
          <div className="stat-tile">
            {/* Toward the key, not toward the whole set — the set can be
                far larger than the run needs, and counting against it made
                every long list look like an unfinished run. */}
            <div className="faint">열쇠까지</div>
            <div className="value">
              {Math.min(challenged, wordsNeededThisRun(run))}/{wordsNeededThisRun(run)}
            </div>
          </div>
          <div className="stat-tile">
            <div className="faint">턴</div>
            <div className="value">{run.turn}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">처치한 적</div>
            <div className="value">{run.stats.enemiesDefeated}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">정답</div>
            <div className="value">{run.stats.correctAnswers}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">오답</div>
            <div className="value">{run.stats.incorrectAnswers}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">획득한 돈</div>
            <div className="value"><UiIcon name="money" size={14} /> {run.stats.moneyEarned}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">보스의 문</div>
            <div className="value">{run.bossDoorFound ? (run.keyFound ? '열림' : '잠김') : '알 수 없음'}</div>
          </div>
        </div>
      </section>

      <section>
        <h3>전체</h3>
        <div className="stats-grid">
          <div className="stat-tile">
            <div className="faint">돈</div>
            <div className="value"><UiIcon name="money" size={14} /> {money}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">처치한 보스</div>
            <div className="value">{totem.stats.bossesDefeated}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">클리어한 던전</div>
            <div className="value">{totem.stats.dungeonsCompleted}</div>
          </div>
          <div className="stat-tile">
            <div className="faint">전투 덱</div>
            <div className="value">{totemSet ? `주문 ${totemSet.spellIds.length}개` : '없음'}</div>
          </div>
        </div>
      </section>
    </SlidePanel>
  )
}
