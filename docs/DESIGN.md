# React Native AI design

React Native AI looks like the rest of the Callstack product family: near-black, one bright
accent, white type, light grotesk headlines, uppercase mono labels, square corners, 1px
hairlines, no shadows or gradients, and dithered pixel art instead of photos or
illustrations. Its siblings are Apex (lime `#c6f432`), Simlock (orange `#ff7a1a`), Appduct
(cyan `#3ddcff`), agent-device (violet `#a47bff`) and Rozenite (crimson-rose `#ff4f7b`).
React Native AI is **Forest** `#3fae6a`: a deep green that reads as a brand, not as a success
state, for software that runs where it lives (on the device).

**Scope.** This file governs every brand visual: the website (`website/`), the social card,
the README banner, slides, diagrams and videos. It does not govern the example app in
`apps/expo-example`, which follows iOS system design (`PlatformColor`, SF Symbols).

## Colour

| Token | Value | Use |
| --- | --- | --- |
| `bg` | `#0a0a0a` | Page background |
| `surface` | `#111111` | Hovered cells, panels |
| `field` | `#161616` | Inputs, inline code, chips |
| `line` | `rgb(255 255 255 / 0.08)` | Hairlines |
| `line-strong` | `rgb(255 255 255 / 0.16)` | Window and input borders |
| `text` | `#ffffff` | Headlines, primary text |
| `muted` | `rgb(255 255 255 / 0.62)` | Body copy, nav links |
| `faint` | `rgb(255 255 255 / 0.5)` | Metadata, line numbers |
| `accent` | `#3fae6a` | Brand, primary actions, second headline beat, strings in code |
| `accent-hover` | `#90d0a9` | Hover on accent fills |
| `accent-rgb` | `63 174 106` | Dither palette, translucent accent |
| `on-accent` | `#0a0a0a` | Text on accent fills |
| `accent-deep` | `#32744b` | Light-mode docs: links and accent text (5.6:1 on white) |
| `accent-rule` | `#3d8d5c` | Light-mode docs: rules, current sidebar item (4.1:1 on white) |

The accent is 7.0:1 on `bg`. Use it sparingly: the wordmark, the primary action, the second
beat of a headline, strings in code and live state. Never use it for status (success, error,
warning). Anything filled with the accent carries dark text. Greys are neutral. Every piece of
text meets 4.5:1 against its background. `website/src/site/brand.ts` is the only place that
holds these values in code.

## The mark

A chip on a 9×9 step grid: pins on every side, a square die, one core in the middle.

```text
..#.#.#..
.........
#.#####.#
..#...#..
#.#.#.#.#
..#...#..
#.#####.#
.........
..#.#.#..
```

Render it one square per `#`, with crisp edges, at heights in multiples of 9px. The lockup is
the mark, then the wordmark `REACT NATIVE AI` (`on-accent` on an `accent` block), then a
`BY CALLSTACK` chip. Never round, outline, recolour or animate the mark.

## Type

| Role | Font | Size | Weight |
| --- | --- | --- | --- |
| Hero headline | Switzer | `clamp(2rem, 1.3rem + 2.6vw, 3.5rem)`, -0.035em | 500 |
| Section headline | Switzer | `clamp(1.75rem, 1.3rem + 1.6vw, 2.75rem)`, -0.03em | 500 |
| Body and ledes | Switzer | 0.9375–1.125rem, line height 1.55, `muted` | 400 |
| Labels | Geist Mono | 0.75rem, uppercase, 0.08em | 400 |
| Code | Geist Mono | 0.8125rem, line height 1.75 | 400 |

Both fonts are free and self-hosted in `website/src/fonts/`. Headlines run in two beats with
the second in the accent: "On-device AI for your mobile app. *Every platform’s models, one API.*" That is the motto. Mono
is for labels only, never full sentences. Platforms are always in the order iOS, Android, and
runtimes in the order Apple, Core AI, ADK, Llama.

## Layout

Content sits in one centred frame, `min(100% - 2 × gutter, 75rem)`, with full-height side
hairlines. Sections open on a hairline row such as `[02]  RUNTIMES`. Grids are equal cells
divided by hairlines, with no gaps; a grid never ends on an empty cell. Spacing steps in 4px.
Corner radius is 0 everywhere. At phone width the page is one column with a 16px gutter.

For slides and video, a 16:9 frame uses the same side hairlines and section head row, with
type sizes scaled from the hero headline.

## Components

- **Buttons:** mono uppercase, 2.5rem tall, square. Primary is an accent fill; dark is `#1a1a1a`.
- **Window:** `bg` fill, `line-strong` border, a bar with a mini wordmark tag, a mono file name
  and three thin controls.
- **Code:** zero-padded line numbers in `faint`, keywords and punctuation dimmed, functions and
  types white, strings and numbers in the accent, comments `faint`.
- **Command bar:** `$` in the accent, the command in mono, a `COPY` label.
- **Phone:** a `#050505` slab with 4px-stepped corners and a 1px `#313131` outline that follows
  the steps. Inside: a mono status row (`9:41`, `✈ AIRPLANE MODE`), the user's bubble on an
  accent fill, the reply in a hairline box, and an accent square marking `apple() · on device`.
- **Runtime cells:** one per runtime, labelled `NATIVE · BY CALLSTACK` (accent) for Apple, Core AI
  and ADK, or `THIRD-PARTY BINDING` (muted) for Llama, which wraps llama.rn.
- **Closing:** a full-width accent CTA bar, the giant accent wordmark, then one footer row.

## Pixel imagery

All imagery is ordered dithering (4×4 Bayer) on a grain of 2 CSS px cells, in three tones:
`#0a0a0a`, the midtone `#1a3b27` (30% accent into `bg`) and the accent.

- **Die (signature).** A square chip below and behind the focus point: a package ring with a
  bright top rim, a dark gap, and a die holding a 6×6 grid of cores, lit on the left and shaded
  on the right. Cores flicker on and off in steps, about three times a second. Traces leave
  pins on all four sides, run straight out, jog away from the side's centre (outer pins jog
  further and turn sooner, so traces never cross), then run to the edge. Pulses travel outward
  along them. A faint dotted board fades away from the chip. The story: the model runs on the
  phone's own silicon.
- **Hollow (404).** The same board with the chip missing: a dark socket with a dashed outline
  that flares now and then, while the pulses still run along the traces.
- **Flow.** Soft, slowly turning bands, capped near the midtone, behind code and tabs.

Text never sits on dither, only on solid fills over it. Never use landscapes, photos, 3D
renders, gradients or glow.

## Motion

Pixel scenes run at about 12 fps in steps, never smoothly. The hero streams the phone's reply
a few words at a time, the way `textStream` delivers it, then holds the finished reply. Under
reduced motion everything shows the finished still frame. For video, use `steps()` easing,
about 12 fps for dither, and cuts rather than cross-fades.

## Words

Plain and specific. Say what becomes possible: on-device AI in a mobile app, using the models
each platform provides, through one drop-in AI SDK API, with no server and no API key. Keep API names out of headlines and ledes. Apple, Core AI and ADK are native (`NATIVE · BY CALLSTACK`): they run on the AI stack the
platform provides. Llama is a `THIRD-PARTY BINDING`: a provider over llama.rn. Page titles are `React Native AI: On-device AI for React Native apps` on
the home page and `Page title | React Native AI` elsewhere. Facts come only from the docs: no
invented benchmarks, adopters or testimonials. Mark JSON UI as experimental.

## Social card and banner

The social card (1200×630, `website/public/og-image.jpg`) shows the lockup, the motto, and a
terminal with the install, the `streamText` call and the first line of the reply, on the Die
scene. The banner (`website/public/banner.jpg`) is the same in a wide crop. Regenerate both
with `bun run og` in `website/`; they read `content.ts` and `brand.ts`.
