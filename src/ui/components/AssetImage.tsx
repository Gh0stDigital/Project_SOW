import { useEffect } from 'react'
import { framesFor, getAsset, type AssetCategory } from '@/config/assets'
import { useSpriteFrame } from '@/ui/hooks/useSpriteFrame'

interface AssetImageProps {
  category: AssetCategory
  assetKey?: string | null
  alt: string
  className?: string
}

/**
 * Renders a local placeholder-or-final image for a given asset slot.
 *
 * Art is usually one picture. Where it is a folder of frames instead (see
 * scripts/artFiles.mjs) this plays them, which is the whole of what makes a
 * portrait idle rather than stand still. Nothing about the element changes:
 * same tag, same classes, same sizing — only the src moves — so an
 * animation can be added to any art the game already draws without
 * touching the screen that draws it.
 */
export function AssetImage({ category, assetKey, alt, className }: AssetImageProps) {
  const frames = framesFor(category, assetKey)
  const frame = useSpriteFrame(frames.length)
  usePreload(frames)

  const src = frames.length > 1 ? frames[frame] : getAsset(category, assetKey)
  return <img src={src} alt={alt} className={className ?? 'asset-img'} draggable={false} />
}

/**
 * Pulls every frame into the browser's cache before it is needed.
 *
 * Without this the second frame is fetched the first time it is shown and
 * the picture blinks out for as long as that takes — once, on the first
 * loop, which is exactly when someone is looking at new art for the first
 * time.
 */
function usePreload(frames: readonly string[]): void {
  const key = frames.join('|')
  useEffect(() => {
    if (frames.length < 2 || typeof Image === 'undefined') return
    for (const src of frames) {
      const img = new Image()
      img.src = src
    }
    // Keyed by the joined list rather than the array, which is new on every
    // render and would re-run this forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
