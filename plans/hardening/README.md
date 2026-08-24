# Hardening — defect register

A running record of defects found while hardening this repo, what has been fixed,
and what is still open. Written to be picked up cold: every open item names the
file and line, says whether it was **verified** (something was run) or
**inferred** (read only), and describes the failure a user would actually see.

## Status at a glance

| | count |
|---|---|
| Fixed and committed | 68 commits through R7, plus 99 in the dead-behaviour campaign since `2443ab4` |
| **Open — components that crash** | **0** (was 6 — all fixed, see R1) |
| Open — breaks a consumer at install/build | 6 (S2.6 closed in R6; S2.7 and S2.8 were already closed and the count was stale) |
| Open — silently-wrong behaviour | 6 (S4.3 closed by R4; **S4.4, S4.6, S4.7 closed in R7**) |
| Open — security | 0 (was 1; **the R2 fix was incomplete — see R3**) |
| Open — `svelte-check` errors | **0** (was 142, recounted to 69 in R6) |
| Open — `svelte-check` warnings | **0** (was 30) |
| Workspaces covered by `pnpm -r check` | **19 of 19** — the gate is complete |
| **Open — dead behaviour** | **4 items, S11** — T1–T6 done; six packages swept |
| Workspaces that typecheck their tests | **14 of 14 that have tests** (S11 T1) |
| Animation-policy backlog | **none** — emptied and deleted (S11 T2–T4) |
| `examples/` animation violations | **0** — gated and cleared; was 78 across 33, not the 24 recorded (S11 T5) |
| Committed build artifacts under the gate | `ssr-server/static` — was serving 6 deleted transitions |

## Remediation log

### R7. The gate is complete — 19 of 19 workspaces

`NOT_YET_GATED` is empty and deleted. `tests/repo/check-coverage.test.ts` now
asserts unconditionally that every workspace carries the byte-identical `check`
script and declares `svelte-check`, so a new workspace has to be gated in the
change that adds it. Baseline: `pnpm -r build`, `typecheck`, `test` (**2249
passing**, was 2166 at the start of this effort) and `check` all clean, and
`pnpm install --frozen-lockfile` clean.

Two corrections to R6's own numbers, both found by measuring rather than
inferring:

- **shader-gallery is 3, not 2**, and **ssr-server is 10, not 5**, once their
  tsconfigs extend the root. They were the last two that did not. A `tsc`-only
  probe had put shader-gallery's delta at +0, and that number meant nothing:
  `tsc` sees only its four `.ts` files and both its errors live in `.svelte`.
  The real delta is one `exactOptionalPropertyTypes` error at
  `ShaderGallery.svelte:51` that no `tsc` run could ever have found.
- **Widening `scopeToDestination` does not fix product-gallery.** R6 and the plan
  before it attributed that cluster first to an untyped call site, then to the
  parent-parameter type. Neither. Core's navigation components are **not
  generic** — `Modal.svelte:94` destructures as `ModalProps<unknown, unknown>`
  with no `<script generics=...>`, as do Sheet, Alert, Popover, Drawer, Sidebar,
  Tabs and NavigationStack — so the `children` snippet hands back `unknown`
  whatever the caller passes. Only `DestinationRouter` is generic. Fixed by
  adopting the house pattern (snippet with no parameter, closing over the outer
  typed store) rather than by making eight components generic mid-effort.

Defects closed, beyond the type errors:

- **`ssr-server`'s post list was dead and orphaned.** It dispatched `selectPost`
  (not in `AppAction`) and read `state.selectedPostId` (not on `AppState`), and
  nothing rendered it — `PostListPage` had superseded it. Deleted. This also
  explains **S6.2**: the e2e suite asserts on `selectedPostId` at
  `ssr.spec.ts:54,68`, a property that never existed. The component and those
  tests were left behind together when the app moved to a destination union.
- **Neither `url-routing` modal could be dismissed by keyboard** — no Escape, no
  keydown, anywhere in either file. **Closes S4.4** as well: the `require()` in a
  browser ESM bundle is gone, and the example's tsconfig now carries a note that
  its missing `types: ["node"]` is load-bearing, since adding it would make that
  error silently disappear.
- **`AttachmentPreviewModal` could not be closed with Escape** — `onkeydown` on a
  `role="dialog"` div that nothing ever focused.
- **`VideoPlayer`'s controls tab-trapped invisible buttons** (`opacity: 0;
  pointer-events: none` does not remove them from the tab order).
- **Both audio scrubbers were focusable sliders with no key handler.**
- **`ImagePreview`'s fullscreen was mouse-only**, and unreachable entirely for a
  `showHeader={false}` consumer.
- **S4.6 and S4.7 closed** in product-gallery, both gate-caught as predicted.
- **S9's `<button>`-in-`<button>` is fixed** as a side effect of unnesting the
  card controls — but **not gated**: the nesting crosses a component boundary and
  no svelte-check gate can see it.
- `ssr-server` and `chat` both called the Svelte 4 `$destroy`; the `?.` made it a
  silent no-op, so HMR leaked an instance per update.

Two core contracts were widening rather than defects, but both had made the
documented pattern impossible to typecheck: `scopeToDestination`/`scopeToOptional`
now take a `ScopableStore` (`{state, dispatch}`), which is what they actually
consume and what every scoping helper actually returns; and `Form` now takes a
`FormStore<T>`, which is why three examples had each hand-rolled the same wrapper.

### New: core's tests are typechecked by nothing

`packages/core/tsconfig.json` excludes every `.test.ts`, and `tsconfig.test.json`
inherits that exclude — so `pnpm typecheck` compiles **no test file in core at
all**, and vitest transpiles without typechecking. Overriding it surfaces **573**
real errors across the suite. Not touched here; recorded because it means any
type-level guard written as a `.test.ts` in core is not actually a guard.

### New: 75 names are unreachable from core's package root

`TreeNode` is exported from `@composable-svelte/core/components/ui` but not from
the root barrel, though `TreeView` is — so no consumer can type the data the
component requires. It is one of **75** such names (53 types, 22 values) across
**11 root-exported components**. The worst case is `Collapsible`: its required
store type, its reducer and its state factory are all unreachable from the root,
so the component cannot be used from `@composable-svelte/core` at all. The
comment at `components/ui/index.ts:55-64` documents this exact fix being applied
one level down and never propagated up. `file-browser` works around it with the
subpath import, as six styleguide demos already do.

### New: `TreeView` is not generic

`TreeViewProps<T = string>` is declared generic but `TreeView.svelte` carries no
`generics=` attribute, so `T` is pinned to `string` and `TreeNode<T>`'s parameter
is unreachable. Attempted and backed out: adding it propagates `T` into
`createInitialTreeViewState`, `treeViewReducer` and the recursive `TreeNodeItem`
snippet, and then stops, because `TreeViewAction` is not generic either — it
carries `nodes: TreeNode<string>[]`. Making the module genuinely generic means
changing a public action union. Same family as the navigation components.


### R6. `pnpm -r check` is a real gate for 9 of 19 workspaces

`C1` was worse than recorded. `pnpm -r` runs a script only where it exists and
skips the rest silently with exit 0, and the register's error table stopped at
`styleguide` — the ten other examples had **never been measured**. The true gap
was 69 errors and 30 warnings across 15 workspaces, not 142 and 19.

Corrections to the counts as they stood:

- The **142** figure was already stale: R4 had cleared `code` (18) and
  `styleguide` (73).
- **graphics is 18, not 14.** `tsc` finds 14 because it never reads `.svelte`;
  svelte-check against the root ruleset finds two more in `Camera.svelte` and two
  more again once `@types/node` leaves. `Light.svelte`'s `default`-less switch
  contributes **0** — both `noImplicitReturns` and `noFallthroughCasesInSwitch`
  are clean there, contrary to the earlier guess.
- The examples hold **32 errors and 11 warnings**, led by `product-gallery` at
  11+6, `file-browser` and `ssr-server` at 5 each.

Now gated: core, code, graphics, styleguide (already), plus **auth, counter,
data-table, maps and charts**. The remaining ten are listed in `NOT_YET_GATED` in
`packages/core/tests/repo/check-coverage.test.ts` with their measured counts —
the gap is now a test that fails when forgotten, not a line in this document.
That test asserts every workspace is either gated with the byte-identical script
and a declared `svelte-check`, or explicitly allowlisted, and that no allowlist
entry is stale.

Defects closed on the way, none of them cosmetic:

- **`graphics/Camera.svelte` silently wiped `fov`, `near` and `far`.** Mounting
  `<Camera {store} {position} {lookAt} />` — the documented shape — sent
  `fov: undefined`, and `reducer.ts:97`'s `{...state.camera, ...action.camera}`
  merge let that overwrite `initial-state.ts`'s `fov: 45`.
  `babylon-adapter.ts:136` then guards `!== undefined`, so the adapter quietly
  never applied a field of view. Same family as R1's four.
- **`charts` `brushStart` required a `position` nothing reads** — not the
  reducer, not the only dispatch, not any of the three tests. It was wrong from
  the design onward: the phase-11 plan intended `event.selection`, which for a 2D
  brush is `[[x0,y0],[x1,y1]]`, never a `[number, number]`. **Closes S2.7's
  sibling.**
- **`ChartTooltip` deleted, closing S2.6.** Its state, actions and `ChartState`
  field were all removed in the Observable Plot migration; nothing could produce
  the prop it took.
- **`ChartConfig.size` was typed as the one thing it is never** —
  `string | ((d)=>any)`, while `plot-builder.ts:17,73` destructures `size = 5`
  and passes it as Plot's `r`. Masked because TS reports only an object
  literal's first bad property.
- **`render-pipeline.ts:342` re-read `items[0].options` without the `?.`** its
  own guard on the line above used — a latent throw.

Two corrections to my own work here, both found by mutation:

- The coverage test's `prepublishOnly` assertion used `toContain('check')`, which
  matches `typecheck`. It passed on every package that runs typecheck and could
  never fail. It now splits on `&&` and matches the whole step.
- The `Camera` test first asserted immediately after `mount()`. `onMount`'s
  dispatch lands after `mount()` returns, so it read the initial state and passed
  for the wrong reason. With `flushSync()` it failed, as it should have. The bug
  is also broader than first written: after a flush `near` and `far` are gone
  entirely, not just `fov` — the earlier trace hid that because `JSON.stringify`
  drops undefined values.

Also worth recording: **d3-brush has never been exercisable in `charts`' test
environment.** jsdom does not implement `SVGAnimatedLength`, so `defaultExtent`
throws `Cannot read properties of undefined (reading 'baseVal')` — on the `<svg>`
root exactly as much as on the `<g>` it now installs into. The new test shims it
and pins the *installation* only; whether dragging behaves identically in a real
browser is **unverified** and needs browser mode `charts` does not have.

Baseline on the current tree: `pnpm -r build`, `typecheck` and `check` clean,
`pnpm -r test` **2211 passing** (was 2166), `pnpm install --frozen-lockfile`
clean.


### R1. All six crashes — FIXED, mutation-verified

The four `effect_update_depth_exceeded` components were fixed at the reducer, by
value, mirroring core's `select.reducer.ts`. A reference guard cannot work here:
both components build their config with `$derived({...})`, a fresh identity every
render.

- `maps` `updateLayerStyle` — `sameStyle` recurses into `colorGradient` tuples.
- `graphics` `updateCamera` / `updateMesh` — `sameConfig` recurses into `Vector3`
  arrays and nested geometry/material objects.
- `code` `NodeCanvas.handleConnect` — took `{ connection }`; `OnConnect` passes
  the `Connection` directly.
- `styleguide` `AudioPlayerDemo` — passed `isOpen`/`onClose`/`title` to `Modal`,
  which declares none of them and requires `store`. Rewired to the scoped-store
  pattern `ModalDemo` already used.

**Correction to the original finding:** the loop does *not* surface as a thrown
Svelte error. It re-schedules, pinning the CPU — the maps mount test hung the
vitest worker indefinitely rather than failing, and vitest could not enforce its
own timeout. Worse for a user than reported: the tab locks up.

New guards: `packages/maps/tests/component-mount.test.ts` (4),
`packages/graphics/tests/component-mount.test.ts` (6). Both packages needed
`resolve.conditions: ['browser']`, or Svelte resolves to its server build under
Vitest and `mount()` throws.

`NodeCanvas` has no mount test yet — SvelteFlow in jsdom is heavy, and the real
guard is `svelte-check`, which cannot run on `code` until S5 adds it. Tracked
there rather than claimed as covered here.

### R3. The R2 fix was incomplete — two live XSS paths closed

**Correction.** R2 claimed the chat XSS was fixed. It sanitised `renderMarkdown`,
which feeds two of the three `{@html}` sites. The third,
`primitives/SimpleChatMessage.svelte:53`, is fed by `renderSimpleMarkdown` in a
*different* module with the identical defect. The original sweep attributed all
three sites to one function; that was never checked, and R2 repeated it. The
package still shipped a working XSS after R2.

A full sink audit now backs the scope: six `{@html}` sites and five
`innerHTML`-class sites across all packages and examples.

- **`renderSimpleMarkdown`** — now sanitised. The allowlist moved to a shared
  `streaming-chat/sanitize.ts` used by both modules, so the next fix cannot land
  on only one of them again.
- **`code/CodeHighlight.svelte:53`** — rendered `{@html highlightedCode || code}`,
  and `state.code` is never escaped. Reachable before the async highlight
  resolves, on every `codeChanged`, and *permanently* after `highlightFailed`.
  Now `{#if}`/`{:else}` with plain interpolation, which Svelte escapes. I had
  previously recorded this package's `{@html}` as safe — that assessment was
  about markdown fallbacks in a different file and was generalised without
  checking this one.
- **`examples/ssr-server/src/client/index.ts:122`** — interpolated `error.message`
  into `document.body.innerHTML`; now built from DOM nodes with `textContent`.
- **`marked` global cross-talk** — both chat modules configured the shared
  `marked` singleton at import time, so whichever loaded last won for both.
  Each now owns a `new Marked()` instance; pinned by a test asserting the full
  renderer emits `language-javascript` while the simple one emits `language-js`.

Verified: 21 chat tests in chromium plus the built package in plain Node.
Reverting either sanitise call fails exactly its own XSS tests and no formatting
test. Streaming cost measured in the browser rather than inferred from jsdom:
**0.641 ms** mean per render (jsdom suggested 4.41 ms), so no material regression.

### R4. `code` and `styleguide` are now checked and gated

The NodeCanvas and AudioPlayerDemo fixes in R1 shipped without a regression
guard. Both are now covered by `svelte-check`, which is the right guard for
prop-contract bugs of that shape.

- **`packages/code`: 16 errors → 0, gated.** Most shared one root cause — the
  `NodeData`/`EdgeData` generics lacked `extends Record<string, unknown>`.
  Fixing that surfaced four *silently ignored* SvelteFlow props underneath:
  `defaultViewport` (not a prop in v1; the stored viewport never applied — it is
  `initialViewport`), `selectable` (it is `elementsSelectable`), and
  `onnodeschange`/`onedgeschange`, which do not exist at all — so the two empty
  `handleNodesChange`/`handleEdgesChange` bodies were wired to nothing and have
  been removed. `connectionLineType`'s `'bezier'` default is also fixed
  (`ConnectionLineType.Bezier === "default"`).
- **`examples/styleguide`: 72 errors + 21 warnings → 0/0, gated.** Real defects
  among them: 11 `<Badge variant="primary">` (no such variant — they rendered
  unstyled), a `<Spinner size="xl">` showcase for a size Spinner does not have,
  and `bind:itemsPerPage` on a Pagination prop that is not `$bindable`, so the
  control never fed back.
- **`SceneDemo.svelte` was not a tooling artifact.** svelte-check parsed the whole
  file as TypeScript. The cause was an unescaped `</script>` inside a template
  literal used as a code sample, which terminated the parser early; escaping it
  as `<\/script>` cleared all six errors. Worth recording because the file
  compiled, transformed via svelte2tsx standalone, and shipped under `vite build`
  — only svelte-check saw it.

Mutation-verified: reverting either R1 fix makes `pnpm check` fail.

### R5. `graphics` packaging

Its build was `vite build && tsc --emitDeclarationOnly`, and `tsc` silently
ignores `.svelte` — so `dist/index.d.ts` re-exported `./components/*.svelte`
files that were never emitted. Consumers got no component types at all. Now
`svelte-package`, like every sibling, and the components ship real prop
declarations.

That change exposed a second defect the old bundle had hidden: graphics used
extensionless relative specifiers throughout, so the preserved module graph did
not resolve in Node. Fixed across 10 files. `maps` and `charts` still fail the
same probe with `ERR_MODULE_NOT_FOUND` — that is the outstanding S2 work, not a
regression from this change.

The "component CSS is never loaded" finding is resolved as a side effect:
svelte-package keeps styles scoped inside components, so there is no orphaned
`dist/index.css` any more.

### R2. Chat XSS — FIXED, mutation-verified

`renderMarkdown` now sanitises with DOMPurify (`isomorphic-dompurify`, a regular
dependency of `chat`). `isomorphic-dompurify` rather than plain `dompurify` is
required, not preferred: `renderMarkdown` is called from `$derived`, so it runs
during SSR, and plain `dompurify` in Node reports `isSupported: false` with
`sanitize` not even a function.

Chat defines its **own** allowlist. Core's `defaultSanitizeOptions` is blog-tuned
and allows none of `del`, `span`, `table`, `input`, nor the `class` attribute —
sanitizing with it would have silently stripped every table, task list and syntax
highlight.

Verified in both environments: 13 tests in chromium, plus the built package
imported into plain Node, where `<script>`, `onerror` and a `javascript:` href
are all neutralised while tables and `language-*` classes survive. Reverting the
one-line sanitise call fails all 6 XSS tests and no formatting test.

Baseline on the current tree: `pnpm -r build` clean, `pnpm -r typecheck` clean
across 19 workspaces, `pnpm -r test` 2131 passing, `pnpm -r check` 0/0 — but see
[C1](#c1-pnpm--r-check-is-a-near-no-op) for why that last number is misleading.

## How this was produced

Three parallel sweeps, plus direct verification:

1. **Satellites** — auth, charts, chat, code, graphics, maps, media. These had
   received essentially no scrutiny; six of them had never had `svelte-check`
   run at all.
2. **core + examples** — hunting silently-wrong behaviour specifically: props
   that are dropped, actions that are dispatched but unhandled, handlers that
   never fire, tests that assert nothing.
3. **Packaging** — what would break for a consumer installing from npm today.

Crashes were confirmed by compiling the real component and mounting it, not by
reading. Where a claim is inferred, it says so.

---

# Part 1 — Open defects

## S1. Crashes

### S1.1 Four components throw `effect_update_depth_exceeded` on mount — VERIFIED

- `packages/maps/src/lib/components/GeoJSONLayer.svelte:71` → `map.reducer.ts:344`
- `packages/maps/src/lib/components/HeatmapLayer.svelte:67` → `map.reducer.ts:344`
- `packages/graphics/src/components/Mesh.svelte:61` → `core/reducer.ts:129`
- `packages/graphics/src/components/Camera.svelte:52` → `core/reducer.ts:66`

The same shape fixed three times in core (Select, Command, ImageGallery). An
`$effect` dispatches unconditionally; `dispatch` reads store state inside that
effect's tracking scope (`store.svelte.ts:72` reads, `:82` writes); the reducer
case returns a fresh object every time. The effect invalidates itself forever.

A `mounted` flag does **not** help — after the first run it is a constant `true`:

```js
let mounted = $state(false);
$effect(() => {
  if (!mounted) { mounted = true; return; }   // constant thereafter
  store.dispatch({ type: 'updateMesh', id, updates: meshConfig });
});
```

Mounting each real component against a store that replicates core's read-then-write
dispatch produced `effect_update_depth_exceeded` with ~1000 dispatches, for all four.

All four are public exports. **No example app and no test in this repo mounts any
of them**, which is why four dead-on-arrival components shipped (maps 0.1.3,
graphics 0.1.2).

Fix: make the reducer case idempotent by value, as in
`packages/core/src/lib/components/ui/select/select.reducer.ts` (`sameOptions`).

For contrast, two components in the same scan are correctly guarded and do not
loop: `maps/Popup.svelte:82` (compares previous values) and
`media/VoiceInput.svelte:90` (compares against store state).

### S1.2 `NodeCanvas` throws on every edge creation — VERIFIED

`packages/code/src/lib/node-canvas/NodeCanvas.svelte:195`

```js
function handleConnect({ connection }: { connection: Connection }) {
  store.dispatch(liftAction({ type: 'connect', sourceNodeId: connection.source, ... }));
}
```

SvelteFlow's `OnConnect` is `(connection: Connection) => void` — it passes the
connection **directly**. Destructuring `{ connection }` yields `undefined`, so
`connection.source` throws. Dragging any node-to-node connection crashes.

### S1.3 The audio-player demo throws on click — VERIFIED

`examples/styleguide/src/lib/components/demos/AudioPlayerDemo.svelte:394`

Passes `isOpen` / `onClose` / `title` to core's `Modal`, which declares none of
them, and omits the required `store`. `ModalPrimitive.svelte:104` then evaluates
`(store !== null && store.state !== null)` — `undefined !== null` is `true`, so it
dereferences `undefined.state`. The demo is registered and reachable.

---

## S2. Breaks a consumer at install or build time

### S2.1 Extensionless relative specifiers in five packages — VERIFIED

The defect already fixed in core's `routing/` and `animation/`. `svelte-package`
copies specifiers verbatim, so these ship as-is. Node ESM cannot resolve them;
bundlers can.

| package | failing import |
|---|---|
| charts | `dist/reducers/chart.reducer` |
| chat | `dist/streaming-chat/index` |
| code | `dist/code-highlight/index` |
| maps | `dist/reducers/map.reducer` |
| media | `dist/audio-player/index` |

The same specifiers land in the `.d.ts`, so consumers also fail to typecheck
under `moduleResolution: node16`/`nodenext` — 12 errors maps, 8 charts, 3 each
code/media, 1 chat (TS2835/TS2307). `auth` and `core` are clean.

Fix at source: `packages/{charts,maps,code,media,chat}/src/lib/**`.

### S2.2 `graphics` ships zero component type declarations — VERIFIED

`packages/graphics/dist/components/` does not exist and no `*.svelte.d.ts` is
emitted anywhere. Its build is `vite build && tsc --emitDeclarationOnly`, and
`tsc` silently ignores the `"src/**/*.svelte"` in its `include`. Every sibling
package uses `svelte-package`, which emits them.

Effect: `Scene`, `Camera`, `Mesh`, `Light`, `WebGLOverlay` fall back to Svelte's
ambient `declare module '*.svelte'` shim. No error is raised — props are silently
`any`, in the Svelte 4 legacy component shape. The package's entire headline API
is untyped.

### S2.3 `graphics` component CSS is never loaded — VERIFIED

`packages/graphics/dist/index.css` holds the extracted scoped styles
(`.scene-container`, `.scene-canvas`, `.webgl-overlay-canvas` — positioning and
sizing). `dist/index.js` contains no `import "./index.css"`, and the README never
mentions the file. A consumer following the README gets an unsized, unpositioned
3D canvas. Vite lib mode extracts CSS by default; `svelte-package` does not have
this problem.

### S2.4 `chat` statically imports its own optional peer — VERIFIED

`peerDependenciesMeta` marks `@composable-svelte/media` optional, and the README
lists it as optional, but both `ChatMessage.svelte` files import it statically:

- `packages/chat/src/lib/streaming-chat/ChatMessage.svelte:6`
- `packages/chat/src/lib/streaming-chat/primitives/ChatMessage.svelte:6`

`ChatMessage` is re-exported from the root barrel, so installing chat without
media is a hard bundler resolution failure. `prismjs`, `pdfjs-dist` and
`@composable-svelte/code` are correctly `await import()`-ed in `markdown.ts:71`;
only `media` was missed.

### S2.5 `maps` never loads the MapLibre stylesheet — VERIFIED

`maplibre-adapter.js` constructs `Map`, `Marker` and `Popup`. MapLibre requires
`maplibre-gl/dist/maplibre-gl.css` for markers, popups and controls to render.
Zero references to any `.css` in `packages/maps/dist/**` or its README. Consumers
get broken popups and controls out of the box.

### S2.6 `charts/ChartTooltip` imports a type that was deleted — **CLOSED (R6)**

Resolved by deleting the component, not by restoring the type: its state, its
actions and the `ChartState.tooltip` field were all removed in the Observable
Plot migration, so nothing could produce the prop it took. Verified as a
consumer against a packed tarball with `skipLibCheck: false`.

Original finding:

`packages/charts/src/lib/components/ChartTooltip.svelte:6` imports `TooltipState`
from `../types/chart.types`, where `chart.types.ts:55` reads
`// Note: TooltipState removed`. The component is still publicly exported, so
consumers with `skipLibCheck: false` get TS2305 from the package root.

### S2.7 `charts` `DataTransforms` cannot be used as a value — **ALREADY CLOSED**

Fixed before this round; `src/lib/index.ts:21` now carries a note explaining why
it is not re-exported as a type. The status table had not been updated.

Original finding:

`dist/index.d.ts:8` re-exports it with `export type`, which shadows the star
export of the const object. `TS2693: 'DataTransforms' only refers to a type`. The
README documents exactly this usage at `:89`; it compiles nowhere.

### S2.8 `code` `NodeCanvas.svelte.d.ts` does not typecheck — **ALREADY CLOSED (R4)**

Original finding:

`TS2344: Type 'NodeData' does not satisfy the constraint 'Record<string, unknown>'`
at `dist/node-canvas/NodeCanvas.svelte.d.ts:9,14`. The generic needs an `extends
Record<string, unknown>` constraint to match `@xyflow/svelte`.

---

## S3. Security

### S3.1 `chat` renders LLM output as unsanitised HTML — VERIFIED

`packages/chat/src/lib/streaming-chat/markdown.ts:155` calls `marked.parse()`
with no sanitiser, and three components pipe the result straight into `{@html}`:

- `streaming-chat/ChatMessage.svelte:117`
- `streaming-chat/primitives/ChatMessage.svelte:107`
- `streaming-chat/primitives/SimpleChatMessage.svelte:53`

Proven against `marked@16.4.1`:

```
input : Hello <img src=x onerror=alert(1)> and <script>alert(2)</script>
output: <p>Hello <img src=x onerror=alert(1)> and <script>alert(2)</script></p>
onerror survives: true | script survives: true
```

Assistant content comes from an LLM, so it is attacker-influenceable through
prompt injection or a compromised endpoint. Shipped in
`@composable-svelte/chat@0.2.4`.

**Agreed fix:** override marked's `html` tokenizer so raw HTML is escaped rather
than emitted. No new dependency, identical behaviour under SSR and in the
browser, and it closes the hole at the source — an assistant message has no
legitimate need to emit arbitrary HTML. The trade-off accepted is that inline
HTML in messages stops rendering as HTML.

`packages/code`'s `{@html}` at `CodeHighlight.svelte:53` is **safe** — Prism
escapes its input (verified: `<img` becomes `&lt;img`) and both fallback paths in
`prism-wrapper.ts:135,145` call `escapeHtml`.

---

## S4. Silently-wrong behaviour

### S4.1 `Combobox` external `value` sync is a no-op — **CLOSED (a4006e5)**

`packages/core/src/lib/components/ui/combobox/Combobox.svelte:104`

```js
$effect(() => {
  if (store.state.selected !== value) {
    store.state.selected = value;      // direct mutation
  }
});
```

`store.svelte.ts:35` declares `let state = $state.raw(...)`, so property mutation
produces no reactivity; `get state()` at `:344` has no setter, so the write lands
on the underlying object; subscribers are notified only from `dispatchCore`. The
component renders exclusively from `$store`, so a changed `value` prop does not
update the UI until some unrelated dispatch happens. It also bypasses the reducer,
so `searchQuery` is never cleared and filtering is never recomputed.

This is the Select bug, unfixed, in the sibling component — and the **next effect
in the same file** carries the comment *"CRITICAL: Dispatch action instead of
directly mutating state. Direct mutation bypasses the reducer's filtering logic"*.
One half was fixed; this half was not.

`ComboboxAction` has no `valueChanged` case, so the action must be added, exactly
as was done for Select (`select.reducer.ts:422`, plus the `External prop sync`
test block at `tests/select.test.ts:582`).

This is the last direct `store.state.X =` write in the repo.

### S4.2 `VoiceInput` wipes transcript history on every dispatch — **CLOSED (b1b334a)**

`packages/media/src/lib/voice-input/VoiceInput.svelte:96`

```js
$effect(() => {
  const mode = $store.mode;
  return () => { transcriptHistory = []; };    // teardown keyed on $store, not mode
});
```

The dependency is the whole state object, which is replaced on every dispatch, so
the teardown runs constantly — audio-level ticks included. `transcriptHistory`
feeds `<VoiceInputPanel transcripts={transcriptHistory} />`, so the panel is
effectively always empty. Measured: `["hello world"]` → `[]` after one unrelated
dispatch.

### S4.3 `NodeCanvas` — three more wrong handler contracts — **ALREADY CLOSED (R4)**

Original finding:

- `:210` `handleConnectStart({ nodeId })` — upstream passes
  `(event, params)`, so `nodeId` is destructured off a MouseEvent and is
  `undefined`. The `if (!nodeId) return` always returns; `connectionStart` is a
  permanent no-op.
- `:116` `connectionLineType = 'bezier'` — not a member of the upstream enum
  (`Bezier = "default"`, `Straight`, `Step`, `SmoothStep`, `SimpleBezier`).
- `:232` `handleNodesChange` is an empty function, wired as `onnodeschange`. All
  bulk node changes — multi-select, keyboard delete, programmatic — are dropped.
  Check `handleEdgesChange` alongside it.

### S4.4 `syncBrowserHistory`'s required `serialize` is never called — **PARTLY CLOSED (R7)**

The `require()` it hid is gone — replaced with the static import that was already
one line above — and `url-routing` is gated, so it cannot come back. The
underlying design point stands: `serialize` is still declared required and still
never called by the 172-line implementation.

Original finding:

`packages/core/src/lib/routing/browser-history.ts:30` declares `serialize` as a
required field. The string appears nowhere in the 172-line implementation; only
`parse`, `parseQuery` and `destinationToAction` are consumed. Optional
`serializeQuery` is likewise never called. The file's own JSDoc admits it handles
only the URL → State direction, but the type still forces every caller to write a
serializer that is discarded.

It hides a live bug: `examples/url-routing/src/App.svelte:30` uses `require()`
inside that callback, in a browser ESM app. It would throw — it never has, only
because it is never called.

Fix: wire it up or drop it from the type. Leaving a required-but-ignored callback
is what let the `require()` bug sit undetected.

### S4.5 Core components freeze their store dependencies — **CLOSED (6f73e96)**

`createStore` re-reads `config.dependencies` on every dispatch
(`store.svelte.ts:72`), so a plain object literal freezes what the props resolved
to at mount. `FileUpload.svelte:43` and `Tooltip.svelte:65` already carry the
getter fix and a comment explaining it. These still use frozen literals:

Corrected while fixing: this is **seven** components, not six, and Toaster is a
separate and worse problem. Now VERIFIED rather than INFERRED, by
`packages/core/tests/dependency-freshness.test.ts` — each case confirmed red
first with `(first=1, second=0)`, and reverting any one component's fix fails
exactly its own test.

**Toaster is not fixed, and a getter there would be a fake fix.** Its
`dependencies` prop is entirely *dead*, not merely frozen: `toastDismissed`
returns early for any toast not in the internal store, prop-supplied toasts
never enter it, and nothing can put one in — no `store` prop, no context, no
component export. `onToastAdded`, `onToastDismissed` and `generateId` can never
fire. Needs its own decision: expose the store, or delete the prop. Tracked as
`it.skip` in the test file with the reasoning inline.

| file | frozen |
|---|---|
| `ui/accordion/Accordion.svelte:101` | `onExpand`, `onCollapse` |
| `ui/dropdown-menu/DropdownMenu.svelte:72` | `onSelect` |
| `ui/tree-view/TreeView.svelte:96` | `onSelect`, `onExpand`, `onCollapse`, `loadChildren` |
| `ui/combobox/Combobox.svelte:95` | `loadOptions` |
| `components/command/Command.svelte:72` | `onCommandExecute`, `filterFunction` |
| `ui/carousel/Carousel.svelte:28` | `onSlideChange`, `onAutoPlayStart`, `onAutoPlayStop` |

`Select`, `Calendar` and `Pagination` are already safe.

### S4.6 `product-gallery` — `size="default"` strips all sizing — **CLOSED (R7)**

Gate-caught and gate-protected.

Original finding:

Four call sites: `CategoryFilter.svelte:53,71`, `ProductList.svelte:139`,
`ProductCard.svelte:113`. `Button.svelte:98` defines only `sm/md/lg/icon`, so
`sizeClasses['default']` is `undefined`, `clsx` drops it, and the button renders
with no height and no padding. The trap: `variantClasses` *does* have a `default`
key, so `variant="default"` works and this looks like it should too.

### S4.7 `product-gallery` — every share button has the same broken test hook — **CLOSED (R7)**

Gate-caught and gate-protected.

Original finding:

`Share.svelte:75` — `data-testid="share-method-{method.method}"` where `method` is
already destructured to a string. All four buttons render
`data-testid="share-method-undefined"`. No test selects it yet, so this is a
pre-broken hook that will silently match nothing, or four things, on first use.

### S4.8 `charts/Chart.svelte:86` — selection callback misfires — **CLOSED (567fd4d)**

Depends on the whole `$store`, so `onSelectionChange` re-fires on every action
(including 60fps zoom progress) with unchanged data; and because it is guarded on
`selectedData.length > 0`, consumers are **never** notified when selection clears.

### S4.9 `code` exports four functions that do nothing — **CLOSED (23d6b44)**

`packages/code/src/lib/code-editor/codemirror-wrapper.ts:240-288` —
`updateEditorLanguage`, `updateEditorTheme`, `updateEditorReadOnly`,
`updateTabSize`. Empty bodies, `_`-prefixed parameters, "TODO: Implement with
Compartment". All four are re-exported from `src/lib/index.ts`; none is called
internally. A consumer calling `updateEditorTheme(view, 'dark')` gets no error
and no effect.

npm has `@composable-svelte/code` at 0.1.0–0.1.3, so removal is breaking — but a
caller today gets silence, and after removal gets a compile error pointing at the
problem. Recommend removing with a minor bump rather than shipping no-ops a fifth
time.

**Resolved by implementing rather than removing.** All four now reconfigure
through `Compartment`s, signatures unchanged, and `CodeEditor.svelte` calls them
from a guarded sync effect — the toolbar's language `<select>` and theme button
were wired to these and did nothing. Covered by
`packages/code/tests/code-editor-reconfigure.test.ts`, which asserts against the
live `EditorView` (a store-only assertion passes with the no-ops restored).

**Still open, split out deliberately: TWO more dead controls.**

- `showLineNumbers` is accepted by `createEditorView` and never read —
  `basicSetup` hardcodes `lineNumbers()` and is not customizable — so the
  toolbar's "Line Numbers: On/Off" button does nothing.
- `enableAutocomplete` is applied only at creation
  (`codemirror-wrapper.ts:243`) and has a live `toggleAutocomplete` reducer
  case (`code-editor.reducer.ts:96`) that reaches no compartment.

Unlike the four that were fixed, neither has an exported updater, so closing
them means **new public API** — and for line numbers, either inlining
basicSetup's contents or a `Prec` override. Different change, different review.
The second was found by the review that followed the fix, which is a reminder
that "the fifth" was an enumeration I asserted rather than derived.

### S4.10 `AuthGuard.onAnonymous` re-fires on every dispatch — NOT A DEFECT (corrected)

The premise was right and the conclusion did not follow. `const state =
$derived(store.state)` does change identity on every dispatch **that produces a
new state** — but no action in `sessionReducer` transitions anonymous ->
anonymous. Measured, applying every member of the union to a resolved-anonymous
state: `sessionResolved` (both shapes), `sessionResolveFailed`,
`loginSucceeded`, `loginFailed` and `loggedOut` all return the **identical**
object (the last three via the epoch guard), which `dispatchCore` does not
notify on; `resolveSession`, `login` and `logout` genuinely leave anonymous. So
`onAnonymous` fires exactly once per entry, which is correct.

Closed by `e994ff4`, which adds `tests/auth-guard-anonymous.test.ts` pinning
that reducer property from both ends, and narrows the effect's dependency to a
boolean as hardening. The tests pass **before and after** the narrowing — they
guard a future anonymous -> anonymous transition, not the change itself.

---

## S5. The `svelte-check` backlog

### C1. `pnpm -r check` was a near no-op — **CLOSED (R7)**

CI runs `pnpm -r check`, but `pnpm -r` only runs the script where it exists. The
commit that introduced this said "check every package that can be" — literally
true, but the effect was nearly nil, and it is why the satellite errors below
stayed invisible after it landed.

**R6 took coverage from 4 workspaces to 9; R7 took it to all 19** and encoded the invariant in
`packages/core/tests/repo/check-coverage.test.ts`, so the remaining ten cannot be
forgotten. This entry also understated the gap twice over: it said "six packages
are ungated" and counted only packages — **ten of the eleven examples were
ungated too**, holding 32 errors and 11 warnings nobody had ever measured.

### C2. `graphics`'s 0/0 was an artifact — **CLOSED (R6)**

Its tsconfig now extends the root, and all 18 hidden errors are fixed. The count
in the original finding below was 14, measured with `tsc`, which never reads
`.svelte`; svelte-check finds four more.

Original finding:

### C2. `graphics`'s 0/0 is an artifact

`packages/graphics/tsconfig.json` is standalone — no `exactOptionalPropertyTypes`,
`noUncheckedIndexedAccess`, `noImplicitReturns` or `noFallthroughCasesInSwitch`,
plus `allowJs`/`checkJs`. Re-run with the root's flags it yields **14 errors**
(e.g. `shaders/render-pipeline.ts:341` object possibly undefined). Its clean bill
of health is not comparable to core's.

### Counts

| package | errors | warnings | tsconfig extends root |
|---|---|---|---|
| auth | 0 | 0 | yes |
| charts | 5 | 1 | yes |
| chat | 15 | 13 | yes |
| code | 18 | 0 | yes |
| graphics | 0 (**14** with root flags) | 0 | **no** |
| maps | 3 | 0 | yes |
| media | 14 | 5 | yes |
| **examples/styleguide** | **73** (28 files) | — | — |

`tsc --noEmit` passes in all seven satellites, so `pnpm -r typecheck` gives zero
signal on `.svelte` files — every component finding above is invisible to the
current pipeline.

### Notable items inside the backlog

- **`$props<Props>()`** — the pre-release signature, which takes no type argument
  in released Svelte 5. `code/ViewportSetter.svelte:19` and
  `media/VideoEmbed.svelte:31`. Compiles fine, so not a crash; the effect is that
  every prop passed to those components is unchecked. `VideoEmbed` is public.
- **Three `media` components are excluded from type checking by a name
  collision.** `MinimalAudioPlayer.svelte:38`, `FullAudioPlayer.svelte:45`,
  `PlaylistView.svelte:42` each declare `const state = $derived($store)`, which
  makes svelte2tsx resolve every later `$state(...)` as a store subscription of
  that local. Accounts for 8 of media's 14 errors. The Svelte compiler resolves
  the rune correctly, so runtime is fine — but those locals are untyped.
  (Core hit exactly this in `Tooltip.svelte` and it was fixed by renaming.)
- **`chat` duplicates components** — `streaming-chat/ChatMessage.svelte` and
  `streaming-chat/primitives/ChatMessage.svelte` are near-identical, as are
  `StreamingChat.svelte` and the three `variants/*StreamingChat.svelte`. Fixes
  need applying twice, or the dead copy deleting.
- Roughly half the backlog is mechanical: `exactOptionalPropertyTypes` on
  forwarded optional props, `noImplicitReturns` on effect cleanups, self-closing
  non-void tags.

### a11y warnings

- **chat (13):** five ambiguous self-closing `<textarea />`; `<video />`
  self-closing and missing `<track kind="captions">`
  (`PendingAttachmentPreview.svelte:47`, `VideoPlayer.svelte:214`); `<div>` with
  mouse handlers and no role (`VideoPlayer.svelte:192`); click handler on `<img>`
  with no keyboard handler (`ImagePreview.svelte:133`); `role="dialog"` without
  `tabindex` (`AttachmentPreviewModal.svelte:65`); `autofocus`.
- **media (5):** progress-bar scrubbers and playlist rows are keyboard
  inaccessible (`MinimalAudioPlayer.svelte:246`, `FullAudioPlayer.svelte:351`,
  `PlaylistView.svelte:119`); self-closing `<iframe />`.
- **charts (1):** `tabindex="0"` with `role="img"` (`Chart.svelte:102`).

---

## S6. Tests

### S6.1 Coverage

| package | tests | mounts a component? |
|---|---|---|
| auth | 38 | **yes** — the only satellite that does |
| charts | 34 | no |
| chat | 32 | no |
| code | 9 | no |
| graphics | 13 | no |
| maps | 32 | no |
| **media** | **0** | no |

`auth` is the only satellite that renders a component, and the only one with 0
svelte-check errors. That correlation is the whole story of this sweep — and
every one of the four crashers in S1.1 is untested and unused by any example, so
nothing here would have caught them.

`media` has 11 components, zero tests, and `"test": "vitest run
--passWithNoTests"` actively hiding it. `examples/styleguide` is the same: zero
tests, `--passWithNoTests`, 73 svelte-check errors.

chat, code and media each pay for a full Playwright browser-mode config that no
test uses.

### S6.2 Tests that never run

`examples/ssr-server/tests/e2e/ssr.spec.ts` holds 14 Playwright tests, but the
package defines only `test:e2e` — no `test` script — so `pnpm -r test` skips the
workspace. Its assertions are also stale (asserts a `selectedPostId` that no
longer exists on `AppState`, and a page title the server does not emit), so
wiring it up is its own piece of work.

### S6.3 Tests that assert nothing

The mutation-draft mistake (a `send` callback that assigns instead of asserting)
is gone repo-wide. These remain:

- `packages/core/tests/form.test.ts:666` — six `send`/`receive` calls, zero `expect`
- `packages/core/tests/test-store.test.ts:112` — no `expect`
- `packages/core/tests/navigation/scope.test.ts:119` — compile-time only; can never fail
- `packages/core/tests/lib/actions/focusTrap.test.ts:186` — "should not throw", no `expect`
- `packages/core/tests/component-mount.test.ts:68` — `expect(container).toBeTruthy()` is trivially true
- `tests/routing/parser.test.ts:413,420` — two `it.skip`

### S6.4 Orphaned artifacts

`packages/core/tests/__screenshots__/` holds directories for `cmd-icon.tmp.test.ts`
and `loop-probe.tmp.test.ts` (leftover probes of mine) and `breadcrumb.test.ts`
(the test is now `breadcrumb.browser.test.ts`). Gitignored, so cosmetic.

---

## S7. Packaging hygiene

- **Eight dead runtime dependencies** — zero hits in both `src/` and `dist/`:
  core `@floating-ui/dom`, `@formatjs/intl`; charts `d3-scale`, `d3-shape`; code
  `@codemirror/lint`, `@codemirror/search`, `prism-themes`; graphics
  `@babylonjs/loaders` (externalised in its vite config, so a pure install cost).
- **`maps` phantom type dependency** — `map.types.ts:7` imports from `geojson`,
  which is a devDependency only. Type-only, so the runtime bundle is fine, but the
  emitted `.d.ts` references it and consumers get an unresolved type.
- **`sideEffects: false` missing on 7 of 8** (only `auth` declares it), so
  bundlers cannot drop unused re-exports. A `CodeHighlight`-only user bundles all
  of CodeMirror *and* SvelteFlow; a `MinimalStreamingChat` user bundles yjs.
- **core lacks `publishConfig.access`** — the only one of the eight missing it.
- **`graphics` lacks `license`, `main`, `types`**, plus `author`, `repository`,
  `homepage`, `bugs`, `keywords` and a `prepack` script. A `LICENSE` file exists
  and ships, but npm will render the package as unlicensed.
- **`./package.json` is not resolvable on 7 of 8** — the five wildcard packages
  map it to a nonexistent `./dist/package.json.js`; core and graphics have no
  entry. Only `auth` exports it.
- **Unreachable public API in core** — `dist/utils.js` (which exports the
  documented `cn()` helper) and `dist/keyboard.js` are shipped but reachable from
  no subpath.
- **`chat` publishes internal planning docs to npm** —
  `src/lib/streaming-chat/plans/` is copied into `dist` by `svelte-package`: six
  files teaching import paths that have never resolved
  (`@composable-svelte/code/collaborative`, `/primitives`, `@composable-svelte/core/utils`).
  Same pattern, smaller, in `media/dist/audio-player/AUDIO-PLAYER-SPEC.md` and
  `code/dist/node-canvas/README.md`.

### Clean — do not re-hunt

No phantom runtime dependencies anywhere; every bare specifier in every shipped
`dist` is declared. Every exports-map target exists; every `files` array is
complete; every tarball contains LICENSE and README. All eight local versions are
ahead of npm, so nothing blocks a release, and all peer ranges are mutually
satisfiable. Only `core` reaches Node builtins, and only from its declared
Node-only subpaths. Dispatched-but-unhandled actions: zero outside the items
above. Nested interactive elements in satellites: zero.

---

## S8. Documentation

- **`createTestStore` is documented as a root export of `@composable-svelte/core`
  in five package READMEs** — charts:226, chat:196, code:186, media:199,
  graphics:241. It lives at `@composable-svelte/core/test`.
- **Names that do not exist** — `createLiveAPI` (root `README.md:269`,
  `core/docs/quick-reference.md:272`; the real one is `createAPIClient`);
  `matchPattern` (`quick-reference.md:384`; it is `matchPath`);
  `createParserConfig` (`docs/navigation/tree-based.md:921`); `createMockStorage`
  (`docs/backend/dependencies.md:472`).
- **`code`'s README** names `createInitialCodeHighlightState` and
  `createInitialCodeEditorState`; the real exports are `createInitialState` and
  `createEditorInitialState`. Three of its four runnable examples are wrong.
- **`media` JSDoc points at the wrong package** — `audio-player/index.ts:15`,
  `video-embed/index.ts:10`, `voice-input/index.ts:15` all say
  `@composable-svelte/code`. These compile into the published `.js` and `.d.ts`.
- `charts` skill tells users to `npm install @observablehq/plot`, which is already
  a hard dependency.
- `maps` exports the component as `MapPopup`; `API.md` uses bare `Popup`, which is
  a type only.

---

## S9. Known-open, carried from earlier rounds

- `examples/product-gallery/ProductCard.svelte:56` and `:122` wrap `<Button>`
  components in raw `<button>` elements — a genuine `<button>`-in-`<button>` in
  the rendered DOM. The compiler cannot warn, because the nesting crosses a
  component boundary, so no svelte-check gate will ever catch it.
- `<Command open={true} />` never opens at mount — **CLOSED (c533691)**, and the
  mechanism recorded here was wrong. It was not "two effects fighting": the
  second effect writes `true` over `true` and is inert, and no binding needed
  redesigning. `createInitialCommandState` honoured `isOpen` but hardcoded
  `presentation: { status: 'idle' }`, while the markup renders on
  `presentation.status !== 'idle'` and the prop-sync effect's guard
  (`$store.isOpen !== open`) is already satisfied at mount — so `opened` never
  dispatched. One line in `command.types.ts`.
- `ssr/render.ts:9` imports `svelte/server`, which the `/ssr` barrel pulls into
  any client bundle importing `hydrateStore`. Verified fully tree-shaken — the
  bundles are byte-identical — so this is tidiness, not weight.

## S11. Outstanding — the dead-behaviour campaign

The rule this section is measured against: **nothing a consumer can pass,
configure, click, or import may produce no effect.** `core`, `media` and `chat`
have been through it; `chat` shipped 0.3.0 after four review rounds. Everything
below is measured, not estimated — the commands that produced each count are
named so the next person can re-run them rather than trust them.

T1–T6 are done: every package has now been swept. T7 (review `ed855dd`), T8
(266 optional props) and T9 (the graphics overlay subsystem) remain, and are
independent of each other — T7 is a review rather than a fix, T8 is mechanical
but wide, and T9 is a project in its own right.

### T1. No workspace typechecked its tests — DONE

The entry below said three of eight packages did. **None did.** Two claims in it
were wrong, and both mattered:

- `chat` and `media` were credited with a second `tsc` pass. Their `typecheck`
  script is `tsc --noEmit`, one pass, over `src` alone. Every workspace's was.
- `core` was credited with a working `tsconfig.test.json`. It had one, correctly
  spelled, adding `tests/**` to `include` — and it resolved **zero** of core's
  123 test files. `extends` *replaces* `include`/`exclude` rather than merging,
  so redefining only `include` left the parent's `"**/*.test.ts"` in `exclude`,
  which filtered every test straight back out.

So eleven `tsconfig.test.json` files existed and **nothing invoked any of them**:
`check` and `typecheck` both pointed at `tsconfig.json`, which excludes tests.

Resolved by pointing `check` at `tsconfig.test.json` wherever one exists (twelve
workspaces; `data-table` and `product-gallery` cover their tests through their
main config, five examples have no tests). `svelte-check` rather than the `tsc`
pass this entry recommended — it reports TS diagnostics for plain `.ts` files
too, making it a strict superset, while `tsc` cannot read `.svelte` at all and
reports TS2614 false positives for named imports from `<script module>`.

The blind spot was hiding real defects, not just drift. In `core` alone:

- `Effect.api` / `Effect.websocket` typed as non-existent for consumers.
- `deps.dismiss()` never dismissed through `ifLet` — an unbounded dispatch loop
  ending in `RangeError`, plus eight wrong documented call shapes.
- `combineReducers` could not infer `Action`; `Destination.match` could not take
  handlers returning different types; `scopeTo(...).into()` could not chain past
  an optional level. In each case the form in the function's own JSDoc
  typechecked for nobody.
- Two of `matchPath`'s five documented examples threw rather than matched.
- `TestStore.advanceTime` threw without fake timers, making 21 documented
  examples unrunnable.

Guarded by `packages/core/tests/repo/typecheck-coverage.test.ts`, which asks
`tsc --showConfig` what each workspace's checked config actually resolves and
compares it against disk. A byte-comparison of the script could not have caught
core: its script looked more thorough than the ones that worked. Mutation-
verified by reproducing core's exact original failure — strip `exclude`, all 123
files report missing.

### T2–T5. The animation policy is finished — DONE

The `BACKLOG` is empty and deleted, and `examples/` is under the gate. Every file
under `packages/*/src` and `examples/*/src` now either complies or is in the
Exception Register.

**T2 (`media` ×2), T3 (`code` ×2), T4 (`maps` ×1)** — five files, five
violations. Four were a base-rule `transition:` serving only a `:hover`/`:focus`
change and were deleted. The two `media` panels were the blocked ones: converting
would have deleted the only `prefers-reduced-motion` guard each had, and
`animateFadeIn` reading the preference itself is what removed that trade. Both
are now `animateFadeIn` in a guarded `$effect`; the `translateY(4px)` rise was
dropped so `transform` keeps a single author.

The `BACKLOG` comment contained a trap. It said each panel's `fadeIn` was "the
only thing its own `@media (prefers-reduced-motion: reduce)` block disables" —
true for `PushToTalkPanel`, false for `ConversationModePanel`, whose block also
stops the `.status-dot` spinners and is their only escape. Following it literally
would have deleted a live accessibility guard as a side effect of a policy tick.
The scanner cannot see that class of loss — it looks for prohibited animations,
not for a missing guard on a permitted one — so
`media/tests/voice-input-panel-entrance.test.ts` pins it.

**T5 (`examples/`)** — the recorded count was **24 across 13 files**. That is the
raw-`<style>` subset; the stated method, "running the scanner's own five
detectors", was never applied, and `TAILWIND_TRANSITION` is one of the five. The
real count, from the scanner once the root was added, is **78 across 33 files** —
`product-gallery` and `styleguide`, the two largest example apps, appear nowhere
in the old table. All 78 cleared: 76 deletions, and two genuine lifecycles
converted to Motion One (`ShaderImage2`'s WebGL fade-out, `PostDetail`'s mount
fade).

Two scanner defects were found and fixed first, in `60da1c0`:

- The Tailwind detectors read English prose as a class list —
  `<li>… CSS transition effects</li>` matched. They now read only quoted spans,
  which is where a utility class can live and prose cannot. A `class`-attribute
  gate was the obvious alternative and was wrong: it drops `Progress.svelte`'s
  `cn('… transition-[width] …')`, a live hit on a line with no `class` token.
- No `.css` file anywhere was scanned; `walk()` kept only `.svelte`. Latent, not
  live — but a `@keyframes` in `globals.css` would have been invisible.

Three prose claims about the policy were false and are corrected: the test's own
header said `Carousel` and `Progress` "sit in the BACKLOG" (one is converted, the
other is in the REGISTER twenty lines below the comment denying it); the guide
repeated it; and the guide's Register table had four rows to the test's five.

### T6. `auth`, `charts` and `graphics` — DONE

The entry below said "no sweep has been run against them", marked INFERRED
because nobody had looked. Looking found ~67 verified items across the three,
and a prior sweep's numbers were wrong in both directions: it reported `auth`
**clean** (it was not — ten findings, two substantive) and gave `charts` 6 and
`graphics` 8 where the real figures were ~24 and ~33.

**`auth`** — the only liveness defect in the campaign. From `status:
'loggingOut'` every action was a no-op except a matching `loggedOut`, produced
only by `fetchLogout`'s own effect — plain `Effect.run`, no timeout, no
`AbortSignal`, no cancellation. A request that never settled bricked the store
permanently: the authenticated UI stayed up with `isRevalidating: true` and
clicking sign out again did nothing. Logout is `Effect.cancellable` now, and the
dependencies take a signal. Also: `AuthGuard` blanked the UI for the whole of a
re-login, contrary to both its own header comment and the README.

**`charts`** — one root cause explained a whole class. `ChartPrimitive` decided
whether to redraw by comparing array *lengths*, so `dimensions` was not in the
set at all (every resize inert), `setData` with an equal row count never redrew,
moving a selection never redrew, and no prop change reached the canvas until an
unrelated data change happened to rebuild. Two buttons in the shipped styleguide
did nothing. Identity comparison fixes all of it. Then `enableTooltip`,
`enableAnimations`, `transitionDuration` and panning implemented; `spec` /
`updateSpec` / `brushExtent` / `brushMove` / `brushEnd` removed; the Playwright
suite deleted (no route, no server, no baselines, never run); and the README's
"WCAG 2.1 AA compliant / Full keyboard navigation / Data table fallback"
corrected against a package with no `tabindex` and no key handler.

**`graphics`** — three separate mechanisms each broke the state → renderer path,
and none could be seen because `Scene.svelte` was never mounted by a test and
could not be: jsdom has no WebGL and the adapter was constructed internally. The
sync is extracted behind a `SceneAdapter` interface now, which is what made the
rest verifiable. `tick` mutated meshes in place so the diff compared an object
with itself (five ticks moved a mesh 10 units in state and produced one adapter
call); two diff baselines were seeded from live state *after* the children had
dispatched, so every `<Camera>` prop and `backgroundColor` was inert at mount;
and `<Light>` had no `$effect` at all. Lights gained the identity meshes already
had — without it, removal took the wrong light and the sync had to clear and
re-add every light on any change. Then `roughness`, the orthographic camera and
geometry changes implemented; five dead fields and the WebGPU claim removed.

Three fixes were caught by tests I had written badly and had to redo: a camera
test that dispatched *after* seeding its baseline and so passed against the
broken code; a charts prop-effect that hung the runner because `renderPlot`
reads and writes the same `$state`; and a `<Light>` effect that hit
`effect_update_depth_exceeded` because `updateLight` was not idempotent by value
while `updateCamera` and `updateMesh` were.

**Then the hostile review of the `graphics` sweep found 20 more, and three of
them were mine.** The premise the whole sweep rested on — that the Babylon
adapter cannot be tested because jsdom has no WebGL — was false. `NullEngine` is
Babylon's headless backend and runs here unchanged. I asserted the opposite in
three commit messages and two test-file headers, and it cost:

- **a material leaked on every mesh update** — `applyMaterial` built a
  `new StandardMaterial` per call and never disposed the outgoing one, measured
  at 61 materials after 60 animated frames. Dead until the commit that made
  animations reach the renderer, at which point the README's own `loop: true`
  example leaked 60 a second. `removeMesh` orphaned the material too, so the
  geometry rebuild leaked once per rebuild.
- **`roughness` was still inert for 7 of the 13 documented presets.** Mapping it
  onto `specularPower` was not enough while `metallic` mapped onto
  `specularColor` as a grey: Babylon's shader is
  `finalSpecular = specularBase * specularColor`, so `metallic: 0` gave black and
  the exponent could not change a pixel — and `metallic: 0.0` is what the docs
  teach for plastic, rubber, wood, stone and glass, the mirror included. The
  "roughness now works" doc rewrite was published against a fix that did not.
- **making `<Light>` reactive turned every intensity tweak into a
  dispose-and-reconstruct** of the Babylon light, one layer below the teardown
  the same commit claimed to have removed.

Plus, pre-existing: two `<Light>`s sharing an id crashed the app with
`effect_update_depth_exceeded`; changing an `id` orphaned the light permanently;
`tick` produced NaN on `duration: 0` and never stopped; an animation outlived
the mesh it targeted; the resize listener was anonymous and unremovable;
orthographic bounds never recomputed; `<Camera orthoSize>` was documented but
was not a prop; and `SKILL.md` still documented the positional light API that
had been replaced, alongside six WebGPU claims and two examples that did not
compile.

Two of my own tests were weak in the way the campaign keeps finding: one
asserted `toBeTruthy()` on a generated id, which a hardcoded literal passes, and
one restated another test under a name describing a property it never checked —
and whose claim was false anyway.

The mount lifecycle is now uniform across `<Camera>`, `<Mesh>` and `<Light>`:
one `$effect`, no `onMount` dispatch, dispatches untracked so the effect follows
its props rather than the store it writes to, and — for the two with ids —
explicit ownership, so a rename moves the object and a collision stands aside
instead of fighting. The `mounted` flag all three carried skipped nothing: it
was `$state`, so writing it inside the effect that read it scheduled the second
run it existed to prevent.

**A second hostile review, of the repairs, found 20 more — two of them
regressions from the repairs themselves.** The pattern is now well established
and worth naming: each round's fixes are written with more confidence than the
code they replace, and that confidence is where the next defect lives.

- **The resize handler snapped the user's camera back.** Making resize
  re-apply the whole camera config so orthographic bounds could track the aspect
  ratio also re-applied `position` and `lookAt` — and `initialize` hands the
  camera to the user via `attachControl`. A camera dragged to radius 25 returned
  to 11.18 on one resize event, which fires continuously during a window drag.
- **Two animations on one property made the mesh strobe at 30Hz.** The
  idempotency guard compared against the mesh *before* the tick, so whichever
  animation produced that value was skipped and the other wrote; the roles then
  swapped every frame. The same commit message defends per-mesh accumulation
  precisely so animations do not drop each other.
- **`roughness` was still inert for dark metals.** Having `metallic` tint the
  highlight toward the diffuse colour moved the black-specular case rather than
  removing it: a near-black surface at `metallic: 1` gets a near-black
  `specularColor`, and Babylon multiplies.

**And a claim I asserted, had repeated back to me, and rewrote a comment around
without ever checking: `SpotLight` does not extend `PointLight`.** Both extend
`ShadowLight` in Babylon 8.36.1. The `!(light instanceof SpotLight)` exclusion
guarding against that hierarchy could never be false, and it survived a mutation
test *because* it was dead — which is the signal I should have read the first
time rather than writing a better comment for it.

Also closed: `addLight` and `updateLight` disagreed on `radius: 0`; every
`startAnimation` began its own rAF chain, so five animations produced four times
the ticks of one; `startAnimation` accepted duplicate ids where meshes and
lights now reject them; `duration: 0` with `loop: true` completed for ever;
`hexToColor3` silently returned white for anything but 6-digit hex while two
documents advertised "hex or CSS color"; and `package.json`'s description and
`webgpu` keyword — both npm-visible — still claimed WebGPU, as did six sibling
skill files.

Three of my own tests were vacuous: `<Camera>`'s untrack and `<Scene>`'s
success-branch cancellation had no coverage at all, and the duplicate-`<Light>`
test asserted only that nothing threw, never inspecting the state the defect
lives in.

graphics: 25 tests at the start of T6, 56 at the end of the sweep, 101 after the
first review, **117** after the second.

### T10. 41 documented Svelte examples do not compile — VERIFIED

`tests/repo/doc-examples.test.ts` gained a compile arm this round, after my own
fix for the graphics README's missing-`{store}` examples introduced a *duplicate*
`{store}` that a verification grep could not see because it spanned two lines.
The same class of miss, twice, on the same file.

Pointed at every markdown file in the repo it finds **41 non-compiling blocks
across 16 files**:

| reason | count | reading |
|---|---|---|
| `global_reference_invalid` | 21 | an excerpt whose `<script>` shows only part of itself, so an auto-subscribed store is undeclared — mostly benign |
| `js_parse_error` | 13 | likely real |
| `script_duplicate` | 3 | likely real |
| `expected_token` | 2 | likely real |
| `state_invalid_placement` | 1 | likely real |
| `block_unclosed` | 1 | likely real |

So roughly 20 look like genuine syntax errors in documented examples, and each
needs individual judgement about whether the excerpt or the code is wrong. The
guard is therefore scoped to a list of *swept* documents — currently the two
graphics ones — which grows as sweeps land. Gating the repo on documents nobody
has read in this campaign would be a large unreviewed change.

A second hole found while building it: **the fence label cannot be trusted.**
`composable-svelte-graphics/SKILL.md` carried 45 ```typescript blocks against a
single ```svelte, and most of the 45 were component markup — which is why a
fence-only check found nothing in the very file whose examples were wrong. 22
were relabelled; the 6 that deliberately elide with `...` cannot compile by
design and are counted so the number cannot quietly grow. The other packages'
skill files have not been checked for this.

### T7. `ed855dd` is unreviewed — VERIFIED

The last commit of the chat pass. Every review round in this campaign found real
defects in the previous round's repairs — including two fixes that were outright
wrong, and three repo guards that could not fail. The prior is that this one is
not the exception.

---

---

# Part 2 — Already fixed

47 commits. The recurring classes, and where the canonical fix now lives:

| class | canonical fix |
|---|---|
| Effect loop: unguarded dispatch + non-idempotent reducer | `ui/select/select.reducer.ts` (`sameOptions`/`sameSelection`) — also fixed in Command, ImageGallery |
| Frozen store dependencies | `ui/file-upload/FileUpload.svelte:43` (getters, with the reasoning in a comment) |
| Writing to `store.state` | `ui/calendar/Calendar.svelte` (`propsChanged` action) |
| Phantom dependency | `packages/chat` (`yjs`), core (`vitest` as optional peer) |
| Server-only code in a client entry | `core/ssr/middleware` + `core/ssr/sanitize` split, guarded by `tests/ssr/entry-graph.test.ts` |
| Extensionless specifiers | `core/routing`, `core/animation` |
| Invalid HTML nesting | `ui/select/Select.svelte` (clear button moved out of the trigger) |
| Dead event handlers | `ui/tooltip/Tooltip.svelte` (`onfocus` → `onfocusin`) |
| Runaway-effect regression guard | `tests/component-mount.test.ts` — 14 components, inline literal props |

## Corrections made to earlier claims

Recorded because they were wrong when first reported:

- `--threshold error` does **not** gate; it only filters what is printed.
  `--fail-on-warnings` is the gating flag.
- The Select `optionsChanged` crash was **introduced** by a "fix" earlier in this
  session — adding a reducer case turned a silent no-op into an infinite loop.
- The first sweep for unguarded dispatch effects classified `ImageGallery` as
  guarded, because the heuristic looked for an `if` before the dispatch rather
  than for a comparison against state. The `if` was on a constant.
- Two "AnimatedNavigationStack guards a runaway effect" tests did not — mutation
  testing showed the effect converges. The header was rewritten to say what the
  tests actually assert.
- Package-count and size figures for the DOMPurify dependency were measured by
  counting top-level `node_modules` directories, which undercounts. The real
  numbers are +69 packages / +32.8 MB.
- "sanitizeHTML still active" was asserted from `<strong>` surviving in the
  output — which unsanitised content would also show. The example's post content
  is entirely allow-listed, so sanitisation is a no-op on it.

---

# Verification protocol

Applied to everything above, and to anything added later:

1. **Mutation-verify every fix.** The test must fail with the fix reverted. A
   test that cannot fail is not a guard.
2. **Probe like a consumer** for packaging changes: `npm pack`, install the
   tarball outside the workspace, `import()` each subpath in plain Node, and
   typecheck a scratch project under `nodenext`.
3. **Distinguish verified from inferred** in every report.
4. **A runaway effect poisons Svelte's error state for the rest of the test
   file** — one real failure shows up as several. Isolate the first before
   concluding. When ImageGallery was broken, four healthy components failed
   alongside it.
5. Core's browser suite is flaky under load; re-run before believing a failure.
6. **A concurrent agent mutating the tree looks exactly like a flaky test.**
   During Wave 3, `dependency-freshness` failed intermittently with the precise
   defect signature `(first=1, second=0)` while a review agent was reverting
   source files to run its own mutations. Every case passed in isolation. Do not
   run the full suite while another agent has the working tree.

---

## S10. Wave 3 — behavioural defects, and what the hostile review caught

Seven items closed (S4.1, S4.2, S4.5, S4.8, S4.9, S4.10, S9(b)), each with a
mutation-verified test written *before* the fix. An independent adversarial
review of the six contained fixes then found **five more real defects**, all
reproduced before being fixed (`7c9cbd8`). Worth recording because the pattern
repeats:

| # | what the review found | why the original guard missed it |
|---|---|---|
| F1 | `<Command />` could not be dismissed by Escape, backdrop or `open={false}` | both render tests asserted only that the dialog was PRESENT at mount; the reducer test drove a `TestStore` and never rendered. Nothing opened the palette and then tried to close it. |
| F2 | charts still notified on re-selecting the same point and on clearing an empty selection | the fix targeted the *storm* and the *clear*; nobody tested a non-change that still allocated |
| F3 | Command's frozen ternary — the shape the commit called "the worst" — had no test | the test file asserted "no DOM route exists", which was false (`Enter` on the dialog) |
| F4 | an initially-open palette lost its dismissal animation | no test compared it against a prop-opened control |
| F5 | commit claimed `ResizeObserver` was constructed unconditionally; it is conditional | reasoning reached the right conclusion from a wrong premise |

**The generalisable lesson: F1, F3 and F4 are all the same miss.** Each test
asserted a *state* (dialog present, callback swapped, palette renders) where the
defect lived in a *transition* (dialog dismissed, prop arriving after mount,
palette animating out). An assertion at one point in a lifecycle cannot see a
lifecycle that is broken elsewhere. Where a component has an open/close, a
mount/update, or an in/out pair, **test the round trip and pin it against a
control that already works** — F4 was only legible because the prop-opened
palette animated and the initially-open one did not.

### T8. 266 optional props cannot be forwarded from a wrapper — VERIFIED

Under `exactOptionalPropertyTypes` (set repo-wide), an optional prop read from
`$props()` has type `T | undefined`, and that cannot be assigned to a bare `T?`.
So a component that forwards its own props to a library component does not
typecheck — the library component cannot be wrapped.

Measured over `packages/core/src/lib/**/*.svelte`:

```
grep -rhoE "^\s+[a-zA-Z_]+\?: [^;]+;" src/lib/**/*.svelte | grep -vc "| undefined"   # 266
grep -rhoE "^\s+[a-zA-Z_]+\?: [^;]+;" src/lib/**/*.svelte | grep -c  "| undefined"   # 134
```

Found via `Command`, whose seven optional props were fixed and pinned by
`tests/test-components/CommandPropForwarding.svelte` — a fixture that exists to
be typechecked, not rendered. The claim in that commit that "the rest of the
codebase already writes `| undefined`; these were the holdouts" was wrong: the
majority do not.

The remedy is mechanical — append `| undefined` — and safe: a prop destructured
with a default already treats explicit `undefined` as absent, and the component
body already saw `T | undefined` under this flag. The work is the blast radius,
not the difficulty.

Nothing catches a new bare optional prop today. A guard belongs with it, in the
shape of `tests/repo/animation-policy.test.ts`: parse the `interface *Props`
blocks and require `| undefined` on every optional member, with a REGISTER for
anything deliberately narrower.

### T9. `graphics`'s overlay subsystem has never been swept — VERIFIED

`packages/graphics/src/lib/overlay/` and `lib/shaders/` — ~4,100 lines, **zero
tests**, and no documentation anywhere: neither the README nor the skill file
mentions `WebGLOverlay`, `createOverlay`, `OverlayOptions`, `updateStrategy` or
any of the 21 shader presets. Its own plan still reads `Status: Planning`
(`plans/phase-16/README.md:3`) while the code ships and is exported.

Deliberately left out of T6: sweeping it properly is its own project, and
folding it in would have tripled that one. ~15 findings are already recorded
from the T6 exploration, unverified beyond a read:

- `OverlayOptions.memoryBudget` and `maxTextureSize` affect no validation — the
  real limits live in `texture-validator.ts` and are never set from them.
- `updateStrategy: 'reactive'` can never fire: the only path is
  `triggerReactiveUpdate`, which nothing calls, and `inferUpdateStrategy`
  assigns `'reactive'` to every `text` and `html` element.
- `handleContextLoss: false` does not disable context-loss handling, and
  silently drops the consumer's `onContextLost` / `onContextRestored` callbacks.
- Context restoration rebuilds resources on the *dead* context — `this.gl` is
  never re-read after the manager creates a new one.
- `updateUniforms` mutates the shared preset constant, so per-element tuning
  leaks into every element using that preset.
- `ElementRegistration.needsUpdate` is written seven times and read never.
- `WebGLOverlay.svelte`'s `onTextureLoaded` fires on a fixed 100ms timer
  regardless of outcome, with its own TODO saying so.

`createOverlay` is not exported from the barrel, and its one consumer
(`examples/shader-gallery`) uses four methods off `bind:this`.
