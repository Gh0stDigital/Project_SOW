# Sound of Worlds

A lightweight, offline, portrait-mobile dungeon-crawling language-study RPG prototype, built for the
iPhone 14 Pro Max viewport (~430×932 CSS px) and responsive down to smaller phones.

Create vocabulary **Spellwords** → group them into **Spell Sets** → equip a set to your **Totem** →
configure a **Dungeon** → explore from a **Standby** hub, moving one turn at a time into weighted
random events (treasure, traps, magic rooms, rest areas, battles, direction forks) → answer
vocabulary prompts by assembling syllable tiles → find the **Boss Door** and the **Key** → break the
boss **Barrier** by using every word correctly → defeat the boss → review your **Results** and
long-term **Records**.

A run ends in exactly one of three ways: the boss falls, the Totem's HP hits 0 (costing one **Life
Point** — at zero the Totem is destroyed for good), or the player walks out.

No accounts, no network calls, no cloud sync — everything runs and saves locally in the browser.

## Running it

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
npm run preview   # serve the production build locally
npm test          # unit tests
```

## Playing it offline

The game never talks to a server, but *loading* it still has to work with no
network at all. `npm run build` therefore emits three ways to launch it, and
each is verified to boot and play with the network hard-blocked:

| What | Use it when |
| --- | --- |
| `dist/index.html` | You can copy the whole `dist/` folder. Open the file directly — no server needed. Code is inlined; art sits alongside as ordinary files. |
| `dist/thoth-offline.html` | You want **one file**. Every image is embedded as a data URI, so it cannot lose its art (~10 MB). Mail it to yourself, drop it on a USB stick, open it anywhere. |
| `dist/sw.js` | The build is *hosted* over http(s), or added to a phone's home screen. The service worker precaches the whole app on first visit, so later launches never touch the network. |

Two things make the from-disk cases work, and both are load-bearing:

- **`vite.config.ts` builds an IIFE, not an ES module.** Module scripts are
  CORS-checked, and a page opened over `file://` has a null origin — so a
  `type="module"` build is blocked outright and the app never boots. This was
  the actual cause of "it won't open without internet": a blank page and a CORS
  error in the console.
- **`scripts/bundle-offline.mjs` inlines that bundle** into the HTML as a plain
  `<script>` at the end of `<body>`, so there is no separate file left to fetch
  and nothing left to block.

### If it opens to a white screen

The build no longer fails silently. Whatever you see tells you what happened:

| On screen | Meaning |
| --- | --- |
| The game | Working. |
| *"JavaScript is turned off"* | The page rendered but scripting is disabled. **On iPhone this is what the Files app preview looks like** — it displays HTML but does not run JavaScript, so a JS app can never start there. Open the file in a real browser instead. |
| *"Starting Thoth…"*, stuck | The page loaded but the bundle never executed. |
| *"Thoth could not start"* + an error | The bundle ran and threw. The error text is on screen — that's the thing to report. |
| Genuinely blank | The file itself didn't load. Check it downloaded completely (it's ~10 MB). |

The iPhone Files-app preview is the common one, and it is a limitation of that
preview, not of the build. `<noscript>`, a boot placeholder and a global error
handler live in `index.html` ahead of the bundle so that none of these states
can present as an unexplained white page.

On a phone, the single-file `thoth-offline.html` is the most reliable option —
*provided it is opened in something that runs JavaScript*. Adding a hosted copy
to the home screen is the most dependable route of all, but it has to be opened
online once so the service worker can precache.

## Art

Every image under `public/assets/<category>/` is registered automatically —
`scripts/gen-asset-manifest.mjs` scans the folder and writes
`src/config/assetManifest.ts`. **Dropping a file in is the whole job.** The
generator runs by itself when the dev server starts, whenever art is added or
removed while it is running, and at the start of every build, so a new totem
is offered in game without any command to remember. `npm run gen:assets` still
runs it by hand.

A browser cannot list a directory, so this cannot happen at runtime in a built
app — the catalogue has to be baked in when the app is built. What is
automatic is the generation, not a live filesystem scan: a hosted or offline
build only gains new art on the next build.

`assetManifest.ts` is generated *and* committed, so it can go stale if art is
committed without it. `src/config/assetManifest.test.ts` compares it against
the files on disk and fails if they diverge — that mismatch has shipped twice,
each time as a portrait sitting in the folder that the game never offered.

Placeholders are generated for any slot that has no file yet, and are never
overwritten — committing real artwork over one is permanent.

### Keeping the art small

Art arrives as full-size lossless PNG — around 3 MB for one backdrop. The game
draws all of it into a 430 px-wide phone viewport and the single-file offline
build inlines every image as base64, so 72 MB of PNG became a 98 MB HTML file
that a phone could not be relied on to open.

```
npm run optimize:art              re-encode everything under public/ as WebP
npm run optimize:art -- --dry-run  report what it would save, write nothing
```

It caps width at 1290 px (430 CSS px × a 3× screen — past that is detail the
phone has no room for), encodes at WebP q88 with lossless alpha, and keeps the
original whenever WebP would be bigger, which happens on small flat
placeholders. Running it twice is a no-op.

**Art is committed already optimized, so this is not part of the build.** It
is a one-off to run over anything new — nothing breaks if you forget, the
files are just larger than they need to be. Both manifests record the
extension of each file, so a world dropped in as PNG plays exactly the same as
the optimized ones, and the two can sit side by side.

## The installed app

Added to a home screen, the game is called **Sound of Worlds** and wears the
book icon. Three places have to agree, because no single one of them covers
every platform:

- `index.html` — `<title>`, `apple-mobile-web-app-title` (what iOS writes
  under the icon; without it the full title is used and truncated), and
  `rel="apple-touch-icon"`. iOS ignores the manifest's icons when something
  is added to the home screen and reads that link instead, so leaving it out
  is what gets you a screenshot of the page as the icon. It must be a PNG.
- `public/manifest.webmanifest` — the name and icons Android and desktop
  Chrome install from.
- `scripts/bundle-offline.mjs` — inlines the icons as data URIs for the
  single-file build, and precaches them in the service worker.

`node scripts/gen-icons.mjs [source]` cuts all five sizes from
`icons/master.webp`. The master sits outside `public/` because it is the
source, not something a player should download.

The icons are written **fully opaque, with no rounded corners of their own**.
The operating system applies its own mask and composites transparency onto
black first, so art with a 23% corner radius — which the master has — comes
back with black wedges at every corner. The generator fills the corners with
a blurred, darkened copy of the art instead, so whatever survives the mask
still matches the picture. The separate `maskable` icon keeps the book inside
the middle 80%, which is all Android guarantees to show.

## Sound

Every cue is a file under `public/audio/`, named after the cue. Dropping one
in replaces the stand-in tone that is there now — same contract as the art.

```
public/audio/
  music/      menu  dungeon  battle  boss  rest  results
  ambient/    wind  drip  night          looping beds, layered under the music
  sfx/        damage playerAttack enemyAttack battleStart enemyAppear
              victory defeat correct wrong trapTrigger chestOpen discovery
              shrine bossDoor reward npcTalk move diceRoll confirm cancel
              itemUse levelUp
  music/<slot>/                        a folder of alternates for that slot
public/worlds/<id>/music/   dungeon  battle  boss   optional, overrides the above
```

A world may ship its own dungeon, battle or boss music; anything it does not
ship falls back to the global track. A cue with no file is silent, not broken.

### One slot, several tracks

A music slot can be a folder instead of a file. `music/dungeon.mp3` is one
dungeon theme; `music/dungeon/` is a set of them, and a run picks one at
random when it starts and keeps it for that whole run — through every battle
and back out again, so the music never changes under the player. The next run
picks again, never the track that just played.

Any number of files, any names: nothing lists them, the folder is scanned.
The single `music/<slot>.mp3` stays the fallback for when the folder is
empty, which is how every slot behaves today. A world can ship its own set at
`public/worlds/<id>/music/<slot>/`, which wins over the global folder for
runs in that world.

`src/systems/musicPool.ts` decides which track; `public/audio/music/dungeon/`
has the same notes in it for whoever opens the folder first.

`scripts/gen-audio-placeholders.mjs` writes a plain synthesised tone for any
cue with no file yet, so the whole chain can be heard and checked before real
audio exists. It never overwrites a real file, so replacing a tone is
permanent.

### Ship mp3, and run the optimizer

```
npm run optimize:audio                re-encode anything above target
npm run optimize:audio -- --dry-run   report, write nothing
npm run optimize:audio -- --music 128 a different music bitrate
```

Two reasons, both about the phone.

**Format.** Every browser on iOS is WebKit, and WebKit only learned to decode
Ogg Vorbis in Safari 17.4 — so an `.ogg` is silence on an older iPhone with
nothing in the console to explain it. mp3 decodes anywhere Web Audio exists at
all. The optimizer converts to mp3 whatever you drop in.

**Size.** The single-file build inlines every sound as base64. Music arriving
at 256-287 kb/s stereo took that build from 29 MB to 57 MB; re-encoded to
112 kb/s mono it is 40 MB. That bitrate is chosen for a loop under a game on a
phone speaker, not for headphones — raise it with `--music` if you disagree,
and note the originals are in git either way.

Ambience is targeted lower still (80 kb/s) because it arrives as 64 kb/s
Vorbis, which is *more* efficient than mp3 at that end: matching its bitrate
would make the files bigger.

One consequence of mp3 worth knowing: the format adds a few hundred samples of
silence at each end, so looping a bed plays that gap every cycle — audible on a
short one. The engine measures each bed's real edges and sets its loop points
inside them, capped at 50 ms so a genuine fade-in is never cut into.

### How it avoids the usual problems

- **No latency.** Every cue is decoded once into an `AudioBuffer`; playing it
  starts a fresh source node. `<audio>` elements and `play()` are not used
  anywhere — that is where the 50-200ms of lag in most web games comes from.
- **Overlap is free.** A node per play off one shared buffer, so five hits can
  ring at once. Repeats get a small random pitch spread and a minimum gap so
  they do not machine-gun or stack into one click.
- **Nothing waits on sound.** `play()` never throws and is never awaited. A
  cue whose file is missing, still decoding or undecodable is silent, and the
  game does not notice.
- **It works offline.** `fetch()` is blocked at `file://`, so the usual
  fetch-then-decode recipe gives sound when hosted and silence on the phone.
  Audio is inlined like the art and decoded straight from base64, which is one
  code path for both builds.
- **Autoplay.** The context is created and resumed on the first real gesture,
  with a silent buffer played once for older iOS. Music asked for before then
  is remembered and started when the gesture arrives.

`src/config/audio.ts` is where a cue's level, minimum gap and pitch spread
live — the file to edit when something is too loud or too eager.
`src/ui/hooks/useSoundtrack.ts` is the whole map from game state to sound.

### Unwritten Worlds — adding a world

A world is a folder of art under `public/worlds/`. Drop one in and it is
compiled, checked and offered automatically: the dev server picks it up while
running, and a build can never ship a world the game does not know about.
There is no code to write and no list to register it in.

```
public/worlds/<your-world-id>/
  world.json            optional: { "name": "...", "description": "..." }
  locations/            10 required
    entrance  corridor1  corridor2  keyRoom  restRoom
    pathwayFork  shrineRoom  treasureRoom  trapRoom  bossRoom
    battle  battle2      optional extra arenas
  events/               10 required
    bossDoor  roadSign  key  trap1  trap2
    treasureLocked  treasureOpened  treasureMimic  rest  shrineDoor
  npcs/                 at least 3 — filenames become their names
  enemies/              at least 4 — filenames become their names
  bosses/               optional; without it the boss borrows an enemy
```

Files are named as above, but neither the extension nor the capitalisation
has to match: `.png`, `.jpg` and `.webp` all work, and `Key.png` fills the
`key` slot. Art gets named by hand, and a capital letter is not worth a
missing image. The real filename is recorded in the manifest, so a
case-sensitive host still serves the right file. Two files claiming one slot
(`key.png` beside `Key.webp`) is reported rather than silently resolved.

Free-form folders are the exception: an npc or enemy filename *is* its name,
so `Man-Eater.webp` stays `Man-Eater`.

A world is **playable only
when every required slot is present**; until then it is listed on the dungeon
setup screen with precisely what it still needs, and the dev server prints the
same list. That is deliberate — an unfinished world should read as work in
progress, never as a bug.

When a finished world or a new Totem appears, the main menu announces it once
and remembers that it did.

Totems and Spell card art stay global in `public/assets/`, since a Totem is
the player's character rather than world content and can enter any world.

Slot names are how the game addresses art, so `config/scenes.ts` maps a
situation (a trap, a rest, the boss door) to a slot and the chosen world
supplies the picture. Adding a world needs no change there.

> **The one limit.** A browser cannot list a directory, so this is compiled at
> build time rather than scanned at runtime. Everything is automatic on the
> developer's side; a deployed copy still only gains a new world on its next
> build.

## Project structure

Gameplay logic is kept independent of presentation wherever practical:

```
src/
  config/       Balance formulas & tunable constants (balance.ts), dungeon
                event weights / Direction modifiers / per-event balance
                (dungeonEvents.ts), item catalog + drop rates (items.ts),
                local asset registry with placeholder fallback (assets.ts) —
                no numeric constant lives inside a component or system.
  domain/       Plain data types: Spell, SpellSet, Totem, DungeonConfig/Run,
                Challenge, Battle (deck/plateau/timer), Settings.
  systems/      Pure, UI-free logic modules:
                  spellFactory / spellProgression / spellCompendium — Spell
                    CRUD, leveling, charge, damage & reward formulas.
                  spellSetManager, totemManager — Set & Totem CRUD.
                  deck.ts — battle-deck ordering (Spell IDs only, no vocab).
                  answerChecker.ts — normalized answer comparison, no AI.
                  eventGenerator.ts — weighted random events, anti-repeat.
                  eventContent.ts — static per-event-type flavor/asset data.
                  challengeEngine.ts — prompt generation + grading.
                  dungeonState.ts — the dungeon state machine: which states
                    exist and which transitions are legal. The single
                    authority on what the player may do right now.
                  dungeonSession.ts — run orchestration: turns, events,
                    modifiers, key/door tracking, rewards, run stats.
                  directionModifiers.ts — temporary Direction weight biases
                    (add / tick / expire / apply, floored at 0).
                  wordStats.ts — per-run vocabulary tracking, separate from
                    a Spell's lifetime counters.
                  hangman.ts — the Magic Room syllable puzzle.
                  restArea.ts — rest healing, price curve, affordability.
                  runResults.ts — builds the end-of-run report (derives
                    only; grants nothing).
                  battleEngine.ts — turn-based attack/defense state machine,
                    multi-prompt enemy attacks, mimics, barrier access.
                  bossPlateau.ts — boss Barrier requirement tracking.
                  totemManager.ts — Totem CRUD, HP, and Life Points.
                  records.ts — Records screen sort/filter selectors.
                  persistence.ts — storage abstraction (swap the adapter to
                    change where saves live) + versioned save/load.
                  offlineCache.ts — registers the service worker when the app
                    is served over http(s); a no-op from disk.
  state/        Zustand stores that call into systems/ and hold state:
                  persistentStore.ts — Compendium, Sets, Totems, Settings
                    (autosaved to localStorage via systems/persistence.ts).
                  dungeonStore.ts — transient dungeon run + battle state.
                  uiStore.ts — top-level screen navigation.
  ui/
    components/ Shared presentational components (SpellCard, Bar, TypewriterText,
                TotemPanel, ProgressMeter, AssetImage, SlidePanel, TopBar).
    screens/    MainMenu, Compendium, Totem, Workshop, Records, and Dungeon —
                Workshop is the blacksmith's: one counter sells the materials
                and treasures a run brought home, the other forges Totems
                from them (recipes in config/forging.ts).
                DungeonScreen routes to config / ExploreView / BattleView /
                ResultsView; ExploreView in turn renders whichever event
                view the run's state calls for (StandbyActions,
                MagicRoomView, RestAreaView, EventActionViews).
    styles/     Single global stylesheet (dark theme, system fonts only —
                no network font loads).
scripts/
  bundle-offline.mjs     Post-build step: inlines the JS bundle into
                         dist/index.html as a classic script, emits the
                         all-in-one dist/thoth-offline.html, and generates
                         dist/sw.js. Runs as part of `npm run build`.
  worldSlots.mjs         The pack format itself — which slots a world must
                         fill to be playable. The one place to change it.
  artFiles.mjs           Which files count as art and how a filename becomes
                         a slot name; the only code that knows about image
                         extensions at all.
  gen-asset-manifest.mjs Scans public/assets and writes
                         src/config/assetManifest.ts.
  gen-world-manifest.mjs Scans public/worlds, validates each pack against
                         worldSlots.mjs, and writes
                         src/config/worldManifest.ts. Both generators run on
                         dev-server start, on every add or removal while it
                         runs, and at the start of a build.
  gen-icons.mjs          Cuts the home-screen icons in public/ from
                         icons/master.webp. Run by hand, not by the build —
                         see "The installed app" below.
  gen-placeholders.mjs   Fills any slot that has no art yet with a generated
                         placeholder (no external deps — hand-rolled PNG
                         encoder). Runs via `npm install`'s postinstall hook
                         or `npm run gen:assets`. Never overwrites a file
                         that exists in any format, so replacing a
                         placeholder with real artwork is permanent.
  optimize-audio.mjs     Re-encodes sound under public/audio as mp3 at a
                         bitrate a phone can carry. Run by hand with
                         `npm run optimize:audio`.
  optimize-art.mjs       Re-encodes art under public/ as WebP, capped at
                         1290 px. Run by hand with `npm run optimize:art`;
                         deliberately not part of the build, since the
                         committed art is already optimized.
  audioSlots.mjs         The sound pack: every cue the game can play.
  gen-audio-manifest.mjs Scans public/audio and each world's optional music,
                         and writes src/config/audioManifest.ts.
  gen-audio-placeholders.mjs
                         Writes a synthesised stand-in tone for any cue with
                         no file yet (hand-rolled WAV, no dependencies).
                         Never overwrites real audio.
public/assets/           Art that is not world content: totems (the player's
                         character, which travels between worlds), spell card
                         art, and ui/ for interface art such as the main menu
                         logo. Anything under ui/ is optional — the menu falls
                         back to its written title without one.
public/worlds/<id>/      One folder per world — locations, events, npcs,
                         enemies and an optional bosses. See "Unwritten
                         Worlds" above.
```

## Notes on scope

- Vocabulary is never semantically validated — a Spell's Korean/English text is only checked against
  the player's own saved answer(s) (trim + English case-insensitive). No AI, dictionary, or
  translation API is used anywhere.
- Vocabulary answers are assembled from tiles rather than typed, so a correct recall can never be
  rejected for a typo and no keyboard ever opens mid-dungeon. The Magic Room's Hangman follows the
  same rule: guesses are tapped from a grid of candidate syllable blocks.
- Only the 10-Word Dungeon tier is exercised end-to-end in this prototype; 25/50-word tiers reuse the
  same systems with a higher `wordLimit` in `config/balance.ts`.
- Rewards are credited at the moment they are earned, during the run. The Results screen only
  *reports* — re-rendering or reopening it can never grant anything twice.
- Dungeon runs are transient (in-memory) by design; Spell/Totem/Set progression and Records persist
  across reloads via `localStorage`.
