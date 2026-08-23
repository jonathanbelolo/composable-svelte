# Changelog

All notable changes to `@composable-svelte/core` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
