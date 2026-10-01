import type { MaterialDef } from '@/domain/material'
import { getAsset, hasAsset } from '@/config/assets'

interface MaterialIconProps {
  def: MaterialDef
  /** Rendered edge length in px. */
  size?: number
  className?: string
}

/**
 * A material, drawn where there is art for it and spelled with its emoji
 * where there is not.
 *
 * The same rule the interface icons follow: the catalogue names what a
 * thing is, not which file it lives in, so a material can be added before
 * anybody has drawn it and gets its picture the moment one lands in
 * public/assets/materials. Nothing else has to change.
 */
export function MaterialIcon({ def, size = 26, className }: MaterialIconProps) {
  const painted = hasAsset('materials', def.id)
  if (!painted) {
    return (
      <span className={`material-icon${className ? ` ${className}` : ''}`} aria-hidden="true">
        {def.icon}
      </span>
    )
  }
  return (
    <img
      src={getAsset('materials', def.id)}
      alt=""
      title={def.name}
      width={size}
      height={size}
      className={`material-icon-img${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  )
}
