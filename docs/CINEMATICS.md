# Cinematic presentation: NO REST FOR COUSIN

Presentation only. Nothing here can change domino rules or tiles, or be required for a
hand to resolve. Hands are ordinary frozen-preset sessions played with the fair AI.

## SceneDirector (`src/story/director.ts`)

**States:** `idle → preparing → entering → presenting ⇄ (text reveal) → entering-hand →
in-hand → leaving-hand → presenting → exiting → idle`.

| Guarantee | How |
| --- | --- |
| Stale callbacks never act | Every async continuation (preload, fades, reveals) carries the director token. `cancel()` bumps it, and is called on reset, navigation, chapter replay and every new scene. |
| No permanent input blocker | Every transitional state has a scheduled exit. `preparing` times out after 4 s and shows the fallback art. `settle()` completes any in-flight transition at once (backgrounding, Skip). |
| Single-step input | The first input on a revealing line finishes the reveal; the next advances **one** beat. Inputs closer than 180 ms are ignored. Input during transitions or hands is ignored, never queued. |
| No double hand start | `enterHand()` works only from `presenting` and once per scene, so a double-tapped "Deal the tiles" starts one hand. |
| Board never advances dialogue | During a hand the director is `in-hand` and ignores advance. The table owns input. |

### Timings (configurable)

| Timing | DEFAULT | REDUCED (reduced motion) |
| --- | --- | --- |
| Scene entrance/exit (fade through the night-ink colour) | 550 ms | 120 ms simple fade |
| Character entrance/exit | 260 ms (opacity + 8 px rise) | immediate |
| Expression change | stable swap (same stage box, same anchor) | immediate |
| Text reveal | 70 chars/s, at most 900 ms, then complete | none |
| Establishing push/pan | one move of about 2.2 s that ends | none |
| Double-tap guard | 180 ms | 180 ms |

- **Under reduced motion,** knock pulses, establishing moves, reveal animations and
  layer transitions are all off.
- **Important silences are player-advanced beats.** Nothing waits on a timer before the
  player may continue.

## Stage view (`src/ui/story-player.ts`)

Layers, back to front:
- backdrop A/B;
- light grade;
- threshold glow;
- water;
- boundary line;
- warmth vignette;
- Roberto's bust;
- dialogue and cards;
- controls;
- curtain.

Everything except the bar, cards and controls is `pointer-events: none`.

**Images:**
- A scene's backdrop is **fetched and decoded (warm queue) before the curtain opens**.
- A mid-scene cut swaps backdrops only after the new image decoded; otherwise the
  current image stays and only the light changes.
- A missing image falls back to the drawn gradient, never a blank or flat background.
  This was tested with every image blocked.

**Roberto's bust:**
- It's drawn through `HostView` (the `render/stage.ts` boxes): one stage box for every
  expression, so there's no size jump, no cropped hat and no neighbouring atlas cell.
- It sits in the layout flow above the dialogue, so a long line never covers his face.
- Upscale is checked at ≤ 1.6× in both orientations.

**Who appears:** only Roberto has approved, labelled expression art.
- He appears on his own lines and on reaction beats that change his expression.
- He is **never** shown beside another speaker's line, and never as a stand-in for two
  people (the kiss is warmth and caption only).
- Marisol, Vale, Luz and Rafa are staged with name tags, light and text until their
  expression sheets are labelled.

## Staging from the approved script (`src/story/staging.ts`)

- Each cue is anchored to the **exact opening text of a stage direction**.
- `staging.test.ts` proves every anchor matches exactly one direction in its scene.
- Cues change light, the threshold glow, water, the boundary line, warmth, Roberto's
  expression and audio hooks. They never change text.

| Moment (brief) | Staging |
| --- | --- |
| Cave dream and warm threshold | Dim cave, dream grade, establishing push; threshold line on the first knocks, pulse and brighten on the fourth knock; cut to the patio at dawn |
| Marisol's arrival, Roberto dropping the facade | Warmth on "stops performing" and "His grin softens"; expression to neutral |
| Vale's public smile → private menace | Resort grade on "His smile arrives…"; cold grade on "His smile is gone" (light only) |
| Quiet promenade, impossible water | Night grade; the surf holds the silence (warmth); a crescent of water under the bench; taps captioned and pulsed |
| Jungle recognition, shared event | Roberto's surprised reaction to the voice; water rising toward the light; threshold on |
| Cave reflection, rising water, boundary, private phrase | Threshold on, then bright; the water lifts; dashed **boundary** line; the water recedes; cut to the **modern rest area** |
| Vulnerable conversation, accepted hand | Rest-area grade (no cave image), warmth, expression neutral |
| Public terrace confrontation | Sunset grade; cold on "His jaw tightens"; back to sunset as Vale recovers the public smile |
| Dinner, mutual kiss, final knocks | Dinner grade; warmth on the kiss (no portrait); knock pulses; a water line beneath the gate; the light stays on; the water goes still |

**Never on the platform.** Chapter 6's hand uses the modern rest-area grade, never the
cave image with the ancient platform (`handEnv: null`). The rest-area beats after the
cut use the same grade, including when the chapter is resumed there.

## Audio hooks

The `StoryCue` type (`knock | water | whisper | surf | dinner | ambience-off`) routes
through the **existing AudioManager** (`audio.cue()`). No second playback system exists.

- **Knocks** use the knock SFX under the usual mute, scene and instance limits.
- **The rest** are reserved hooks, counted in `stats.cuesReserved`, waiting for the
  sound bank.
- **Story tables run with banter off**, so serious scenes stay serious, and Quick
  Play's Cousin quips never appear with Roberto as the player.

## Chapter flow

- **Order:** pre-hand dialogue → **Deal the tiles** card (shows the script's hand, and
  for Chapter 6 the rest-area note) → the hand at the table → **Continue the case** →
  the matching **Win / Loss / Tie insert** (verbatim) → the common continuation → the
  end card with the chapter's notebook entry → the next scene.
- **Progress** (record v2) saves the scene, part, beat, outcome and the in-progress hand
  (engine state + AI streams), from the deal onward.
- **Completion** is written in the same record as the outcome, so a reload never replays
  it.
- **Replay** of a completed chapter (case file) is memory-only and never changes case
  progress.

## Evidence

- `npm test`: director (9), staging anchors (3), chapter structure (4).
- `npm run story:e2e`: rapid taps, skip in transitions, double Deal, refresh
  mid-dialogue and mid-hand (identical tiles), a real hand → its verbatim insert
  (passed as a win and as a loss on separate runs), completion once, missing images,
  background, reduced motion, rotation, repeated navigation, and 10 staged moments in
  portrait and short landscape.
