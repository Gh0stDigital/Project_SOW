import { AssetImage } from './AssetImage'
import { useTypewriter } from '@/ui/hooks/useTypewriter'
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
/**
 * One line of the keeper's speech, typed out.
 *
 * Its own component so the hint can be mounted the moment the line above it
 * finishes and start from nothing — the alternative was a "wait your turn"
 * flag threaded through the hook, which had the failure mode of showing the
 * held line in full instead of hiding it.
 */
function TypedLine({ text, className }: { text: string; className: string }) {
  const typed = useTypewriter(text)
  return (
    // aria-live so a screen reader is handed the finished sentence rather
    // than being interrupted on every character.
    <p className={className} aria-live="polite">
      {typed.shown}
      {typed.typing && <span className="shop-caret" aria-hidden="true" />}
    </p>
  )
}

export function ShopKeeper({ place, sign = false }: ShopKeeperProps) {
  const speech = keeperSpeech(place)
  const line = useTypewriter(speech.line)

  return (
    <div className="shop-counter">
      {sign && <div className="shop-sign">{SHOP_SIGN}</div>}
      <div className="shop-keeper">
        {/* Bubble first, figure second — she stands on the right and speaks
            leftwards into the screen, which is also the reading order. */}
        <div
          className={`shop-speech mood-${speech.mood}`}
          // Tapping finishes the line, for anyone who reads faster than she
          // talks. Not a button: it is a region you can poke, and making it
          // one would put it in the tab order ahead of the actual controls.
          onClick={line.skip}
        >
          <div className="shop-speech-name">{SHOP_KEEPER_NAME}</div>
          <p className="shop-line" aria-live="polite">
            {line.shown}
            {line.typing && <span className="shop-caret" aria-hidden="true" />}
          </p>
          {/* The note waits for the line above it. Two blocks typing at once
              reads as noise rather than as somebody speaking, and the hint is
              the part you read second anyway. Keyed on the text so a new hint
              remounts and types itself rather than inheriting a finished
              one's progress. */}
          {speech.hint && !line.typing && (
            <TypedLine key={speech.hint} text={speech.hint} className="shop-hint" />
          )}
        </div>
        <div className={`shop-portrait mood-${speech.mood}`}>
          <AssetImage category="shop" assetKey="keeper" alt={SHOP_KEEPER_NAME} className="shop-portrait-img" />
        </div>
      </div>
    </div>
  )
}
