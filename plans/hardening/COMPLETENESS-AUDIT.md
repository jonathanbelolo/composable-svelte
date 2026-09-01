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

### G2. `maps` ships a provider that does not exist — **CLOSED**

> Closed by `3017942`, `e263c66`, `f0883fe`, `ece1d76`, `a02bc37` and the docs
> commit that follows them. Mapbox is now real and opt-in rather than a string
> that selected MapLibre; what remains open is at the end of this entry.

> **This entry contained a false claim, corrected 28 August 2026.** It read
> "**`mapbox-gl` is not a dependency of the package** — `packages/maps/package.json`
> lists `maplibre-gl` and `@types/geojson` only." I had printed `dependencies`,
> `peerDependencies` and `peerDependenciesMeta`, never read
> `optionalDependencies`, and wrote the conclusion as a measured finding. In
> conversation I put it more strongly still — "not a dependency at all, not even
> optional" — an emphatic denial of the one field I had not looked at, and a
> decision was taken on that premise.
>
> The truth is the opposite, and worse. See below.

`MapProvider = 'maplibre' | 'mapbox'` (`map.types.ts:12`) is a public type
offering a choice with no behavioural difference:

```
// map-adapter.ts:16-19
case 'mapbox':
  // For now, Mapbox uses the same adapter as Maplibre (they have compatible APIs)
  return new MaplibreAdapter();
```

`state.provider` is read in exactly one place — `MapPrimitive.svelte:46` — so the
whole of the "choice" is which class that line constructs, and both answers are
`MaplibreAdapter`.

**`mapbox-gl` is declared, installed, and imported by nothing.**
`packages/maps/package.json` carries `optionalDependencies: { "mapbox-gl":
"^3.7.0" }`. `mapbox-gl@3.16.0` is in the store and linked into
`packages/maps`; `grep` finds no import of it in any package or example source.
The registry reports its `unpackedSize` as **58.5 MB across 20 files** (the
compressed download is smaller and was not measured).

`optionalDependencies` are installed **by default** — the field means "install
this, but tolerate a build failure", which is for platform-specific native
modules, not for opt-in features. So every consumer of this package downloads a
58 MB proprietary SDK that the package never loads. The mechanism for an opt-in
peer is `peerDependencies` + `peerDependenciesMeta.<name>.optional`, which `chat`
already uses for `prismjs` and `pdfjs-dist`.

**A second, separate defect: the `mapbox` tile provider cannot load.**
`TILE_PROVIDERS.mapbox.styleURL` is `mapbox://styles/mapbox/streets-v12`.
MapLibre has no knowledge of that scheme — its dist contains zero occurrences of
`mapbox://`, and its request path takes `http(s):`/`file:` or a handler
registered through `addProtocol`, of which none is — so the style request is
never made and the map breaks rather than degrades. `getAvailableTileProviders()`
includes it, `TileProviderControl` renders it in a dropdown, and the styleguide's
MapDemo renders that control: a broken map is one click away in the repo's own
showcase. `requiresAPIKey: true` is hollow besides, because `getStyleURL` ignores
the key for this provider — its `styleURL` is a string, not a function.

**And `MapAdapter` is exported but not pluggable.** `MapPrimitive` constructs the
adapter internally, so the interface is decorative — which is also why
`MapPrimitive` has no test: there is no way to keep a GL context out of it.

Live documents asserting Mapbox support: `src/lib/index.ts:4`;
`README.md` lines 9, 15, 86-94 (an entire "Mapbox GL (Optional)" section with a
`provider: 'mapbox'` example), 192 and 221; the `package.json` `description` and
`keywords`; and `.claude/skills/composable-svelte-maps/SKILL.md` lines 8, 20, 89,
104-105, 589-592, plus 565, which documents a `'satellite'` style that does not
exist in `src` at all.

**What was done.** `MapAdapter` is injectable — an `adapter` prop on `Map` and
`MapPrimitive`, MapLibre by default — so the interface that was exported and
unusable is now the extension point. `MapProvider`, `MapState.provider` and
`createMapAdapter` are gone. The broken `mapbox` tile provider is gone. A real
`MapboxAdapter` ships behind `@composable-svelte/maps/mapbox`, and `mapbox-gl`
moved from `optionalDependencies` to an optional peer: **measured with packed
tarballs, that takes a consumer install from 149 MB to 87 MB.** The layer
translation both adapters need was lifted into pure functions, which is also
where the only interesting logic was and none of it had a test.

`MapPrimitive` — the core of the package — had no test because it built its own
map and jsdom has no WebGL. It has eleven now, through an injected fake, which
is a slice of G4 closed as a side effect. maps went from 36 to 94 tests.

Also corrected along the way: the maps skill file listed seven tile providers of
which **five did not exist** (`'osm'`, `'stamen-terrain'`, `'stamen-toner'`,
`'satellite'`, `'mapbox'`), and documented a `changeStyle` example using a
`mapbox://` URL that MapLibre cannot load.

**Still open, and not claimed:** `maps` is the one package that says it is
unfinished, and is. `README.md:5` marks Phase 12C in progress with **five**
unimplemented features (3D buildings, marker clustering, geocoding, drawing
tools, routing). That is honest, and it is the reason `maps` should not be in a
1.0 without a decision — a decision this work does not make.

### G3. `media` overclaims its video platforms — **CLOSED**

> Closed by `78bd608`, `a755f58`, `bd8b6aa`, `e2e6041` and the docs commit that
> follows them. **The entry below describes the smallest of eight defects.**
> Checking it found that the documented component did not exist and that Twitch
> did not work; the overclaim was the least of it.

`README.md` Features: "Auto-detects YouTube, Vimeo, **and more**". The type is a
closed three-member union — `VideoPlatform = 'youtube' | 'vimeo' | 'twitch'`
(`video-embed/types.ts:20`) — and a consumer cannot extend it. `VideoEmbed.svelte:81-86`
records that "Twitter, TikTok, Dailymotion, generic" were **removed** because the
extractor "has no registry entry for [them] and can never produce" them. So the
code already knows the claim is false. Drop "and more", or open the union.

### G4. Components no test has ever executed — **CORRECTED, then CLOSED**

> **The original entry was wrong in both directions**, because the method behind
> it was a name-grep: "does the component's basename appear anywhere in its
> package's tests". That counts a mention in a comment and misses a component
> rendered through a tested parent. It is preserved below the correction, since
> the register's value is that a reader can tell which of its claims were
> reached by measuring.

Re-measured by following relative imports from every test file in the repo,
through barrel `index.ts` files — which is what a test actually causes to
execute:

- **media was wrong.** `VoiceInputPanel`, `AudioVisualizer` and `RecordingTimer`
  are all reached through `VoiceInput`, which has eleven test files. Voice input
  is among the best-tested things in this repo.
- **chat was partly right.** `MessageReactions`, `FileAttachment` and
  `AttachmentGallery` are reached. `TypingIndicator`, `TypingUsersList` and
  `ActionButtons` are not, and the last two the entry never named.
- **maps' `TileProviderControl` is confirmed** — never executed, and a `[x]`
  roadmap item. G2's work tested the tile registry, not the component.
- **The entry missed the large one entirely: 39 components in `core` are never
  executed by any test in the repo.** `Button`, `Input`, `Checkbox`, `Radio`,
  `RadioGroup`, `Slider`, `Textarea`, `Label`, `Progress`, all of `Card`,
  `Banner` and `DataTable`, the four `Form*` parts, and `DestinationRouter`.
  None is *imported* by any test; the few files that "name" `Button` mention it
  incidentally.

**The original entry's own caveat was backwards.** It dismissed core's list as
primitives covered through their parents. The eight navigation `*Primitive`s
*are* covered, through their tested wrappers — and the **atoms**, which are the
component library's headline surface, are the ones nothing touches.

**43 components, never executed**, and a live hazard in the most-used of them:
`Button`'s `sizeClasses[size]` is `undefined` for a value outside its union and
`cn()` drops it, so the button renders with no height or padding. That is how
the recorded S4.6 defect happened, and types do not reach a value arriving from
a store or from JSON.

**A second measurement of mine over-reported and was discarded.** Searching test
text for `<Name`, `mount(Name` or `Name.svelte` put 51 core components on the
list — but 38 test files use `render()` from `vitest-browser-svelte`, and named
imports come from barrels. `Breadcrumb` has a dedicated test file and appeared
on it. Import-reachability is the measurement that holds, and is what the guard
in `tests/repo/component-coverage.test.ts` is built on.

**Closed.** All 43 now have tests, and the guard asserts coverage
unconditionally — `UNTESTED_PENDING` reached empty and was deleted along with
the arm that read it, the shape `NOT_YET_GATED` took in R7. A component added
with no test fails the gate on the day it arrives.

**That last sentence was false when first written, and a hostile review of this
item is what found it.** The walker followed a barrel and credited everything it
re-exported, so a component dropped into an existing `ui/*/index.ts` was marked
reached as soon as any test imported any sibling — which is how components
actually arrive here. Demonstrated with a probe component that had no test at
all and passed cleanly. A barrel entered by name now forwards only those names,
and each of the 43 was separately checked to be *named* in a test rather than
swept up by a sibling's import.

Fixing that introduced a second defect, found the same way: rewriting the import
parser to read named bindings silently dropped `export … from` forwarding, which
the original loose regex had matched by accident. The signal was that the
*permissive* mutation lost eight components — an unexplained result rather than a
failing one, which is the kind that gets waved through.

Three defects fell out of rendering things for the first time, which is the
return on this item:

- **`DestinationRouter` crashed whenever nothing was presented.** Its
  no-destination path returned an empty object, so every route's scoped store
  came out `undefined` — and `Modal`, `Sheet` and `Drawer` all declare
  `store: ScopedDestinationStore | null`. At runtime it threw
  `Cannot read properties of undefined (reading 'state')`. That is the resting
  state of a router, and it is an exported navigation API.
- **`Button` lost all sizing for a value outside its union** — the S4.6 defect,
  fixed in the example at the time and left live in the component.
- **`maps` kept a stale `style`** after a tile provider change; see G2's entry.

Two things learned that are worth carrying: components render asynchronously in
core's browser suite, so reading the container synchronously finds nothing and
looks like a component fault; and `Modal`, `Sheet` and `Drawer` render into
`document.body` rather than their own container, so a router test that queries
the container sees only comment markers.

---

*The entry as originally written:*

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

### G5. `auth` is not what its name implies — **CLOSED**

`README.md:3-5` scopes it precisely: "Client half of the identity substrate for
Composable Svelte apps backed by generated Composable Rust backends". The gap is
that a consumer installing `@composable-svelte/auth` from a registry listing will
expect general-purpose auth. Closed with a first-line disclaimer naming what is
absent, and saying plainly that the package name is broader than the package.

**The closure text above was itself stale and has been corrected.** It read
"There is no password login, OAuth, signup or token refresh, and none is
claimed", which was true when written and false by the time anyone read it:
password sign-in, signup, email verification, password recovery, MFA and OAuth
have all since shipped. Only token refresh, account linking and MFA management
remain absent. A resolution that names a moving list dates faster than the entry
it closes — the same failure class as G6 below, where a sweep scoped to package
READMEs left the documents above them behind.

### G6. Root-level docs still carry counts the package READMEs dropped — **CLOSED**

The front-door sweep at `86b2da4` corrected the package READMEs and the skill
files. Two documents above them were not swept:

- `guides/README.md` — six stale versions (`core (v0.4.3)` against 0.11.2, plus
  chat, charts, code, maps, media), and "77 shadcn-svelte components" at lines
  49 and 438.
- `README.md` (root) — "77 components" at lines 350 and 412, and "Production-ready
  with **420+ tests**" at line 5 against a measured 3,256.

Same class as the skill-file regression recorded in `HANDOFF.md` §4.5: the
sweep was scoped to package READMEs, and the class extends past them.

**Closed.** The component count was removed rather than renumbered, matching
the sweep of `packages/core/README.md` — the real answer depends on what you
count, and a bare number invites the next disagreement. The seven version
headings in `guides/README.md` went the same way: a guide is not where a
version belongs, `package.json` is the source of truth, and that copy could
only rot. The test count was raised from a nine-times-stale floor to a current
one; note that "420+" was never *false*, only useless, which is its own kind of
rot and harder to notice.

**A fourth stale claim turned up that this entry never catalogued** —
`README.md:416`, a second "420+ tests". The entry named three; there were four.

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
2. ~~**G2 `maps` mapbox**~~ — **done**. Five commits; larger than recorded, because
   the entry's central claim was wrong and the tile provider was a second defect.
3. **G4 test gaps** — three advertised features with no test touching their component.
4. ~~**G6 root docs**~~ — **done**, and it was four claims rather than three.
5. ~~**G3 `media` "and more"**~~ — **done**, and it was never one word: eight
   defects, including a component whose documented API did not exist.
6. ~~**G5 `auth` positioning**~~ — **done**.

`maps`' five unbuilt Phase 12C features are a scope decision, not a defect, and
are the strongest argument for excluding `maps` from any 1.0.
