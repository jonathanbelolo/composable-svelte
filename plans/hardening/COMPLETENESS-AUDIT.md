# Completeness audit — is each package whole?

Written 28 August 2026, measured at `c036585`, working tree clean.

Every previous round of this campaign hunted **defects**: things that are wrong.
This pass asks a different question — **is anything missing or half-built**, and
does each package do what it says it does. The §4.9 "genuine product gaps" list
in `HANDOFF.md` was never built systematically; it is whatever happened to
surface while looking for something else. This is the deliberate version.

Where a claim is **verified**, the command or file that produced it is named.
Where it is **inferred**, it says so.

---

## Method, and one thing it disqualified

Four signals were used: README claims against exports, browser-global reachability
under SSR compilation, per-component test reachability, and provider/strategy
unions checked case by case.

**Plan checkboxes were tried and discarded as a signal.** `plans/phase-*` holds
2,000+ unticked `- [ ]` boxes, including 99 in `phase-1`, which is complete.
The boxes were written as task lists and never maintained. Anyone reaching for
them as a completeness measure will get a number with no meaning.

---

## Part 1 — What is missing

### G1. `charts` cannot be operated without a pointer — **CLOSED**

> Closed by `98663aa`, `f24d6bc`, `7e4a45d`, `f3ccdd9`, `8c1f9c4`, `f2c81fd`,
> `e607438`, `c1a720e` and the palette/conformance commit that follows them.
> The finding as written is preserved below; what remains open is listed at the
> end of this entry.

`packages/charts/src` contains **zero** `tabindex` and **zero** key handlers
(`grep -rn "tabindex\|onkeydown\|onkeyup\|onkeypress" packages/charts/src` →
no matches). Zoom, pan and brush selection are real and are attached in-package
to the SVG via `d3-zoom`/`d3-brush` (`ChartPrimitive.svelte:251` and `:278`).

So the package is **interactive but not operable without a pointer**. That is
**WCAG 2.1.1 Keyboard, a Level A failure.** `README.md:276` names AA conformance
as the unaudited item, which understates it — the package fails a more basic bar,
and no AA audit would change that.

**`role="img"` makes it worse than an omission.** `Chart.svelte:134` declares the
container a static graphic. That is a false statement about a surface supporting
brush selection and zoom: assistive tech is told there is nothing to operate, so
a user does not go looking. Same shape as the `media` `AudioManager` defect —
the wrong answer resolves cleanly instead of failing loudly.

**The README contradicts itself.** Line 5 says `✅ **Feature Complete** (Phase 11C)`;
lines 264-280 document the missing keyboard path, the missing data-table fallback
and the missing audit, ending "Do not treat this package as accessible for
interactive use." Both cannot be true.

Four further defects in the accessibility markup, none previously recorded:

- **`id="chart-summary"` is a hardcoded literal** (`Chart.svelte:145`). Two charts
  on one page emit duplicate DOM ids, and both `aria-describedby` references
  resolve to the **first** — every chart after the first is described by another
  chart's data. Not reachable in-repo (`ComponentShowcase.svelte` renders one demo
  at a time), which is why nothing caught it; a consumer dashboard is the normal case.
- **The summary is empty unless both `x` and `y` are passed.** `{#if x && y}`
  (`Chart.svelte:146`) wraps the entire content, but both props are optional and
  Observable Plot renders without them. `aria-describedby` then points at an empty div.
- **Label and summary count different things.** `aria-label` uses `$store.data.length`
  (line 135); the summary uses `filteredData` (line 149). After any `filterData`,
  the label overstates the point count.
- **Brush selection collapses to a contiguous index range.** `ChartPrimitive.svelte`
  dispatches `selectRange: [min, max]` and `chart.reducer.ts:132-142` selects
  everything between — so brushing two scattered points silently selects every
  point whose index falls between them. This is a correctness defect, not an a11y
  one, and it is separate from the `index` ≠ data-index caveat already commented
  in that file.

**What was done.** `focusedIndex` on `ChartState` with `focusNext`,
`focusPrevious`, `focusFirst`, `focusLast`, `focusPoint`, `clearFocus`,
`selectFocused`, `zoomIn` and `zoomOut` in the reducer; the component binds keys
to dispatches and owns no navigation logic. A polite live region announces each
point, a ring marks it on all five chart types, and a capped screen-reader data
table renders outside the `role="application"` element so it stays browsable.
`role="img"` is gone. All four markup defects and the brush defect are fixed.
charts went from 65 to 191 tests.

**A fifth defect turned up while verifying, and it was not in the audit.**
Driving the styleguide in a real browser showed that selecting a point removed
every *other* point from the chart. `buildScatterPlot` set `stroke` to a function
returning `null` for unselected rows, and Observable Plot **drops** a datum whose
channel value is null rather than drawing it without that property — so the
`fillOpacity` dimming beside it was styling rows that no longer existed. It
predates this campaign (`7654967`), and it reached users the moment `Enter`
became a way to select. Fixed in `c1a720e` with a regression test that runs in
jsdom; no browser was needed to catch it, only someone looking at a chart with
something selected.

The browser pass also produced a second reminder of an existing method rule: the
first confirmation of that fix showed it still broken, because the styleguide
resolves the package through its `exports` map to `dist/` and the build was
stale. That is "rebuild before believing a survivor", arriving from the opposite
direction — not a guard failing to fail, but a fix failing to land.

**The three items first left open have since been closed too.**

- **Contrast is measured, not unreviewed.** The review found the *default* state
  of every scatter chart at 2.41:1 against white — under SC 1.4.11's 3:1 — and
  dimmed points at 1.26:1, which is erasure rather than de-emphasis. The palette
  moved into `src/lib/utils/palette.ts` and `tests/contrast.test.ts` recomputes
  the ratios from those constants against light and dark backgrounds, so the
  published numbers cannot drift from the code. The hue did not change: darker
  blues score better on white and worse on dark, and `#3b82f6` is the one that
  clears 3:1 on both.
- **State markers use `currentColor`.** Writing the constants down exposed a
  defect the earlier work had shipped: a fixed `#000` focus ring is 21:1 on white
  and **1.02:1** on near-black, so the keyboard cursor was invisible in dark mode
  for exactly the users most likely to depend on it. Verified in the styleguide's
  dark theme at 19.12:1 against the card it actually renders on.
- **WCAG 2.1 AA is reviewed criterion by criterion** in
  `tests/wcag-conformance.test.ts` — no keyboard trap, character-key shortcuts
  scoped to focus per the SC 2.1.4 exemption, no reliance on colour alone, no
  context change on focus, name/role/value. Executable, not a checklist.
- **The selection highlight now draws on all five chart types**, closing a gap the
  README had carried through three review rounds. An added mark rather than
  per-type styling, since an area chart is one path and a histogram's rects are
  bins; the histogram gets a solid rule against focus's dashed one, so the two
  are distinguished by line style rather than colour.

**What genuinely cannot be closed here:** an independent audit. Everything above
is checked by tests anyone can run, but no third party has looked at it, and the
criteria belonging to the page around the chart — heading structure, text colour
inherited through `currentColor`, reflow at the app's breakpoints — are the
consuming application's to meet. The README says exactly that.

### G2. `maps` ships a provider that does not exist — VERIFIED

`MapProvider = 'maplibre' | 'mapbox'` (`map.types.ts:12`) is a public type
offering a choice with no behavioural difference:

```
// map-adapter.ts:16-19
case 'mapbox':
  // For now, Mapbox uses the same adapter as Maplibre (they have compatible APIs)
  return new MaplibreAdapter();
```

**`mapbox-gl` is not a dependency of the package** — `packages/maps/package.json`
lists `maplibre-gl` and `@types/geojson` only. A consumer selecting `'mapbox'`
silently gets MapLibre. Two live documents assert otherwise:

- `src/lib/index.ts:4` — "Built with Maplibre GL and Mapbox GL".
- `README.md:192` — Phase 12A, `- [x] Mapbox adapter support`, under
  `✅ **COMPLETE**`.

Either implement a real adapter, or remove `'mapbox'` from the union and both
claims. Removing it is breaking.

Separately, `maps` is the one package that says it is unfinished, and is:
`README.md:5` marks Phase 12C in progress with **five** unimplemented features
(3D buildings, marker clustering, geocoding, drawing tools, routing). That is
honest, and it is the reason `maps` should not be in a 1.0 without a decision.

### G3. `media` overclaims its video platforms — VERIFIED

`README.md` Features: "Auto-detects YouTube, Vimeo, **and more**". The type is a
closed three-member union — `VideoPlatform = 'youtube' | 'vimeo' | 'twitch'`
(`video-embed/types.ts:20`) — and a consumer cannot extend it. `VideoEmbed.svelte:81-86`
records that "Twitter, TikTok, Dailymotion, generic" were **removed** because the
extractor "has no registry entry for [them] and can never produce" them. So the
code already knows the claim is false. Drop "and more", or open the union.

### G4. Advertised features with no test reaching their component — VERIFIED (list), INFERRED (severity)

44 of 152 components are not named in any test in their own package. That count
is a **candidate list, not a defect count**: a primitive exercised through a
tested parent (`PopoverPrimitive` via `Popover`) appears in it, and is fine.

What survives that caveat is the subset where the component *is* the advertised
feature:

| package | untested components | the README bullet they implement |
|---|---|---|
| chat | `MessageReactions`, `FileAttachment`, `AttachmentGallery`, `AudioPlayer`, `TypingIndicator` | "Message reactions", "File attachments", "Collaborative — typing indicators" |
| media | `VoiceInputPanel`, `AudioVisualizer`, `RecordingTimer` | "Voice input — push-to-talk and conversation modes" |
| maps | `MapPrimitive`, `TileProviderControl` | the package's own core, and 12B's `[x] TileProviderControl` |

`maps` is the structural outlier overall: 6 components and 2 test files, where
every other package is roughly proportional.

### G5. `auth` is not what its name implies — NOT A DEFECT, a positioning gap

`README.md:3-5` scopes it precisely: "Client half of the identity substrate for
Composable Svelte apps backed by generated Composable Rust backends", with
seeded-user passwordless login. There is no password login, OAuth, signup or
token refresh, and none is claimed. The gap is that a consumer installing
`@composable-svelte/auth` from a registry listing will expect general-purpose
auth. Worth a first-line disclaimer, not code.

### G6. Root-level docs still carry counts the package READMEs dropped — VERIFIED

The front-door sweep at `86b2da4` corrected the package READMEs and the skill
files. Two documents above them were not swept:

- `guides/README.md` — six stale versions (`core (v0.4.3)` against 0.11.2, plus
  chat, charts, code, maps, media), and "77 shadcn-svelte components" at lines
  49 and 438.
- `README.md` (root) — "77 components" at lines 350 and 412, and "Production-ready
  with **420+ tests**" at line 5 against a measured 3,256.

Same class as the skill-file regression recorded in `HANDOFF.md` §4.5: the
sweep was scoped to package READMEs, and the class extends past them.

---

## Part 2 — What is NOT a gap

Recorded so a later pass does not re-hunt these.

### SSR is safe across all 152 components — VERIFIED, control-tested

Nothing in the repo renders a sibling package on a server: `examples/ssr-server`
depends on `core` alone, and `examples/styleguide` is a plain Vite SPA, not
SvelteKit. So this was unverified territory rather than a known-good.

Each `.svelte` in all eight packages was compiled with
`svelte/compiler` at `generate: 'server'`, the component function body isolated,
nested function bodies stripped — SSR runs the body but never the handlers or
`onMount`/`$effect` — and the remainder scanned for `window`, `document`,
`navigator`, `localStorage`, `sessionStorage`, `ResizeObserver`,
`IntersectionObserver`, `MutationObserver` and `matchMedia`.

**Result: 152 scanned, 0 unparsed, 0 render-path accesses.**

**The first version of this check returned the same 0 and was vacuous** — the
stripper treated the component function as a nested function and deleted the
whole body. A two-arm control caught it: a positive fixture (`const w = window.innerWidth`
at instance scope) was **not** flagged. After the fix the positive flags `window`
and the negative (`window` reached only through a function called from `onMount`)
stays silent. The 0 above is from the controlled version. Rule 4 of `HANDOFF.md`
§5 earned its place again.

Third-party libraries reachable from a barrel were checked separately, since a
module-scope import is the other SSR failure mode: `MaplibreAdapter` (static
`import maplibregl from 'maplibre-gl'`) is exported from the `maps` barrel and
`BabylonAdapter` (static `@babylonjs/core`) from the `graphics` barrel. **Both
import cleanly in plain Node.** `@xyflow/svelte` does not, but by an ESM
directory-import resolution that Vite handles — not a library defect, and `code`'s
barrel does not reach it.

**Residual, stated rather than glossed:** this is a static and import-level result.
Nothing has rendered these components on a server end to end. One SSR smoke test
would convert it.

### Deferred core features are not advertised as present — VERIFIED

`store.svelte.ts:109` and `types.ts:192-196` defer middleware and Redux DevTools
to Phase 5, and both are **commented out** rather than exposed as inert options.
Every mention in `packages/core/docs` is either Redux-migration context or
explicitly prefixed "Future:". No false claim.

### `chat`'s missing CRDT layer is handled correctly — VERIFIED

`collaborative-reducer.ts:131-140` receives `sync_update`, warns that CRDT sync is
not implemented, and ignores it. It previously dispatched into a path whose only
meaningful line was commented out, discarding real payloads silently. It is not
advertised in the README. Loud and unclaimed is the right end state.

### Others checked and clean — VERIFIED

- `code`'s three advertised validation strategies all exist and are exported:
  `permissiveValidator`, `strictValidator`, `composeValidators` (`validation.ts:222,237,254`).
- `graphics` states plainly in its Features list that WebGPU is not implemented.
- `packages/*/src` carries **zero** `FIXME`/`XXX`/`HACK` and only two live `TODO`s,
  both the documented Phase 5 deferrals.

---

## Ranking

1. ~~**G1 `charts`**~~ — **done**. Six commits; see the entry above for the three
   things deliberately left open.
2. **G2 `maps` mapbox** — a public type promising a provider that is not installed.
   Small fix, breaking, and false in two live documents.
3. **G4 test gaps** — three advertised features with no test touching their component.
4. **G6 root docs** — mechanical, 10 minutes.
5. **G3 `media` "and more"** — one word.
6. **G5 `auth` positioning** — one sentence.

`maps`' five unbuilt Phase 12C features are a scope decision, not a defect, and
are the strongest argument for excluding `maps` from any 1.0.
