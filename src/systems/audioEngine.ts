/**
 * Sound.
 *
 * Three problems make browser audio feel cursed, and each is designed out
 * here rather than worked around at the call site.
 *
 * 1. Latency. An <audio> element has a load pipeline and a play() that
 *    returns a promise, which puts 50-200 unpredictable milliseconds between
 *    a hit landing and the sound of it. So: decode once into an AudioBuffer,
 *    then start a fresh source node per play. That is sample-accurate, and a
 *    node is cheap enough to throw away every time — which is also what makes
 *    overlapping copies of one sound free, where an element could only ever
 *    play a sound once at a time.
 *
 * 2. Loading. Firing a cue whose buffer has not decoded yet is the other half
 *    of the same bug. Here it is simply silent: play() checks and returns.
 *    Nothing in this file throws, and nothing the game does is ever awaited on
 *    audio — a sound that is missing, slow or broken must never be able to
 *    interrupt a battle.
 *
 * 3. Autoplay. The context starts suspended and needs a real gesture; older
 *    iOS also wants a silent buffer played once before it will co-operate.
 *    unlock() does both, and music asked for before then is remembered and
 *    started when it lands, so the caller never has to know.
 *
 * And one that is specific to this game: it runs offline from file://, where
 * fetch() is blocked. The usual recipe — fetch the url, decode the response —
 * therefore works when hosted and is silent on the phone. Decoding straight
 * from base64 avoids the network layer entirely, so both builds take one path.
 */

import {
  ambientGain,
  ambientBusGain,
  audioPath,
  audioTiming,
  musicGain,
  musicPool,
  sfxSpec,
  type AmbientCue,
  type AudioFolder,
  type MusicCue,
  type SfxCue,
} from '@/config/audio'
import { pickTrack } from './musicPool'

export interface AudioVolumes {
  music: number
  sfx: number
  muted: boolean
}

/** The slice of AudioContext this uses, so a test can supply its own. */
export type AudioContextLike = Pick<
  AudioContext,
  'createGain' | 'createBufferSource' | 'createBuffer' | 'decodeAudioData' | 'currentTime' | 'destination' | 'state' | 'resume'
>

interface Bed {
  source: AudioBufferSourceNode
  gain: GainNode
  cue: string
  /** Everything needed to start this bed a second time. */
  buffer: AudioBuffer
  bus: GainNode
  target: number
  fade: number
  /**
   * Started on a context that was not running yet.
   *
   * Such a bed is *supposed* to begin the moment the context resumes, and on
   * Chromium it does. Safari is not reliable about it — the source is spent
   * and nothing is ever heard — which is why resume() starts these again
   * rather than trusting them.
   */
  cold: boolean
}

/**
 * Half a second of silence, as an mp3.
 *
 * Played on a loop by an <audio> element — never heard, and not there to be
 * heard. On iOS a page that only uses Web Audio is filed under the ambient
 * audio session, which the hardware ring/silent switch mutes: the context
 * runs, the gain is up, samples flow, and the phone plays none of it. That
 * is indistinguishable from a bug from the inside, and it is the usual
 * reason a game is silent on an iPhone and fine everywhere else.
 *
 * An <audio> element playing moves the page to the playback session, which
 * the switch does not mute. It has to be genuinely silent audio rather than
 * something turned down, because iOS ignores volume set from script.
 *
 * The in-app mute is unaffected and still silences everything: this decides
 * which session the page gets, not whether it makes noise.
 */
const SILENCE_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjEuMTAwAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAAWAAAC9QBGRkZGT09PT09YWFhYYWFhYWFpaWlpcnJycnJ7e3t7hISEhISNjY2NlpaWlpaenp6ep6enp6ewsLCwsLm5ubnCwsLCwsrKysrT09PT09zc3Nzl5eXl5e7u7u739/f39/////8AAAAATGF2YzYxLjMuAAAAAAAAAAAAAAAAJAQvAAAAAAAAAvXsYDDCAAAAAAAAAAAAAAAAAP/zEMQAAAADSAAAAABMQU1FMy4xMExBTUUz//MSxA0AAANIAAAAAC4xMDBVVVVVTEFNRTMu//MQxBsAAANIAAAAADEwMFVVVVVMQU1FMy7/8xDEKAAAA0gAAAAAMTAwVVVVVVVVVVVVVf/zEMQ1AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxEIAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDETwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMRcAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxGkAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xLEdgAAA0gAAAAAVVVVVVVVVVVVVVVVVVX/8xDEhAAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMSRAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxJ4AAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDEqwAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMS4AAADSAAAAABVVVVVVVVVVVVVVVVV//MQxMUAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDE0gAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEsTfAAADSAAAAABVVVVVVVVVVVVVVVVVVf/zEMTtAAADSAAAAABVVVVVVVVVVVVVVVVV//MQxPIAAANIAAAAAFVVVVVVVVVVVVVVVVX/8xDE8gAAA0gAAAAAVVVVVVVVVVVVVVVVVf/zEMTyAAADSAAAAABVVVVVVVVVVVVVVVVV'

function inlined(): Record<string, string> | undefined {
  return (globalThis as { __THOTH_INLINE_ASSETS?: Record<string, string> }).__THOTH_INLINE_ASSETS
}

/**
 * base64 -> bytes, without going through fetch().
 *
 * This is the whole reason sound works from a file:// build: a data URI
 * handed to fetch() is a request, and requests from a null origin are
 * refused. Decoding the characters by hand is not.
 */
function bytesFromDataUri(uri: string): ArrayBuffer {
  const binary = atob(uri.slice(uri.indexOf(',') + 1))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * Where a bed should loop, in seconds.
 *
 * mp3 carries encoder delay and padding — a few hundred samples of silence at
 * each end that are an artefact of the format, not the recording. Looping the
 * whole buffer therefore plays that silence every cycle, which on a 4.6-second
 * wind bed is an audible tick roughly every four seconds.
 *
 * So the loop points skip it. Only a little: the trim is capped, because past
 * that a quiet edge is the recording rather than the encoder, and cutting into
 * it would be worse than the tick.
 */
const LOOP_SILENCE = 0.0015 // about -56 dB
/**
 * An mp3's encoder delay is around 1100-2300 samples, so 50 ms covers it with
 * room to spare. It was 250 ms first, and that was wrong: the menu theme
 * fades in, so the trim ate a quarter-second of real music. Past this the
 * quiet is the recording and gets left alone.
 */
const MAX_TRIM_SECONDS = 0.05

export function loopPoints(buffer: AudioBuffer): { start: number; end: number } {
  const whole = { start: 0, end: buffer.duration }
  // Anything unexpected about the buffer costs the trim, not the sound.
  if (typeof buffer.getChannelData !== 'function') return whole
  const data = buffer.getChannelData(0)
  const rate = buffer.sampleRate
  if (!data?.length || !rate) return whole
  const limit = Math.floor(MAX_TRIM_SECONDS * rate)

  let first = 0
  while (first < limit && first < data.length && Math.abs(data[first]) < LOOP_SILENCE) first++

  let last = data.length - 1
  const floor = data.length - 1 - limit
  while (last > floor && last > first && Math.abs(data[last]) < LOOP_SILENCE) last--

  if (first >= last) return whole
  return { start: first / rate, end: (last + 1) / rate }
}

export class AudioEngine {
  private ctx: AudioContextLike | null = null
  private master: GainNode | null = null
  private musicBus: GainNode | null = null
  private ambientBus: GainNode | null = null
  private sfxBus: GainNode | null = null

  private buffers = new Map<string, AudioBuffer>()
  private loading = new Map<string, Promise<AudioBuffer | null>>()
  private lastPlayed = new Map<string, number>()

  private music: Bed | null = null
  private beds = new Map<string, Bed>()
  /** Asked for before the first gesture; started the moment there is one. */
  private pending: { music: MusicCue | null; ambient: AmbientCue[]; worldId: string | null } | null = null
  private worldId: string | null = null
  /**
   * Which alternate is playing for each pooled slot, and which played
   * before it.
   *
   * Held rather than re-rolled, because setMusic('dungeon') is called every
   * time the player comes back out of a battle. Picking again there would
   * change the track mid-run, several times a run — the choice belongs to
   * the run, so it is made once and kept until newRun() throws it away.
   */
  private chosen = new Map<string, string>()
  private previousChoice = new Map<string, string>()
  private volumes: AudioVolumes = { music: 0.7, sfx: 0.9, muted: false }
  /**
   * Whether a real gesture has ever reached unlock().
   *
   * resume() is called from page events too — coming back from the home
   * screen, regaining focus — and those are not gestures. Without this the
   * app would try to start the music as soon as its window was focused,
   * which is both against the autoplay rules and wrong for a title screen
   * that has not been tapped yet.
   */
  private everUnlocked = false
  private duckUntil = 0

  /** The silent loop that keeps iOS on the playback session. */
  private silence: HTMLAudioElement | null = null

  private makeContext: () => AudioContextLike
  private random: () => number

  constructor(makeContext: () => AudioContextLike = () => new AudioContext(), random: () => number = Math.random) {
    this.makeContext = makeContext
    this.random = random
  }

  get unlocked(): boolean {
    return this.ctx !== null && this.ctx.state === 'running'
  }

  /**
   * What the engine is doing, in the terms the sound panel reports it.
   *
   * Exists because "no music on my phone" has two completely different
   * causes that look identical from the outside: the context never
   * started, or it is running perfectly and the device is not letting the
   * sound out. One is a bug here and the other is the ring/silent switch,
   * and nobody can tell which without being told.
   */
  diagnose(): { context: 'none' | AudioContextLike['state']; playing: boolean; session: boolean } {
    return {
      context: this.ctx?.state ?? 'none',
      playing: !!this.music && !this.music.cold && this.ctx?.state === 'running',
      session: this.silence !== null,
    }
  }

  /**
   * Creates the context and the buses. No gesture needed: a context may be
   * built before one, it just starts suspended — and a suspended context
   * still decodes, which is the whole point of warm() below.
   */
  private ensureContext(): boolean {
    if (this.ctx) return true
    try {
      this.ctx = this.makeContext()
    } catch {
      return false // No Web Audio: the game is simply silent.
    }
    this.buildBuses()
    // 'ambient' rather than 'playback'. Both get sound out; the difference
    // is what iOS then thinks the app is. 'playback' means media — it takes
    // over the now-playing slot, puts a banner in the status bar, shows
    // transport controls on the lock screen and stops whatever the player
    // was already listening to. For a study game that is wrong on every
    // count. 'ambient' mixes under their music instead and stays out of the
    // system UI. The cost is that the hardware mute switch now silences the
    // game, which is the normal bargain for game audio.
    // Guarded: this is a young API, and a browser that has the object but
    // rejects the value must not take the whole engine down with it — the
    // session type is a nicety, the sound is not.
    try {
      const session = (navigator as { audioSession?: { type: string } }).audioSession
      if (session) session.type = 'ambient'
    } catch {
      // Left at whatever the browser chose for itself.
    }
    return true
  }

  /**
   * Decode ahead of the gesture.
   *
   * Waiting for the tap to build the context meant waiting for the tap to
   * start decoding, and the menu theme is a two-minute mp3 — so the first
   * thing anyone heard was a second of silence. Decoding does not need
   * permission; only making a sound does. This runs at load, so by the time
   * there is a gesture the buffers are already in memory and resume() is the
   * only work left.
   *
   * Every decode is issued at once. It used to await the music first, on the
   * reasoning that the track playing now matters most — but the menu theme is
   * a two-minute mp3 and the effects are a few hundred milliseconds each, so
   * awaiting it held every effect behind it: measured from a cold load,
   * nothing at all was decoded for 2.3 seconds and then all 26 arrived
   * within 230ms. A player who tapped inside that window got silence, which
   * is the first thing the game does. decodeAudioData is off the main thread,
   * so there was never anything to be gained by serialising them.
   */
  async warm(music: MusicCue | null, sfx: readonly SfxCue[], ambient: readonly AmbientCue[] = []): Promise<void> {
    if (!this.ensureContext()) return
    await Promise.all([
      ...(music ? [this.buffer('music', music)] : []),
      ...sfx.map((c) => this.buffer('sfx', c)),
      ...ambient.map((c) => this.buffer('ambient', c)),
    ])
  }

  /**
   * Call from a real user gesture. Safe to call repeatedly; the work happens
   * once. Sound cannot start until it has run, so anything asked for before
   * the gesture is held in `pending` and started here.
   */
  unlock(): void {
    if (!this.ensureContext()) return
    const ctx = this.ctx!
    this.everUnlocked = true
    this.takePlaybackSession()
    void this.resume()
    // Older iOS needs to have actually played something before it believes
    // the gesture happened.
    try {
      const blip = ctx.createBuffer(1, 1, 22050)
      const source = ctx.createBufferSource()
      source.buffer = blip
      source.connect(ctx.destination)
      source.start(0)
    } catch {
      // Not fatal: resume() alone is enough on everything newer.
    }
    const queued = this.pending
    this.pending = null
    if (queued) {
      this.worldId = queued.worldId
      this.setMusic(queued.music)
      this.setAmbience(queued.ambient)
    }
  }

  /**
   * Starts the silent loop that gets iOS off the ambient audio session —
   * see SILENCE_MP3. Must run inside the gesture, like everything else
   * here, and only ever once.
   *
   * Entirely best-effort. Where there is no <audio> element, or the play is
   * refused, the game is exactly as it was.
   */
  private takePlaybackSession(): void {
    if (this.silence || typeof document === 'undefined' || typeof Audio === 'undefined') return
    try {
      const el = new Audio(SILENCE_MP3)
      el.loop = true
      // Tells iOS not to take the audio fullscreen, which it does for
      // anything it thinks is a video.
      el.setAttribute('playsinline', '')
      el.setAttribute('aria-hidden', 'true')
      this.silence = el
      void el.play().catch(() => {
        // Refused: let it go and leave the session as it was.
        this.silence = null
      })
    } catch {
      this.silence = null
    }
  }

  /**
   * Get the context running again, and make sure something is coming out of
   * it.
   *
   * Two things suspend a context: never having had a gesture, and the OS
   * taking the app away. Coming back from either used to leave the game
   * silent, because restoring the gain of a suspended context restores the
   * gain of a context that is not running. resume() is the missing half, and
   * it is safe to call at any time — on a context already running it does
   * nothing and costs nothing.
   *
   * Beds that were started while suspended are then started again. A bed
   * that has been playing all along is left alone: it simply carries on
   * where the suspend interrupted it, which is what should happen when the
   * player comes back from their home screen.
   *
   * It does nothing at all before the first gesture, because resuming is
   * only ever *re*-starting something the player already started.
   */
  async resume(): Promise<void> {
    if (!this.ctx || !this.everUnlocked) return
    try {
      await this.ctx.resume?.()
    } catch {
      return // Still no gesture, or no audio at all. The next one will do.
    }
    if (this.ctx.state !== 'running') return
    if (this.music?.cold) this.music = this.restart(this.music)
    for (const [cue, bed] of this.beds) {
      if (bed?.cold) this.beds.set(cue, this.restart(bed))
    }
  }

  /** Replaces a bed with a fresh one of the same cue, from the top. */
  private restart(bed: Bed): Bed {
    try {
      bed.source.stop()
    } catch {
      // Never started, or already stopped. Either way it is being replaced.
    }
    bed.gain.disconnect()
    return this.startBed(bed.buffer, bed.cue, bed.bus, bed.target, bed.fade)
  }

  private buildBuses(): void {
    const ctx = this.ctx!
    this.master = ctx.createGain()
    this.master.connect(ctx.destination as AudioNode)
    this.musicBus = ctx.createGain()
    this.ambientBus = ctx.createGain()
    this.sfxBus = ctx.createGain()
    // Ambience hangs off the music bus: it is background, and the player has
    // one slider for background and one for the game making noises at them.
    this.musicBus.connect(this.master)
    this.ambientBus.connect(this.musicBus)
    this.sfxBus.connect(this.master)
    this.applyVolumes()
  }

  setVolumes(v: AudioVolumes): void {
    this.volumes = v
    this.applyVolumes()
  }

  private applyVolumes(): void {
    if (!this.master) return
    this.master.gain.value = this.volumes.muted ? 0 : 1
    this.musicBus!.gain.value = this.volumes.music
    // Ambience hangs off the music bus, so this is a level *under* the
    // player's background slider rather than a second slider.
    this.ambientBus!.gain.value = ambientBusGain
    this.sfxBus!.gain.value = this.volumes.sfx
  }

  /** Warms the cues that have to be instant. Safe to call more than once. */
  async preload(cues: readonly SfxCue[]): Promise<void> {
    await Promise.all(cues.map((c) => this.buffer('sfx', c)))
  }

  private async buffer(folder: AudioFolder, cue: string): Promise<AudioBuffer | null> {
    const path = audioPath(folder, cue, this.worldId)
    if (!path || !this.ctx) return null
    const cached = this.buffers.get(path)
    if (cached) return cached
    const inFlight = this.loading.get(path)
    if (inFlight) return inFlight

    const work = (async () => {
      try {
        const uri = inlined()?.[path]
        const bytes = uri
          ? bytesFromDataUri(uri)
          : await (await fetch(path)).arrayBuffer()
        const decoded = await this.ctx!.decodeAudioData(bytes)
        this.buffers.set(path, decoded)
        return decoded
      } catch {
        // A cue that will not decode stays silent for the session rather than
        // retrying on every play.
        this.buffers.delete(path)
        return null
      } finally {
        this.loading.delete(path)
      }
    })()
    this.loading.set(path, work)
    return work
  }

  /** Fire and forget. Never throws, never awaits, silent if not ready. */
  play(cue: SfxCue): void {
    if (!this.ctx || !this.sfxBus || this.volumes.muted) return
    const spec = sfxSpec(cue)
    const now = this.ctx.currentTime
    const last = this.lastPlayed.get(cue)
    if (last !== undefined && now - last < spec.minInterval) return

    const path = audioPath('sfx', cue, this.worldId)
    if (!path) return
    const buf = this.buffers.get(path)
    if (!buf) {
      // Not decoded yet: start it for next time and stay quiet for this one.
      void this.buffer('sfx', cue)
      return
    }
    this.lastPlayed.set(cue, now)

    const source = this.ctx.createBufferSource()
    source.buffer = buf
    if (spec.detune) source.playbackRate.value = 1 + (this.random() - 0.5) * spec.detune
    const gain = this.ctx.createGain()
    gain.gain.value = spec.gain
    source.connect(gain)
    gain.connect(this.sfxBus)
    source.start()
  }

  /** Dips the beds so a sting lands clear, then brings them back. */
  duck(): void {
    if (!this.ctx || !this.musicBus) return
    const now = this.ctx.currentTime
    const { duckTo, duckSeconds, duckHoldSeconds } = audioTiming
    this.duckUntil = now + duckSeconds + duckHoldSeconds
    const g = this.musicBus.gain
    g.cancelScheduledValues?.(now)
    g.setValueAtTime?.(g.value, now)
    g.linearRampToValueAtTime?.(this.volumes.music * duckTo, now + duckSeconds)
    g.linearRampToValueAtTime?.(this.volumes.music, this.duckUntil)
  }

  /** Which world's music to prefer. Changing it re-resolves the current track. */
  setWorld(worldId: string | null): void {
    if (this.worldId === worldId) return
    this.worldId = worldId
    const playing = this.music?.cue as MusicCue | undefined
    if (playing) {
      const current = this.music
      this.music = null
      this.fadeOut(current)
      this.setMusic(playing)
    }
  }

  /**
   * Forget which alternates are playing, so the next run picks again.
   *
   * Called when a run begins. Anything already playing keeps playing — the
   * menu theme should not restart because a dungeon was configured — and the
   * new choice lands when the dungeon's own track is next asked for.
   */
  newRun(): void {
    for (const [slot, track] of this.chosen) this.previousChoice.set(slot, track)
    this.chosen.clear()
  }

  /**
   * The file-level cue for a slot: the slot itself, or one of its alternates.
   *
   * Everything downstream — decoding, paths, the offline bundle — takes the
   * result as an ordinary cue name, which is why pools needed no change to
   * any of it.
   */
  private track(cue: MusicCue): string {
    const pool = musicPool(cue, this.worldId)
    if (pool.length === 0) return cue
    const held = this.chosen.get(cue)
    if (held && pool.includes(held)) return held
    const picked = pickTrack(pool, this.random, this.previousChoice.get(cue)) ?? cue
    this.chosen.set(cue, picked)
    return picked
  }

  setMusic(cue: MusicCue | null): void {
    // Only queue when there is no context at all. Once there is one — warmed
    // before any gesture — the bed is decoded and started immediately; a
    // source started on a suspended context begins the moment it resumes,
    // which is what makes the music arrive with the tap rather than after it.
    if (!this.ctx) {
      this.pending = { music: cue, ambient: this.pending?.ambient ?? [], worldId: this.worldId }
      return
    }
    // Compared by slot, not by the alternate playing for it: coming back out
    // of a battle asks for 'dungeon' again, and that must not restart the
    // track the run is already on.
    if (this.music?.cue === cue) return
    const outgoing = this.music
    this.music = null
    if (outgoing) this.fadeOut(outgoing)
    if (!cue) return

    const track = this.track(cue)
    void this.buffer('music', track).then((buf) => {
      // Another track may have been asked for while this one decoded.
      if (!buf || !this.ctx || this.music) return
      // The bed is labelled with the slot, so the check above keeps working.
      this.music = this.startBed(buf, cue, this.musicBus!, musicGain[cue] ?? 1, audioTiming.musicFadeSeconds)
    })
  }

  /** The beds that should be playing now. Anything not listed fades out. */
  setAmbience(cues: readonly AmbientCue[]): void {
    if (!this.ctx) {
      this.pending = { music: this.pending?.music ?? null, ambient: [...cues], worldId: this.worldId }
      return
    }
    for (const [cue, bed] of this.beds) {
      if (!cues.includes(cue as AmbientCue)) {
        this.beds.delete(cue)
        this.fadeOut(bed, audioTiming.ambientFadeSeconds)
      }
    }
    for (const cue of cues) {
      if (this.beds.has(cue)) continue
      // Claim the slot now: decoding is async and this could be called again
      // before it finishes, which would otherwise start the bed twice.
      this.beds.set(cue, null as unknown as Bed)
      void this.buffer('ambient', cue).then((buf) => {
        if (!buf || !this.ctx || this.beds.get(cue)) return
        this.beds.set(
          cue,
          this.startBed(buf, cue, this.ambientBus!, ambientGain[cue] ?? 1, audioTiming.ambientFadeSeconds),
        )
      })
    }
  }

  private startBed(buf: AudioBuffer, cue: string, bus: GainNode, target: number, fade: number): Bed {
    const ctx = this.ctx!
    const source = ctx.createBufferSource()
    source.buffer = buf
    source.loop = true
    // Skip the encoder's padding, and begin where the loop begins so the
    // first cycle sounds like every one after it.
    const { start, end } = loopPoints(buf)
    source.loopStart = start
    source.loopEnd = end
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.gain.linearRampToValueAtTime?.(target, ctx.currentTime + fade)
    source.connect(gain)
    gain.connect(bus)
    source.start(0, start)
    return { source, gain, cue, buffer: buf, bus, target, fade, cold: ctx.state !== 'running' }
  }

  private fadeOut(bed: Bed | null, fade = audioTiming.musicFadeSeconds): void {
    if (!bed || !this.ctx) return
    const end = this.ctx.currentTime + fade
    bed.gain.gain.cancelScheduledValues?.(this.ctx.currentTime)
    bed.gain.gain.setValueAtTime?.(bed.gain.gain.value, this.ctx.currentTime)
    bed.gain.gain.linearRampToValueAtTime?.(0, end)
    try {
      bed.source.stop(end)
    } catch {
      // Already stopped; nothing to do.
    }
  }

  /** Everything quiet, for leaving a run or backgrounding the app. */
  stopAll(): void {
    this.fadeOut(this.music)
    this.music = null
    for (const [, bed] of this.beds) this.fadeOut(bed, audioTiming.ambientFadeSeconds)
    this.beds.clear()
  }
}

/** The one the game uses. */
export const audio = new AudioEngine()
