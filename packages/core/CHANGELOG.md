# Changelog

All notable changes to `@composable-svelte/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`handleStackAction` takes an options object as its seventh argument**:
  `actionType` names the parent action type a mapped screen effect is
  dispatched under (it was hard-coded to `'stack'`, AUDIT-2026-09-03-FINDINGS
  N11), and `screenId` gives screens an identity so a screen effect that
  settles after the stack changed is dropped instead of landing on the screen
  now at that index (N8). `StackAction`'s `screen` variant gains an optional
  `screenId`. Both are optional; existing calls are unchanged.

- **`AlertDialog`** and its parts — `AlertDialogHeader`, `AlertDialogTitle`,
  `AlertDialogDescription`, `AlertDialogFooter`, `AlertDialogAction`,
  `AlertDialogCancel`. A titled, described confirmation composed over `Alert`,
  following the compound-parts convention `Card` and `Banner` already use.

  `Alert` was a presentation shell with a bare `children` snippet and nothing
  to say, so every app needing a confirmation wrote its own heading, paragraph
  and two buttons inside it.

  No `Trigger` part: presentation here is state-driven, and a trigger would be
  a second, imperative way to open a dialog. No `Content` part: `Alert` is
  already the box. `onclick` is required on both buttons — a `Cancel` that
  dismissed by itself would bypass the parent reducer that owns the dismissal
  transition.


- **`headingLevel` on `BannerTitle`, `CardTitle`, `ToastTitle`, `Empty` and
  `FileUpload`.** The level belongs to the page, not the component: `BannerTitle`
  rendered a fixed `<h5>`, so putting a `Banner` under an `<h2>` jumped the
  outline from 2 to 5 and no consumer could fix it from outside. Each defaults to
  the level it has always rendered, so nothing changes unless you pass one.

- **`parseRetryAfter` is exported from `@composable-svelte/core/api`.** It
  handles both the delay-seconds and HTTP-date forms of `Retry-After` and was
  private to `api/retry.ts`; `@composable-svelte/auth` needs it and a second
  implementation would drift. Returns milliseconds.


- `tests/repo/optional-props.test.ts` — a repo-wide guard requiring
  `| undefined` on every optional prop, with a register for the `$bindable`
  exemptions. Function types must be parenthesised first:
  `(() => void) | undefined`, never `() => void | undefined`, which is a
  function *returning* `void | undefined` and forwards nothing.

### Deprecated

- **`createDestinationReducer` and `DestinationReducerMap`.** The helper routes
  by the *current* destination's type, hands every case one shared action
  type, and returns the child's effect untagged, so a result that arrives
  after the destination changed is applied to whichever case is open then
  (AUDIT-2026-09-03-FINDINGS N8). `createDestination()` routes by the action's
  case and maps each child's effect back into it. Kept for existing callers.

### Fixed

- **The WebSocket client reconnects more than once.** Every `connect()` reset
  the attempt counter, including the one the reconnect timer made, and a
  failed attempt was never rescheduled, so the first retry that failed was
  the last: no backoff ladder, no `maxAttempts`, no `MAX_RECONNECTS` event,
  and every `reconnecting` event said attempt 1. The timer now opens a socket
  without touching the counter, a failed attempt schedules the next rung,
  the ladder climbs to `maxAttempts` and then settles as `failed` with the
  exhaustion event, and `reconnected.totalDelay` is the sum of the ladder's
  delays rather than the last one. A failed attempt no longer logs a warning;
  its `error` event and the next `reconnecting` event say what happened.
  (AUDIT-2026-09-03-FINDINGS W1)

- **The API client's `deduplicate` option does something.** It was
  destructured from the client config and never read, so deduplication could
  not be turned off per client; only the per-request flag worked. The
  request's flag still wins. (AUDIT-2026-09-03-FINDINGS A1)

- **`Effect.api`, `Effect.apiFireAndForget` and `Effect.apiAll` were `undefined`
  in every bundled consumer.** `dist/api/effect-api.js` attaches them at
  import time and was reached only through a binding re-export out of modules
  that `sideEffects` did not list, so a bundler dropped the unused re-export
  before the assignment ran; the docs teach `Effect.api(` throughout. The
  barrels now import the module for its side effect, as they already did for
  websocket, and `sideEffects` lists the whole chain. Measured by
  `tests/repo/bundle-probe.test.ts` with esbuild. (AUDIT-2026-09-03-FINDINGS P1)

- **`scopeTo().case()` and `.optional()` return typed stores.** Both returned
  `ScopedStore<any, any>`, so a typo in the case name and a foreign child
  action compiled. The state comes from the position in the state tree; the
  child action is derived from the root action union by the same path — the
  runtime wrapping read backwards. A root store typed `Store<S, any>` keeps
  an untyped dispatch. (AUDIT-2026-09-03-FINDINGS P5)

- **`Alert` announced itself rather than its question.** It hardcoded
  `aria-label="Alert dialog"`, so a screen-reader user heard the same three
  words whether they were being asked to delete an account or discard a draft.
  New `ariaLabelledby`, `ariaLabel` and `ariaDescribedby` props; the hardcoded
  string remains the fallback, so no existing caller changes behaviour.
  `AlertDialog` wires them to its own title and description automatically.

  **`Modal`, `Sheet` and `Drawer` carried the identical defect** — `"Modal
  dialog"`, `"Bottom sheet"`, `"Side drawer"` — and take the same three props
  now, with the same fallbacks. Every modal surface in the library can be named
  by its content.

  Still hardcoded, and deliberately: the `aria-label` on `NavigationStack`,
  `Sidebar` and `Tabs`. Those are landmark and tablist roles, where naming the
  region after the component is a reasonable default rather than a dead end.

- **`createParserConfig(routes, options?)`** — builds a `ParserConfig` from a
  pattern-to-handler map, so a route stops being four lines of
  `const p = matchPath(pattern, path); return p ? {...} : null`. Additive:
  `ParserConfig` and `parseDestination` are untouched, and the `parsers` list
  form stays for routes that are not a single pattern — a custom regular
  expression, or one parser drawing on two. The two mix, because the config is
  a plain object.

  It also restores the symmetry with `SerializerConfig`, whose half has always
  been a keyed map.

  Keys are tried in insertion order, and the map form hides that, so a more
  specific pattern must come first. A handler may return `null` to decline
  *after* its pattern matched, which is what lets a route reject a value it
  does not like without claiming it.

- **Custom serializers for SSR state** — `createTaggedSerializer()` and the
  `StateSerializer` type, accepted by `serializeState`, `serializeStore`,
  `buildHydrationScript`, `renderToHTML` (as `options.serializer`), `parseState`
  and `hydrateStore` (as `config.serializer`).

  The documentation claimed `serializeState` **throws** on a `Date` or a `Map`.
  It does not, and that was the dangerous half of the claim, because a throw is
  loud. What actually happened: a `Date` arrived on the client as a `string`, a
  `Map` or `Set` arrived as `{}` with every entry lost, and TypeScript asserted
  the original type on both sides. Only a `BigInt` or a cycle ever threw.

  The replacer and reviver travel as **one object**, because a tag written by a
  replacer that no reviver reads is worse than no tagging at all — the state
  arrives as a visible wrapper instead of a value. Passing one object to both
  halves is what makes that hard to get wrong.

- **`ConnectionStats.messagesQueued`** — how many messages a queuing wrapper is
  holding for the connection. `0` for a client that does not queue.

  The register had declined queue inspection outright, on the grounds that the
  queue is an implementation detail of reconnection and exposing it invites
  reaching into it. That reasoning holds for a *handle* and there is still no
  `websocket.queue`; but the need behind the request was a pending count, and a
  read-only number on `stats` cannot be reached into.

  Required rather than optional: under `exactOptionalPropertyTypes` an optional
  field would force `stats.messagesQueued ?? 0` at every read, which is worse
  for the one thing it exists to do. Additive for readers of `stats`, breaking
  for anyone implementing `WebSocketClient` with a hand-written `stats` object.

- **`createMockStorage()`** — an in-memory `SyncStorage<T>` for tests, the
  counterpart to `createMockCookieStorage` that the localStorage/sessionStorage
  pair never had. `createNoopStorage()` discards writes and reads back `null`,
  which models "storage unavailable" and cannot express a round trip, so callers
  hand-rolled their own: core's own storage test built one and used it 48 times.
  It now imports this instead.

  Values are held as **JSON strings**, not live objects, so a `Date` put in
  comes back as a string exactly as it would through real storage — a
  `Map<string, T>` double hides that, and hiding it is how a test passes where
  production does not. `prefix`, `validator` and `debug` all behave as they do
  in `createLocalStorage`, which makes "a stored value the validator rejects
  reads back as `null`" testable for the first time.

  **`setItem` does not fire `subscribe`, deliberately.** That contract is
  cross-context only, and no browser delivers a `storage` event to the tab that
  caused the write. `simulateSetItem` / `simulateRemoveItem` play the part of
  the other tab — which is the first time `SyncStorage.subscribe` has been
  exercisable at all.


- **The two validation paths disagreed about which message to show.** Per-field
  validation took the *first* Zod issue (`issues.find`), whole-form took the
  *last* (assignment in a loop). So `"   "` in an email field said "Email is
  required" while typing and "Enter a valid email address" on submit — same
  input, same schema, two answers.

  Both now take the first. Zod emits in schema-declaration order, so for
  `.min(1, 'Email is required').email(...)` the first is the one that names the
  actual problem. The per-field match is on the full path and is exact rather
  than by prefix, so a zip code's error does not also appear on `address`.

  Two consequences of the old routing go with it. A numeric path segment no
  longer falls through to `formErrors` — it was neither truthy at index 0 nor a
  string, so an array element's error went where nothing renders it. And an
  error for a path with no record yet now creates a complete `FieldState`
  instead of spreading `undefined` into a two-key object missing `warnings` and
  `isValidating`.

- **State embedded in the hydration script could break out of it.** Both
  `renderToHTML` and `buildHydrationScript` wrote the serialized store raw into
  `<script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">`. A state
  value containing `</script>` closed that element early and everything after it
  was parsed as markup — stored XSS, reachable through any state field a user
  influences: a display name, a search term, a URL parameter. `escapeHtml` was
  defined in the same file and applied to the page title and the client-script
  src, never to the state.

  Both sites now escape `<` as `\u003C`, which is invariant under `JSON.parse`
  and closes `</script`, `<script` and `<!--` in one rule. **Not `escapeHtml`,
  deliberately**: a script element's contents are not entity-decoded, so `&lt;`
  would reach `JSON.parse` literally and break hydration instead — a test pins
  that distinction so the obvious wrong fix cannot be substituted later.
  `generateStaticSite` calls `renderToHTML`, so every generated page is covered.

- **`Combobox` can be given an accessible name.** It rendered `role="combobox"`
  and spread no rest props onto its input, so a consumer had no way to name it at
  all and a screen reader announced "combobox" and nothing else. New `ariaLabel`
  prop, **defaulting to `placeholder`** — what a sighted user reads — so the
  control is never nameless and no existing caller has to change.

- **Cross-field validation now runs outside `onSubmit`.** Per-field validation
  did `schema.shape[field].safeParse(value)` — one sub-schema, one value. A
  `.refine()` lives in the parent object's checks, so it was never in scope:
  `shape.confirmPassword.safeParse('does-not-match')` returns success, and a
  "passwords must match" rule was invisible in `onBlur`, `onChange` and `all`.
  It fired only when the whole schema was parsed, at submit.

  Three consequences, all of them visible to a user. The mismatch appeared only
  after a submit. Typing one character into the confirm field cleared it, and
  nothing could put it back before the next submit. And fixing the *other*
  field left the message on screen saying two values did not match when they
  now did.

  Per-field validation parses the whole schema and takes the issues for the
  field being validated. One asymmetry is deliberate: a pass may **clear** an
  error on any field the parse exonerates, but only **sets** one on the field
  being validated — so fixing `password` clears a stale message from
  `confirmPassword` without flagging fields the user has not reached.

  This also deletes the `(schema as any).shape` cast, and with it a silent
  failure mode: when `.shape` was absent the lookup yielded `undefined`, the
  branch was skipped, and every field validated as clean with no error and no
  warning.

  **How it survived:** not a missing review — `form.reducer.ts` carries one — but
  a combinatorial gap. The suite has two axes, schema kind and validation mode,
  and covered three of the four cells. The single cross-field test avoided the
  defect on every axis at once: `path: []` rather than a field path, `onSubmit`
  so per-field validation never ran, pre-populated data so `fieldChanged` never
  fired, and one assertion so nothing checked that a fixed error cleared. Four
  tests now occupy the empty cell, each mutation-verified.

- **`formErrors` is cleared by a successful validation.** It was written only on
  failure and cleared only by `formReset`, so a form-level message outlived the
  validation that disproved it and stayed for the life of the form.

- **`TestStore` now models cancellation.** Its `Cancellable` case ran
  `effect.execute(dispatch)` with no `AbortController`, no in-flight registry
  and no dispatch gating, so re-registering an id did not cancel the effect
  already running under it — both dispatched — and the executor received no
  `signal`. That is the one effect type whose entire purpose is cancellation,
  and any reducer using a fixed id to make a second request supersede the first
  behaved one way in production and another under test. `Effect.cancel(id)` now
  also aborts an in-flight cancellable rather than only tearing down a
  subscription.


- **`BrowserHistoryConfig.serialize` is no longer required.** `syncBrowserHistory`
  handles one direction — URL → state — and never called it, so the type forced
  every caller to write a function that was then never invoked. The other
  direction is `createURLSyncEffect`, which takes its own serializer. Widening
  only: callers still passing `serialize` compile unchanged.

### Changed

- **BREAKING: every caller of a coalesced request has its own promise, signal
  and timeout.** One promise served every caller, so one caller's abort or
  timeout rejected the others and a joiner's own `signal` and `timeout` were
  ignored. A caller's abort now rejects that caller with the signal's reason
  (an `AbortError`, not the `TimeoutError` every abort was mapped to) and
  detaches it; `timeout` bounds the caller's whole request, retries included;
  the shared fetch is aborted only when every caller is gone; joiners receive
  a structured clone of the response. A signal that is already aborted makes
  no fetch, and the abort listener is removed on settle. Error interceptors
  no longer see a `TimeoutError`: the timeout is the caller's, not the
  fetch's. A retry backoff sleep is not signal-aware, so after the last caller
  leaves an attempt may wait out one backoff before it stops.
  (AUDIT-2026-09-03-FINDINGS A7, A3)

- **BREAKING: the response cache is bounded and hands out clones.** It handed
  out the object it stored, so a caller that edited its response edited the
  cache for everyone; it grew without bound within the TTL; and an entry
  stored under a custom `key` could never be invalidated. Hits are structured
  clones now, the cache holds `maxEntries` (default 100, set per client with
  `cache: { maxEntries }`) with the least recently used dropped first,
  invalidation matches the path a request was made with, and a response that
  cannot be cloned is not cached and warns once. (AUDIT-2026-09-03-FINDINGS A2)

- **BREAKING: POST, PUT, PATCH and DELETE are no longer deduplicated by
  default.** Two identical concurrent mutations coalesced into one request,
  which hid the second intent. Safe methods (GET, HEAD, OPTIONS) still
  coalesce; a mutation coalesces only when its request sets
  `deduplicate: true`. (AUDIT-2026-09-03-FINDINGS A11)

- **BREAKING: the API client's request deduplication and response cache are
  per client instance.** Both were module-global: two clients built for two
  users coalesced into one fetch and both received the first user's body, and
  a cached body was shared across hosts and headers. Each `createAPIClient()`
  and each `createMockAPI()` now owns its map and cache, and the key is the
  request as it will be sent — method, resolved URL, query parameters, merged
  headers. The module-level `clearCache()`/`clearInFlightRequests()` helpers
  (never exported from the package) are gone; use the client's `clearCache()`.
  (AUDIT-2026-09-03-FINDINGS A1, A2)

- **`integrate()` runs each child before the core reducer.** Core ran first,
  so a parent observing `Destination.matchCase` read the child's state from
  before the action, and a core reducer that cleared the field on an action
  the child also handled hid that action from the child, whose effect was
  never produced. Children now run first, in registration order, and core
  runs on the state they produced; effects are batched children first.
  Observable only by a core reducer that reads a child's field on the same
  action. (AUDIT-2026-09-03-FINDINGS N14)

- **BREAKING: `createDestination()` takes and returns the single-wrapped case
  action** — `{ type: caseType, action: childAction }` — instead of expecting a
  second `presented` wrapper inside each case. No layer above produced that
  inner wrapper: `scopeTo().case()` wraps the case in one `presented`,
  `ifLetPresentation` strips it, and the generated reducer read
  `action.action.action`, which was `undefined`, so a child driven through the
  DSL threw on its first action. `DestinationAction<Reducers>` is now
  `{ type: K; action: ChildAction }`. Anyone who hand-built the double-wrapped
  form (the audit found nobody) drops one level. (AUDIT-2026-09-03-FINDINGS N1)

- **BREAKING: `Destination.reducer` maps the child's effect into its case.** It
  returned the effect unmapped, so an async child's own result came back as a
  destination action with no case and was dropped — every `Effect.run` under
  `createDestination` was stuck. The result now routes back to the child, and
  one that settles after the case has changed is dropped by the case check. (N2)

- **BREAKING: `scopeTo().case().dismiss()` dispatches the field's
  `{ type: 'dismiss' }`** instead of wrapping it in the case, a shape
  `ifLetPresentation` never recognised, so the field was never cleared. The
  case is not named; the state says which case was open. (N1)

- **`Destination.is()`, `matchCase()` and `match()` look through the parent's
  field and the `presented` wrapper**, so the parent action, `action.action`
  and the bare case action all match. A `dismiss` no longer matches a prefix
  path (`is(dismiss, 'addItem')` was `true`). A case may not be named
  `presented` or `dismiss`; `createDestination` throws.

- **`FormState.fields` is keyed by field path. Breaking.** It was keyed by
  top-level name, and Zod issues were routed with `issue.path[0]`, so a nested
  schema's error at `['address','zip']` landed on `address` — it could not be
  shown beside the input that caused it, and the field it named might not be on
  screen at all.

  `fields` is now `Partial<Record<FieldPath<T>, FieldState>>`, so `'address.zip'`
  and `'items.0.name'` are keys. `focusedField`, the eight `field:`-carrying
  actions, `formValidationCompleted.fieldErrors`, `asyncValidators` and
  `FormFieldProps.name` move to `FieldPath<T>` with it.

  **`Partial`, not total, and deliberately so.** A total record would have
  compiled with no churn at all and then thrown: an entry exists only once its
  path exists in the data, so an optional field or an array element that was
  absent at init has none. That is the lie `form-field-record.test.ts` exists to
  refuse. In practice `state.fields.email.error` becomes
  `state.fields.email?.error` — and since `noUncheckedIndexedAccess` is already
  on repo-wide, widening to `Record<string, FieldState>` would have cost exactly
  the same and lost compile-time checking of the key as well. `fieldStateAt()`
  is exported for callers who want a total read, so they opt into it explicitly.

  **A flat schema produces exactly the keys it always did**, so a form over a
  flat schema changes only in that its reads acknowledge absence.

  **`id` is the raw path**, so an input for `address.zip` gets `id="address.zip"`.
  That is legal HTML, and `for=`/`aria-describedby` associate by string
  equality, so labels and error announcements are unaffected.
  `querySelector('#address.zip')` is not — use `CSS.escape`, or the
  `[data-field="address.zip"]` attribute the component already emits.
  Sanitising the dot was rejected: it invents a namespace in which fields `a.b`
  and `a_b` collide, and the collision is a wrong label association, which fails
  silently and only for screen-reader users.


- **BREAKING (types): every optional prop now accepts `undefined`.** Under
  `exactOptionalPropertyTypes`, an optional prop read from `$props()` has type
  `T | undefined`, which cannot be assigned to a bare `T?` — so a component
  forwarding its own props to one of ours did not typecheck, and our components
  could not be wrapped. 0.11.2 fixed `Command` and said "`Command` is not
  special: 266 optional props are still bare". Measured properly it was **476
  across 143 files in eight packages**; all are fixed.

  Only 13 remain bare, all `$bindable`: `bind:value={x}` requires the parent's
  variable to match the prop type, so `| undefined` there makes binding
  *stricter* for consumers rather than looser.

- **BREAKING (types): `ImageGallery`'s mode discriminants are `?: undefined`,
  not `?: never`.** `never` refuses an explicit `undefined` — which is exactly
  what a forwarding wrapper holds — so neither branch of its props union could
  be forwarded. The runtime mode detection is unchanged.

- Twelve layout components (`Box`, `Panel`, `Text`, `Heading`, `Kbd`, `Empty`,
  `Banner*`, `ButtonGroup`, `AspectRatio`, `BreadcrumbSeparator`) now
  `Omit<…, 'class' | 'children'>` from their `HTMLAttributes` base. `svelte/elements`
  declares `children?: Snippet` bare and a derived interface may not widen an
  inherited member, so omitting it is what lets these accept a forwarded
  `Snippet | undefined`. Passing children as markup is unaffected.

## [0.11.2] - 2026-08-23

### Fixed

- **`deps.dismiss()` never dismissed anything through `ifLet`.**
  `createDismissDependency` and `createDismissDependencyWithCleanup` were handed
  the parent's `dispatch` and ignored it, dispatching through the effect's own
  executor argument instead. Child effects are mapped by `ifLet` with
  `fromChildAction`, and the wrapper already produces a parent action, so the
  dismiss arrived double-wrapped as
  `{ child: { presented: { child: { dismiss } } } }`. Under a real store that is
  not merely ignored: `ifLetPresentation` unwraps `presented` and hands the
  result back to the child reducer, which dismisses again — an unbounded loop
  ending in `RangeError: Maximum call stack size exceeded`.

  Both factories now dispatch through the captured parent dispatch, which makes
  `ifLet`'s mapping a no-op.

  Every existing test executed the effect directly with the parent's dispatch,
  so with no `ifLet` in the path there was no second wrapping and none of them
  could see it.

- **Documented call shapes for all three dismiss factories were wrong**, and
  harmless only because the first argument was dead. `docs/api/reference.md`
  documented an API that never existed (a one-argument form, a
  `DismissDependency<Action>` type parameter, and `deps.dismiss.dismiss(dispatch)`
  on what is a plain function); the navigation skill passed a *store* where the
  dispatch goes and a string where the wrapper goes; several examples built the
  dependency inside a reducer, which has no `dispatch` in scope; and several
  called `deps.dismiss()` as a statement and returned `Effect.none()`, discarding
  the dismiss. All corrected, and `tests/repo/doc-examples.test.ts` now checks
  these shapes across every markdown file in the repo.

- **`scopeTo(...).into()` could not chain past an optional level.** `keyof
  Current` is `never` the moment `Current` is nullable, while the builder's own
  `getValue()` explicitly walks through a null and returns null — the signature
  forbade what the implementation documents and does. It looks through the null
  now and carries the nullability into the result.

- **`Command`'s optional props did not accept an explicit `undefined`**, so
  under `exactOptionalPropertyTypes` a component forwarding its own `$props()`
  to `<Command>` did not typecheck — the palette could not be wrapped. All seven
  now say `| undefined`, pinned by
  `tests/test-components/CommandPropForwarding.svelte`, which exists to be
  typechecked rather than rendered.

  `Command` is not special: 266 optional props across `src/lib/**/*.svelte` are
  still bare, against 134 that are not, so most components in this library
  cannot be wrapped either. Recorded in `plans/hardening/README.md` §S11 as its
  own item rather than claimed fixed here.

- **`Destination.match` could not take handlers returning different types.**
  BREAKING: the type parameter is now the handler map rather than the result, so
  an explicit `Destination.match<MyResult>(…)` no longer compiles — let it
  infer. No in-repo caller used that form. `docs/api/reference.md` and
  `docs/dsl/destinations.md` are updated.
  It inferred a single `T` from the handler map, so `T` came from the first
  handler and every other one was checked against it — the multi-case form in
  its own JSDoc, the form the helper exists for, typechecked for nobody. It now
  infers the map and distributes `ReturnType` over it, giving the union the
  caller actually receives.

- **`combineReducers` could not infer its `Action` type**, so the form shown in
  its own JSDoc did not typecheck for anyone — `Action` resolved to `unknown`
  because a reverse-mapped type yields inference candidates only for the
  parameter under the key. The parameter now carries a second, non-mapped
  inference site. Nothing that was rejected before is accepted now.

- **Two of `matchPath`'s five documented examples threw** rather than matching:
  `:action?` gave `Unexpected ?` and a bare `*` gave `Missing parameter name`,
  both pre-v8 path-to-regexp syntax, while the doc block above them claimed
  support for "optional params, wildcards". Rewritten in v8 syntax (`{/:action}`
  and `*path`) and all five are now pinned by tests. Two tests skipped as
  "requires the END option, deferred to v1.1" were testing `{action}`, an
  optional *literal* segment that never captured anything; repaired and
  un-skipped.

### Added

- **`TestStore.dispatch(action)`** — delivers an action from outside the
  reducer, exactly as an effect would, so `receive()` matches it. A dependency
  holding the parent's dispatch had no way to reach a `TestStore` before, which
  meant a dismiss could not be observed under test at all: `receive()` could
  never match it, and a test asserting only on the state before the dismiss
  passed, as did `assertNoPendingActions()`.

- **`Effect.api`, `Effect.apiAll`, `Effect.apiFireAndForget` and
  `Effect.websocket` were typed as non-existent.** Both extension modules
  augmented a name with nothing to merge into — `api/effect-api.ts` declared
  `interface Effect`, `websocket/effect-websocket.ts` declared `interface
  EffectNamespace` — while `Effect` is a `const`. Merging an interface
  contributes nothing to a const of the same name, so both augmentations were
  inert while `(Effect as any).api = api` made the runtime work anyway.

  All of it is documented — `docs/backend/api-client.md`,
  `docs/backend/websocket.md`, and the JSDoc example at
  `src/lib/websocket/index.ts:26` — so a consumer following the documentation
  wrote code that ran and did not typecheck.

  `Effect` now carries an `EffectExtensions` seam that both modules merge into.
  Purely additive: nothing that compiled before stops compiling.

## [0.11.1] - 2026-08-23

### Fixed

- `TestStore.advanceTime` called `vi.advanceTimersByTime` whenever the method
  existed — which it always does — and Vitest throws "a function to advance
  timers was called but the timers APIs are not mocked" when they are not. So
  `finish()`, whose documented job is to wait for pending effects and assert
  none remain, threw in any test that had no reason to fake time. **Twenty-one
  documented examples in this repo were unrunnable because of it.**

  It now advances virtual time only when a clock is actually faked, and waits on
  the real one otherwise — so `advanceTime(300)` means the same thing in both
  modes.

## [0.11.0] - 2026-08-22

### Added

- `animateFadeIn` / `animateFadeOut` and the `FadeOptions` they take — the
  generic pair, for something that is not a modal, a toast or a list item. They
  replace the last two state-driven CSS transitions in `@composable-svelte/chat`:
  an image preview lifting `opacity` on a `.loaded` class, and a video player's
  controls lifting it on `.visible`.

  Three things about them are deliberate, and all three were measured rather than
  designed:

  - **They own the start value.** `opacity: [0, 1]` means the element's resting
    state in CSS is "visible". Both sites they replace parked their element at
    `opacity: 0` and lifted it from a client-side handler, so server-rendered
    HTML — and any client with JavaScript off — showed nothing at all.
  - **They write their own end state.** Motion commits its final style a frame or
    two *after* `.finished` resolves: the promise settles with the inline style
    still empty and the computed value back at the cascade's. For an element that
    unmounts nobody sees it; for one that stays, it is a visible flash.
  - **Reduced motion is asymmetric.** `animateFadeIn` cannot simply return early
    — a previous fade-out may have left the element at zero — and `animateFadeOut`
    has to write `opacity: 0` itself. Skipping the animation must never skip the
    outcome.

  An instant show should be `animateFadeIn(element, { duration: 0 })` rather than
  an inline `style.opacity`: a running Web Animation outranks an inline style, so
  assigning the style leaves a fade-out in flight to finish anyway.

### Changed

- `createScrollFollower` now reads `prefers-reduced-motion` itself when its
  `reducedMotion` option is omitted, instead of animating regardless. Callers
  that already pass the option are unaffected.

### Fixed

- Every sibling package declared `@composable-svelte/core` as an ever-growing
  `"^0.4.1 || … || ^0.10.0"` list. Each core release appended a minor, which
  moves the ceiling and never the floor, so packages kept advertising
  compatibility with versions that lacked the exports they import. The ranges are
  now exactly the core they are built against, and
  `tests/repo/peer-ranges.test.ts` keeps them there.

- `tests/repo/dist-freshness.test.ts` fails when a package's `dist/` is older
  than its `src/`. Cross-package tests resolve through the exports map to built
  output, so a stale build produced a green suite that said nothing about the
  code under change — verified in both directions before the guard was written.

## [0.10.0] - 2026-08-22

### Added

- `animateListItemIn` — the entry animation for an item appearing in a list,
  replacing the one-shot `@keyframes` chat used on message bubbles. It uses
  `springPresets.listItem`, which had been defined for exactly this and never
  called by anything.

  It supplies its own start values (`opacity: [0, 1]`) rather than relying on a
  CSS `opacity: 0`, because `$effect` never runs on the server: an element parked
  at zero opacity awaiting an effect renders permanently invisible in server HTML
  and with JavaScript disabled. Owning the start value keeps the resting state —
  and the server's output — simply "visible".

  It consults `prefersReducedMotion()`, making it the second animation in the
  package to honour the preference. Skipping it cannot skip the outcome, because
  the outcome is the element's natural state.

## [0.9.0] - 2026-08-22

### Added

- `createScrollFollower` — smooth scrolling the caller owns, for following a
  target that keeps moving. `scroll-behavior: smooth` is prohibited by the
  animation guideline (the store cannot see, sequence on or cancel it), and the
  case that needed replacing is a chat list auto-scrolling as tokens stream in:
  the target moves every chunk, so a one-shot animation per chunk would be
  interrupted by the next, and an interrupted Motion One `.finished` never
  settles. A single `requestAnimationFrame` loop that re-reads the target each
  frame retargets for nothing.

  Its `isSelfScroll()` answers "was that scroll event mine?" by comparing the
  live position against the last value written — deliberately not "am I
  running?". A listener that went deaf while the animation ran would leave a user
  unable to scroll away from a stream at all.

- `prefersReducedMotion()` and `watchReducedMotion()`. The guideline requires
  every animation to be skippable and records that none of the 28 helpers in
  `animate.ts` consults the preference. This does not close that gap — it
  provides the reader, not the plumbing — but `createScrollFollower` honours it,
  which makes it the first animation in the package that does.

## [0.8.0] - 2026-08-22

The effect system's cancellation was inert. Found while building a package's
socket teardown on top of it.

### Fixed

- **`Effect.cancel` could not cancel an `Effect.cancellable`.** The store created
  an `AbortController`, stored it and aborted it — but `EffectExecutor` took only
  `dispatch`, so the signal never reached anyone. The work ran to completion and
  still dispatched. Executors now receive the signal as a second argument, and
  dispatches from a cancelled effect are dropped whether or not the executor
  observes it, so cancellation is correct without the author opting in.
- **`Effect.cancel` was identified by stringifying the executor** and testing for
  `{}`, so a real effect whose body contained an empty object literal was
  silently treated as a cancellation and never ran. It already had to accept both
  `{}` and `{ }` because the build reformats the no-op it was matching. There is
  a structural `cancelOnly` marker now, and `Effect.map` preserves it — mapping a
  cancel through a scoped child reducer used to turn it into a phantom
  cancellable.
- **Subscription cleanups could take down the whole teardown.** A setup that
  returned nothing — the shape this repo's own examples use for a WebSocket
  dependency — meant `undefined` was stored and later called, throwing a
  *synchronous* TypeError that the surrounding `.catch` could not see. `destroy()`
  threw, and every later step (remaining cleanups, the subscription map, debounce
  and throttle timers, the subscriber list) was skipped. A cleanup that throws
  synchronously escaped through `dispatch()` into the caller's event handler and
  left itself installed to throw again at destroy. Both are absorbed now.
- **A cancelled subscription could still dispatch.** A real socket's `close()`
  fires `onclose` on a later task, so a dead subscription's report overwrote the
  live one's state: a deliberate disconnect displayed "connection failed", and a
  reconnect reported failed while a healthy socket delivered messages. Dispatch
  is gated on the subscription still being current.
- **A superseded cancellable deleted its successor's controller** when it settled,
  after which `Effect.cancel` for that id found nothing.
- A non-object rejection (`throw null`, bare `Promise.reject()`) threw a second
  `TypeError` inside the error handler, turning a handled failure into an
  unhandled rejection.
- **`TestStore` ignored cancellation entirely** — it never ran subscription
  cleanups on `Effect.cancel` and never honoured `cancelOnly`, so a reducer whose
  disconnect is `Effect.cancel(subscriptionId)` tore nothing down under test while
  behaving correctly in production. The obvious test passed vacuously.

### Changed

- **BREAKING** — `EffectExecutor` takes an optional `signal: AbortSignal` second
  parameter. Additive, so existing executors are unaffected. It is supplied for
  `Effect.cancellable` only and is `undefined` for `run`, `debounced`, `throttled`
  and `afterDelay`; since `fetch` accepts an undefined signal without complaint,
  that distinction is documented on the type.
- **BREAKING** — a cancelled effect's dispatches are dropped where they
  previously landed. Any code depending on that was depending on `Effect.cancel`
  not working.

## [0.7.0] - 2026-08-21

A sweep to remove **dead behaviour**: anything a consumer can pass, configure,
click or import that produces no effect. Everything below was reachable and
inert, not merely unimplemented. Nothing here is deprecated-then-removed —
0.x, and the alternative to a breaking change was leaving a lie in place.

### Animation compliance

`guides/ANIMATION-GUIDELINES.md` is rewritten and now mechanically enforced. An
audit found **135 CSS animation sites** in shipped source that the previous
version could not adjudicate — it contradicted itself on Pattern A, treated
`@keyframes` as allowed regardless of whether it repeated, and had an
exceptions category with no criteria.

- **The rule is now one question**: what *drives* the change — a pseudo-class, a
  state change, an endless loop, or a continuous external source. A one-shot
  `@keyframes` is a lifecycle animation, not an allowed keyframe animation; the
  `infinite` keyword is the test.
- **`PresentationState` is required only where the lifecycle must be in the
  store** — something sequencing on completion, or an element that must animate
  out before unmounting. Elsewhere a plain boolean plus Motion One is the
  sanctioned pattern, and the guide is explicit that it is fire-and-forget.
- **Reduced motion is mandatory**, and a skipped animation must still dispatch
  its completion — otherwise skipping it deadlocks the state machine. No helper
  in `animate.ts` honours the preference yet; that gap is now recorded rather
  than silently carried.
- **`packages/core/tests/repo/animation-policy.test.ts`** enforces the CSS ban as
  a ratchet: it fails on any violation outside a recorded backlog *and* on any
  backlog entry whose file has become clean, so an excuse cannot outlive its
  defect.
- **Converted**: the four disclosure chevrons (Accordion, Collapsible, Select,
  Combobox) onto `animateChevron`; `Select`'s dropdown, which had no animation at
  all and a bound-but-unread `dropdownElement`; and the `Switch` thumb, which had
  three authors for one property.

### Fixed

- **Collapsible's collapse animated from 0 to 0.** The `{#if}` sat inside the
  element being measured, so Svelte emptied it before the effect read
  `scrollHeight`. Measured: five consecutive height samples of exactly 0.
- **Accordion and Collapsible content had three authors** for height, opacity and
  overflow — a reactive style attribute, Tailwind utilities, and Motion One. The
  reactive attribute compiles to a `cssText` assignment, which wipes every inline
  style Motion wrote, and fires exactly when an animation is starting or being
  interrupted.
- **Server rendering of animated elements.** Moving an element's position from
  markup into an `$effect` means the server emits it at rest, because effects do
  not run there: a checked `<Switch>` was sent with `bg-primary` on the track and
  its thumb at zero. Positions are now placed declaratively from a non-reactive
  value and animated by Motion One thereafter, and
  `tests/ssr/animated-initial-state.test.ts` compiles the components the way the
  server does — the entire browser-mode suite is blind to this class of defect.
- **`Toaster` could not display anything a consumer controlled.** It rendered
  `externalToasts ?? $store.toasts`, the only dispatch any rendered element
  could produce was `toastDismissed`, and that case returned early for any toast
  not in the internal store. Prop-supplied toasts never entered it and nothing
  could put one in — no `store` prop, no context, no export. `position` was
  written by `positionChanged` and read by nothing, since the container was
  classed from the component's own prop. `toastActionClicked` had no dispatcher:
  `Toast.svelte` called `toast.action.onClick()` locally and then dismissed,
  making "acted on it" and "discarded it" indistinguishable to
  `onToastDismissed` and in the action history. `animateToastOut` was exported
  with no caller, so toasts vanished rather than animating out; dismissal is now
  two-step (`toastDismissed` marks, `toastRemoved` removes) so the exit
  animation has somewhere to happen.
- **i18n `setLocale` validated against the wrong list.** It checked
  `deps.localeDetector.getSupportedLocales()` while the UI renders from
  `state.availableLocales` — `examples/ssr-server`'s LanguageSwitcher builds its
  buttons from exactly that — so a shipped switcher could offer a locale the
  reducer silently refused with a `console.warn`. It failed both ways: a locale
  the app lists but the detector does not was rejected, and one the detector
  knows but the app does not was accepted. The detector detects a starting
  locale; it does not authorise a switch.
- **`Command`'s children drove a different store.** `Command.svelte` rendered
  `{@render children()}` with no arguments and provided no context, while
  `CommandInput` / `CommandList` / `CommandItem` each *required* a `store` prop
  — so a consumer built a second store and everything `<Command>` was configured
  with (`commands`, `filterFunction`, `maxResults`, `caseSensitive`, `groups`)
  fed an internal store nothing rendered. `CommandList` never iterated
  `filteredCommands` at all, so there was nowhere for that configuration to
  become visible even in principle. Children now take the palette's store from
  context, with a `{@render children({ store })}` payload as the escape hatch;
  `store` stays optional because standalone use with a consumer-owned store was
  the one configuration that worked.
- **`maxResults` was ignored by seven of nine paths.** Applied by `queryChanged`
  and `commandsUpdated`, ignored by `opened`, `closed`, `executeCommand`,
  `clearQuery`, `reset`, `dismissalCompleted` and the state factory — so the
  palette exceeded its own limit after every open, close, clear and execute. All
  nine now route through one `applyFilter` (filter, order by group, bound).
  Ordering happens there rather than in the view because `nextCommand`,
  `selectCommand` and `executeCommand` index into `filteredCommands`, so sorting
  anywhere else makes the keyboard highlight and the executed command disagree.
- **The Combobox chevron was a dead click zone.** A bare `<svg>` with no handler
  that nevertheless rotated with `$store.dropdown.status` — it looked like the
  toggle, sat exactly where a user clicks to open a combobox, and did nothing.
  The `toggled` action existed with no dispatcher. It is now a real button with
  `aria-expanded`.
- **FileUpload's progress bar sat at 0% for every upload.** `uploadProgress`
  existed as an action and a reducer case with no dispatcher, because `onUpload`
  was `(file) => Promise<void>` and gave a consumer no channel to report
  through. The bar went 0 → gone, never a value between.
- **`Sidebar` never finished presenting, and `springConfig` did nothing.** It
  animated through a CSS `transition-[width]` + `transitionend` handshake that
  could not complete: the wrapper mounts only once it is already visible, so it
  was born at its target width, no transition ran, `transitionend` never fired
  and `onPresentationComplete` was unreachable. With no spring there was nothing
  for `springConfig` to configure, so it sat destructured and unused. It is now
  Motion One, which CLAUDE.md requires for lifecycle animation, using the
  `animateSidebarExpand` / `animateSidebarCollapse` helpers that had shipped
  exported with zero callers.
- **An overlay hydrated in the open state could never be dismissed.** Five
  primitives spelled their animation guard `lastAnimatedContent !== null` —
  "have I animated anything yet?" — which differs from "is this a transition I
  have already run" whenever a component mounts already `presented`. The
  collapse branch was refused, `dismissalCompleted` never fired, and the
  reducer's own `status !== 'presented'` guard then rejected every further
  dismiss: an undismissable overlay, permanently, with no error. That is what
  SSR hydration produces for a page rendered with an overlay open, and what
  every mount of a persistent desktop sidebar looks like. `ModalPrimitive` alone
  carried an ad-hoc "deep linking" seed for this and it had never been
  propagated; all six now key on the `(status, content)` pair.
- **`Calendar` ignored a `selectedDate` in another month.** `propsChanged` never
  touched `currentMonth`, so a date picker setting `selectedDate` to a date
  elsewhere left the grid on the old month with the selection off-screen —
  indistinguishable from nothing being selected, on the default path. Range mode
  had the identical problem. `monthSet` was the action for exactly this and had
  no dispatcher anywhere in the repo; the default header rendered month and year
  as static text, so reaching a distant month meant one chevron click per month.
- **TreeView's bulk operations had no dispatcher.** `expandAll`, `collapseAll`
  and `allNodesDeselected` were implemented, tested at the reducer level, and
  unreachable — the component owns its store privately and handed out no
  reference. `expandAll` also used `getAllNodeIds`, marking leaves as expanded,
  and marked `lazy` nodes expanded without dispatching their load, so such a
  branch rendered open, empty and with no spinner, permanently.
- **`fieldFocused` was a no-op that said so in a comment.** `FormControl`
  dispatches it on every `onfocus`, so it was reachable, carried a field name
  and changed nothing; its siblings `touched` and `dirty` reach the DOM as
  `data-touched` / `data-dirty` and focus had no counterpart.
- **The lightbox's loading state had no reader.** `lightbox.isImageLoading` was
  written in eleven places and read in none, so opening a lightbox on a
  full-size photo showed an empty frame with nothing to say the image was
  coming.
- **Range calendars could not select anything.** The prop-sync effects compared
  `store.state.X` against the `X` prop, and that comparison cannot tell which
  side moved — the effect reads both, so it re-runs on either. Single mode
  survived only by accident, because `dateSelected` writes the `selectedDate`
  prop through `deps.onDateSelect`. `rangeStarted` notifies nobody, so the first
  click set `selectedRange.from` in the store, the effect saw a difference, and
  `propsChanged` put the stale prop back; `rangeCompleted` was unreachable
  because it needs a `from` that could never survive. Each effect now keys on its
  own prop's previous value.
- **`DropdownMenu` never animated, and its whole presentation subsystem was
  unreachable.** No action wrote `presenting` or `dismissing` — `opened`,
  `closed`, `toggled`, `escape` and `itemSelected` touched only `isOpen` — and
  the only dispatcher of `{ type: 'presentation' }` was the component's own
  `$effect`, which can fire only in those two statuses. A closed loop with no
  entry point, so `animateDropdownIn`/`Out`, the `presenting` opacity gate, the
  `dismissing` mount arm, the reducer's `presentation` case and
  `DropdownMenuState.presentation` were all dead. The menu popped in with no
  animation, against CLAUDE.md's Motion One requirement.
- **Disclosure chevrons animated on a separate timeline from what they
  disclose.** The Combobox chevron rotated via a Tailwind transition while its
  dropdown animated through Motion One — two uncoordinated timelines for one
  gesture, which `guides/ANIMATION-GUIDELINES.md` names as the reason
  state-driven animation exists. Both halves now run from the same effect via a
  new `animateChevron` helper.
- **`MockAPIClient` stubbed a third of `APIClient`.** `addInterceptor` returned
  an empty closure and `clearCache` / `invalidateCache` did nothing. Anything a
  consumer builds on interceptors — auth headers, response shaping, error
  mapping — silently stopped existing under test, so a test covering that code
  proved the opposite of what it appeared to. All three are now real, and
  `cache` defaults to `false` exactly as in `createAPIClient`.

### Added

- `createToastStore(config)`, and a `store` prop on `Toaster`.
- `Command` exports `setCommandContext` / `getCommandContext`, and `Command`
  accepts `groups` and `caseSensitive`.
- `Calendar`'s default header has month and year `<select>`s, and its `header`
  snippet payload gains `setMonth`. Offered years are clamped to `minDate` /
  `maxDate` when set.
- `TreeView` accepts a `controls` snippet receiving `expandAll`, `collapseAll`,
  `deselectAll`, `expandedCount` and `selectedCount`. Not a `store` prop: the
  state is `Set<string>`, which is not JSON-serialisable and would break SSR
  hydration.
- `FormState.focusedField`, `FieldState.focused`, and `data-focused` on control
  props. Focus deliberately does **not** set `touched` — that gates error
  display, so touching on focus fires "required" on every field the user tabs
  through.
- `role="progressbar"` and `aria-valuenow` on FileUpload's bar; a loading
  spinner in `ImageLightbox`.
- `animateChevron(element, expanded, springConfig?)` in the animation module.
- `FieldRenderState`, the payload `FormField` hands its children — the stored
  `FieldState` plus `value` and `focused`, which the form tracks centrally.
- Calendar's month `<select>` disables months with no selectable day in them,
  matching the year select's clamping.
- Styleguide demos for Toast, Command and TreeView's toolbar. Toast and Command
  had none, which is part of why these shipped unnoticed.

### Changed

- **`onUpload` is now `(file, onProgress) => Promise<void>`.** Source-compatible:
  an existing one-argument function stays assignable under TypeScript's
  fewer-parameters rule.
- **`Command`'s `children` snippet receives `{ store }`.** Also
  source-compatible — `Snippet` is a call-signature interface, so a
  zero-argument `{#snippet children()}` stays assignable.
- **`SidebarPrimitive`'s children snippet payload** drops `targetWidth` and
  `onTransitionEnd`, which described the CSS-transition contract that is gone.

### Removed

- **`Toaster`'s `toasts` and `dependencies` props**, and its `maxToasts` /
  `defaultDuration` / `position` config props. All were unreachable;
  `dependencies` is exactly redundant with `createToastStore({ dependencies })`.
  `store` and the config props are mutually exclusive and now **throw** when
  both are given, rather than silently ignoring one.
- **`Command`'s `toggled` action.** `open` is `$bindable`, and the only snippet
  that could dispatch `toggled` renders while the palette is open — so it could
  only ever close, and a half-reachable action is still a lie.
- **`CommandGroup.items`** — a third source of truth for group membership,
  alongside `groups` (labels and ordering) and `CommandItem.group`.
- **`FormDependencies`.** An empty interface accepts any object, so it
  constrained nothing: a type-level no-op wearing the shape of a contract.
- **`TreeNodeItemProps`.** `TreeNodeItem` is a snippet that types its own
  parameter inline, so the interface described nothing.
- **`Effect.animated()` and `Effect.transition()`.** Both had zero callers, and
  they exist to time a fixed-duration CSS animation from the reducer — which the
  animation guideline now prohibits. Investigating whether they were needed as a
  timeout fallback produced a finding worth keeping: Motion One's `.finished`
  captures no `reject` and never settles when an animation is interrupted, so
  the `try/catch` in every helper is dead code for that path. The components
  survive it because the `(status, content)` guard means the live promise always
  matches the live status, and `tests/animation-interruption.test.ts` pins that.
  A fallback is required only where that correspondence breaks, so adding one by
  default would have been unreachable code.
- **`FieldState.value` and `FieldState.focused`** from the *stored* per-field
  record. The reducer wrote both exactly once, at init, and never again: the real
  value lives in `state.data` and focus in `state.focusedField`, so both stored
  copies were stale the moment anything happened. They remain on
  `FieldRenderState`, where they are derived correctly.

## [0.6.0] - 2026-08-18

### Fixed

- **Transparent component surfaces.** Popovers, dropdowns, selects, comboboxes,
  tooltips and modal backdrops rendered see-through in consumer apps. The package
  shipped two mutually incompatible CSS-variable vocabularies — `--popover` in
  `styles/globals.css` and `--color-popover` in `styles/theme.css` — with no
  preset and no setup documentation, so a consumer's Tailwind config routinely
  referenced tokens that no stylesheet declared. `hsl(var(--undefined))` is
  invalid at computed-value time, which paints nothing while the border and
  shadow still draw. Both vocabularies now resolve, and every colour ends in a
  literal fallback, so an undefined token degrades to the default light theme
  instead of to nothing. (That fallback cannot help if Tailwind never generates
  the class at all — for that, see the `content` / `@source` setup below.)
- **Tailwind v4 incompatibility.** Both shipped stylesheets used v3-only
  `@tailwind` directives, and v4 consumes `--color-*` as a complete colour rather
  than an HSL triplet, so v4 apps got invalid colours even when tokens were
  present. `styles/tailwind.css` is a native v4 entry point.
- **Nested overlays dismissed their parents.** `clickOutside` tested only
  `node.contains(target)`, but overlays render through a portal, so a click
  inside a nested overlay looked "outside" to its parent — dismissing a
  confirmation alert also dismissed the modal beneath it. Dismissal now follows
  a layer stack: only the topmost overlay reacts.
- **Effects that re-triggered themselves.** The overlay primitives wrote an
  animation guard held in `$state` on every qualifying run of the `$effect`
  that reads it — Svelte's `effect_update_depth_exceeded` condition. It threw
  when a sheet was opened by a fast click. Six other components shared the
  anti-pattern with a gated write, so they converged after an extra pass rather
  than hanging; all eleven guards are now plain locals, and the one that must
  stay reactive reads through `untrack`.
- **Debug logging removed.** 32 `console.log` calls shipped to consumers,
  including one in `AnimatedNavigationStack`'s template that ran on every
  render. The `console.log`s that remain in the library are all inside JSDoc
  examples.
- **Dark mode silently inert** for consumers whose config lacked
  `safelist: ['dark']` — Tailwind v3 tree-shakes `@layer base` selectors absent
  from `content`, purging the entire dark token block. The preset supplies it.

### Added

- `styles/tokens.css` — canonical, directive-free design tokens, importable from
  Tailwind v3, Tailwind v4, or plain CSS.
- `styles/tailwind.css` — Tailwind v4 entry point: registers the library as a
  content source, defines the `.dark` variant, and maps tokens via `@theme inline`.
- `tailwind-preset` — published Tailwind v3 preset with the full colour map,
  `darkMode: 'class'`, the `.dark` safelist, and a `contentGlob` export so
  consumers need not hardcode an install path.
- "Styling & Theming" documentation in the README, including troubleshooting for
  transparent components.
- `tailwindcss` declared as an optional peer dependency.

### Changed

- `styles/globals.css` is unchanged in behaviour and remains self-contained. Its
  token block is duplicated from `tokens.css` rather than `@import`ed, because an
  `@import` is only inlined by pipelines running `postcss-import` — where it is
  not, no tokens would be declared at all. A test pins the two copies together.
- `styles/theme.css` is marked legacy. It is deliberately left vocabulary-pure so
  it cannot shadow a consumer's own `--color-*` overrides; every `--color-*` name
  it shipped through v0.5.x still works via the preset's resolution chain.

### Added — public API surface

- `components/ui` now re-exports each component's **reducer, state factory and
  prop types**, not just the component: `collapsibleReducer`,
  `createInitialCollapsibleState`, `selectReducer`, `comboboxReducer`,
  `accordionReducer`, `treeViewReducer`, `carouselReducer`, `fileUploadReducer`,
  `paginationReducer`, `calendarReducer`, `tooltipReducer`,
  `dropdownMenuReducer`, and the prop types `SelectOption`, `ComboboxOption`,
  `TreeNode`, `MenuItem`, `CarouselSlide`, `DateRange`, `UploadedFile`. None of
  these was reachable from any entry point before, which made `Collapsible`
  impossible to use and the others impossible to type.
- `navigation-components` now also exports `DestinationRouter` and the headless
  primitives, matching what the root barrel already offered.

### Changed — SSR entry points

- **Server-only middleware moved off `/ssr`.** `createSecurityHeaders`,
  `fastifySecurityHeaders`, `defaultSecurityHeaders`, `RateLimiter`,
  `fastifyRateLimit` and their config types are now at
  `@composable-svelte/core/ssr/middleware`; `sanitizeHTML`, `createSanitizer`
  and `defaultSanitizeOptions` are at `@composable-svelte/core/ssr/sanitize`.
  None of them is exported from `/ssr` any more. The names are unchanged.

  They had to move because the sanitiser imports `isomorphic-dompurify`,
  which depends on `jsdom`, and the root entry re-exports through the `/ssr`
  barrel — so *any* consumer of `@composable-svelte/core`, browser apps
  included, pulled DOMPurify into their module graph. A bundle of an app that
  imported only `Effect` from the root entry went from 70,458 bytes containing
  DOMPurify's browser build (and throwing `ReferenceError: window is not
  defined` under Node) to 22,355 bytes without it.

  `/ssr` keeps `hydrateStore`, `parseState`, `serializeStore`, `serializeState`,
  `renderToHTML`, `renderComponent`, `buildHydrationScript` and `isServer`, and
  is now browser-safe. A new test walks the built module graph of every entry in
  the `exports` map and fails any client-reachable one that can reach jsdom,
  DOMPurify, fastify or a Node builtin.

- **`isomorphic-dompurify` is now an optional peer dependency, not a runtime
  dependency.** It was installing for every consumer, including browser-only
  apps that never sanitise anything. Measured by installing a packed tarball
  into an empty project and counting every package manifest: core alone is
  **41 packages / 26.0 MB**; adding the sanitiser's dependency takes that to
  **110 packages / 58.8 MB** — it costs **+69 packages and +32.8 MB**, mostly
  jsdom.

  It is the only server-side helper in core with a dependency, which is why
  sanitisation gets its own entry rather than sharing `/ssr/middleware`. Security
  headers and rate limiting have no dependencies at all, so that entry always
  resolves; if sanitisation were re-exported there, importing it for rate
  limiting alone would eagerly load jsdom. Consumers who call `sanitizeHTML`
  should add `isomorphic-dompurify` to their own dependencies; without it the
  import fails immediately with `Cannot find package 'isomorphic-dompurify'`
  rather than silently skipping sanitisation.

- For the record: importing `generateStaticSite` from `/ssr` has never worked —
  the barrel only ever re-exported SSG *types*, deliberately, to keep `fs` out
  of browser builds. It has always been `@composable-svelte/core/ssr/ssg`.
  Several docs said otherwise and are corrected.

### Changed — renames

- The `AccordionItem` **type** is exported as `AccordionItemData`; the name
  `AccordionItem` belongs to the component.
- dropdown-menu's local `PresentationEvent` is now
  `DropdownMenuPresentationEvent`. It shadowed the canonical navigation type of
  the same name; both were previously unreachable, so nothing can break.

### Publish order

`@composable-svelte/core` must be published **first**. The satellite packages
declare `^0.6.0` in their core peer range, which is unsatisfiable until 0.6.0 is
on npm. Then publish the seven satellites (each patch-bumped so the widened
range actually reaches consumers).

### Notes

- **Applying the preset changes `dark:` from a media query to a class.** The
  preset sets `darkMode: 'class'` (v4: `@custom-variant dark`), because that is
  what `themeManager` drives. Any `dark:` utility in your own app that previously
  followed the OS setting will now require `.dark` on `<html>`.
- Otherwise the preset does not restyle your app. It sets colours, `borderRadius`,
  `darkMode` and the `.dark` safelist — nothing else. It deliberately does **not**
  touch `boxShadow`, `borderColor` or the transition defaults, all of which would
  apply app-wide for no benefit (`theme.css`'s shadow values were already
  identical to Tailwind's, and routing them through `var()` silently dropped the
  second layer of multi-layer coloured shadows).
- **Do not import both `styles/globals.css` and `styles/theme.css`.** Together,
  `globals.css` declares `--popover` at our defaults, which shadows a `theme.css`
  consumer's own `--color-popover` branding — the resolution chain tries the
  unprefixed name first. Upgrading consumers should keep `theme.css` alone, or
  migrate their overrides to the unprefixed names.
- Tailwind v3 does **not** merge a preset's `content` into the resolved config
  (verified against 3.4.18). Add the exported `contentGlob` to your own `content`
  array or the component classes will be purged.
- `styles/tailwind.css` assumes tokens are HSL triplets. An app that already has a
  shadcn-svelte **v4** palette (complete `oklch()` colours) should skip that file
  and map the tokens in its own `@theme` block.

## [0.5.0] – [0.5.2]

No changelog entries were written for these releases. From the git history they
covered the satellite packages' peer-dependency widening and a Svelte 5
reactivity sweep across Form, TreeView and several UI components
(`e47f98a`, `eee141e`, `2625e4d`).

## [0.4.0] - 2025-01-12

### Added

#### 🌍 Internationalization (i18n)
- **Complete i18n System**: Full-featured internationalization with ICU MessageFormat
  - `createInitialI18nState()`: Initialize i18n state with locale configuration
  - `createTranslator()`: Create translation function bound to locale and namespace
  - `createFormatters()`: Framework formatters for dates, numbers, currency, relative time
  - `i18nReducer()`: Built-in reducer for locale switching and namespace loading
  - **ICU MessageFormat Parser**: Full ICU support (variables, plurals, select)
  - **Translation Loaders**: Three built-in loaders for different use cases
    - `BundledTranslationLoader`: Import translations directly (fastest, best for SSG)
    - `FetchTranslationLoader`: Load translations over network (dynamic, best for large apps)
    - `GlobTranslationLoader`: Vite glob imports (best for code splitting)
  - **Locale Detection**: Three detection strategies
    - `createBrowserLocaleDetector()`: Detect from browser `navigator.language`
    - `createStaticLocaleDetector()`: Fixed locale (SSR/SSG)
    - Custom detector support for cookies, URL params, user preferences
  - **Framework Formatters**: Automatic locale-aware formatting
    - `formatters.date()`: Respects cultural date formatting (MM/DD vs DD/MM)
    - `formatters.number()`: Locale-specific number formatting (1,234.56 vs 1 234,56)
    - `formatters.currency()`: Currency formatting with proper symbols
    - `formatters.relativeTime()`: Relative time formatting ("2 hours ago")
  - **Namespace Loading**: Progressive loading for performance
    - Load namespaces on-demand
    - `isNamespaceLoaded()`, `isNamespaceLoading()` helpers
    - `loadNamespace` action for dynamic loading
  - **35 Tests**: Comprehensive test coverage for all i18n features

#### 🖥️ Server-Side Rendering (SSR)
- **Complete SSR System**: Production-ready server-side rendering
  - `renderToHTML()`: Render Svelte components to HTML string with state serialization
  - `hydrateStore()`: Client-side store hydration from serialized state
  - **Fastify Integration**: Production server setup with security hardening
    - `fastifyRateLimit`: Rate limiting plugin (100 requests/minute default)
    - `fastifySecurityHeaders`: Security headers plugin (CSP, X-Frame-Options, etc.)
  - **Per-Request Stores**: Isolated state for each SSR request (no memory leaks)
  - **State Serialization**: Automatic JSON serialization/deserialization
  - **Client Hydration**: Seamless client-side hydration without flicker
  - **Multi-Locale SSR**: Detect locale from query params, Accept-Language header, or cookies
  - **Data Loading**: `getServerProps` for pre-loading data on server
  - **URL Routing Integration**: Parse URL and initialize destination state on server
  - **Security Best Practices**: CSRF protection, rate limiting, security headers

#### 📦 Static Site Generation (SSG)
- **Complete SSG System**: Build-time static page generation
  - `generateStaticSite()`: Generate entire site with multiple routes
  - `generateStaticPage()`: Generate single static page
  - **Dynamic Routes**: Path enumeration for dynamic route generation
    - Support for patterns like `/posts/:id`
    - Enumerate all paths at build time
    - `getServerProps` for loading data per path
  - **Multi-Locale SSG**: Generate static pages for all locales
    - Example: 33 pages generated (11 routes × 3 languages)
    - URL structure: `/`, `/fr/`, `/es/` for different locales
  - **Asset Copying**: Copy CSS and JS to static output directory
  - **Build Callbacks**: `onPageGenerated` callback for progress tracking
  - **Hybrid SSG + SSR**: Combine static pages with server-side fallback
  - **22 Tests**: Comprehensive SSG test coverage

#### 📚 Documentation
- **i18n Guide** (`docs/i18n/internationalization.md`): 400+ lines
  - Quick start and setup instructions
  - Translation file structure with ICU MessageFormat
  - Using translations and formatters in components
  - Locale switching and namespace loading
  - SSR/SSG integration patterns
  - Best practices and troubleshooting
  - Complete API reference
- **SSR/SSG Guide** (`docs/ssr/server-rendering.md`): 600+ lines
  - When to use SSR vs SSG (decision matrix)
  - Complete SSR setup with Fastify
  - Complete SSG setup with build scripts
  - Multi-locale static generation
  - Security hardening guide
  - Performance optimization strategies
  - Troubleshooting common issues
- **Updated Docs**: README.md and quick-reference.md updated with i18n and SSR/SSG sections

#### 🎯 Examples
- **SSR Server Example** (`examples/ssr-server/`): Complete multi-locale blog
  - Fastify server with SSR
  - SSG build script (generates 33 static pages)
  - Multi-locale support (English, French, Spanish)
  - Language switcher with progressive enhancement
  - Client-side hydration
  - Translation files for all locales
  - Framework formatters in use

#### 🧪 Testing
- **80+ New Tests**: Bringing total to 500+ tests
  - 35 i18n tests: Translation, ICU parsing, formatters, locale detection
  - 22 SSG tests: Static generation, multi-locale, dynamic routes
  - 23 SSR tests: Rendering, hydration, security

### Changed
- **Package Keywords**: Added `i18n`, `internationalization`, `ssr`, `server-rendering`, `ssg`, `static-generation` keywords for better npm discoverability

### Migration Guide

#### i18n Integration
Add i18n to your store state and dependencies:

```typescript
import {
  createInitialI18nState,
  BundledTranslationLoader,
  createBrowserLocaleDetector,
  browserDOM
} from '@composable-svelte/core/i18n';

// Initialize i18n state
const i18nState = createInitialI18nState('en', ['en', 'fr'], 'en');

// Create translation loader
const translationLoader = new BundledTranslationLoader({
  bundles: {
    en: { common: enTranslations },
    fr: { common: frTranslations }
  }
});

// Add to store
const store = createStore({
  initialState: {
    // ... your state
    i18n: i18nState
  },
  reducer: appReducer,
  dependencies: {
    // ... your dependencies
    translationLoader,
    localeDetector: createBrowserLocaleDetector(['en', 'fr']),
    storage: localStorage,
    dom: browserDOM
  }
});
```

Use translations in components:

```svelte
<script lang="ts">
  import { createTranslator, createFormatters } from '@composable-svelte/core/i18n';

  const t = $derived(createTranslator($store.i18n, 'common'));
  const formatters = $derived(createFormatters($store.i18n));
</script>

<h1>{t('welcome')}</h1>
<p>{t('greeting', { name: 'Alice' })}</p>
<time>{formatters.date(new Date())}</time>
```

#### SSR Setup
For server-side rendering, use Fastify with `renderToHTML`:

```typescript
import { createStore } from '@composable-svelte/core';
import { renderToHTML } from '@composable-svelte/core/ssr';

fastify.get('*', async (request, reply) => {
  const store = createStore({
    initialState,
    reducer: appReducer,
    dependencies: {} // Server dependencies
  });

  const html = renderToHTML(App, { store });
  reply.type('text/html').send(html);
});
```

Client hydration:

```typescript
import { hydrateStore } from '@composable-svelte/core/ssr';

const stateElement = document.getElementById('__COMPOSABLE_SVELTE_STATE__');
const store = hydrateStore(stateElement.textContent, {
  reducer: appReducer,
  dependencies: clientDependencies
});
```

#### SSG Setup
For static site generation, create a build script:

```typescript
import { generateStaticSite } from '@composable-svelte/core/ssr';

await generateStaticSite(App, {
  routes: [
    { path: '/' },
    { path: '/about' },
    {
      path: '/posts/:id',
      paths: ['/posts/1', '/posts/2'],
      getServerProps: async (path) => {
        const id = parseInt(path.split('/').pop()!);
        return { post: await loadPost(id) };
      }
    }
  ],
  outDir: './static',
  baseURL: 'https://example.com'
}, {
  reducer: appReducer,
  dependencies: {}
});
```

## [0.3.0] - 2025-11-05

### Added
- **Phase 16**: WebGL Overlay System for shader-based image effects
- **Graphics Package Integration**: Full WebGL/WebGPU rendering capabilities
  > **Correction, added later.** WebGPU was never implemented. Both branches of
  > the adapter's detection built the same WebGL `Engine`, so the label was the
  > only thing that varied, and `activeRenderer` reports `'webgl'`. The entry
  > above is left as published rather than rewritten — this note is how it is
  > corrected.

## [0.2.6] - 2025-11-04

### Changed
- **Developer Experience**: Simplified `scopeToElement()` API from 5 type parameters to just 1
  - Before: `scopeToElement<ParentState, ParentAction, ChildState, ChildAction, ID>(...)`
  - After: `scopeToElement<ChildAction>(...)`
  - 80% reduction in boilerplate while maintaining full type safety
  - All other types (ParentState, ChildState, ID) are automatically inferred from arguments
  - No breaking changes to runtime behavior or type safety guarantees

### Added
- **Testing**: 3 comprehensive tests for `scopeToElement` API covering:
  - Scoped store creation with simplified type signature
  - Type-safe action dispatching
  - Null handling for non-existent items

## [0.2.5] - 2025-11-04

### Fixed
- **Exports**: Added missing `integrate`, `scopeTo`, and `ScopedStore` exports to main package index

## [0.2.4] - 2025-11-04

### Added
- **Collection Management** - Comprehensive primitives for managing dynamic arrays of child features
  - `forEach()`: Core combinator for routing actions to collection items by ID
  - `forEachElement()`: Simplified wrapper for standard pattern with action type
  - `elementAction()`: Helper for creating type-safe element actions
  - `integrate().forEach()`: Fluent DSL integration for collection management
  - `integrate().reduce()`: Method to set core reducer when using forEach first
  - `scopeToElement()`: View-layer helper for creating scoped stores for collection items
  - **Boilerplate Reduction**: Reduces collection management code by ~92% (50+ lines → 4 lines)
  - **Type Safety**: Full generic type inference without manual annotations
  - **Immutable Updates**: Automatic shallow copy array updates
  - **Effect Mapping**: Automatic wrapping of child effects with parent actions
  - **Test Coverage**: 15 comprehensive tests covering all functionality

### Changed
- `integrate()` now accepts optional core reducer parameter for better composition
- `IntegrationBuilder.coreReducer` is now optional when using `.reduce()` method

## [0.2.1] - 2025-11-04

### Fixed
- **Build**: Rebuilt package with all exports properly included in dist/ folder. Version 0.2.0 was published before the build step, resulting in missing exports in the npm package. This patch ensures all ~130 exports are available.

## [0.2.0] - 2025-11-04

### Added

#### Complete Public API Surface
- **API Module Exports** (~30 exports): Complete HTTP/REST client API now publicly available
  - Core types: `APIClient`, `APIResponse`, `RequestConfig`, `RetryConfig`, `CacheConfig`, `APIRequest`, `HTTPMethod`, `SafeHTTPMethod`
  - Interceptors: `RequestInterceptor`, `ResponseInterceptor`, `ErrorInterceptor`, `Interceptor`, `APIClientConfig`
  - Type utilities: `InferResponse`
  - Client factory: `createAPIClient()`
  - Request builder: `Request` class
  - Testing utilities: `createMockAPI()`, `createSpyAPI()` with types `MockResponse`, `MockRoutes`, `SpyAPIClient`, `RecordedCall`
  - Endpoint helpers: `createRESTEndpoints()`, `createPaginatedEndpoints()`, `createSearchEndpoints()`, `createFullEndpoints()` with types
  - Error classes: `APIError`, `NetworkError`, `TimeoutError`, `ValidationError`, `ValidationErrorField`
  - Effect integration: `api()`, `apiFireAndForget()`, `apiAll()`

- **WebSocket Module Exports** (~24 exports): Complete real-time communication API now publicly available
  - Core types: `WebSocketClient`, `WebSocketConfig`, `WebSocketMessage`, `WebSocketEvent`
  - Event types: `WebSocketConnectedEvent`, `WebSocketDisconnectedEvent`, `WebSocketErrorEvent`, `WebSocketReconnectingEvent`, `WebSocketReconnectedEvent`
  - State types: `ConnectionState`, `ConnectionStatus`, `ConnectionStats`
  - Config types: `ReconnectConfig`, `HeartbeatConfig`
  - Callback types: `MessageSerializer`, `MessageListener`, `EventListener`
  - Error handling: `WebSocketError`, `WS_ERROR_CODES`, `JSONSerializer`
  - Production client: `createLiveWebSocket()`
  - Testing utilities: `createMockWebSocket()`, `createSpyWebSocket()` with types `MockWebSocketClient`, `SpyWebSocketClient`, `RecordedConnection`, `RecordedDisconnection`
  - Advanced features: `createHeartbeat()`, `createMessageQueue()`, `createQueuedWebSocket()`, `createChannelRouter()`, `createChannelWebSocket()` with types

- **UI Component Exports** (~60 components): Complete component library now publicly available
  - Layout & Structure: `Box`, `Panel`, `Separator`, `AspectRatio`
  - Typography: `Text`, `Heading`
  - Interactive Elements: `Button`, `IconButton`, `ButtonGroup`, `Kbd`
  - Form Controls: `Input`, `Textarea`, `Checkbox`, `Radio`, `RadioGroup`, `Switch`, `Slider`, `Select`, `Combobox`, `Label`, `FileUpload`
  - Display Components: `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Badge`, `Avatar`, `Tooltip`, `TooltipPrimitive`
  - Feedback Components: `Progress`, `Spinner`, `Skeleton`, `Empty`
  - Banner & Alerts: `Banner`, `BannerTitle`, `BannerDescription`
  - Navigation UI: `Breadcrumb`, `BreadcrumbList`, `BreadcrumbItem`, `BreadcrumbLink`, `BreadcrumbPage`, `BreadcrumbSeparator`, `BreadcrumbEllipsis`, `Pagination`, `DropdownMenu`, `TreeView`
  - Interactive Containers: `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`, `Collapsible`, `CollapsibleTrigger`, `CollapsibleContent`
  - Advanced Components: `Calendar`, `Carousel`

- **Navigation Component Exports** (~15 components): Complete navigation system now publicly available
  - High-level components: `Modal`, `Sheet`, `Drawer`, `Sidebar`, `Popover`, `Alert`, `Tabs`, `NavigationStack`, `AnimatedNavigationStack`, `DestinationRouter`
  - Primitive components: `ModalPrimitive`, `SheetPrimitive`, `DrawerPrimitive`, `SidebarPrimitive`, `PopoverPrimitive`, `AlertPrimitive`, `TabsPrimitive`, `NavigationStackPrimitive`

### Changed
- **Organized Exports**: Created `components-exports.ts` for better code organization (separating 75+ component exports from main index)

### Fixed
- **Duplicate Export**: Removed duplicate `Unsubscribe` type export (now only exported from dependencies module, shared by WebSocket module)

### Migration Guide
All previously internal modules are now part of the public API. If you were importing from internal paths (not recommended), update to the main package export:

```typescript
// Before (v0.1.0 - internal imports, not officially supported)
import { createMockAPI } from '@composable-svelte/core/dist/api/mock-client.js';
import { Skeleton } from '@composable-svelte/core/dist/components/ui/skeleton/Skeleton.svelte';

// After (v0.2.0 - official public API)
import { createMockAPI, Skeleton } from '@composable-svelte/core';
```

## [0.1.0] - 2025-01-11

### Added

#### Core Architecture
- **Store System**: Reactive Svelte 5 store with `createStore()` API
- **Reducer Pattern**: Pure functions with `(state, action, deps) => [newState, effect]` signature
- **Effect System**: 11 effect types (none, run, fireAndForget, batch, cancellable, debounced, throttled, afterDelay, subscription, cancel, animated, transition, map)
- **Composition**: `scope()`, `scopeAction()`, `combineReducers()` for reducer composition
- **TestStore**: Exhaustive action testing with send/receive pattern

#### Navigation
- **Tree-Based Navigation**: State-driven navigation with optional/enum patterns
- **Navigation Operators**: `ifLet()`, `createDestinationReducer()`, `scopeToDestination()`
- **Navigation Components**: Modal, Sheet, Drawer, Alert, Sidebar, NavigationStack, Popover
- **Dismiss Dependency**: Child self-dismissal with `createDismissDependency()`
- **DestinationRouter**: Declarative routing component

#### DSL & Type Safety
- **createDestination()**: Generate destination reducers with template literal types
- **Matcher API**: Type-safe action matching with case paths (`Destination.is()`, `Destination.extract()`, `Destination.matchCase()`, `Destination.match()`, `Destination.on()`)
- **Fluent API**: `integrate()` builder for reducer composition, `scopeTo()` for store scoping

#### Animation
- **PresentationState**: Animation lifecycle management (idle → presenting → presented → dismissing)
- **Motion One Integration**: Spring physics and gesture-driven animations
- **Animation Helpers**: `animateModal()`, `animateSheet()`, `animateDrawer()`, `animateAlert()`, `animateAccordion()`
- **Timeout Fallbacks**: Graceful recovery from animation failures

#### Backend Integration
- **API Client**: HTTP/REST client with interceptors, retry logic, caching, deduplication
- **WebSocket**: Real-time communication with reconnection, channels, heartbeat, message queuing
- **Dependencies**: Clock (System/Mock), Storage (localStorage/sessionStorage/cookies)
- **Testing Utilities**: Mock/Spy clients for API and WebSocket

#### URL Routing
- **Browser History Sync**: Two-way synchronization with browser navigation
- **Pattern Matching**: URL pattern matching with path-to-regexp
- **Query Parameters**: Type-safe query parameter handling with Zod schemas
- **Deep Linking**: Support for app → URL and URL → app navigation

#### Component Library
- **73+ UI Components**: Full shadcn-svelte integration
- **Form Components**: Input, Textarea, Checkbox, Radio, Switch, Select, Combobox, File Upload
- **Data Components**: DataTable, Pagination, Calendar, Tree View, Carousel
- **Overlay Components**: Tooltip, Dropdown Menu, Command Palette, Toast
- **Layout Components**: Accordion, Collapsible, Tabs, Breadcrumb, Separator

#### Documentation
- **21 Documentation Files**: 20,000+ lines of professional-grade documentation
- **Getting Started Guide**: First app tutorial with counter example
- **Core Concepts**: Store, reducers, effects, composition, testing
- **Navigation Guides**: Tree-based navigation, components, dismiss patterns
- **DSL Reference**: Destinations, matchers, scope helpers
- **API Reference**: Complete API documentation with 500+ code examples
- **Troubleshooting**: Common issues and solutions
- **Migration Guide**: From Redux, TCA, MobX, Svelte stores

### Testing
- **1504 Tests**: Comprehensive test coverage across all modules
- **68 Test Files**: Unit, integration, and browser tests
- **100% Pass Rate**: All tests passing (5 skipped for browser-specific features)

### Infrastructure
- **TypeScript**: Strict mode with exactOptionalPropertyTypes
- **Build System**: Vite + tsc for optimized builds
- **Testing**: Vitest + Playwright for unit and browser tests
- **CI/CD**: GitHub Actions workflow for automated testing and building

### Fixed
- All 66+ TypeScript build errors (animation types, API cache, exactOptionalPropertyTypes)
- All 8 failing tests (accordion, sidebar, modal, alert, dropdown-menu)

[0.2.0]: https://github.com/jbelolo/composable-svelte/releases/tag/v0.2.0
[0.1.0]: https://github.com/jbelolo/composable-svelte/releases/tag/v0.1.0
