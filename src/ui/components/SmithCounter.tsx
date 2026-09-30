import { useTypewriter } from '@/ui/hooks/useTypewriter'
import { UiIcon } from './UiIcon'
import { smithSpeech, SMITH_NAME, WORKSHOP_SIGN, type WorkshopPlace } from '@/systems/blacksmith'

interface SmithCounterProps {
  /** Where in the workshop this is being rendered — decides what is said. */
  place: WorkshopPlace
  /** Hangs the board over the forge. The workshop's front room only. */
  sign?: boolean
}

/**
 * One line of the smith's speech, typed out. Its own component so the hint
 * can mount fresh the moment the line above it finishes — same reason as
 * the Compendium keeper's.
 */
function TypedLine({ text, className }: { text: string; className: string }) {
  const typed = useTypewriter(text)
  return (
    <p className={className} aria-live="polite">
      {typed.shown}
      {typed.typing && <span className="shop-caret" aria-hidden="true" />}
    </p>
  )
}

/**
 * The man at the forge.
 *
 * Built out of the word shop's counter classes on purpose: both are places
 * with somebody in them, and two different-looking speech bubbles in one
 * game would read as two different games. He has no portrait yet, so the
 * workshop's own icon stands in his frame — the hammer and the ingot are
 * what the sign outside would show anyway.
 */
export function SmithCounter({ place, sign = false }: SmithCounterProps) {
  const speech = smithSpeech(place)
  const line = useTypewriter(speech.line)

  return (
    <div className="shop-counter">
      {sign && <div className="shop-sign">{WORKSHOP_SIGN}</div>}
      <div className="shop-keeper">
        {/* Bubble left, figure right — the same arrangement as the word
            shop, so moving between the two shops does not move the face. */}
        <div className={`shop-speech mood-${speech.mood}`} onClick={line.skip}>
          <div className="shop-speech-name">{SMITH_NAME}</div>
          <p className="shop-line" aria-live="polite">
            {line.shown}
            {line.typing && <span className="shop-caret" aria-hidden="true" />}
          </p>
          {speech.hint && !line.typing && (
            <TypedLine key={speech.hint} text={speech.hint} className="shop-hint" />
          )}
        </div>
        <div className={`shop-portrait smith-portrait mood-${speech.mood}`}>
          <UiIcon name="anvil" size={72} />
        </div>
      </div>
    </div>
  )
}
