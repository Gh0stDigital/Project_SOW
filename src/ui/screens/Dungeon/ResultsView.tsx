import { useState } from 'react'
import { curtain } from '@/state/transitionStore'
import { curtainTiming } from '@/config/transitions'
import { useUiStore } from '@/state/uiStore'
import { useDungeonStore } from '@/state/dungeonStore'
import { getItemDef } from '@/config/items'
import { findMaterialDef, getMaterialDef } from '@/config/materials'
import { pct, type RunReport, type WordReportRow } from '@/systems/runResults'
import type { ItemId } from '@/domain/item'
import { SlidePanel } from '@/ui/components/SlidePanel'
import { UiIcon } from '@/ui/components/UiIcon'

type DetailPanel = 'words' | 'haul' | null

/**
 * End-of-run report.
 *
 * The summary is sized to one viewport — outcome, Totem state, the headline
 * numbers and accuracy — with the long lists (every word's performance, the
 * items collected, level-ups) behind modals rather than a scroll. Purely a
 * readout: every reward was credited when it was earned, so rendering or
 * re-rendering this screen can never grant anything a second time.
 */
export function ResultsView() {
  const goTo = useUiStore((s) => s.goTo)
  const report = useDungeonStore((s) => s.report)
  const exitToMenu = useDungeonStore((s) => s.exitToMenu)
  const [panel, setPanel] = useState<DetailPanel>(null)

  if (!report) {
    exitToMenu()
    return null
  }

  const glyph = report.outcome === 'victory' ? '🏆' : report.outcome === 'abandoned' ? '🚪' : '💀'
  const attempted = report.words.filter((w) => w.correct + w.incorrect > 0).length
  const haulCount = report.itemsCollected.length + report.chargeGains.length + report.masteredWords.length

  return (
    <div className="screen results-screen">
      <div className="results-head">
        <span className="glyph">{glyph}</span>
        <h1>{report.title}</h1>
        <p className="muted">
          {report.turns}턴 · 정확도 {pct(report.totalAccuracy)}
        </p>
      </div>

      {/* ---- Totem outcome ---- */}
      <div className={`panel totem-outcome ${report.totemDestroyed ? 'destroyed' : ''}`}>
        <div className="row">
          <span>
            <UiIcon name="heart" size={14} /> {report.totemHp}/{report.totemMaxHp}
          </span>
          <span>◆ 생명력 {report.lifePointsRemaining}</span>
          {report.totemLevelAfter > report.totemLevelBefore && (
            <span className="faint">Lv {report.totemLevelBefore} → {report.totemLevelAfter}</span>
          )}
        </div>
        {report.totemDestroyed ? (
          <p className="destroyed-note">토템이 파괴되었습니다. 토템 화면에서 새로 기르세요.</p>
        ) : (
          report.lifePointLost && <p className="faint">생명력 1을 잃었습니다.</p>
        )}
      </div>

      {/* ---- Headline numbers ---- */}
      <div className="results-grid tight">
        <Stat label="돈" value={`💰 ${report.moneyEarned}`} />
        <Stat label="토템 경험치" value={report.totemXpEarned} />
        <Stat label="적" value={report.enemiesDefeated} />
        <Stat label="미믹" value={report.mimicsDefeated} />
        <Stat label="보물" value={report.treasureCollected} />
        <Stat label="휴식" value={report.restsUsed} />
      </div>

      {/* ---- Accuracy ---- */}
      <div className="panel accuracy-panel">
        <div className="accuracy-row">
          <Accuracy label="전체" value={report.totalAccuracy} />
          <Accuracy label="공격" value={report.attackAccuracy} />
          <Accuracy label="방어" value={report.defenseAccuracy} />
        </div>
        <div className="faint" style={{ textAlign: 'center' }}>
          정답 {report.totalCorrect} · 오답 {report.totalIncorrect}
        </div>
      </div>

      {/* ---- Everything long lives behind a modal ---- */}
      <div className="btn-row">
        <button className="btn btn-ghost" onClick={() => setPanel('words')}>
          <UiIcon name="book" size={15} /> 단어 ({attempted}/{report.words.length})
        </button>
        <button className="btn btn-ghost" disabled={haulCount === 0} onClick={() => setPanel('haul')}>
          🎁 전리품 ({haulCount})
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <button
        className="btn btn-primary btn-block"
        onClick={() => {
          // Both halves of leaving happen behind the curtain: the run is torn
          // down and the menu is mounted while the screen is black, so the
          // player never sees the results screen empty itself out. The menu
          // theme comes back on the reveal rather than over the results.
          void curtain({
            holdMs: curtainTiming.hold.toMenu,
            onCovered: () => {
              exitToMenu()
              goTo('menu')
            },
          })
        }}
      >
        메인 메뉴로
      </button>

      {panel === 'words' && <WordsPanel report={report} onClose={() => setPanel(null)} />}
      {panel === 'haul' && <HaulPanel report={report} onClose={() => setPanel(null)} />}
    </div>
  )
}

function WordsPanel({ report, onClose }: { report: RunReport; onClose: () => void }) {
  return (
    <SlidePanel title="단어 성적" onClose={onClose}>
      {report.struggled.length > 0 && (
        <section>
          <h3>복습할 만한</h3>
          <div className="list">
            {report.struggled.map((w) => (
              <WordRow key={w.spellId} word={w} />
            ))}
          </div>
        </section>
      )}
      <section>
        <h3>모든 단어</h3>
        <div className="list">
          {report.words.map((w) => (
            <WordRow key={w.spellId} word={w} />
          ))}
        </div>
      </section>
    </SlidePanel>
  )
}

function HaulPanel({ report, onClose }: { report: RunReport; onClose: () => void }) {
  const tally = (ids: readonly string[]) =>
    ids.reduce<Record<string, number>>((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})
  const itemCounts = tally(report.itemsCollected)
  // Unknown ids are dropped rather than rendered blank — the bag does the
  // same thing with them, so the haul should not promise something that
  // will not be there.
  const materialCounts = tally(report.materialsCollected.filter((id) => findMaterialDef(id)))

  return (
    <SlidePanel title="전리품" onClose={onClose}>
      {Object.keys(itemCounts).length > 0 && (
        <section>
          <h3>아이템 & 보물</h3>
          <div className="reward-lines">
            {Object.entries(itemCounts).map(([id, count]) => {
              const def = getItemDef(id as ItemId)
              return (
                <span key={id} className="reward-line">
                  {def.icon} {def.name} ×{count}
                </span>
              )
            })}
          </div>
        </section>
      )}

      {Object.keys(materialCounts).length > 0 && (
        <section>
          <h3>재료 & 보물</h3>
          <div className="reward-lines">
            {Object.entries(materialCounts).map(([id, count]) => {
              const def = getMaterialDef(id)
              return (
                <span key={id} className="reward-line">
                  {def.icon} {def.name} ×{count}
                </span>
              )
            })}
          </div>
        </section>
      )}

      {report.chargeGains.length > 0 && (
        <section>
          <h3>충전된 단어</h3>
          <p>{report.chargeGains.map((g) => `${g.korean} ⚡${g.from}→${g.to}`).join(' · ')}</p>
        </section>
      )}

      {report.masteredWords.length > 0 && (
        <section>
          <h3>새로 숙달함</h3>
          <p>{report.masteredWords.join(', ')}</p>
        </section>
      )}

      <section>
        <h3>합계</h3>
        <div className="stats-grid">
          <div className="stat-tile">
            <div className="faint">턴 수</div>
            <div className="value">{report.turns}</div>
          </div>
        </div>
      </section>
    </SlidePanel>
  )
}

function WordRow({ word }: { word: WordReportRow }) {
  const attempts = word.correct + word.incorrect
  return (
    <div className="word-report-row">
      <span className={`status-dot ${word.introduced ? 'done' : 'pending'}`} />
      <div className="word-report-body">
        <div className="word-report-word">
          {word.korean} <span className="faint">— {word.english}</span>
        </div>
        <div className="faint word-report-meta">
          {attempts === 0 ? (
            '시도한 적 없음'
          ) : (
            <>
              {word.correct}✓ / {word.incorrect}✗ · {pct(word.accuracy)}
              {word.attackTotal > 0 && ` · 공격 ${pct(word.attackAccuracy)}`}
              {word.defenseTotal > 0 && ` · 방어 ${pct(word.defenseAccuracy)}`}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Accuracy({ label, value }: { label: string; value: number }) {
  return (
    <div className="accuracy-cell">
      <div className="accuracy-value">{pct(value)}</div>
      <div className="faint">{label}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-tile">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}
