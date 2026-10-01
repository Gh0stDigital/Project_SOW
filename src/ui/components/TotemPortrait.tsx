import { AssetImage } from './AssetImage'
import { creatureArt, isCreatureKey } from '@/systems/creatureTotems'

interface TotemPortraitProps {
  assetKey?: string | null
  alt: string
  className?: string
}

/**
 * A Totem's picture, wherever its art happens to live.
 *
 * Two places now: the painted portraits in assets/totems, and the creatures
 * in each world's own pack. Everything that draws a Totem goes through here
 * rather than reaching for `AssetImage category="totems"` directly — that
 * call resolves against the portrait folder alone, so a Totem wearing a
 * minotaur would have come out as whichever portrait the fallback landed
 * on, which is a real bug and a quiet one.
 */
export function TotemPortrait({ assetKey, alt, className }: TotemPortraitProps) {
  const creature = isCreatureKey(assetKey) ? creatureArt(assetKey!) : null
  if (creature) {
    return <img src={creature} alt={alt} className={className ?? 'asset-img'} draggable={false} />
  }
  return <AssetImage category="totems" assetKey={assetKey} alt={alt} className={className} />
}
