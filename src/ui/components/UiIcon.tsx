import { getAsset, hasAsset } from '@/config/assets'

/**
 * The interface icons, by what they mean rather than by filename.
 *
 * The art is named BookIcon, heartIcon and so on; the game should not have
 * to know that. Each entry carries the emoji it replaces, which is what gets
 * drawn when the folder has no art for it — the same rule as the element
 * icons, so an icon can be added or removed without touching a screen.
 */
const icons = {
  anvil: { key: 'anvilIcon', emoji: '🔨', label: '대장간' },
  book: { key: 'BookIcon', emoji: '📖', label: '도감' },
  chart: { key: 'chartIcon', emoji: '📊', label: '기록' },
  deck: { key: 'deckIcon', emoji: '⚔️', label: '전투 덱' },
  roster: { key: 'chestIcon', emoji: '📦', label: '토템 보관' },
  exp: { key: 'expIcon', emoji: '✨', label: '경험치' },
  heart: { key: 'heartIcon', emoji: '❤️', label: '체력' },
  key: { key: 'keyIcon', emoji: '🗝️', label: '열쇠' },
  money: { key: 'moneyIcon', emoji: '💰', label: '돈' },
  totem: { key: 'totemIcon', emoji: '🗿', label: '토템' },
  trash: { key: 'trashcanIcon', emoji: '🗑️', label: '삭제' },
} as const

export type UiIconName = keyof typeof icons

interface UiIconProps {
  name: UiIconName
  /** Rendered edge length in px. */
  size?: number
  className?: string
}

/** One interface icon: the painted one where it exists, else its emoji. */
export function UiIcon({ name, size = 16, className }: UiIconProps) {
  const icon = icons[name]
  const painted = hasAsset('icons', icon.key)
  if (!painted) {
    return (
      <span className={`ui-icon-emoji${className ? ` ${className}` : ''}`} title={icon.label}>
        {icon.emoji}
      </span>
    )
  }
  return (
    <img
      src={getAsset('icons', icon.key)}
      alt=""
      title={icon.label}
      width={size}
      height={size}
      className={`ui-icon${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
