import type { Totem } from '@/domain/totem'
import type { RewardBundle } from '@/domain/dungeon'
import type { RestNpc } from '@/systems/restNpcs'
import { quoteRest } from '@/systems/restArea'
import { usePersistentStore } from '@/state/persistentStore'
import type { WorldPack } from '@/config/worldManifest'
import { WorldImage } from '@/ui/components/WorldImage'
import { UiIcon } from '@/ui/components/UiIcon'

interface RestAreaViewProps {
  totem: Totem
  usesSoFar: number
  npcs: RestNpc[]
  /** The run's world — NPC portraits come from its pack. */
  world: WorldPack | undefined
  /** The last exchange, kept on screen until the player leaves. */
  said: { npcId: string; reward: RewardBundle } | null
  onTalk: (npcId: string) => void
  onRest: () => void
  onLeave: () => void
}

/**
 * The Rest Area. Once found it stays on the map for the rest of the run and
 * can be revisited from Standby; each use costs more than the last. Every
 * number shown here comes from the rest quote, never from the component.
 */
export function RestAreaView({ totem, usesSoFar, npcs, world, said, onTalk, onRest, onLeave }: RestAreaViewProps) {
  // Money is the player's purse now, not this Totem's pocket.
  const money = usePersistentStore((s) => s.money)
  const quote = quoteRest(totem, money, usesSoFar)
  const speaking = said ? npcs.find((n) => n.id === said.npcId) : null

  return (
    <div className="panel rest-area">
      <h3>⛺ 쉼터</h3>
      {/* Flavor is the first thing to go on a short phone — the numbers
          below are what the player actually decides on. */}
      <p className="muted rest-flavor">마른 구석과 잦아든 모닥불. 누군가 물자를 두고 갔습니다 — 값을 받고요.</p>

      <div className="stats-grid">
        <div className="stat-tile">
          <div className="faint">회복량</div>
          <div className="value"><UiIcon name="heart" size={14} /> {quote.healAmount}</div>
        </div>
        <div className="stat-tile">
          <div className="faint">가격</div>
          <div className="value"><UiIcon name="money" size={14} /> {quote.price}</div>
        </div>
        <div className="stat-tile">
          <div className="faint">보유</div>
          <div className="value"><UiIcon name="money" size={14} /> {money}</div>
        </div>
        <div className="stat-tile">
          <div className="faint">다음 이용</div>
          <div className="value"><UiIcon name="money" size={14} /> {quote.nextPrice}</div>
        </div>
      </div>

      <div className="hp-row">
        <span>
          <UiIcon name="heart" size={14} /> {totem.currentHp}/{totem.maxHp}
        </span>
        <span className="faint">{usesSoFar}번 휴식함</span>
      </div>

      {quote.blockedReason === 'full_hp' && <p className="faint">이미 체력이 가득합니다.</p>}
      {quote.blockedReason === 'too_expensive' && (
        <p className="faint">아직 여기서 쉴 돈이 부족합니다.</p>
      )}

      <div className="btn-row">
        <button
          className="btn btn-primary btn-block"
          disabled={quote.blockedReason !== null}
          onClick={onRest}
        >
          휴식 — <UiIcon name="money" size={14} /> {quote.price}
        </button>
      </div>

      {npcs.length > 0 && (
        <div className="npc-section">
          <div className="npc-heading">
            이곳의 사람들 <span className="faint">· {npcs.filter((n) => !n.spoken).length}명과 대화 가능</span>
          </div>

          <div className="npc-row">
            {npcs.map((npc) => (
              <button
                key={npc.id}
                className={`npc-card${npc.spoken ? ' spoken' : ''}${said?.npcId === npc.id ? ' active' : ''}`}
                onClick={() => onTalk(npc.id)}
                disabled={npc.spoken}
              >
                <WorldImage world={world} folder="npcs" slot={npc.avatarKey} alt={npc.name} className="npc-portrait" />
                <span className="npc-name">{npc.name}</span>
                <span className="faint npc-state">{npc.spoken ? '대화함' : '대화'}</span>
              </button>
            ))}
          </div>

          {speaking && (
            // Their line is one of the player's own sample sentences, which
            // is the point: your examples come back at you in the dungeon.
            <div className="npc-speech" key={speaking.id}>
              <div className="npc-speech-name">{speaking.name}</div>
              <p className="npc-line" lang="ko">
                {speaking.line}
              </p>
              {speaking.translation && <p className="npc-translation faint">{speaking.translation}</p>}
              <div className="npc-gift">
                {said && (said.reward.money > 0 || said.reward.lines.length > 0) ? (
                  <>{said.reward.lines.join(' · ')}을(를) 주었습니다</>
                ) : (
                  <span className="faint">나눠 줄 것이 없었습니다.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
      <button className="btn btn-ghost btn-block" onClick={onLeave}>
        떠나기
      </button>
    </div>
  )
}
