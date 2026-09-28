import { useEffect, useRef } from 'react'
import { audio } from '@/systems/audioEngine'
import { useDungeonStore } from '@/state/dungeonStore'
import { usePersistentStore } from '@/state/persistentStore'
import { useUiStore } from '@/state/uiStore'
import { useTransitionStore } from '@/state/transitionStore'
import type { MusicCue, AmbientCue } from '@/config/audio'

/**
 * Turns what the game is doing into what the game sounds like.
 *
 * All of it lives here rather than in the stores. The stores stay about
 * rules, this stays about sound, and the whole mapping — which track plays
 * when, which sting fires on which transition — can be read in one file
 * instead of being scattered across thirty call sites.
 *
 * Everything is edge-triggered off state the game already keeps, so nothing
 * needed a new field to make a noise.
 */

const ambienceFor = (state: string | undefined): AmbientCue[] => {
  if (!state) return []
  if (state === 'Rest') return ['drip']
  if (state === 'Battle' || state === 'BossBattle') return []
  return ['wind', 'drip']
}

function musicFor(screen: string, state: string | undefined): MusicCue | null {
  // The menu theme covers everything outside a run. Letting it stop on the
  // Compendium meant silence while you worked, and a track that restarted
  // from the top every time you came back.
  if (screen !== 'dungeon') return 'menu'
  switch (state) {
    case undefined:
    case 'DungeonSetup':
      return 'menu'
    case 'Battle':
      return 'battle'
    case 'BossBattle':
      return 'boss'
    case 'Rest':
      return 'rest'
    case 'Results':
    case 'Defeat':
      return 'results'
    default:
      return 'dungeon'
  }
}

export function useSoundtrack(): void {
  const screen = useUiStore((s) => s.screen)
  const opening = useUiStore((s) => s.opening)
  const run = useDungeonStore((s) => s.run)
  const battle = useDungeonStore((s) => s.battle)
  const totems = usePersistentStore((s) => s.totems)
  const money = usePersistentStore((s) => s.money)
  const phase = useTransitionStore((s) => s.phase)
  const lastOutcome = useDungeonStore((s) => s.lastOutcome)

  const totem = totems.find((t) => t.id === run?.config.totemId)
  const previous = useRef({
    state: undefined as string | undefined,
    phase: undefined as string | undefined,
    enemyHp: 0,
    totemHp: 0,
    level: 0,
    money: 0,
    keyFound: false,
    bossDoorFound: false,
    lastResult: null as string | null,
    eventId: null as string | null,
    outcomeNonce: 0,
  })

  // ---- Beds -------------------------------------------------------------
  useEffect(() => {
    audio.setWorld(run?.config.worldId ?? null)
  }, [run?.config.worldId])

  // A new run rolls for its music.
  //
  // Keyed on the config object rather than on a new field: it is built once
  // when the run is set up and carried by reference through every state
  // update after it, so a change of identity here means a different run and
  // nothing else does. Leaving a run and starting another therefore picks
  // again, while walking around inside one does not.
  const config = run?.config
  useEffect(() => {
    if (config) audio.newRun()
  }, [config])

  // Music waits for the curtain.
  //
  // A track starting at the same instant as the screen goes black is the
  // thing that made entering a dungeon feel abrupt: the sting, the old theme
  // and the new theme all landed together. So the bed stops as the curtain
  // covers, and the next one only starts once the reveal has finished and
  // the phase is idle again. Nothing here needs to know *which* transition
  // is running — only whether one is.
  useEffect(() => {
    // Read live rather than from the closure. A battle starting sets the
    // curtain in a layout effect and the run state in the same commit, so
    // the `phase` this effect closed over is still 'idle' on exactly the
    // tick that matters — and the battle bed would start for one frame
    // before being stopped again.
    // Nothing plays under the opening. `screen` says 'menu' from the first
    // frame — the sequence is an overlay, not a screen — so without this the
    // theme starts while the book is still shut, and the tap that is meant to
    // begin the game lands on a track already playing.
    if (opening) {
      audio.setMusic(null)
      return
    }
    const current = useTransitionStore.getState().phase
    if (current === 'covering' || current === 'covered') {
      audio.setMusic(null)
      return
    }
    if (current !== 'idle') return
    audio.setMusic(musicFor(screen, run?.state))
  }, [screen, run?.state, phase, opening])

  useEffect(() => {
    audio.setAmbience(!opening && screen === 'dungeon' ? ambienceFor(run?.state) : [])
  }, [screen, run?.state, opening])

  // ---- Stings -----------------------------------------------------------
  useEffect(() => {
    const p = previous.current
    const state = run?.state

    if (state !== p.state) {
      if (state === 'Battle' || state === 'BossBattle') {
        audio.play(state === 'BossBattle' ? 'bossDoor' : 'battleStart')
        audio.duck()
      }
      if (state === 'Rolling') audio.play('diceRoll')
      if (state === 'Defeat') { audio.play('defeat'); audio.duck() }
      if (state === 'Results') { audio.play('victory'); audio.duck() }
      p.state = state
    }

    // A hit is a drop in someone's health, whoever took it.
    const enemyHp = battle?.enemy.currentHp ?? 0
    if (battle && enemyHp < p.enemyHp) audio.play('damage')
    p.enemyHp = enemyHp

    const totemHp = totem?.currentHp ?? 0
    if (totem && totemHp < p.totemHp) audio.play('damage')
    p.totemHp = totemHp

    if (battle?.phase !== p.phase) {
      if (battle?.phase === 'enemy_challenge') audio.play('enemyAttack')
      if (battle?.phase === 'player_resolve') audio.play('playerAttack')
      p.phase = battle?.phase
    }

    if (battle?.lastResult && battle.lastResult !== p.lastResult) {
      audio.play(battle.lastResult === 'correct' ? 'correct' : 'wrong')
    }
    p.lastResult = battle?.lastResult ?? null

    if (totem && totem.level > p.level && p.level > 0) { audio.play('levelUp'); audio.duck() }
    p.level = totem?.level ?? 0

    // The purse is the player's, so the sting follows the save rather than
    // whichever Totem happens to be out.
    if (money > p.money && p.money > 0) audio.play('reward')
    p.money = money

    // What the player has just walked into, announced the moment it is on
    // screen rather than when they finish dealing with it. Waiting for the
    // outcome meant a find was heard several taps after it was seen.
    const eventId = run?.currentEvent?.id ?? null
    if (eventId && eventId !== p.eventId) {
      const type = run?.currentEvent?.type
      if (type === 'battle') audio.play('enemyAppear')
      if (type === 'trap') audio.play('trapTrigger')
      // A chest and the key are both finds; the door is the way out.
      if (type === 'treasure' || type === 'key_room' || type === 'boss_door') audio.play('discovery')
      p.eventId = eventId
    }

    // Chests and traps resolve into the same state whether they went well or
    // badly, so the store says which out loud.
    if (lastOutcome && lastOutcome.nonce !== p.outcomeNonce) {
      if (lastOutcome.kind === 'chest_opened') audio.play('chestOpen')
      if (lastOutcome.kind === 'chest_failed') {
        // The lid shutting, then the mistake. Staggered, because the two
        // landing on the same millisecond is one muddy noise rather than a
        // chest closing and an answer being wrong.
        audio.play('cancel')
        setTimeout(() => audio.play('wrong'), 180)
      }
      // The device was already heard arming itself when the trap appeared;
      // springing it is the wrong answer, and the hit that follows.
      if (lastOutcome.kind === 'trap_sprung') audio.play('wrong')
      if (lastOutcome.kind === 'trap_avoided') audio.play('correct')
      p.outcomeNonce = lastOutcome.nonce
    }

    // Picking the key up and marking the door are the tail of events that
    // already announced themselves above, so they stay silent rather than
    // firing a second discovery a few taps later.
    p.keyFound = run?.keyFound ?? false
    p.bossDoorFound = run?.bossDoorFound ?? false
  }, [run, battle, totem, money, lastOutcome])
}
