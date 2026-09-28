import { create } from 'zustand'
import type { Spell } from '@/domain/spell'
import type { SpellSet } from '@/domain/spellSet'
import type { Totem } from '@/domain/totem'
import type { GameSettings } from '@/domain/settings'
import type { SeenContent } from '@/systems/newContent'
import { markSeen } from '@/systems/newContent'
import { allWorlds } from '@/systems/worldRegistry'
import { assetKeys } from '@/config/assets'
import { defaultSettings } from '@/domain/settings'
import type { InventoryEntry, ItemId } from '@/domain/item'
import { itemBalance } from '@/config/items'
import { addItem, consumeItem } from '@/systems/inventory'
import type { DungeonTierId } from '@/config/balance'
import { PersistenceService, localStorageAdapter } from '@/systems/persistence'
import { addSpell, editSpell, deleteSpell, type SpellEditInput, markEquipped } from '@/systems/spellCompendium'
import type { NewSpellInput } from '@/systems/spellFactory'
import {
  createSpellSet,
  renameSpellSet,
  addSpellToSet,
  removeSpellFromSet,
  deleteSpellSet,
  pruneSpellFromAllSets,
} from '@/systems/spellSetManager'
import { createTotem, equipSpellSet, isUsable, STARTING_AVATAR } from '@/systems/totemManager'
import { STARTING_TOTEM_KEY, isTotemUnlocked } from '@/config/progression'
import { migrateSpells } from '@/systems/spellMigration'
import { totemBalance } from '@/config/balance'

/** What the first Totem used to be called before it had a name. */
const LEGACY_DEFAULT_TOTEM_NAME = '토템'

export interface DungeonSelectionDraft {
  totemSpellSetId: string | null
  /**
   * The set the dungeon draws its words from, or the marker that says to
   * pick one at the start of every run (RANDOM_SET_ID).
   */
  dungeonSpellSetId: string | null
  tierId: DungeonTierId
  /**
   * The set the last randomly-chosen run actually landed on, so the next
   * roll can avoid it. Absent on a save written before random existed, and
   * on any selection that named its own set.
   */
  lastRandomSetId?: string | null
}

export interface PersistedData {
  spells: Spell[]
  spellSets: SpellSet[]
  totems: Totem[]
  activeTotemId: string | null
  settings: GameSettings
  lastDungeonSelection: DungeonSelectionDraft
  inventory: InventoryEntry[]
  /** Worlds and Totems the player has already been told about. */
  seenContent: SeenContent
}

const persistence = new PersistenceService<PersistedData>(localStorageAdapter)

function defaultData(): PersistedData {
  // Named after who they are, not after what they are. The default used to
  // be '토템' — the word "totem" — which is the category, not the character.
  const totem = createTotem(STARTING_TOTEM_KEY)
  return {
    spells: [],
    spellSets: [],
    totems: [totem],
    activeTotemId: totem.id,
    settings: defaultSettings,
    lastDungeonSelection: { totemSpellSetId: null, dungeonSpellSetId: null, tierId: 'tier10' },
    inventory: itemBalance.startingInventory.map((e) => ({ ...e })),
    // A brand-new save has seen everything shipping with it: a first launch
    // should not announce the whole catalogue as new.
    seenContent: markSeen(allWorlds, assetKeys('totems')),
  }
}

function loadInitial(): PersistedData {
  const saved = persistence.load()
  if (!saved) return defaultData()
  // Shallow-merge with defaults so new fields introduced later don't break old saves.
  const defaults = defaultData()
  return {
    // Entries saved before word types and structured definitions existed
    // are filled in with safe defaults rather than dropped.
    spells: migrateSpells(saved.spells ?? defaults.spells),
    spellSets: saved.spellSets ?? defaults.spellSets,
    totems: (saved.totems && saved.totems.length > 0 ? saved.totems : defaults.totems).map((t) => ({
      ...t,
      // A saved portrait is kept when it names art the save is allowed to
      // wear. An unknown key (art removed or renamed since the save) or a
      // locked one falls back rather than breaking the load, and it falls
      // back to a portrait that exists rather than to a key that has to be
      // guessed at again on every render.
      // isTotemUnlocked() answers false for a key that names nothing, so
      // this covers both cases at once.
      avatarKey: isTotemUnlocked(t.avatarKey) ? t.avatarKey : STARTING_AVATAR,
      // A Totem still carrying the old default name is carrying the word
      // "totem", not a name somebody chose — nobody types that over the top
      // of a name they wanted. A name of their own is left alone.
      name: t.name === LEGACY_DEFAULT_TOTEM_NAME ? STARTING_TOTEM_KEY : t.name,
      // Life Points were added after some saves were written — give older
      // Totems a full set rather than a destroyed one.
      lifePoints: t.lifePoints ?? totemBalance.startingLifePoints,
      maxLifePoints: t.maxLifePoints ?? totemBalance.startingLifePoints,
      destroyed: t.destroyed ?? false,
      // Tier clears were added after some saves were written. An absent
      // record reads as "nothing cleared", so a save from before the gate
      // existed starts at the first tier like a new one — which is the
      // honest answer, since nothing ever recorded what it had beaten.
      clearedTiers: t.clearedTiers ?? [],
      stats: { ...t.stats, dungeonsFailed: t.stats?.dungeonsFailed ?? 0 },
    })),
    activeTotemId: saved.activeTotemId ?? defaults.activeTotemId,
    settings: { ...defaults.settings, ...saved.settings },
    lastDungeonSelection: { ...defaults.lastDungeonSelection, ...saved.lastDungeonSelection },
    inventory: saved.inventory ?? defaults.inventory,
    // Saves written before this existed have seen nothing recorded, but they
    // have plainly seen the worlds that shipped with them — treat an absent
    // record as "everything current", so upgrading does not announce the
    // whole catalogue.
    seenContent: saved.seenContent ?? defaults.seenContent,
  }
}

export interface PersistentStore extends PersistedData {
  createSpell(input: NewSpellInput): Spell
  /** Creates many Spells in one update (used by batch import). */
  bulkCreateSpells(inputs: NewSpellInput[]): Spell[]
  editSpell(id: string, patch: SpellEditInput): void
  deleteSpell(id: string): void
  replaceSpells(updater: (spells: Spell[]) => Spell[]): void

  createSpellSet(name: string, spellIds?: string[]): SpellSet
  renameSpellSet(id: string, name: string): void
  addSpellToSet(setId: string, spellId: string): void
  removeSpellFromSet(setId: string, spellId: string): void
  deleteSpellSet(id: string): void

  /** Raises a new Totem — its own character, not a reskin of the current one. */
  createTotem(name: string, avatarKey?: string): Totem
  /** Throws the save away and begins again. */
  startNewGame(): void
  /** Swaps a Totem's portrait to any unlocked art the registry offers. */
  setTotemAvatar(totemId: string, avatarKey: string): void
  /** Totems that can still enter a dungeon (not destroyed). */
  usableTotems(): Totem[]
  setActiveTotem(id: string): void
  equipTotemSpellSet(totemId: string, spellSetId: string | null): void
  replaceTotem(id: string, updater: (t: Totem) => Totem): void

  updateSettings(patch: Partial<GameSettings>): void
  /** Records everything currently present as seen, dismissing the notice. */
  acknowledgeNewContent(): void
  setLastDungeonSelection(sel: DungeonSelectionDraft): void

  grantItem(itemId: ItemId, quantity?: number): void
  consumeItem(itemId: ItemId): void
}

export const usePersistentStore = create<PersistentStore>()((set, get) => ({
  ...loadInitial(),

  createSpell(input) {
    let created: Spell | undefined
    set((state) => {
      const spells = addSpell(state.spells, input)
      created = spells[spells.length - 1]
      return { spells }
    })
    return created!
  },
  bulkCreateSpells(inputs) {
    let created: Spell[] = []
    set((state) => {
      let spells = state.spells
      for (const input of inputs) spells = addSpell(spells, input)
      created = spells.slice(spells.length - inputs.length)
      return { spells }
    })
    return created
  },
  editSpell(id, patch) {
    set((state) => ({ spells: editSpell(state.spells, id, patch) }))
  },
  deleteSpell(id) {
    set((state) => ({
      spells: deleteSpell(state.spells, id),
      spellSets: pruneSpellFromAllSets(state.spellSets, id),
    }))
  },
  replaceSpells(updater) {
    set((state) => ({ spells: updater(state.spells) }))
  },

  createSpellSet(name, spellIds = []) {
    let created: SpellSet | undefined
    set((state) => {
      const sets = createSpellSet(state.spellSets, name, spellIds)
      created = sets[sets.length - 1]
      return { spellSets: sets }
    })
    return created!
  },
  renameSpellSet(id, name) {
    set((state) => ({ spellSets: renameSpellSet(state.spellSets, id, name) }))
  },
  addSpellToSet(setId, spellId) {
    set((state) => ({ spellSets: addSpellToSet(state.spellSets, setId, spellId) }))
  },
  removeSpellFromSet(setId, spellId) {
    set((state) => ({ spellSets: removeSpellFromSet(state.spellSets, setId, spellId) }))
  },
  deleteSpellSet(id) {
    set((state) => ({
      spellSets: deleteSpellSet(state.spellSets, id),
      totems: state.totems.map((t) => (t.equippedSpellSetId === id ? { ...t, equippedSpellSetId: null } : t)),
    }))
  },

  createTotem(name, avatarKey) {
    // A locked portrait is refused here as well as hidden in the picker, so
    // the lock is a rule of the save rather than a property of one screen.
    const allowed = !!avatarKey && isTotemUnlocked(avatarKey)
    const totem = createTotem(name, allowed ? avatarKey : STARTING_AVATAR)
    // A newly raised Totem becomes the active one — otherwise a player
    // whose only Totem was destroyed would still have no one to play as.
    set((state) => ({ totems: [...state.totems, totem], activeTotemId: totem.id }))
    return totem
  },
  setTotemAvatar(totemId, avatarKey) {
    if (!isTotemUnlocked(avatarKey)) return
    set((state) => ({
      totems: state.totems.map((t) => (t.id === totemId ? { ...t, avatarKey } : t)),
    }))
  },
  usableTotems() {
    return get().totems.filter(isUsable)
  },
  setActiveTotem(id) {
    // A destroyed Totem can never be selected again.
    const target = get().totems.find((t) => t.id === id)
    if (!target || !isUsable(target)) return
    set({ activeTotemId: id })
  },
  equipTotemSpellSet(totemId, spellSetId) {
    set((state) => ({
      totems: state.totems.map((t) => (t.id === totemId ? equipSpellSet(t, spellSetId) : t)),
      spells: spellSetId ? markEquipped(state.spells, get().spellSets.find((s) => s.id === spellSetId)?.spellIds ?? []) : state.spells,
    }))
  },
  replaceTotem(id, updater) {
    set((state) => ({ totems: state.totems.map((t) => (t.id === id ? updater(t) : t)) }))
  },

  updateSettings(patch) {
    set((state) => ({ settings: { ...state.settings, ...patch } }))
  },

  acknowledgeNewContent() {
    set({ seenContent: markSeen(allWorlds, assetKeys('totems')) })
  },
  setLastDungeonSelection(sel) {
    set({ lastDungeonSelection: sel })
  },

  grantItem(itemId, quantity = 1) {
    set((state) => ({ inventory: addItem(state.inventory, itemId, quantity) }))
  },
  consumeItem(itemId) {
    set((state) => ({ inventory: consumeItem(state.inventory, itemId) }))
  },

  startNewGame() {
    // Everything the save holds, back to how a first launch finds it. The
    // subscription below then writes it out, so the old game is gone from
    // disk as well as from memory — a half-reset that left the old spells on
    // disk would come back on the next load.
    set(defaultData())
  },
}))

/**
 * When the autosave was last written, or null when there is none.
 *
 * The title screen asks this to decide whether "Load Game" has anything to
 * load, and whether starting fresh is about to overwrite something. It is a
 * plain function rather than store state because it is a fact about the
 * disk, not about the game in memory.
 */
export function autosaveTime(): Date | null {
  return persistence.savedAt()
}

// Persist on every change. Simple + adequate for prototype scale.
usePersistentStore.subscribe((state) => {
  const { spells, spellSets, totems, activeTotemId, settings, lastDungeonSelection, inventory, seenContent } = state
  persistence.save({ spells, spellSets, totems, activeTotemId, settings, lastDungeonSelection, inventory, seenContent })
})
