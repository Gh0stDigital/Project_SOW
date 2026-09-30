import { AssetImage } from './AssetImage'
import { keeperSpeech, SHOP_KEEPER_NAME, SHOP_SIGN, type CompendiumPlace } from '@/systems/wordShop'

interface ShopKeeperProps {
  /** Where in the Compendium this is being rendered — decides what is said. */
  place: CompendiumPlace
  /**
   * Hangs the shop's board over the counter. Only the import screen wants
   * it: everywhere else the Compendium's own title is already overhead, and
   * a second sign in every room reads as decoration rather than signage.
   */
  sign?: boolean
}

/**
 * The person behind the counter, in whichever part of the Compendium you
 * happen to be standing.
 *
 * The same face and the same bubble in every room — the shelves, the
 * bundles, the desk, the counter — is what makes the Compendium one shop
 * with somebody in it rather than four screens that each explain themselves
 * differently. What they say comes from systems/wordShop.ts, which is a pure
 * function of `place`; this renders it and nothing more.
 *
 * One portrait covers every state. It is framed and glowed by mood rather
 * than swapped for different art, so a single drawing does the whole job.
 */
export function ShopKeeper({ place, sign = false }: ShopKeeperProps) {
  const speech = keeperSpeech(place)
  return (
    <div className="shop-counter">
      {sign && <div className="shop-sign">{SHOP_SIGN}</div>}
      <div className="shop-keeper">
        <div className={`shop-portrait mood-${speech.mood}`}>
          <AssetImage category="shop" assetKey="keeper" alt={SHOP_KEEPER_NAME} className="shop-portrait-img" />
        </div>
        <div className={`shop-speech mood-${speech.mood}`}>
          <div className="shop-speech-name">{SHOP_KEEPER_NAME}</div>
          <p className="shop-line">{speech.line}</p>
          {speech.hint && <p className="shop-hint">{speech.hint}</p>}
        </div>
      </div>
    </div>
  )
}
