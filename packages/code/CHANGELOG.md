# Changelog

All notable changes to `@composable-svelte/code` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-09-26

### Changed — breaking

- **The Svelte peer rises from `^5.20.0` to `^5.30.0`.** Applications on Svelte
  5.20–5.29 must upgrade Svelte. The `@xyflow/svelte` `^1.4.1` dependency behind
  `NodeCanvas` already requires Svelte `^5.25.0`, and SvelteFlow's server
  rendering failed on 5.20 and 5.25 (`$$render_inner is not defined`). Svelte
  5.30.0 is the lowest version checked passing, including SSR; 5.55.3 was also
  checked. Earlier 5.2x patches were not individually checked.

### Added

- **`CodeEditor`, `CodeHighlight` and `NodeCanvas` accept a managed view.** The
  `store` prop takes a standalone `Store` as before, or a managed `ChildView`:
  a `FeatureViewProps` store, a `PresentationView`, or the result of `scopeTo`
  / `composition.bind`. So `defineViews(composition, { editor: { render:
  CodeEditor } })` works with no adapter. Commands reach a managed view through
  its own owner's observed actions (`observeChildActions`). A standalone store
  still uses `subscribeToActions`.
- `CodeEditor` `autofocus` prop. It focuses the editor once it exists. A
  `focus` command dispatched before then is dropped, including one dispatched
  in the turn that creates the editor's owner.
- `NodeCanvas`'s `liftAction` is optional when the store's action type already
  is `NodeCanvasAction`, which covers every managed canvas view. It defaults to
  the identity. It is still required when a standalone parent store wraps canvas
  actions. `unliftAction` is for standalone stores only: a managed view never
  needs it.

### Changed

- Requires `@composable-svelte/core` `^0.13.1` as a peer; that release exports
  `observeChildActions` and `isManagedChildView` from
  `@composable-svelte/core/application`.
- **A store that is neither a managed view nor has `subscribeToActions` warns
  once, then renders.** The warning is per store and component. It names the
  likely causes: a wrapper or copy of a managed view, an `ApplicationStore`,
  two copies of `@composable-svelte/core`, or a custom store without the
  method. `CodeHighlight` used to degrade silently in this case. `CodeEditor`
  and `NodeCanvas` used to warn on every mount.
- Components bind their `store` once, at mount. Changing the prop afterwards
  warns once. Use `{#key store}` to rebind; `FeatureViews` / `FeatureOutlet`
  already remount per owner.
- **Built-in results now carry correlation fields.** These are additive and
  optional, and hand-dispatched actions without them behave as before. A test
  that compares these actions with exact equality must add the fields:
  - `valueChanged` from the editor carries `baseValue` and `baseRevision`;
  - `formatted` carries `attemptId` and `input`;
  - `formatFailed` carries `attemptId`;
  - `highlighted` and `highlightFailed` carry `code` and `language`.
- `CodeEditorState` gains optional `formatAttempt` and `valueRevision`.
  `createInitialCodeEditorState` sets both to `0`. `codeEditorReducer` adds one
  to `valueRevision` for each accepted `valueChanged` and applied `formatted`,
  so a test comparing whole editor states with exact equality after a value
  write must include it.
- **A parent reducer that declines a `valueChanged` now has the editor revert
  to `state.value`.** The document used to keep the declined text. Parent
  reducers that rewrite the value are unaffected: the editor shows state's
  value, as before.

### Fixed

- **A value or setting written in the same tick before a command was lost.**
  `valueChanged('Loaded')` followed by `insertText('!')` produced `"!A"`, and
  the command's report then overwrote `"Loaded"` in state too. State used to
  reach CodeMirror in `$effect`s, after the synchronous command. It is now
  applied synchronously from the store's state listener, before any action of
  the same turn. The same applies to configuration: `setReadOnly(false)`
  followed by an insert no longer has the insert refused.
- **An editor report queued behind a newer write no longer overwrites it.**
  Each `valueChanged` from the editor names the document and the revision it
  edited, and the reducer drops a report that state has moved past, including
  past a write that restored the same text. Line-break style (CRLF vs LF) does
  not count as a difference.
- **A declined edit no longer desynchronises the editor for good.** When a
  parent reducer declined a `valueChanged`, the document kept the declined text
  and every later edit was dropped as stale, so Save wrote a value the user
  could not see. The editor now reverts the declined edit and later edits land.
- **Viewport commands on a managed `NodeCanvas` no longer depend on
  `liftAction`.** A non-identity `liftAction` such as `(a) => ({ ...a })`
  disabled the default recognition, and `setViewport` / `zoomIn` / `zoomOut` /
  `fitView` / `centerView` were dropped silently. A managed view's commands now
  bypass `unliftAction`.
- **A late format no longer overwrites an edit made while the formatter ran,
  and overlapping formats resolve to the latest request.** A result applies
  only if it answers the newest `format` and the value is still its input.
- **A slow earlier highlight can no longer overwrite a newer one.**
- A managed view whose owner has retired reads `undefined`. All three
  components keep rendering the last committed state instead of throwing, and
  mounting an already-retired view renders nothing.

## [0.4.1] - 2026-09-18

### Fixed

- Correct public repository and documentation links for external consumers.
- Fix editor initial values, node-canvas records/action lifting and the highlighting test.
- Verify packaged README examples in an isolated npm consumer before release.


## [0.4.0] - 2026-09-18

### Changed

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **BREAKING (types): every optional prop now accepts `undefined`.** Under
  `exactOptionalPropertyTypes` a prop read from `$props()` is `T | undefined`
  and cannot land on a bare `T?`, so `NodeCanvas` and `CodeEditor` could not be
  wrapped by a consumer forwarding its own props. See
  `@composable-svelte/core`'s entry for the full account.

## [0.3.0] - 2026-08-23

### Added

- Explicit exports for `./code-editor`, `./code-highlight` and `./node-canvas`.
  All three had an `index.js` in `dist` and no entry, so the wildcard `"./*"`
  resolved them to `dist/code-editor.js` and siblings — files that have never
  existed. Any consumer who tried the obvious subpath got `ERR_MODULE_NOT_FOUND`.

  Found by a guard written for the identical defect in
  `@composable-svelte/chat`; `packages/core/tests/repo/side-effects.test.ts` now
  fails when a subpath anyone references does not resolve.

## [0.2.0] - 2026-08-21

A sweep to remove **dead behaviour**: anything a consumer can pass, configure,
click or import that produces no effect. Everything below was reachable and
inert, not merely unimplemented. Nothing is deprecated-then-removed — 0.x, and
the alternative to a breaking change was leaving a lie in place.

### Fixed

- **`showLineNumbers`, `enableFolding` and `enableAutocomplete` did nothing.**
  The editor was built on CodeMirror's `basicSetup`, which hardcodes
  `lineNumbers()`, `foldGutter()` and `autocompletion()`. `enableAutocomplete`
  was inert in *both* directions: `false` could not remove basicSetup's copy,
  and `true` pushed a second one CodeMirror deduped. `basicSetup` is replaced by
  an explicit extension list with Compartments, which is what CodeMirror's own
  documentation prescribes — basicSetup "does not allow customization… copy it
  into your own code".

  Three parts of that rewrite are deliberate and non-obvious: `history()` is
  *not* compartmented, because reconfiguring it drops and recreates
  `historyField` and wipes the user's undo stack; `codeFolding()` is hoisted out
  of the fold compartment, because `foldGutter()` bundles it and `foldState` is
  a module-level StateField, so compartmenting the pair discards existing folds
  when the gutter is toggled; and `closeBrackets()` moved into the autocomplete
  compartment. Disabling autocomplete calls `closeCompletion(view)` first,
  without which CodeMirror throws `RangeError: Field is not present in this
  state`.
- **The Format button soft-locked.** It was disabled by
  `$store.formatError !== null`, and `formatError` is cleared inside
  `case 'format'` — which a disabled button can never dispatch to reach. One
  failed format disabled it for the session, and with no `formatter` dependency
  the first click always fails, which is exactly what the README's example
  configures. Disabled by read-only alone now; the error still surfaces in the
  banner.
- **Five editor commands were no-ops** with comments claiming CodeMirror handled
  them. Nothing did. `insertText`, `deleteSelection`, `selectAll`, `undo` and
  `redo` changed nothing; `undo` additionally set `canRedo` and `redo` set
  `canUndo` — inverted — and nothing read either flag.

  These are *commands*, not configuration: they carry no state, so the reducer
  stays pure (each case returns the identical state and `Effect.none()`) and the
  view subscribes to the action stream and performs the CodeMirror call, which
  reports back inward as `valueChanged` / `selectionChanged` / `historyChanged`.
  `subscribeToActions` rather than an `$effect`, because Svelte coalesces effect
  runs and two commands dispatched in one tick would collapse into one.
- **`tabSize` moved the cursor but not the indentation.** It set
  `EditorState.tabSize` only; `indentUnit` is what auto-indent uses.
- **Eleven `NodeCanvas` props were frozen at mount.** The component destructured
  a second time out of a variable rather than the `$props()` call site, which
  reads each name once at init — so `nodeTypes`, `edgeTypes`,
  `connectionLineType`, `panOnDrag`, `zoomOnScroll`, `selectable`, `class`,
  `minZoom`, `maxZoom`, `fitView` and `onViewportChange` ignored every later
  change.
- **`strictValidator` did not match the validator contract.** Declared
  `(error = '…')` while validators are called with five positional arguments, so
  `error` would receive the whole `NodeCanvasState` — and under
  `strictFunctionTypes` the assignment does not compile at all, making a
  publicly exported helper and the README's own `composeValidators` example
  unusable. `permissiveValidator` worked only by accident, a zero-arity function
  being assignable to anything.
- **The canvas viewport was write-only in both directions.** The store's
  viewport reached SvelteFlow only as `initialViewport`, read once at
  construction, so `setViewport` / `zoomIn` / `zoomOut` wrote state the canvas
  never re-read and `fitView` / `centerView` returned `Effect.none()` outright.
  Panning never dispatched, so `$store.viewport` stayed frozen at its mount
  value forever. A new `FlowCommands` child subscribes to the action stream and
  calls `useSvelteFlow()`; the canvas reports back through `onmoveend`. This
  also removed a second, disagreeing source of truth — the reducer clamped zoom
  with hardcoded `2` and `0.1`, ignoring the component's `minZoom` / `maxZoom`.
- **Canvas selection, `readonly` and `connectionInProgress` maintained state
  nothing read.** All three are now applied to the flow.
- **`CodeHighlight` reserved a gutter and never filled it.** `showLineNumbers`
  defaults to `true`, so this was the default experience: the CSS declared
  `counter-reset` and `padding-left: 3.8em`, and the file contained no
  `counter-increment` and no `::before` anywhere. `startLine` was doubly dead —
  the inline style reset a counter named `line-number` while the stylesheet used
  `linenumber`, two names for a counter nothing incremented.

  Numbers are real spans rather than CSS counters, deliberately:
  `getComputedStyle(el, '::before').content` returns the literal `counter(...)`
  expression, so no test can assert what a reader actually sees. The gutter
  carries `aria-hidden="true"` and `user-select: none` — copying a snippet and
  getting line numbers back in the clipboard is worse than having no numbers.
- **`highlightLines` was written and never read.** Now rendered as bands.
- **A denied clipboard read as "Copy".** `copyFailed` dropped `action.error` and
  `'failed'` fell into the idle branch of `copyButtonText`, so a failure was
  indistinguishable from having done nothing — and unlike `copyCompleted` it
  never reset.
- **`CodeHighlight` ignored external `code` changes.** Highlighting ran at init
  only, so a parent mutating `code` without dispatching `codeChanged` kept stale
  output forever.
- **`isFocused` was write-only**; now `class:code-editor--focused`.
- **`state.error` was set by no action at all**, so the error banner was
  unreachable — while the one place a failure actually happened, the
  language-load `.catch(...)`, dropped the reason on the floor. `languageLoadFailed`
  sets it; `languageChanged` clears it, since picking a language is the retry.

### Added

- `createStrictValidator(message)` for the custom-message case the broken
  `strictValidator` signature was reaching for.
- `focus` / `blur` command actions.
- `updateLineNumbers`, `updateFolding`, `updateAutocomplete` and
  `runEditorCommand` are exported, so a consumer driving a view by hand gets all
  eight updaters rather than four.
- `createInitialState` accepts `enableFolding`.
- Real undo/redo buttons driven by real `undoDepth` / `redoDepth`, reported
  edge-triggered so typing 30 characters produces at most 2 dispatches.
- An `autoLayout` action, folding the `deps.autoLayout` result back into
  `state.nodes` — the dependency was declared and advertised in the README with
  nothing calling it.

### Removed

- **`focusEditor` / `blurEditor`.** Exported from both barrels with zero callers
  and unusable in principle: `CodeEditor` never exposes its `EditorView`.
  Replaced by the `focus` / `blur` command actions.
- **`showGutter`.** Genuinely redundant: `showLineNumbers: false` plus
  `enableFolding: false` already produces exactly "no gutter", and both are now
  live. A third flag meaning the conjunction of two others is a new way to be
  wrong.
- **`enableLinting`** from state, and `@codemirror/lint` from dependencies.
- **`deps.nodeTypes`**, redundant with the component prop and
  `createConnectionValidator`, which closes over the same registry.
- **`undo` / `redo` canvas actions**, which had no history to act on, and
  `externalViewport`.
