# Animation Guidelines for Composable Svelte

This document is the **authority** on when and how Composable Svelte animates.
If the code and this document disagree, one of them is a defect — and
`packages/core/tests/repo/animation-policy.test.ts` decides which, because it
enforces the rules below mechanically.

## Core principle

Animation is **state-driven**. What is on screen is a function of state, and a
transition between two screens is a function of a state *change*. An animation
the store cannot see is an animation nothing can coordinate, sequence, cancel or
test.

CSS transitions are the main way that principle gets broken, because they are
invisible to everything: they live entirely in the style layer, they fire
whenever a class changes for any reason, and no test can observe one mid-flight
without sampling computed styles and hoping.

## The one rule

**Classify by what *drives* the change, never by what the change looks like.**

Read the element. Ask what makes it change. There are exactly four answers.

| What drives the change | Mechanism | Example |
|---|---|---|
| A CSS pseudo-class — `:hover`, `:focus`, `:focus-visible`, `:active` | **No transition.** Keep the end-state style; the change is instant. | `hover:bg-accent` on a button |
| Component or reducer state | **Motion One**, in a guarded `$effect` | a chevron rotating with `isExpanded` |
| Nothing — it repeats forever | **CSS `@keyframes`**, and it must carry `infinite` | a spinner, a skeleton shimmer |
| A continuous external numeric source | **Register entry required** (see below) | an audio level, a playback position |

Two consequences worth stating explicitly, because both were being violated:

- **A one-shot `@keyframes` is a lifecycle animation, not an allowed keyframe
  animation.** `animation: slideIn 0.2s ease-out` on mount is exactly the thing
  Motion One exists for. The `infinite` keyword is the test, not the `@keyframes`
  syntax.
- **A single declaration may not serve two masters.** If one
  `transition-colors` covers both a `hover:` class and a state-driven class,
  split it: the hover half goes, the state half becomes Motion One. Twelve sites
  in this repo were of this shape, which is why they survived so long — each
  looked half-legitimate.

### Why pseudo-class transitions go

This is the rule most likely to feel excessive, so here is the actual reasoning
rather than an appeal to consistency:

- They cannot be coordinated. A chevron fading on a 200ms CSS transition next to
  a dropdown springing in on Motion One is one gesture rendered on two unrelated
  timelines — visibly so, because a spring and an `ease-out` do not have the same
  shape.
- They fire on class changes that have nothing to do with hovering. Any reactive
  class on the same element re-triggers them.
- They are the seam through which state-driven animation erodes. Every violation
  found in this codebase began as a defensible one-off.

Instant hover feedback is not a downgrade. It is what the platform does by
default, and it is what a component whose *real* animations are choreographed
should do.

## Choosing a state-driven mechanism

Once you know the change is state-driven, there is exactly one question:

> **Must the element still be on screen after the state says it is gone?**

- **No — the element stays mounted throughout.** Use a **plain boolean plus
  Motion One in a guarded `$effect`.** This is the sanctioned pattern for
  rotations, colour changes, height changes on always-rendered content, and
  anything else where nothing unmounts. Reference: `AccordionContent.svelte:51-74`.

- **Yes — it must animate *out* before it disappears.** Use **`PresentationState`**
  (`idle → presenting → presented → dismissing → idle`). This is the *only*
  reason to reach for it: a lifecycle is what keeps an element mounted through
  `dismissing` so an exit animation has something to animate. Reference:
  `SheetPrimitive.svelte:131-178`.

`PresentationState` is not a badge of quality and it is not required for every
animation. Adding it where nothing unmounts is cost with no benefit — and where
state is keyed per item (`TreeView`'s `Set<string>`), a per-item
`Map<string, PresentationState>` reintroduces the non-serialisable-state problem
documented at `TreeView.svelte:78-85`. Don't.

A third shape exists and ships: `Combobox`'s bespoke
`idle | opening | open | closing` status. It predates the lifecycle and works.
Treat it as acceptable where it already is, not as a template for new code.

## Invariants for the guarded `$effect`

Every one of these is load-bearing, and every one of them was learned by
shipping the bug:

1. **The guard is a plain `let`, never `$state`.** The effect reads and writes
   it, so a reactive guard re-triggers the effect it lives in —
   `effect_update_depth_exceeded`. Eleven guards had this defect in 0.6.0.
2. **Key the guard on the `(status, content)` pair**, not on "have I animated
   anything yet". Those questions diverge when a component mounts already
   `presented` — SSR hydration of a page rendered with an overlay open, or any
   persistent sidebar — and the difference is a permanent deadlock: the exit
   branch is refused, `dismissalCompleted` never fires, and the reducer's own
   `status !== 'presented'` guard then rejects every later dismiss. Seven files
   had this.
3. **`idle` resets the guard** and returns early.
4. **Fire completion callbacks inside `queueMicrotask`**, so the dispatch lands
   outside effect context.
5. **The element must still contain its content while it animates.** An `{#if}`
   *inside* the element you `bind:this` empties it during the DOM update, before
   the effect runs — so a collapse that measures `scrollHeight` measures zero and
   animates 0→0. Keep the content mounted for the duration, or measure before
   the change.

## Pattern A — atomic components

An atomic component **does not animate its own interaction or value states**:
no transition on hover, focus, press, checked, disabled, or on the value it
displays.

Badge · Button · Card · Checkbox · Input · Label · Radio · Separator · Slider ·
Textarea

**`Switch` is deliberately not on that list.** Its thumb travels between two
positions — that is a genuine state transition with a start, an end and a
distance, not decoration on a hover — and it has been driven by Motion One and
the `button` spring preset since before this document was rewritten. The
original list named it anyway, which made the list wrong rather than the code.
Its *track colour* still changes instantly, because that part is decoration.

**A composed child that is legitimately animated is not a violation.** A
`<Spinner>` rendered inside a Button in its loading state is a spinner — an
infinite keyframe animation, allowed on its own terms — and the Button is still
Pattern A. What the Button may not do is animate *itself*.

This carve-out is stated because the previous version of this document
contradicted itself here: it declared Pattern A "ZERO animation" while listing
`Progress` as an approved exception *as a Pattern A component*, and Button has
always shipped a spinner.

## Exception Register

Nothing is an exception unless it is in this table.
`animation-policy.test.ts` reads the same list, so an entry here is the only
thing that makes a site legal.

To add one, a site must meet **all** of:
- driven by a continuous external numeric source, or genuinely
  performance-critical at 60fps;
- no mount/unmount lifecycle involved;
- animating a cheap property (`transform`, `opacity`, or a single dimension);
- a per-frame Motion One call would be measurably worse, not merely more code.

| Site | Property | Rationale |
|---|---|---|
| `ui/carousel/Carousel.svelte` — slide track | `transform` | GPU `translateX` at 60fps; `currentIndex` is reducer-owned, so the animation *is* state-driven — only the tween is CSS. Applies to the slide track only, not the arrows or dots. |
| `voice-input/components/AudioVisualizer.svelte` — bars and pulse | `height`, `transform` | Live microphone level, sampled faster than a spring could settle. The 0.1s ease smooths *between analyser samples*; removing it makes the meter step. Reduced-motion is already honoured in-file. |
| `audio-player/FullAudioPlayer.svelte` — progress fill / buffered | `width` | Playback position from `timeupdate`. Buffered uses 0.3s deliberately: the source is chunky and the smoothing is doing real work. |
| `audio-player/MinimalAudioPlayer.svelte` — progress fill | `width` | As above. |
| `voice-input/components/ConversationModePanel.svelte` — silence countdown | `width` | VAD countdown; a linear tween is the countdown's semantics. |
| `ui/progress/Progress.svelte` — bar fill | `width` | Determinate progress from a `value` prop. Narrowed from `transition-all` to the one property it may animate. |

Deliberately **not** granted: `Slider.svelte`'s fill. It is on the same
"driven by a number" footing, but the number comes from the user's own drag — so
the transition makes the fill *lag the thumb the user is holding*. A transition
that delays feedback on a direct manipulation is a defect, not an exception.

## Available animation helpers

`packages/core/src/lib/animation/animate.ts`, re-exported from
`@composable-svelte/core/animation`. Every one is `async`, returns
`Promise<void>`, and swallows its own errors after `console.error`.

| Helper | Notes |
|---|---|
| `animateModalIn` / `animateModalOut` | |
| `animateBackdropIn` / `animateBackdropOut` | no `springConfig` |
| `animateSheetIn` / `animateSheetOut` | takes `side` |
| `animateDrawerIn` / `animateDrawerOut` | takes `side` |
| `animateAlertIn` / `animateAlertOut` | |
| `animateTooltipIn` / `animateTooltipOut` | `Out` has no `springConfig` |
| `animateToastIn` / `animateToastOut` | |
| `animateDropdownIn` / `animateDropdownOut` | no `springConfig` |
| `animatePopoverIn` / `animatePopoverOut` | takes `positionTransform` |
| `animateSidebarExpand` / `animateSidebarCollapse` | takes `targetWidth`, `side` |
| `animateStackPushIn` / `animateStackPushOut` / `animateStackPopIn` / `animateStackPopOut` | |
| `animateAccordionExpand` / `animateAccordionCollapse` | duration-based, not springs; measure `scrollHeight` — see invariant 5 |
| `animateChevron` | `(element, expanded, options?)` — accepts `SVGElement`, since a chevron is usually an inline `<svg>` |

Springs come from `springPresets` in `spring-config.ts` — `modal`, `sheet`,
`drawer`, `alert`, `toast`, `dropdown`, `popover`, `tooltip`, `button`,
`listItem`, `collapse` — each `{ visualDuration, bounce }`, with
`visualDuration` in **seconds**. Merge overrides with `mergeSpringConfig(preset,
override)`; it is per-field `??`, so an explicit `0` wins.

### Adding a helper

Put it in `animate.ts`, follow the existing shape exactly: take an optional
`springConfig`, resolve it against a preset, `await motionAnimate(...).finished`,
and `catch` by setting the end-state inline styles so a failed animation still
leaves the element correct. Export it from `animation/index.ts`.

## Testing an animation

The reducer-level test proves the state machine, not the animation. Three grades
exist in this repo, in ascending order of what they actually prove:

1. **State machine.** `waitForState(store, s => s.presentation.status ===
   'presented')`. Proves the lifecycle advances. Passes against a component that
   ignores the state entirely.
2. **Mid-flight computed style.** Sample `getComputedStyle` a few frames in and
   assert the property is *between* its endpoints. Proves something animated.
3. **Paired discriminator.** Assert both what should move and what should not —
   `sidebar-animation.test.ts:76-91` asserts `margin-left` travels *while width
   stays constant*, which fails both against no animation and against the CSS
   transition it replaced. This is the grade to aim for.

Assert the **transition**, not the state. A test that only checks "the spinner is
there" passes against a spinner that never leaves, which is the worse bug.

### `document.getAnimations()` is a trap

Measured twice in this repo, wrong both times:

- It returns **0** for a Motion One spring on a non-composited property
  (`margin`, `width`, `height`, colour) — Motion drives those with its own JS
  ticker, not the Web Animations API.
- It returns a **stale non-zero** elsewhere, because a finished entry animation
  is still attached.

Use it only for opacity/transform-only animations, and only relative to a
control run. Otherwise sample computed styles.

## Enforcement

`packages/core/tests/repo/animation-policy.test.ts` scans
`packages/*/src/**/*.svelte` for `transition-*` classes, raw `transition:`
declarations, and `animation:` / `@keyframes`, and fails anything that is not
either an `infinite` keyframe or a Register entry. It runs under
`vitest.node.config.ts` because it reads from disk.

If it fails, the fix is the code or a Register entry with a written rationale —
not a wider pattern in the test.

## Migration recipes

**Pseudo-class transition** → delete the `transition-*` class or `transition:`
declaration. Keep the `:hover` / `:focus` / `:active` styles exactly as they are.

**State-driven, element stays mounted** → give the element a ref (`bind:this`,
or a `use:` action when it is inside a repeated snippet, as `TreeView` requires),
add a guarded `$effect`, call the helper. No reducer change.

**State-driven, element must animate out** → add `presentation:
PresentationState<T>` to the state, a `presentation` action carrying
`PresentationEvent`, and set `dismissing` where the state currently clears. Keep
the boolean flipping immediately if it backs `aria-expanded` — the markup keeps
the node mounted on `presentation.status`, not on the boolean. Reference:
`dropdown-menu.reducer.ts`.

**One-shot `@keyframes`** → treat as state-driven and pick one of the two above.
Delete the `@keyframes` block.

---

*Rewritten after a full audit found 135 CSS animation sites in shipped source
that the previous version of this document could not adjudicate.*
