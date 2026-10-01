import { TotemPortrait } from './TotemPortrait'

/** How large the window is. The window itself never changes shape. */
export type AvatarSize = 'hud' | 'setup' | 'hero' | 'tile'

interface AvatarFrameProps {
  assetKey?: string | null
  alt: string
  size?: AvatarSize
  /** Shakes the whole window, so a clipped sprite cannot slide out of it. */
  hit?: boolean
  className?: string
}

/**
 * A Totem portrait in a window of a fixed size.
 *
 * Totem art arrives in two shapes: tall full-body portraits (768x1376) and
 * wide sprites (1200x896). Fitted into a box, the tall ones filled the height
 * and the wide ones the width, so the same character looked half the size
 * depending on which file it came from.
 *
 * Measuring the art says how to fix that: in every one of them the character
 * occupies 91-96% of the file's own *height*, and it is the side margins that
 * vary — from 49% to 92% of the width. So height is the honest common
 * measure. The window is fixed and the image is sized by its height, which
 * draws every Totem at the same height whatever its file's proportions and
 * trims only the empty margin at the sides.
 *
 * The window's 1.3 ratio is the widest of the source art, so even a sprite
 * that fills its file edge to edge keeps its sword.
 */
export function AvatarFrame({ assetKey, alt, size = 'hud', hit, className }: AvatarFrameProps) {
  return (
    <span className={`avatar-frame avatar-frame-${size}${hit ? ' is-hit' : ''}${className ? ` ${className}` : ''}`}>
      <TotemPortrait assetKey={assetKey} alt={alt} className="avatar-img" />
    </span>
  )
}
