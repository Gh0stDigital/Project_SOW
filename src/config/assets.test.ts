import { describe, it, expect } from 'vitest'
import { assetKeys, framesFor, getAsset, hasAsset, resolveKey } from './assets'
import { assetManifest } from './assetManifest'

// Named against whatever art the folder actually holds. Pinning these to one
// filename made them fail the moment a totem was deleted, which is a thing
// the folder is meant to allow.
const someTotem = assetKeys('totems').find((k) => k !== 'default')!

describe('asset registry', () => {
  it('discovers art from the folder rather than a hand-written list', () => {
    // A portrait was once added to the folder but never registered, so it was
    // invisible to the game. Auto-discovery is what fixes that.
    expect(assetKeys('totems').length).toBeGreaterThan(0)
    for (const key of assetKeys('totems')) expect(hasAsset('totems', key)).toBe(true)
  })

  it('falls back to the placeholder for an unknown key', () => {
    expect(getAsset('totems', 'no_such_totem')).toBe(getAsset('totems', 'default'))
  })

  it('matches keys ignoring case and separators', () => {
    // Art arrives named by hand; a capital letter should not lose an image.
    const canonical = getAsset('totems', someTotem)
    expect(getAsset('totems', someTotem.toLowerCase())).toBe(canonical)
    expect(getAsset('totems', someTotem.toUpperCase().replace(/_/g, '-'))).toBe(canonical)
    expect(hasAsset('totems', someTotem.replace(/_/g, ' '))).toBe(true)
  })

  it('resolveKey takes the first candidate that exists', () => {
    expect(resolveKey('totems', ['no_such_totem', someTotem])).toBe(someTotem)
    expect(resolveKey('totems', ['no_such_totem', 'also_missing'])).toBeNull()
  })

  it('matches the real art regardless of how the key is written', () => {
    // Art arrives named by hand, so case and separators should not lose it.
    expect(resolveKey('totems', [someTotem.toUpperCase()])).toBe(someTotem)
    expect(resolveKey('totems', [someTotem.replace(/_/g, '-')])).toBe(someTotem)
    expect(resolveKey('totems', ['totem_flame'])).toBeNull()
  })

  it('holds no world content now that worlds own it', () => {
    // Locations, events, enemies, NPCs and bosses moved into public/worlds.
    // What is left is art that belongs to no world: a Totem is the player's
    // character and travels between them, and ui/ is the interface itself.
    // Stated as what may not be here rather than as an exact list, so adding
    // another world-independent category is not a test failure.
    const worldOwned = ['locations', 'events', 'enemies', 'npcs', 'bosses', 'traps', 'treasure', 'battlebg']
    for (const category of worldOwned) {
      expect(Object.keys(assetManifest)).not.toContain(category)
    }
  })
})

describe('a totem_ prefix is decoration, not identity', () => {
  // Portraits are named both ways — totem_stone and silverKnight sit in the
  // folder together — and a save holds whatever key it was written with. If
  // the prefix decided identity, renaming a file would quietly cost a player
  // their character's face. Derived from the folder rather than pinned to a
  // filename, so deleting a totem is still allowed.
  const isPrefixed = (key: string) => /^totem/i.test(key.replace(/[^a-z0-9]/gi, ''))
  const prefixed = assetKeys('totems').find(isPrefixed)
  const plain = assetKeys('totems').find((key) => key !== 'default' && !isPrefixed(key))

  it.skipIf(!plain)('finds unprefixed art through a prefixed key', () => {
    expect(getAsset('totems', `totem_${plain}`)).toBe(getAsset('totems', plain!))
    expect(hasAsset('totems', `totem_${plain}`)).toBe(true)
    expect(resolveKey('totems', [`totem_${plain}`])).toBe(plain)
  })

  it.skipIf(!prefixed)('finds prefixed art through a bare key', () => {
    const bare = prefixed!.replace(/^totem[_-]?/i, '')
    expect(getAsset('totems', bare)).toBe(getAsset('totems', prefixed!))
    expect(resolveKey('totems', [bare])).toBe(prefixed)
  })

  it('lets an exact spelling outrank another key stripped of its prefix', () => {
    // Both spellings can be present at once; whichever is asked for by name
    // is the one that answers.
    for (const key of assetKeys('totems')) expect(resolveKey('totems', [key])).toBe(key)
  })

  it('still falls back when the name matches with or without the prefix', () => {
    expect(getAsset('totems', 'totem_no_such_totem')).toBe(getAsset('totems', 'default'))
    expect(hasAsset('totems', 'totem_no_such_totem')).toBe(false)
  })
})

describe('a folder without a `default` still answers', () => {
  // default.webp was renamed to Dolbae.webp — the placeholder turned out to
  // be a character. Every save still names `default` as its portrait, so an
  // unknown key has to land on real art rather than on nothing.
  it('falls back to a real portrait when there is no default', () => {
    const resolved = getAsset('totems', 'no_such_totem')
    expect(resolved).toBeTruthy()
    const real = assetKeys('totems').map((key) => getAsset('totems', key))
    expect(real).toContain(resolved)
  })

  it('resolves the key every save was written with', () => {
    // Not a placeholder and not empty: whatever `default` means now, asking
    // for it gets a portrait.
    expect(getAsset('totems', 'default')).toBe(getAsset('totems', 'no_such_totem'))
    expect(getAsset('totems', 'default')).toBeTruthy()
  })
})

describe('art that has been renamed', () => {
  // A portrait is the one thing a player would notice losing, and these
  // files get renamed between builds — SilverFinal became Silver Knight.
  it('finds a portrait under the name a save was written with', () => {
    const current = getAsset('totems', 'Silver Knight')
    expect(hasAsset('totems', 'SilverFinal')).toBe(true)
    expect(getAsset('totems', 'SilverFinal')).toBe(current)
    expect(resolveKey('totems', ['SilverFinal'])).toBe('Silver Knight')
  })

  it('still falls back for a name that was never used', () => {
    expect(hasAsset('totems', 'NeverExisted')).toBe(false)
  })
})

describe('art stored as a folder of frames', () => {
  it('lists an animated portrait as one ordinary key', () => {
    // Solomon is `totems/Solomon.anim/`, several files. The rest of the
    // game must never have to know that.
    expect(assetKeys('totems')).toContain('Solomon')
    expect(hasAsset('totems', 'Solomon')).toBe(true)
  })

  it('gives every frame, in order', () => {
    const frames = framesFor('totems', 'Solomon')
    expect(frames.length).toBeGreaterThan(1)
    expect(frames[0]).toContain('Solomon.anim/0')
    expect(frames[1]).toContain('Solomon.anim/1')
  })

  it('makes the still image the first frame, so the two cannot drift apart', () => {
    // Anything that has never heard of animation draws getAsset() and gets
    // a real picture of the character rather than a fallback.
    expect(getAsset('totems', 'Solomon')).toBe(framesFor('totems', 'Solomon')[0])
  })

  it('answers with nothing for art that is a single picture', () => {
    const still = assetKeys('totems').find((k) => k !== 'Solomon' && k !== 'default')!
    expect(framesFor('totems', still)).toEqual([])
  })

  it('answers with nothing for a key it does not have', () => {
    expect(framesFor('totems', 'no-such-totem')).toEqual([])
    expect(framesFor('totems', '')).toEqual([])
    expect(framesFor('totems', null)).toEqual([])
  })

  it('finds frames through the same loose matching as the still', () => {
    // Keys arrive from saves spelled however they were written.
    expect(framesFor('totems', 'solomon').length).toBeGreaterThan(1)
  })
})
