import { create } from 'zustand'

export type Screen = 'menu' | 'compendium' | 'totem' | 'workshop' | 'dungeon' | 'records'

/**
 * What the Compendium should open onto, when something sent the player
 * there to do a particular job.
 *
 * The dungeon screen refuses an undersized set; the fix for that is two
 * screens away, and arriving at the Compendium's front door having
 * forgotten why you came is most of the reason the fix went unused. One
 * field rather than a general router, because there is exactly one such
 * errand so far.
 */
export type CompendiumErrand = null | 'merge'

interface UiStore {
  screen: Screen
  goTo(screen: Screen): void
  /** The errand the Compendium was opened for, cleared once it is begun. */
  errand: CompendiumErrand
  /** Sends the player somewhere with a job in mind. */
  goToErrand(screen: Screen, errand: CompendiumErrand): void
  clearErrand(): void
  /**
   * True until the opening has handed over to the menu.
   *
   * The title sequence plays *over* a mounted app, so `screen` is already
   * 'menu' while the book is still shut — which means anything that keys off
   * the screen alone thinks the player has arrived when they have not. The
   * soundtrack is the one that cares: the menu theme would otherwise be
   * playing under the cover, the flash and the loading bar.
   */
  opening: boolean
  /**
   * Whether the opening is on screen at all.
   *
   * Separate from `opening` because the two stop being true at different
   * moments: the menu is the player's as soon as the reveal starts, but the
   * sequence stays mounted on top of it for another second while it fades.
   * One flag would have to pick which of those it meant, and would be wrong
   * about the other.
   */
  titleUp: boolean
  /** The menu is on show. Music may start. */
  arrive(): void
  /** The opening has finished fading and can go. */
  closeTitle(): void
  /** Back to the title screen, to start again or load a different game. */
  returnToTitle(): void
}

export const useUiStore = create<UiStore>()((set) => ({
  screen: 'menu',
  goTo: (screen) => set({ screen, errand: null }),
  errand: null,
  goToErrand: (screen, errand) => set({ screen, errand }),
  clearErrand: () => set({ errand: null }),
  opening: true,
  titleUp: true,
  arrive: () => set({ opening: false }),
  closeTitle: () => set({ titleUp: false }),
  returnToTitle: () => set({ screen: 'menu', opening: true, titleUp: true, errand: null }),
}))
