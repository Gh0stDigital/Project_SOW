import type { WorldPack } from '@/config/worldManifest'
import type { DungeonTierId } from '@/config/balance'
import { WorldImage } from './WorldImage'
import { Bar } from './Bar'
import { UiIcon } from './UiIcon'
import { bossPreview } from '@/systems/bossPreview'

interface BossPanelProps {
  world: WorldPack | undefined
  tierId: DungeonTierId
  /** The Totem's level, so the panel can say how the matchup looks. */
  totemLevel: number
}

/**
 * Who is waiting at the bottom, shown beside the Totem you are taking.
 *
 * The setup screen said where you were going and who with, and nothing at
 * all about what for. Now that each tier fields its own guardian rather
 * than one of the world's creatures at random, the boss is the clearest
 * statement of what a tier actually is — "the one with the minotaur" means
 * more than "the 10-word dungeon", and it is the thing a player is
 * choosing between.
 *
 * Showing it here does not count as having met it: the blacksmith's roster
 * is filled by fighting, not by reading a menu. Otherwise the whole
 * bestiary would unlock from this screen without a single dungeon.
 */
export function BossPanel({ world, tierId, totemLevel }: BossPanelProps) {
  const boss = bossPreview(world, tierId)
  if (!boss) return null

  // The same comparison the level line below the panels makes, kept to the
  // three words that fit: a boss does not roll, so this is exact rather
  // than a forecast.
  const standing =
    totemLevel >= boss.level ? '해볼 만합니다' : totemLevel * 2 >= boss.level ? '버겁습니다' : '벅찹니다'
  const warn = totemLevel * 2 < boss.level

  return (
    <div className="boss-panel">
      <span className="totem-panel-tag">이 던전의 주인</span>
      <span className="boss-panel-art">
        <WorldImage world={world} folder={boss.folder} slot={boss.slot} alt={boss.name} />
      </span>
      <div className="stats">
        <div className="name-row">
          <span className="name">{boss.name}</span>
          <span className="muted">Lv {boss.level}</span>
        </div>
        <div className="hp-row">
          <span>
            <UiIcon name="heart" size={13} /> {boss.maxHp}
          </span>
          <div style={{ flex: 1 }}>
            <Bar value={1} max={1} kind="hp" thin />
          </div>
        </div>
        <div className={`hp-row boss-panel-standing${warn ? ' warn' : ''}`}>{standing}</div>
      </div>
    </div>
  )
}
