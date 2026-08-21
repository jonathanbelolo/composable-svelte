# Animation Guidelines for Composable Svelte

This document is the **authority** on when and how Composable Svelte animates.

It **supersedes** `specs/frontend/animation-integration-spec.md` §Overview, §1.3,
§5.1–5.2 and §9.1(2), and the transition examples in
`specs/frontend/navigation-spec.md`. Those describe a Svelte-built-in-transitions
design that was never shipped — there is not one `transition:` / `in:` / `out:` /
`animate:` directive anywhere in `packages/*/src`. Read the specs for design
rationale, not for animation instructions.

**What is mechanically enforced, and what is not.** `animation-policy.test.ts`
enforces exactly one rule family: the ban on CSS-authored animation (§The one
rule). Everything else here — the invariants, Pattern A, the choice of
mechanism, reduced motion — is reviewed by people, not by the suite. A green
suite is not compliance. Live proof that the gap is real: `Toast.svelte:85` is an
unguarded `$effect` calling `animateToastIn`, a plain violation of invariant 1,
and the test reports it clean.

## Core principle

Animation is **state-driven**. What is on screen is a function of state, and a
transition between two screens is a function of a state *change*.

CSS transitions break that, and in this codebase they break it twice over. They
are invisible to the store, so nothing can sequence or cancel them — and they are
invisible to the *tests*, because Tailwind is not compiled in the browser test
environment. Measured: a class-driven `rotate-180` has no CSS behind it and
`getComputedStyle(el).transform` reads `none` at every point of the change. A
utility-class animation is not merely uncoordinated; it is unobservable to every
test in this repo. Motion One writes inline styles, so it is testable without a
build step. That, more than taste, is why this document exists.

## The one rule

**Classify by what *drives* the change, never by what the change looks like.**

Read the element. Ask what makes it change.

| What drives the change | Mechanism |
|---|---|
| A CSS pseudo-class — `:hover`, `:focus`, `:focus-visible`, `:active` | **No transition.** Keep the end-state style; the change is instant. |
| Component or reducer state | **Motion One**, in a guarded `$effect` |
| Nothing — it repeats forever | **CSS `@keyframes`**, and it must carry `infinite` |
| A continuous external numeric source | **Register entry required** |
| A browser-native animation not written as `transition`/`animation` — `scroll-behavior: smooth`, `startViewTransition`, Svelte's `transition:` / `in:` / `out:` / `animate:` | **Prohibited**, for the same reason as CSS transitions: the store cannot see it. Use Motion One, or an explicit scroll helper. |

This table covers the mechanisms present in this repo. It is not a proof that no
sixth exists — if you find one, add a row rather than forcing it into an
ill-fitting one.

Three consequences worth stating, because all three were being violated:

- **A one-shot `@keyframes` is a lifecycle animation.** `animation: slideIn 0.2s
  ease-out` on mount is exactly what Motion One is for. The `infinite` keyword is
  the test, not the `@keyframes` syntax.
- **A single declaration may not serve two masters.** One `transition-colors`
  covering both a `hover:` class and a state-driven class must be split: the
  hover half goes, the state half becomes Motion One.
- **`scroll-behavior: smooth` is an animation.** Four sites in `chat/` set
  `scrollTop = scrollHeight` on a new message and let the browser animate it —
  a state-driven lifecycle animation in CSS, unguarded for reduced motion.

### Why pseudo-class transitions go

- They cannot be coordinated. A chevron on a 200ms `ease-out` beside a dropdown
  on a spring is one gesture on two timelines, and the two curves do not match.
- They fire on class changes that have nothing to do with hovering.
- They are unobservable under test, per the Core Principle above.

Instant hover feedback is not a downgrade; it is the platform default.

## Reduced motion — mandatory

**Every animation this library runs must be skippable, and skipping it must not
change what the store believes.**

This is not optional polish. The library animates by default, and today **not one
of the 27 helpers in `animate.ts` consults the user's preference** — modal,
sheet, drawer, alert, tooltip, toast, dropdown, popover, sidebar, stack,
accordion and chevron all run at full amplitude regardless. The only honouring
that exists is five CSS `@media (prefers-reduced-motion: reduce)` blocks in
`media/`, and two of those guard one-shot `@keyframes` that the rule above orders
converted.

So the migration has a trap in it, and it must be stated: **converting a CSS
animation that sits under a reduced-motion block, without carrying the preference
across, removes accessibility support.** Do not do that.

The shape to follow already exists, in `ImageGallery.svelte:197`: read the
preference once, put it in the store, and let the component branch on it.
`ImageLightbox.svelte:174` then skips the animation **and dispatches the
completion event immediately**.

That last part is the whole game. A skipped animation that does not dispatch its
completion is invariant 2's deadlock with extra steps — the element never leaves
`presenting`, and every later dismiss is refused. **Reduced motion must
short-circuit the animation, never the state machine.**

## Choosing a mechanism for a state-driven animation

Two questions, in order:

1. **Must anything in the store react to this animation finishing?** Sequencing a
   second animation after it, cancelling it, guarding an action on it, or
   asserting on it in a reducer test.
2. **Must the element outlive the state that renders it** — i.e. animate out
   before unmounting?

**Yes to either → the lifecycle belongs in the store.** Then choose:

- `PresentationState` (`idle → presenting → presented → dismissing → idle`) for
  anything overlay-shaped. Reference: `SheetPrimitive.svelte:131-178`.
- A domain flag plus a store-owned duration, where a full lifecycle is
  overweight. Reference: `Toast` — `toast.reducer.ts:115` sets `dismissing: true`
  and defers removal with `Effect.afterDelay(state.exitDurationMs, …)`. This is a
  legitimate shape, not a lesser one; the duration lives in state where a test
  can reach it.

**No to both → a plain boolean plus Motion One in a guarded `$effect`.**
Reference: `Switch.svelte:60-86`.

### Be honest about what the boolean pattern gives up

It is **fire-and-forget**. It dispatches nothing, so the store never learns the
animation finished. It is *observable* (Motion writes inline styles a test can
sample) but not *coordinatable* — a parent cannot sequence against it, and rapid
toggling starts overlapping runs with no cancellation.

That is an acceptable trade for decoration — a chevron, a thumb. It is the wrong
trade the moment question 1 is a yes. `Carousel` is the cautionary example: its
track never unmounts, so the naive reading says "boolean", but its reducer owns
`isTransitioning` and needs `transitionCompleted` — and the component currently
hand-rolls that with a bare `setTimeout` running against a duration it also feeds
to CSS. Two clocks, no cancellation, no fallback. That is what question 1 exists
to catch.

## Completion, and what happens when it never arrives

A store-owned lifecycle is a promise that a completion event will be dispatched.
If that promise is broken the machine sticks, because the reducer guards
(`status !== 'presented'` and friends) then refuse every later transition.

**Motion One's `.finished` can break it, and in a specific way worth knowing.**
Verified in `motion@12.23.24`: `motion-dom`'s `WithPromise` builds
`new Promise((resolve) => …)` and captures **no `reject`**. `notifyFinished()` is
called only from `finish()`; `cancel()` and `stop()` go straight to `teardown()`.
And `MotionValue.start()` stops the previous animation before starting a new one.

So an **interrupted animation's promise never settles** — not resolved, not
rejected, pending for the life of the page. Two consequences:

- The `try/catch` in every helper in `animate.ts` is **dead code for that path**.
  There is nothing to catch. Do not reach for `.catch()` as your recovery.
- A `.then()` that dispatches completion will simply never run.

**Why the components here survive that**, and it is structural rather than luck:
the `(status, content)` guard starts a new animation only when the status has
actually changed, so the *live* promise always matches the *live* status. A hung
promise is therefore always a superseded one — and the reducer's own status guard
would have rejected its dispatch anyway. `tests/animation-interruption.test.ts`
pins both halves.

**When you do need a timeout fallback:** when that correspondence breaks. Two
effects animating the same element, an element re-keyed mid-flight, or any design
where the live status can have no live promise. Then dispatch a timeout event at
2–3× the expected duration and guard the completion cases so whichever arrives
second returns the identical state.

Do **not** add a fallback where the correspondence holds. A recovery path with no
reachable trigger is unreachable code, and this codebase is being cleaned of
exactly that.

## Invariants for the guarded `$effect`

Every one was learned by shipping the bug.

1. **The guard is a plain `let`, never `$state`.** The effect reads and writes it,
   so a reactive guard re-triggers the effect it lives in —
   `effect_update_depth_exceeded`. Eleven guards had this defect in 0.6.0.
2. **Key the guard on the `(status, content)` pair**, not on "have I animated
   anything yet". Those diverge when a component mounts already `presented` — SSR
   hydration of a page rendered with an overlay open, or any persistent sidebar —
   and the difference is a permanent deadlock. Seven files had this.
3. **`idle` resets the guard** and returns early.
4. **Fire completion callbacks inside `queueMicrotask`**, so the dispatch lands
   outside effect context.
5. **The element must still contain its content while it animates.** An `{#if}`
   *inside* the element you `bind:this` empties it during the DOM update, before
   the effect runs — so a collapse measuring `scrollHeight` measures zero and
   animates 0→0. Keep the content mounted for the duration, or measure first.
6. **One property, one author.** If Motion One animates a property, nothing else
   may write it — no utility class, no reactive `style={…}` attribute. Svelte
   rewrites the whole `style` attribute on any re-render, so a second author does
   not merely duplicate, it clobbers mid-flight. The Switch thumb had three
   authors for its transform and looked fine, which is not an ownership rule.
7. **On first run, place — do not animate.** Seed the guard from the current
   value and set the end state directly. A switch that mounts already on has not
   just been switched on. This applies to booleans exactly as much as to
   `(status, content)`; three components in this repo hand-rolled three
   incompatible versions of it before it was written down.

### The guard is not state

Invariant 1 gives a mechanical reason; here is the principled one. The guard is a
record of **what this component last told the DOM**, not a fact about the domain.
The DOM is an external mutable resource, and this codebase already has that
boundary: `CodeEditor.svelte:31` holds its CodeMirror `EditorView` in a plain
`let`, outside the store, for the same reason.

The cost, which must be disclosed: rendering becomes a function of state *and
mount order*, not of state alone. Two components bound to the same store, mounted
either side of a change, can render it differently. That is acceptable for
decoration and unacceptable for anything the store sequences against — which is
question 1 again.

## Pattern A — atomic components

An atomic component **does not animate its own interaction or value states**: no
transition on hover, focus, press, checked, disabled, or on the value it
displays.

Badge · Button · Card · Checkbox · Input · Label · Radio · Separator · Slider ·
Textarea

**`Switch` is deliberately not on that list**, and `CLAUDE.md` defers to this
list rather than repeating it. A switch thumb travelling between two positions is
a genuine state transition — start, end, distance — so it belongs in Motion One.
Its *track colour* changes instantly, because that part is decoration. (Its
animation was already Motion One before this rewrite, but it was also carrying a
CSS transition, a reactive inline `style` and an unguarded effect, so the code
was not blameless either.)

**A composed child may animate on its own terms — but it must itself satisfy the
rule above.** A loading spinner inside a Button is an `infinite` keyframe
animation, legal in its own right, and does not make the Button a violation. The
test is the child's own legitimacy, not the fact of nesting; otherwise every
component escapes Pattern A by extracting a wrapper.

## Exception Register

An entry grants a **named set of properties** on a named file. Nothing outside
this table and outside the temporary backlog (below) may animate in CSS.

To be admitted, a site must be:
- driven by a continuous external numeric source — audio level, playback
  position, a countdown — that changes faster than a spring could settle; **and**
- free of any mount/unmount lifecycle; **and**
- animating one named property, not `all`.

There is deliberately no "it would be slower otherwise" limb. It cannot be
applied without a benchmark nobody runs, and it is refuted by the mechanics
anyway: Motion One drives `transform` and `opacity` through the Web Animations
API, so for exactly the properties people reach for, there is no per-frame JS
call to be slower than.

| Site | Property | Rationale |
|---|---|---|
| `voice-input/components/AudioVisualizer.svelte` — bars, pulse | `height`, `transform` | Live microphone level, sampled faster than a spring settles. The 0.1s ease smooths *between* analyser samples; without it the meter steps. |
| `audio-player/FullAudioPlayer.svelte` — progress, buffered | `width` | Playback position from `timeupdate`; buffered uses 0.3s because the source is chunky. |
| `audio-player/MinimalAudioPlayer.svelte` — progress | `width` | As above. |
| `voice-input/components/ConversationModePanel.svelte` — silence countdown | `width` | VAD countdown; a linear tween is the countdown's semantics. |

**Not exceptions — grandfathered, pending conversion.** `Carousel`'s slide track
and `Progress`'s bar are state-driven (`currentIndex`, `value`), which is row 2 of
the one rule, not row 4. They are listed in the backlog rather than here, because
calling them principled exceptions would be the same wishful accounting this
document was rewritten to remove.

**Refused, despite fitting the shape:** `Slider`'s fill. The number comes from the
user's own drag, so a transition makes the fill lag the thumb they are holding. A
transition that delays feedback on direct manipulation is a defect.

### That refusal generalises: feedback is instant

Anything that tracks the user's **current input position** is feedback, not a
transition, and must not animate at all — not in CSS and not in Motion One. A
slider fill following a drag, a list highlight following ArrowDown, the current
page, the active tab, a carousel's position dot.

The test is *is the user still moving?* If yes, the change is a readout of where
they are, and delaying it is the defect. If no — they acted and are now waiting
for the result — it is a transition and may animate.

This resolves a genuine conflict between the rule table above and this Register.
A list highlight is reducer state, so the table alone says Motion One; but it is
also direct manipulation, so this section says instant. Instant wins, and the
practical reason is decisive: `background-color` is not composited, so Motion One
drives it on a JS ticker and the highlight visibly trails a held arrow key. The
guidance would have made the library worse.

Note how small the visible change usually is. `Combobox` and `Select` dispatch
`highlightChanged` on `onmouseenter`, so their hover class and their highlight
class paint the same colour on the same element — with the transition gone, the
two are indistinguishable.

## The backlog

`animation-policy.test.ts` also carries a `BACKLOG` of files not yet converted.
**The Register grants properties; the backlog grants time.** A file in the
backlog is not adjudicated — it is merely not yet failing the build.

It is a ratchet in both directions: a violation in a file *not* listed fails, and
a listed file that has become *clean* also fails, so an excuse cannot outlive its
defect. It shrinks to empty and is then deleted.

## Available animation helpers

`packages/core/src/lib/animation/animate.ts`, re-exported from
`@composable-svelte/core/animation`. All 27 `animate*` helpers are `async`, return
`Promise<void>`, and swallow their own errors after `console.error`. Most also
restore the end state inline on failure — `animateBackdropIn`/`Out` and
`animateTooltipOut` do not, which is a gap, not a pattern to copy.

The module additionally re-exports Motion One's own `animate` (`animate.ts:15`).
That one is **not** async, returns `AnimationPlaybackControls`, and swallows
nothing — it is what `Switch.svelte` uses for a one-property tween.

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
| `animateSidebarExpand(el, targetWidth, …)` / `animateSidebarCollapse(el, currentWidth, …)` | note the differing second parameter |
| `animateStackPushIn` / `animateStackPushOut` / `animateStackPopIn` / `animateStackPopOut` | |
| `animateAccordionExpand` / `animateAccordionCollapse` | duration-based, not springs; both measure `scrollHeight` — see invariant 5 |
| `animateChevron(el, expanded, options?)` | accepts `SVGElement`; `options.degrees` defaults to 180 (a tree twisty wants 90) |

Springs come from `springPresets` in `spring-config.ts` — `modal`, `sheet`,
`drawer`, `alert`, `toast`, `dropdown`, `popover`, `tooltip`, `button`,
`listItem`, `collapse` — each `{ visualDuration, bounce }`, `visualDuration` in
**seconds**. Merge with `mergeSpringConfig(preset, override)`; per-field `??`, so
an explicit `0` wins.

### Adding a helper

Follow the existing shape: optional `springConfig`, resolve against a preset,
`await motionAnimate(...).finished`, and `catch` by setting the end state inline
so a failed animation still leaves the element correct. Export from
`animation/index.ts`.

## Testing an animation

Three grades, ascending in what they prove:

1. **State machine** — `waitForState(store, s => s.presentation.status ===
   'presented')`. Proves the lifecycle advances; passes against a component that
   ignores it entirely.
2. **Mid-flight computed style** — sample `getComputedStyle` a few frames in and
   assert the property sits *between* its endpoints.
3. **Paired discriminator** — assert what should move *and* what should not.
   `sidebar-animation.test.ts:76-91` asserts `margin-left` travels while width
   stays constant, which fails both against no animation and against the CSS
   transition it replaced. Aim here.

Assert the **transition**, not the state: a test that only checks "the spinner is
there" passes against a spinner that never leaves.

Remember that Tailwind is not compiled under test, so grade 2 is impossible for
anything a utility class drives — another reason those conversions are not
optional.

### `document.getAnimations()` is a trap

Measured twice in this repo, wrong both times: it returns **0** for a Motion One
spring on a non-composited property (`margin`, `width`, `height`, colour), which
Motion drives with its own JS ticker; and a **stale non-zero** elsewhere, because
a finished entry animation is still attached. Use it only for opacity/transform
animations, and only against a control run.

## Migration recipes

**Pseudo-class transition** → delete the `transition-*` class or `transition:`
declaration. Keep the `:hover` / `:focus` / `:active` styles.

**State-driven, element stays mounted, nothing sequences on it** → give the
element a ref (`bind:this`, or a `use:` action inside a repeated snippet), add a
guarded `$effect` honouring invariants 1, 6 and 7, call the helper.

**State-driven, something sequences on it, or it must animate out** → put the
lifecycle in the store: `PresentationState`, or a domain flag with a store-owned
duration. Keep any boolean that backs `aria-expanded` flipping immediately; gate
the markup on the lifecycle instead. Reference: `dropdown-menu.reducer.ts`, whose
event type is `DropdownMenuPresentationEvent` — deliberately its own type, not
the canonical `PresentationEvent`.

**One-shot `@keyframes`** → one of the two above; delete the `@keyframes` block.
**If it sits under a `prefers-reduced-motion` block, carry the preference across
first.**

---

*Rewritten after an audit found 135 CSS animation sites the previous version
could not adjudicate, then revised again after a hostile review found this one
inert in places — the Register excused by the backlog, reduced motion missing,
and the sanctioned pattern overselling what it delivers.*
