# Hardening — defect register

A running record of defects found while hardening this repo, what has been fixed,
and what is still open. Written to be picked up cold: every open item names the
file and line, says whether it was **verified** (something was run) or
**inferred** (read only), and describes the failure a user would actually see.

## Status at a glance

| | count |
|---|---|
| Fixed and committed | 47 commits |
| **Open — components that crash** | **6** |
| Open — breaks a consumer at install/build | 8 |
| Open — silently-wrong behaviour | 12 |
| Open — security | 1 |
| Open — `svelte-check` errors, previously invisible | **142** |
| Open — `svelte-check` warnings | 19 |

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

### S2.6 `charts/ChartTooltip` imports a type that was deleted — VERIFIED

`packages/charts/src/lib/components/ChartTooltip.svelte:6` imports `TooltipState`
from `../types/chart.types`, where `chart.types.ts:55` reads
`// Note: TooltipState removed`. The component is still publicly exported, so
consumers with `skipLibCheck: false` get TS2305 from the package root.

### S2.7 `charts` `DataTransforms` cannot be used as a value — VERIFIED

`dist/index.d.ts:8` re-exports it with `export type`, which shadows the star
export of the const object. `TS2693: 'DataTransforms' only refers to a type`. The
README documents exactly this usage at `:89`; it compiles nowhere.

### S2.8 `code` `NodeCanvas.svelte.d.ts` does not typecheck — VERIFIED

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

### S4.1 `Combobox` external `value` sync is a no-op — VERIFIED

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

### S4.2 `VoiceInput` wipes transcript history on every dispatch — VERIFIED

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

### S4.3 `NodeCanvas` — three more wrong handler contracts — VERIFIED

- `:210` `handleConnectStart({ nodeId })` — upstream passes
  `(event, params)`, so `nodeId` is destructured off a MouseEvent and is
  `undefined`. The `if (!nodeId) return` always returns; `connectionStart` is a
  permanent no-op.
- `:116` `connectionLineType = 'bezier'` — not a member of the upstream enum
  (`Bezier = "default"`, `Straight`, `Step`, `SmoothStep`, `SimpleBezier`).
- `:232` `handleNodesChange` is an empty function, wired as `onnodeschange`. All
  bulk node changes — multi-select, keyboard delete, programmatic — are dropped.
  Check `handleEdgesChange` alongside it.

### S4.4 `syncBrowserHistory`'s required `serialize` is never called — VERIFIED

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

### S4.5 Six core components freeze their store dependencies — INFERRED

`createStore` re-reads `config.dependencies` on every dispatch
(`store.svelte.ts:72`), so a plain object literal freezes what the props resolved
to at mount. `FileUpload.svelte:43` and `Tooltip.svelte:65` already carry the
getter fix and a comment explaining it. These still use frozen literals:

| file | frozen |
|---|---|
| `ui/accordion/Accordion.svelte:101` | `onExpand`, `onCollapse` |
| `ui/dropdown-menu/DropdownMenu.svelte:72` | `onSelect` |
| `ui/tree-view/TreeView.svelte:96` | `onSelect`, `onExpand`, `onCollapse`, `loadChildren` |
| `ui/combobox/Combobox.svelte:95` | `loadOptions` |
| `components/command/Command.svelte:72` | `onCommandExecute`, `filterFunction` |
| `ui/carousel/Carousel.svelte:28` | `onSlideChange`, `onAutoPlayStart`, `onAutoPlayStop` |

`Select`, `Calendar` and `Pagination` are already safe.

### S4.6 `product-gallery` — `size="default"` strips all sizing — VERIFIED

Four call sites: `CategoryFilter.svelte:53,71`, `ProductList.svelte:139`,
`ProductCard.svelte:113`. `Button.svelte:98` defines only `sm/md/lg/icon`, so
`sizeClasses['default']` is `undefined`, `clsx` drops it, and the button renders
with no height and no padding. The trap: `variantClasses` *does* have a `default`
key, so `variant="default"` works and this looks like it should too.

### S4.7 `product-gallery` — every share button has the same broken test hook — VERIFIED

`Share.svelte:75` — `data-testid="share-method-{method.method}"` where `method` is
already destructured to a string. All four buttons render
`data-testid="share-method-undefined"`. No test selects it yet, so this is a
pre-broken hook that will silently match nothing, or four things, on first use.

### S4.8 `charts/Chart.svelte:86` — selection callback misfires — INFERRED

Depends on the whole `$store`, so `onSelectionChange` re-fires on every action
(including 60fps zoom progress) with unchanged data; and because it is guarded on
`selectedData.length > 0`, consumers are **never** notified when selection clears.

### S4.9 `code` exports four functions that do nothing — VERIFIED

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

### S4.10 `AuthGuard.onAnonymous` re-fires on every dispatch — INFERRED

`packages/auth/src/lib/components/AuthGuard.svelte:69`. `const state =
$derived(store.state)` changes identity on every dispatch, so the effect re-runs.
Documented use is dispatching a redirect, usually idempotent — low severity, and
`auth` is otherwise the cleanest package in the repo.

---

## S5. The `svelte-check` backlog

### C1. `pnpm -r check` is a near no-op

CI runs `pnpm -r check`, but `pnpm -r` only runs the script where it exists, and
only `core` and `graphics` declare one. Six packages are ungated. The commit that
introduced this said "check every package that can be" — literally true, but the
effect was nearly nil, and it is why the 55 satellite errors below stayed
invisible after it landed.

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
- `<Command open={true} />` never opens at mount. Two effects fight; one writes
  `open = $store.isOpen` and clobbers the incoming prop. Verified: dialog absent
  at mount, present when toggled afterwards. Fixing it means redesigning the
  bidirectional binding.
- `ssr/render.ts:9` imports `svelte/server`, which the `/ssr` barrel pulls into
  any client bundle importing `hydrateStore`. Verified fully tree-shaken — the
  bundles are byte-identical — so this is tidiness, not weight.

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
