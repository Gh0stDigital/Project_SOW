// Which files count as art, and how a filename becomes a slot name.
//
// Art arrives as PNG and is converted to WebP by scripts/optimize-art.mjs,
// so both formats are in play at once: a world someone has just dropped in
// is PNG until it is optimized, while the worlds shipped here are WebP. The
// slot name is the filename without its extension either way, so the format
// an image happens to be stored in never reaches the game's vocabulary —
// only this module knows about extensions at all.
//
// Case is not part of the vocabulary either. `Key.png` fills the `key` slot,
// because art is named by hand and a capital letter is not worth a missing
// image — the same rule config/assets.ts already applies to global art. The
// slot is reported under its canonical spelling and the real filename is
// carried alongside it, since a case-sensitive host serves `Key.png` and
// `key.png` as different files.

import { existsSync, readdirSync, statSync } from 'node:fs'
import { extname, join } from 'node:path'

/**
 * A folder of frames, rather than a single picture.
 *
 * `Solomon.anim/` beside the other portraits is one slot called Solomon
 * whose art happens to be several files. The suffix is on the folder and
 * not on the frames so that the slot name stays the artist's filename —
 * naming the folder is the whole of declaring an animation, which keeps
 * the rule this module exists for: dropping art in is the only step.
 *
 * Frames play in filename order, so they are numbered: 0, 1, 2.
 */
export const ANIM_SUFFIX = '.anim'

/** The frames inside an `.anim` folder, in order, as filenames. */
function framesIn(dir, folder, exts) {
  return readdirSync(join(dir, folder))
    .filter((f) => exts.includes(extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((f) => `${folder}/${f}`)
}

/** Formats a browser will draw, in the order the optimizer prefers them. */
export const ART_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg']

/**
 * Formats a browser will decode, best first. Placeholder tones are written as
 * WAV because it needs no encoder; real audio arrives compressed.
 */
export const AUDIO_EXTENSIONS = ['.m4a', '.mp3', '.ogg', '.webm', '.wav']

export function isArtFile(file) {
  return ART_EXTENSIONS.includes(extname(file).toLowerCase())
}

const fold = (name) => name.toLowerCase()

/**
 * Every art file in a folder as `{ slot, file, ext }`, sorted by slot.
 *
 * `canonical` names the slots this folder is supposed to fill; a file whose
 * name matches one of them apart from case is reported under the canonical
 * spelling. Folders whose filenames are the content — npcs, enemies — pass
 * nothing and keep their names exactly as they are.
 *
 * One slot cannot be two files. If a folder holds both `key.png` and
 * `Key.webp`, ART_EXTENSIONS order decides and the loser is returned in
 * `collisions` so the generator can say so rather than silently dropping it.
 */
export function artIn(dir, canonical = [], exts = ART_EXTENSIONS) {
  if (!existsSync(dir)) return []
  const canonicalBy = new Map(canonical.map((slot) => [fold(slot), slot]))
  const bySlot = new Map()
  const collisions = []

  for (const file of readdirSync(dir).sort()) {
    // A folder of frames. Reported as its own slot, with the first frame as
    // the file every existing caller already knows how to draw — so art
    // that gains an animation keeps working everywhere that does not know
    // about animation at all.
    if (file.endsWith(ANIM_SUFFIX) && statSync(join(dir, file)).isDirectory()) {
      const frames = framesIn(dir, file, exts)
      if (frames.length === 0) continue
      const name = file.slice(0, -ANIM_SUFFIX.length)
      const slot = canonicalBy.get(fold(name)) ?? name
      const first = frames[0]
      bySlot.set(slot, {
        slot,
        file: first,
        ext: extname(first).toLowerCase().slice(1),
        rank: -1,
        frames,
      })
      continue
    }
    const ext = extname(file).toLowerCase()
    if (!exts.includes(ext)) continue
    const name = file.slice(0, -ext.length)
    const slot = canonicalBy.get(fold(name)) ?? name
    const entry = { slot, file, ext: ext.slice(1), rank: exts.indexOf(ext) }
    const seen = bySlot.get(slot)
    if (!seen) {
      bySlot.set(slot, entry)
    } else if (entry.rank < seen.rank) {
      bySlot.set(slot, entry)
      collisions.push({ slot, ignored: seen.file, used: entry.file })
    } else {
      collisions.push({ slot, ignored: entry.file, used: seen.file })
    }
  }

  const out = [...bySlot.values()]
    .map(({ slot, file, ext, frames }) => (frames ? { slot, file, ext, frames } : { slot, file, ext }))
    .sort((a, b) => a.slot.localeCompare(b.slot))
  out.collisions = collisions
  return out
}

/** A folder's art as a `{ "<prefix><slot>": filename }` table for a manifest. */
export function fileTable(entries, prefix = '') {
  return Object.fromEntries(entries.map(({ slot, file }) => [`${prefix}${slot}`, file]))
}

/** The same, for the slots that have more than one frame. */
export function frameTable(entries, prefix = '') {
  return Object.fromEntries(
    entries.filter((e) => e.frames?.length > 1).map(({ slot, frames }) => [`${prefix}${slot}`, frames]),
  )
}

/** Path to a folder's art for one slot, ignoring case, or null. */
export function artPath(dir, slot, exts = ART_EXTENSIONS) {
  if (!existsSync(dir)) return null
  const want = fold(slot)
  for (const ext of exts) {
    for (const file of readdirSync(dir)) {
      if (extname(file).toLowerCase() !== ext) continue
      if (fold(file.slice(0, -ext.length)) === want) return join(dir, file)
    }
  }
  return null
}
