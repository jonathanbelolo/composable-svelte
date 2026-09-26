# Code migration: managed views for CodeEditor, CodeHighlight and NodeCanvas

- **Worker:** Claude Opus 5.5, implementation worker for `packages/code` only.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`.
- **Inputs:**
  - `COMMAND-DELIVERY-DECISION.lead-copy.md`;
  - `B1-CONTRACT-REVIEW.md` (K1, K2, A1, R1–R7);
  - `B1-CORE-PRODUCTION.md`;
  - `INVENTORY.md`, rows §4.1–4.3 and O1–O6, O10.
- **Status:**
  - Uncommitted and unpublished.
  - No version or peer-floor change. `package.json` changed only its `test` script.
  - Nothing outside `packages/code` or this lane directory was edited.

## 1. Outcome

The shipped `CodeEditor`, `CodeHighlight` and `NodeCanvas` (with its internal
`FlowCommands`) now accept either store kind:

- a **managed `ChildView`**: a `FeatureViewProps.store`, a `PresentationView`, or the result of `scopeTo` / `composition.bind`;
- a **standalone `Store`**, as before.

There is no facade, no adapter component, and no inverse action map on the
managed path. `defineViews(composition, { x: { render: CodeEditor } })` works as
written, and the same holds for `CodeHighlight` and `NodeCanvas`. This is proven
from the packed tarballs (§5).

The dual command path lives in one package-internal helper,
`src/lib/internal/view-source.ts` (`bindViewSource`). It is not exported from any
entry point. The rule, per K2:

1. `isManagedChildView(source)` is true → `observeChildActions`. A retired view is inert and does not throw.
2. `subscribeToActions` is a function → use it. This is the unchanged standalone path; a TestStore-style throw propagates and is not masked (R7).
3. Otherwise → **warn once per store and component, and keep rendering.** The message names the component and what is lost. It lists the causes:
   - a wrapper or copy of a managed view;
   - an `ApplicationStore` (render through `FeatureViews` / `FeatureOutlet`);
   - two copies of `@composable-svelte/core`;
   - a custom store without `subscribeToActions`.

The helper subscribes state (`onState`) and actions (`onAction`). The
state-before-action guarantee comes from core: both store kinds notify state
subscribers before action listeners in one turn. Mutant M10 below shows that
subscription order is not what provides it.

## 2. Behaviour by component

### CodeEditor

- **State reaches the engine synchronously, before commands (R2; fixes N1).**
  - What changed: value and config sync moved out of two `$effect`s and into the state listener.
  - Effect: a value, `setReadOnly`, theme, language, tab size, line numbers, folding or autocomplete reduced before a command is in CodeMirror when the command runs.
  - Standalone: `valueChanged('Loaded')` then `insertText('!')` in one tick now gives `!Loaded`. It used to give `!A` and lose `Loaded` from state.
- **Echo safety (N2).**
  - **Wrapper:** `createEditorView`'s update listener adds `baseValue` to each `valueChanged`: the document the edit was made from. It is tracked in O(1) and is not re-serialised.
  - **Reducer:** `codeEditorReducer` drops a report whose `baseValue` is no longer `state.value`. The comparison ignores CRLF/LF differences, because CodeMirror normalises line breaks (mutant M2b).
  - **Result:** a command's echo that is queued behind a newer external write can no longer overwrite it. `[insertText '!', valueChanged 'Y']` in one drain ends at `Y`. It used to end at `!A`, the pinned hazard.
  - **Component:**
    - It keeps a bounded FIFO (256 entries) of reports still in flight. When state catches up to one of its own queued reports, it does not write that lagging value back into the document. Without the FIFO, a burst in one drain rewinds and rewrites the document (M3); the first cut of this migration live-locked Chromium this way before the FIFO existed.
    - It suppresses the report of its own programmatic writes (M4).
- **Format freshness (O6).**
  - Each `format` takes `formatAttempt + 1`.
  - `formatted` carries `attemptId` and `input`; `formatFailed` carries `attemptId`.
  - A result applies only if it answers the latest request and the value is still its input. So an edit made while the formatter runs survives, and overlapping formats resolve to the newest request.
  - Untagged `formatted` / `formatFailed` dispatched by application code still apply unconditionally.
- **Commands before the engine exists are dropped.** Nothing is buffered or replayed; that is the decision's drop policy. `focus` at creation is covered by a new durable prop, `autofocus`.
  - **No ready action was added (R1 not taken).** No `CodeEditorAction` member was added, so exhaustive switches in consumers do not break.
  - The recipe: durable setup lives in state (`value`, `readOnly`, …) or props (`autofocus`).
  - If a real consumer later needs a readiness fact, R1's owner-stamped action is still the shape to add. That would be a type-visible change.
- **Retirement (O10).**
  - A retired view reads `undefined`. The component renders its last committed state, toolbar included, and ignores the retired owner.
  - Mounting an already-retired view renders nothing.
  - A late `createEditorView` resolution after unmount destroys the view. A late language-load failure after unmount does nothing.
- **R3.**
  - `store` is bound once, at mount. If the prop's identity changes later, the component warns once per instance. The warning names `{#key store}`.
  - `FeatureViews` / `FeatureOutlet` already remount per owner.
- **Preserved:** toolbar, language select, undo/redo buttons, theme and line-number toggles, Format, Save and its serialized/queued saves, `Mod-s` / `Mod-Shift-f`, compartment reconfiguration without losing history, `pendingLanguage` last-request-wins, and the non-undoable mount catch-up.

### CodeHighlight

- The `codeChanged` dedupe guard now uses the helper: `observeChildActions` on a managed view, `subscribeToActions` standalone.
  - Measured: an external `codeChanged` through a managed view highlights once.
  - A parent writing `code` directly is still re-highlighted, once.
- **Highlight freshness (O5).**
  - `highlighted` and `highlightFailed` carry the `code` and `language` they were computed for.
  - A tagged result for code or a language that state has since left is dropped.
  - Untagged results still apply.
- Retained-state rendering on retirement, as for the editor.

### NodeCanvas and FlowCommands

- `FlowCommands` binds through the helper. A managed view's observed actions are already `NodeCanvasAction`s, so the default recognition applies. **No `unliftAction` is needed on the managed path, however the parent wraps canvas actions** (R4).
- **`liftAction` is optional exactly when the store's action type already is `NodeCanvasAction`,** which covers every managed canvas view. It then defaults to the identity. It is still **required** when a standalone parent store wraps canvas actions: that is a compile error (the type surface, M11). `unliftAction` is documented as standalone-only.
- **`setViewport` and the real SvelteFlow commands are covered through a managed view:**
  - `setViewport` is clamped to `minZoom`/`maxZoom`, and state learns the clamped value through `onmoveend`;
  - two same-tick `zoomIn`s give ×1.44;
  - `fitView`, `centerView`, and in-order `setViewport` then `zoomIn` in one drain;
  - sibling isolation, and the parent's same-named actions are ignored.
- `handleMoveEnd` and all rendering tolerate a retired view.

## 3. Public surface changes (for the CHANGELOG owner)

All of them are additive or relaxations. The `CHANGELOG.md` `Unreleased` entry lists them.

- **Prop types:**
  - The `store` prop of all three components is widened: `Store | ChildView`. It is declared through the internal `ViewSource` type alias; the emitted `.d.ts` imports it from `dist/internal/view-source.js`.
  - `NodeCanvas.liftAction` is conditionally optional.
  - New `CodeEditor.autofocus` prop.
- **New optional fields on existing types:**
  - `valueChanged.baseValue`;
  - `formatted.attemptId` and `formatted.input`;
  - `formatFailed.attemptId`;
  - `highlighted` / `highlightFailed`: `code` and `language`;
  - `CodeEditorState.formatAttempt`, which `createInitialCodeEditorState` sets to `0`.
- **Observable changes:**
  - Built-in results now carry these fields, so a test that compares them with exact equality must add them. The package's own `code-highlight.test.ts` was updated for exactly this. TestStore `receive` is a partial match and is unaffected.
  - `CodeHighlight` now warns once when the store lacks the capability; it used to degrade silently.
  - `CodeEditor` and `NodeCanvas` used to warn on every mount; they now warn once per store.
  - The editor no longer dispatches the report of its own programmatic writes.
- **Unchanged:** no action-union member was added, and no reducer's action handling was removed.
- **Peer floor (A2), for the parent:** the package now imports `isManagedChildView` and `observeChildActions` from `@composable-svelte/core/application`. `"@composable-svelte/core": "^0.13.0"` admits cores without them. The floor must become the exporting core version once core is bumped. I left it untouched as instructed.

## 4. Files

### Source (`packages/code/src/lib`)

| File | Change |
|---|---|
| `internal/view-source.ts` | **New.** `bindViewSource`, `ViewSource`, `warnStoreReplaced`; internal only |
| `code-editor/CodeEditor.svelte` | Rewritten script: helper binding, synchronous `reconcile`, in-flight FIFO and write suppression, retained state, `autofocus`, prop-swap warning; markup reads `current` |
| `code-editor/codemirror-wrapper.ts` | `baseValue` on reports. The earlier lane edit, which narrowed `createEditorView`'s store to `Pick<Store, 'dispatch'>`, is kept |
| `code-editor/code-editor.reducer.ts` | Stale-report drop (`sameDocument`); format attempt correlation |
| `code-editor/code-editor.types.ts` | `baseValue`; `formatted`/`formatFailed` tags; `formatAttempt` |
| `code-highlight/CodeHighlight.svelte` | Helper binding, retained state |
| `code-highlight/code-highlight.reducer.ts` | One `highlight` effect builder that tags results; `isStale` |
| `code-highlight/code-highlight.types.ts` | Result tags |
| `node-canvas/NodeCanvas.svelte` | `ViewSource` store, conditional `liftAction` with identity default, retained state, retirement-safe `handleMoveEnd`, docs |
| `node-canvas/FlowCommands.svelte` | Helper binding |
| `node-canvas/README.md` | Managed usage section |

### Package files

- `README.md`: a "Managed features" section with a self-contained example, verified to compile. It also corrects the CodeHighlight action list from `copyTriggered` to `copyCode`.
- `CHANGELOG.md`: the `Unreleased` entry.
- `vitest.config.ts`: excludes `tests/ssr/**`.
- `vitest.ssr.config.ts`: **new** node-environment server-render runner, the same approach as chat's.
- `package.json`: `"test": "vitest run && vitest run --config vitest.ssr.config.ts"`. No version or peer changes.

### Tests (`packages/code/tests`)

| File | Tests | Covers |
|---|---:|---|
| `managed/code-editor-managed.test.ts` | 24 | Real `CodeEditor` via `render: CodeEditor`:<br>• managed path taken with no warning<br>• duplicate same-tick commands and undos<br>• sibling and captured-view isolation<br>• a 6-command burst in one drain, with the cursor checked<br>• value→command and readOnly→command ordering<br>• echo behind a newer external write<br>• undoable external write whose echo is dropped<br>• same-ID replacement<br>• command/replace/command in one drain<br>• pre-attach drop, and the catch-up at attach not entering history<br>• detach and remount with no replay<br>• panel closed during creation; presentation view<br>• hand-bound retired view; mounting a retired view<br>• prop-swap warning<br>• Save, language select, theme/line numbers/folding<br>• format with an edit in flight; undoable format<br>• `autofocus` |
| `managed/code-highlight-managed.test.ts` | 6 | Managed dedupe (one highlight), parent direct write, stale highlight, removal mid-highlight; standalone dedupe; warn-once without the capability |
| `managed/node-canvas-managed.test.ts` | 7 | Real `NodeCanvas` via `render: NodeCanvas` (no lift/unlift):<br>• ×1.44 double `zoomIn`, sibling unaffected<br>• clamped `setViewport` reported back<br>• `fitView` / `centerView`<br>• in-order burst<br>• removal<br>• selection reaches its own owner<br>• hand-bound view that survives retirement |
| `view-source.test.ts` | 5 | Helper: owner scoping and order, retirement, a pre-retired view, standalone order, wrapper warn-once per component with message text |
| `code-editor-ordering.test.ts` | 7 | Standalone: value→command and readOnly→command in one tick; external write echo; CRLF edits; fast typing; bare store warns once and still edits; a throwing `subscribeToActions` is not masked |
| `code-editor-format-freshness.test.ts` | 10 | Replaces the probe. Covers format freshness (edit kept, overlapping formats, superseded success and failure, untagged, read-only) and reducer stale-report cases |
| `ssr/managed-render.test.ts` | 5 | Node server render: managed editors, highlights and canvases, and standalone; no commands run, no highlighting, concurrent request stores |
| `managed/managed-surface.types.ts` | (svelte-check) | Accepted and rejected store kinds per component, `ApplicationStore` type-valid, `liftAction` optional or required |
| `managed/{editor,highlight,canvas}-model.ts`, `*Host.svelte`, `support.ts`, `reactive-props.svelte.ts` | — | Managed roots from the public core entries (built `dist`), and hosts |
| `code-highlight.test.ts` (modified) | — | Exact-equality expectations include the new result tags |

### Proof directory (`tests/proof/`)

**Removed.** They were superseded, and they depended on a source alias and an ambient mirror:

- `owner-seam/` in full: the B slice, including `owner-actions.d.ts`, the ambient mirror;
- `vitest.owner-seam.config.ts`, the source alias;
- `production-value-command-order.probe.test.ts`;
- `../code-editor-format-freshness.probe.test.ts`.

The node_modules cache `node_modules/.vite-b1-owner-seam` was removed as well.

The exact sha256 of every removed file, taken before deletion, is in §8. The two regressions that replace the probes are `code-editor-ordering.test.ts` and `code-editor-format-freshness.test.ts`.

**Updated:**

- `managed-contract.types.ts`: the former `@ts-expect-error` "CodeEditor requires a full Store" is now a positive assertion.
- `owner-seam-feasibility.test.ts`: the header points at the public API.
- `command-queue.managed.test.ts`:
  - **What changed:** Option A's "PINNED HAZARD" now asserts the fixed outcome, `Y`.
  - **Why:** the fix lives in the shipped reducer.

**Kept, as evidence:** the Option A queue prototype and its SSR proof. All of it passes. It is part of the default browser include, so the parent should decide whether it ships in the package's test suite.

## 5. Verification (exact results)

All commands ran in `packages/code` unless noted.

| Gate | Result |
|---|---|
| `pnpm run build` | ok. `svelte-package`, 4 declaration bridges. `dist/internal/view-source.js` imports core as an external `@composable-svelte/core/application` |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` (`svelte-check --fail-on-warnings`) | 0 errors, 0 warnings |
| `pnpm test`, browser | 25 files, **212 passed** (exit 0) |
| `pnpm test`, SSR (`vitest.ssr.config.ts`) | 1 file, **5 passed** |
| Proof SSR (`tests/proof/vitest.ssr-proof.config.ts`) | 2 passed |
| Baseline before any change | 21 files, 156 tests, all passed |
| Packed integration (outside the repo, §5.1) | 1/1 passed; installed-declaration svelte-check 0 errors. A sanity mutant (`canvases: { render: CodeEditor }`) gives 1 error |
| Core repo guards (`packages/core`, `vitest.node.config.ts tests/repo/`, read-only) | 480 passed, 25 failed. Every code-package arm passes (see below) |

**The core repo-guard failures are environmental.** None of them cites `packages/code`. The code arms pass:

- exports map;
- side-effect modules;
- check gating and canonical script;
- typecheck coverage;
- "resolves all of its test files".

The failures are:

- `auth`, `charts`, `graphics` and `maps` have no `dist` in this worktree (dist-freshness, side-effects, flat-barrel, doc-typecheck "ran against a built library");
- `core was built after its sources were last edited` fails because core sources and `packages/core/tsconfig.json` were being modified during this session by another worker. I made no core edit;
- doc-typecheck register drift in the `.claude/skills` auth and maps files;
- `doc-examples` "every one of them compiles" hit its 5 s timeout under machine load;
- `check-coverage` for `packages/architecture`;
- `typecheck-coverage` for `packages/chat`.

The parent should rerun after `pnpm -r build`.

**Load note.** Another session was running its own vitest suites on this machine. My first full browser run had 12 × 30 s timeouts spread across unrelated files. The immediate rerun passed 25/25 files and 212/212 tests, and the final-bytes `pnpm test` above passed as well. I also found that a name-based `pkill` in my own watchdog could have killed the other session's processes. I replaced it with a kill scoped to its own process tree before any further runs.

### 5.1 Packed integration (A1)

- **Packing:**
  - Core was packed with `npm pack --ignore-scripts`, so its existing `dist` was not rebuilt.
  - Code was packed with `pnpm pack`, which runs `prepack` → build.
  - Both tarballs went to `/tmp/code-pack`. Their hashes are in §8.
- **Install:** into `/tmp/code-packed-fixture` with `pnpm install --prefer-offline`. There is exactly one `@composable-svelte/core` in `.pnpm`.
- **What the test does:**
  - It mounts the real `CodeEditor`, `CodeHighlight` and `NodeCanvas` from the installed code `dist`, using `defineViews(..., { render: X })` fed by the installed core `application` entry.
  - It asserts `isManagedChildView` is true for the bound view.
  - A one-drain `[valueChanged 'Loaded', insertText '!', insertText '!']` gives `!!Loaded` in both the document and state.
  - A highlight renders.
  - `setViewport` then `zoomIn` gives `scale(1.2)`, which state learns.
  - `console.warn` and `console.error` are never called.
- **Where it lives:** the sources and reproduction steps are in `code-packed-fixture/` in this directory.
- **Two toolchain findings, neither caused by this migration:**
  - `@xyflow/svelte`'s `.svelte` sources need `vitePreprocess({ script: true })` under Svelte 5.43.3. Its native TS stripping leaves `key?` in `KeyHandler.svelte`.
  - A fresh `^1.4.1` resolve picks xyflow 1.6.2, while the repo lock has 1.4.1. The fixture pins 1.4.1.

### 5.2 Mutation verification

Each mutant was applied to one source file, the listed tests were run, and the file was restored. The restore was checked by sha256: `restored=yes` for every mutant. The raw log is `CODE-MIGRATION-MUTATION.log`.

| Mutant | Killed by |
|---|---|
| M1 the state listener no longer reconciles | 12 tests (ordering, CRLF, managed value/readOnly, …) |
| M2 the reducer ignores `baseValue` | 2 (stale-report unit, managed echo race) |
| M2b line-break-sensitive comparison | 2 (CRLF unit, CRLF mounted) |
| M3 own in-flight reports treated as external | **survived at first.** The rewind converges once M4's suppression is in place. The burst test now also asserts the cursor, and M3 is then killed by 1 test |
| M4 programmatic-write reports not suppressed | 1 (echo count) |
| M5 format results not correlated | 4 |
| M6 highlight results never stale | 1 |
| M7 the helper never takes the managed path | 25 (helper, editor, highlight, canvas) |
| M8 no warn-once dedupe | 2 |
| M9 no retained state | 1 (hand-bound retired view) |
| M10 the helper subscribes actions before state | **equivalent**: ordering is core's. The helper comment was corrected to say so |
| M11 `liftAction` always optional (type) | svelte-check: an unused `@ts-expect-error` in `managed-surface.types.ts` |
| M12 the default lift is not the identity | 7 (all managed canvas tests) |

## 6. Limitations and open items

1. **The peer floor and version (A2) are the parent's.** `^0.13.0` must become the core version that exports the API.
2. **No readiness action (R1).** Deliberately not added; `autofocus` covers the common case. Anything else imperative at readiness is dropped by design.
3. **NodeCanvas viewport commands act on the canvas as rendered.** Unlike the editor, there is no state→engine reconcile before a command. A `setNodes` followed by `fitView` in one drain fits the nodes SvelteFlow has at that moment, because node props update on Svelte's flush and xyflow measures asynchronously. That is the same as shipped standalone behaviour. `setViewport` state seeds `initialViewport` only, which loses to `fitView={true}`.
4. **A parent writing `viewport` into canvas state directly** (not via `setViewport`) does not move a mounted canvas. This is unchanged.
5. **The in-flight FIFO is bounded at 256.** A reducer that rewrites `valueChanged` values (for example, normalising them) makes the editor treat the rewritten value as an external write. That is safe, because the document then equals state, but the stale queued reports behind it are dropped. A burst of more than 256 reports in one drain forgets the oldest report; its echo can rewind the document and create extra undo entries before the remaining reports replay, then converges on state.
6. **Components bind their store once.** Swapping the prop only warns. Rebinding in place was rejected: it would carry one owner's undo history into another.
7. **The `ApplicationStore` runtime case is covered by message text only.** `createApplication` is not public, and building an app through `ApplicationRoot` just to pass `app.store` was out of proportion. The type surface asserts it is type-valid, which is why it warns rather than failing to compile.
8. **The skill doc** `.claude/skills/composable-svelte-code/SKILL.md` and its fixture are outside this lane's write scope. They still describe standalone usage only.
9. **Other workers were active in this worktree.** At handoff, `git status` also shows modified or new files in `packages/core` (docs, `vite.config.ts`, `vitest.node.config.ts`, `tsconfig.json`), `packages/media` and `packages/chat`. None of them are mine; this migration touched only `packages/code` and this directory.

   **Core was changing during this session.** Core sources and `packages/core/tsconfig.json` changed underneath this work, by another worker. Every test here ran against core `dist` as built by the core worker (`B1-CORE-PRODUCTION.md`), and that `dist` exports the API. The parent should rerun this package's suite against the final core bytes.
10. **The Option A proof suite** is still in `tests/proof/` and in the default browser include (§4).

## 7. Reproduce

```sh
cd packages/code
pnpm run build && pnpm run typecheck && pnpm run check
pnpm test                                   # browser, then SSR
pnpm exec vitest run tests/managed tests/view-source.test.ts tests/code-editor-ordering.test.ts tests/code-editor-format-freshness.test.ts
pnpm exec vitest run --config vitest.ssr.config.ts
pnpm exec vitest run --config tests/proof/vitest.ssr-proof.config.ts
# packed: see code-packed-fixture/README.md
```

## 8. Hashes

### Frozen core consumer rerun

After the core owner-action API was frozen at tarball SHA-256
`230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`,
the packed Code tarball below was installed with it into a **fresh** npm fixture
at `/private/tmp/code-packed-final`. The fixture uses one lockfile and a pinned
Svelte 5.43.3; `npm ls` shows one deduplicated core and Svelte copy and
`@xyflow/svelte@1.4.1`. Both `package-lock.json` tarball integrity fields match
the exact files' SHA-512 hashes. The installed managed CodeEditor,
CodeHighlight and NodeCanvas browser test passed 1/1; installed declaration
`svelte-check` passed with 0 errors and 0 warnings. The Vite plugin emitted
virtual CSS load notices, but the test and check exited 0. The earlier attempt
to force-refresh the worker's pnpm fixture hit a local pnpm store reflink error,
so its mixed install was not used as evidence; the fresh npm fixture is the
qualification receipt.

Packed tarballs:

```
a7e4a61746a0e12e9ca374cce23b9dcd25fe52505832876e8ac40c55dc31a752  /tmp/code-pack/composable-svelte-code-0.4.1.tgz   (final bytes; installed dist diffed identical to packages/code/dist)
85fe058fdd6f8d9ff41de5225748debd34c4f162123aa0775f5fa32155822ba9  /tmp/code-pack/composable-svelte-core-0.13.0.tgz   (npm pack --ignore-scripts of the core worker's dist)
```

Removed proof files (sha256 before deletion):

```
6d200687442348a96a48b6dde72466d62ca535d48e56fde45fa478dcca2de7ad  packages/code/tests/proof/owner-seam/BCanvas.svelte
2382b01899a23423510aeba868dd0661edd35c22a9ff01392a41bbcf9bf96af5  packages/code/tests/proof/owner-seam/BCanvasHost.svelte
302d83d1a67b17612d781243692aef8d2bc3e5e67752ac8bffb41d982cd02e47  packages/code/tests/proof/owner-seam/BEditor.svelte
caa24c9e3d0cd6706e4ebdfb7548e92a8bdc9c5135639125a547e3ab73138c44  packages/code/tests/proof/owner-seam/BFlowCommands.svelte
5961ae0a59938902a016b30e92fb1c5d6fe31a82fa96b212495d657421cbe341  packages/code/tests/proof/owner-seam/BHost.svelte
26bf56e185b49f66ff49b374eb16130a7fde9aafcfd64f7365a1379f199ec953  packages/code/tests/proof/owner-seam/b-canvas-model.ts
e28a99680d751519a181bdbb4bb238de50ab734d365002dd628cfd54cb812e17  packages/code/tests/proof/owner-seam/b-model.ts
26b512e8336fe6f4edf236896035337c9e0faf0ec5f816e0b217fd9c6e2baa72  packages/code/tests/proof/owner-seam/canvas.owner-seam.ts
47389922bf914e7d85d0d85a39e4a0cb14d923b73c806a7694a70c5a748f43bf  packages/code/tests/proof/owner-seam/code-editor.owner-seam.ts
9856cd955ed67908c772b3867af1617ee97e98783536d25c0d8994c605d89d8e  packages/code/tests/proof/owner-seam/owner-actions.d.ts
fe1cb7d7efe7a7377ebe95b3802049f180cc3780f119b40ce9829f80c8216593  packages/code/tests/proof/owner-seam/owner-seam.types.ts
5826d1a5cf2713d07ea4c0052ba674f3e1b09fc54e06cf4a2b9d24f505f2635e  packages/code/tests/proof/vitest.owner-seam.config.ts
e99e67ede926d4a07f30a4a4f50a72e13cf60d9f74bb0b90fcbdb6aec8321b23  packages/code/tests/proof/production-value-command-order.probe.test.ts
fdad4ad16a7247c110787abaf15ba920fa0830e0a9fad2aa86ef460a37f177ff  packages/code/tests/code-editor-format-freshness.probe.test.ts
```

## 9. Resolution of CODE-INDEPENDENT-REVIEW F1–F4

- **Worker:** Claude Opus 5.5, follow-up for `packages/code` only.
- **Date:** 2026-09-25.
- **Scope:** only `packages/code` was edited, plus this section. Core, media, chat, root, versions and peers were not touched. Nothing was committed or published.
- **Status:** F1, F2 and F4 are fixed and mutation-verified. For F3, the bound was raised and its consequence is documented.

### 9.1 F1: a declined edit desynchronised the editor. Fixed

- **What the fix does:** the editor now behaves as a controlled input.
  - Each report of the editor's own stays recorded until the store has reduced it.
  - If state took the report, `reconcile` matches it as the editor's own echo, as before.
  - If the report is still recorded once it has been reduced, state declined it. `settle` then:
    - puts the document back to `state.value`;
    - forgets the reports queued behind it. They were edited on top of the declined text, and the reducer drops them as stale.
- **How the component learns a report was reduced:**
  - **Managed:** the report is delivered back through `observeChildActions`. This runs after commit, so after `onState`. It is matched by identity, or structurally when a slot copies actions on unwrap.
  - **Standalone with `subscribeToActions`:** the same `onAction` path.
  - **Standalone without it (bare store):** core's `dispatch` is synchronous, so the report is settled when `dispatch` returns. `observesActions` in `internal/view-source.ts` decides which path applies.
- **The revert, `restoreEditorValue`:**
  - It lives in `codemirror-wrapper.ts` and is package-internal, not re-exported.
  - It applies the smallest change that turns the document into state's value, and keeps it out of history.
  - CodeMirror maps the undo stack through that change and drops the declined edit's own event, because the revert cancels it. Earlier undo steps survive.
  - A whole-document replacement would have mapped every earlier undo step away. Mutant F1-M2 shows this.
  - Line breaks are normalised before comparing.
- **Save now matches what is shown,** because document and state agree again.
- **Rewritten values** are values a parent changes rather than declines, for example by normalising them. They are unchanged: they read as an external write and replace the document as an undoable change. This is now tested (limitation 5 was argued only in prose before).

### 9.2 F2: value ABA in one managed drain. Fixed

- **New optional state field:** `CodeEditorState.valueRevision`.
  - `createInitialState` sets it to `0`. A missing value counts as `0`.
  - `codeEditorReducer` adds 1 for each accepted `valueChanged` and each applied `formatted`.
- **New optional action field:** `valueChanged.baseRevision`.
  - The component stamps each report with the revision it expects state to be at: the last reconciled revision, plus one for each of its own reports still in flight.
  - The reducer drops a report whose `baseRevision` is not state's revision.
  - It also keeps the `baseValue` check. That check still catches writes that bypass the reducer.
- **What `reconcile` compares now:**
  - It compares value and revision together, so an external write that restores the same text is no longer skipped.
  - An in-flight entry counts as the editor's own echo only if both the value and the expected revision match.
  - For a reducer that keeps no revision (the revision does not move), the value alone decides, as before.
- **Result:** `[insertText '!', valueChanged 'A']` on `A` now ends at `A`/`A`. A `formatted 'A'` in the same position ends the same way. The control case, `'Y'`, is unchanged.
- **Compatibility:**
  - No action-union member was added, and no field is required.
  - Hand-dispatched `valueChanged` without the new fields behaves as before.
  - Observable change: whole-state exact-equality assertions made after a value write must now include `valueRevision`. This is recorded in the CHANGELOG.

### 9.3 F3: FIFO overflow. Bound raised; consequence documented

- **Why the bound could be raised:** entries now leave when their report is reduced, whether accepted, declined, or cleared by an external write. A reducer that ignores `valueChanged` therefore no longer keeps them.
- **The bound only limits a burst:** more reports in flight in one drain than the bound. It went from 64 to 256.
- **What overflow still does:** the component comment now states it. The oldest entry is forgotten, so its echo reads as an external write. The document is rewound to it with an undo entry, and the queued reports then replay one replacement at a time. It converges on state.

### 9.4 F4: managed FlowCommands bypasses `unliftAction`. Fixed

- `FlowCommands` checks `isManagedChildView(store)` once, at mount. On the managed path it passes observed actions straight to `runCommand` and never calls `unliftAction`.
- Test: a hand-bound managed view with `liftAction: (a) => ({ ...a })` still moves the canvas on `setViewport` and on `zoomIn`.
- The `unliftAction` JSDoc, the package README and the NodeCanvas README now say it is ignored for a managed view.

### 9.5 Tests added

| File | Tests | Covers |
|---|---:|---|
| `managed/code-editor-veto.test.ts` | 10 | Standalone, with a parent reducer that declines values over 3 characters:<br>• the review's repro, `abc` → `d` declined → delete 2 → `c` → `cxy`, with no undo event left behind and Save equal to the document<br>• undo/redo after a declined edit<br>• a declined command<br>• a bare store without `subscribeToActions`<br>A rewriting (uppercasing) parent.<br>Managed, with the composed reducer in `.forEach`:<br>• the same repro, plus Save<br>• a one-drain burst of 3 inserts: the first accepted, the rest reverted, then later edits land<br>F2:<br>• `[insert '!', valueChanged 'A']` ends at `A`, and later edits land<br>• the `'Y'` control<br>• a restoring `formatted` |
| `managed/veto-model.ts`, `managed/VetoHost.svelte` | — | Managed root with `limitedEditorReducer`, which wraps the shipped reducer; mounted through `defineViews` / `render: CodeEditor` |
| `managed/node-canvas-managed.test.ts` | +1 | F4 |
| `code-editor-format-freshness.test.ts` | +3 | The revision moves on each accepted write and not on a stale one; reducer-level ABA; state without `valueRevision` |

### 9.6 Mutation verification

Each mutant was applied, the listed tests were run, and the file was restored. Every restore was checked by sha256, and all show `restored=yes`. The script is `/tmp/code-f-mutants.py` and the raw log is `/tmp/code-f-mutants.log`.

| Mutant | Result |
|---|---|
| F1-M1 `settle` never reverts | 6 of 10 failed |
| F1-M2 the revert replaces the whole document | 1 failed (undo after a declined edit) |
| F1-M3 the revert enters history | 2 failed |
| F1-M4 no settle after a bare-store dispatch | 1 failed (bare store) |
| F1-M5 delivered reports are never settled | 5 failed |
| F2-M1 the reducer ignores `baseRevision` | 4 of 23 failed |
| F2-M2 `reconcile` ignores the revision | 1 failed |
| F2-M3 the component does not stamp `baseRevision` | 2 failed |
| F2-M4 accepted writes do not advance the revision | 4 failed |
| F4-M1 managed commands go through `unliftAction` | 1 failed (F4 test) |

### 9.7 Verification (final bytes)

All commands ran in `packages/code`.

| Gate | Result |
|---|---|
| `pnpm run build` | ok, 4 declaration bridges |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` | 0 errors, 0 warnings |
| `pnpm test`, browser | 26 files, **226 passed** |
| `pnpm test`, SSR | 1 file, **5 passed**; exit 0 |
| Editor suites before the full run | 9 files, 91 passed: managed, ordering, view-source, commands, save, state, toolbar, reconfigure, mount-lifetime |

- **Load:** another session's chat vitest ran on the machine during the full run. It did not affect the result, and no process of that session was touched.
- **Core under test:** the tests ran against the worktree's `packages/core/dist`, which was not modified.

**Packed Code tarball.** Packed after the last source change with `pnpm pack --pack-destination /tmp/code-pack-f1f4`, which runs `prepack` → build. The previous tarball in `/tmp/code-pack/` was left in place.

```
de62d7a41ffba9a1c8e5d05381f847c6fa9d50d82c060a5c391da57708db4295  /tmp/code-pack-f1f4/composable-svelte-code-0.4.1.tgz
sha512-f3IYxQaK6O4f7UNm8P/sv9fW8Kt5c72g3G6RutolZaP4ObVo56l+pJ0iiktmK0nigQyGc8ly1vyTsVjAIQF/AA==
```

- The extracted `package/dist` diffs identical to `packages/code/dist`.
- `restoreEditorValue` is not in `index.js`.
- **Not done here, left to the lead:** the installed-fixture run against the frozen core tarball, `230233b9…4355`. §8's `a7e4a617…a752` is superseded.

Source sha256 at pack time:

```
fa8aa03c1be79499a5c441f236b393b12437e3cc7210e5bf34e1f8be1d82c6c7  src/lib/code-editor/CodeEditor.svelte
52367b08c80b565de76f773d883e3c26950dd9098cdcf6d7ccb8bdacc28149d5  src/lib/code-editor/code-editor.reducer.ts
4d7dd65e9811a36c4f2c048a201473a6de6a1569dd109363b4b1699992cf3dc5  src/lib/code-editor/code-editor.types.ts
284337414cbbc06db06b30d6e9a15a9d9982b6086c29b4e8e2c300925e44dc04  src/lib/code-editor/codemirror-wrapper.ts
5b0646e4c1cbedb81a6a89fc0840d1a6c179e009a166b6ae96153f747a4d3da5  src/lib/internal/view-source.ts
2b1afa3152b6d3ec88bff4fab7dcd5c239ab602214cb1f0929a9bc4d9cf0216e  src/lib/node-canvas/FlowCommands.svelte
0a4602b4bbd6c4b71c0789d02b3dd99acfcbc422035a362fe824231977a5a2c0  src/lib/node-canvas/NodeCanvas.svelte
```

### 9.8 Remaining limits

1. **A write that bypasses `codeEditorReducer`** does not advance `valueRevision`, for example a parent assigning `value` itself. If such a write restores exactly the text of an edit still in flight, it cannot be told from that edit's echo. Any other value is recognised. This is documented in the README.
2. **Edits made on top of declined text before state answered are reverted with it.** This only happens with managed bursts; standalone reduces each keystroke synchronously. It is the controlled-input choice, and the README documents it.
3. **A custom standalone store without `subscribeToActions` whose `dispatch` is asynchronous** is settled too early. Its accepted edit is reverted first and then re-applied as an external write. It converges. Stores from core are synchronous, and such a store already warns.
4. **Overflow above 256 reports in flight in one drain** still behaves as described in §9.3.
5. §6 limitation 5 is superseded by §9.1–9.3. The A2 peer floor and the §6 items that do not concern F1–F4 still stand.

## 10. Final independent review, installed floor and shipped recipe

The bounded read-only Opus 5.5 delta review of F1/F2/F4 found no blocking
findings. It spotted a low-severity cursor mismatch after a synchronous parent
veto: the CodeMirror update listener could report positions from the rejected
transaction after the editor had restored its document. The listener now reads
`update.view.state` after dispatch, including its selection and undo/redo
availability. Standalone and managed veto tests set a real cursor and assert
that parent cursor state matches the restored document. Focused 10/10; full
browser 226/226; SSR 5/5; build/typecheck/check 0/0. The review's documentation
nits are corrected: the queue cap is 256, overflow behavior is described, and
a custom standalone Store without action subscription is documented to require
synchronous dispatch for declined-edit detection.

The final Code archive is `/private/tmp/t5-code/composable-svelte-code-0.4.1.tgz`,
SHA-256 `cec04f1702044e8ddd50eee3e83780737075cf0f09d465f0e323caa93f1086ff`.
It includes `recipes/managed`, which contains a runnable CodeEditor,
CodeHighlight and NodeCanvas composition plus a Chromium test; the recipe
passed 1/1 from the npm archive and typechecked 0/0 in an installed consumer.
The archive's `dist/` is byte-identical to the post-cursor-fix runtime archive
SHA `459db6b8dd3b00f0e2280c7538c2b0f9a509ddb146bfdcbda836b978a4ee72ab`.

A true installed SSR compatibility floor is Svelte 5.30.0: both xyflow 1.4.1
and fresh-resolved 1.7.0 pass declarations, client build, managed Chromium 2/2,
production SSR build and Node render. Svelte 5.25.0 fails direct SvelteFlow
production SSR with `$$render_inner is not defined` even though xyflow declares
it peer-compatible; see `LANE-FINAL-HANDOFF.md`. Root accepted the conservative
Code peer recommendation `^5.30.0`. The previous Code tarballs and §8 hash
are superseded.
