# Clean application authoring and managed motion

**Consolidated architecture and remediation specification · 18 September 2026 · Baseline: core 0.12.2**

This specification proposes the next architectural layer of Composable Svelte.
It is a design for implementation, not a description of APIs already released.
All new API names and code sketches below are provisional. The ownership rules,
behavioral contracts, and qualification criteria are the substance of the proposal.
This is the authoritative design document for this work. It incorporates the
original design review, accepted Fable findings, and coordinator-verified Gemini
source findings. Requirements, acceptance gates, and implementation closure live here; the
[design review](application-authoring-and-motion-review.md) and review reports
retain evidence and history. §19 records Fable's design dispositions; §20–23
connect the combined evidence to tracked work. “Accepted” means incorporated into
the specification; it does not mean implemented or fixed. The source review is
complete, while the proposed APIs and defect corrections remain unqualified.

The objective is that application code primarily expresses **content, presentation,
and business rules**. Common infrastructure should be supplied and owned by the
framework. Applications must still be able to write custom animation, from an
individual element to an entire page, inside a clearly defined integration boundary.

Reading paths:

- **Architecture:** [ownership](#3-the-application-authoring-contract),
  [application layer](#4-the-supported-application-layer),
  [presentation lifecycle](#7-presentation-navigation-and-focus-lifecycle).
- **Motion:** [defaults and recipes](#5-motion-as-a-framework-capability),
  [custom extension contract](#6-the-managed-custom-animation-extension).
- **Delivery:** [generic reference demo](#13-generic-reference-demo-and-migration-examples),
  [qualification](#14-qualification-and-acceptance-evidence),
  [implementation sequence](#15-implementation-sequence).
- **Fix and close:** [combined evidence](#20-combined-evidence-and-remediation-scope),
  [confirmed defect register](#21-confirmed-defect-register),
  [architecture delivery checklist](#22-architecture-delivery-checklist),
  [candidate triage](#23-candidate-triage-and-review-dispositions).

## 1. Decisions this proposal makes

1. Preserve the existing reducer, effect, dependency-injection, composition, and
   TestStore architecture. Add a supported application-authoring layer over it.
2. Make store ownership, routing attachment, presentation lifecycle, focus, and
   motion resource management framework responsibilities in that supported path.
3. Support **macro motion**—pages, layouts, modules, overlays, shared elements—and
   **micro motion**—individual values, controls, icons, feedback, and interaction.
   Neither is a special exemption or restricted to branding.
4. Provide three authoring levels: built-in behavior, declarative motion recipes,
   and managed custom drivers. They use the same lifecycle and testing contracts.
5. Keep logical feature state authoritative. Animation never decides whether a
   business operation succeeded or whether an accepted navigation occurred.
6. Keep coordinated presentation lifecycle observable and testable, but have the
   framework generate its bookkeeping. Do not require every feature to declare
   completion actions, revision counters, watchdogs, or cleanup code.
7. Give custom code scoped targets, resources, and scheduling. A folder named
   `adapters` or `motion` does not grant unrestricted orchestration privileges.
8. Qualify the design with an explicitly fictional, generic reference demo and
   independent macro/micro exercises before expanding it across the component catalog.
9. Test architectural compliance separately from functional correctness, and test
   fresh-agent consumption separately from both.
10. Implement managed ordering and ownership inside the existing store executor,
    with matching TestStore semantics. Prove those mechanisms before settling the
    facade syntax; wrapping public dispatch cannot supply the required guarantees.

**Success means removing reusable infrastructure responsibilities from the
application, including machinery currently hidden in application helpers.**

## 2. Evidence and current limitations

The following observations are grounded in the current library implementation and
public documentation. The consumer patterns below illustrate the resulting
integration burden. The proposed APIs and reference demo have not been implemented
or experimentally validated by this design exercise.

The completed Gemini pass covers 1,327 pinned code files. Its 316 candidate
entries include overlapping, unverified and improvement-only claims. Independent
probes reproduced 20 distinct defects at documented boundaries. These findings
now inform the contracts in §9, the regression matrix in §14, and the linked
register in §21. A separate Fable/coordinator reproduction of stale dismissal is
also tracked there. Source-review coverage is not implementation qualification.

| Existing capability | Evidence | Limitation to address |
| --- | --- | --- |
| Owned effects and teardown | [store implementation](../../packages/core/src/lib/store.svelte.ts), [effect helpers](../../packages/core/src/lib/effect.ts) | Good foundation; application components still manually connect several independent browser and presentation lifetimes. |
| Internal dispatch and test execution | [store implementation](../../packages/core/src/lib/store.svelte.ts), [TestStore](../../packages/core/src/lib/test/test-store.ts) | Executors receive internal dispatch, which can reenter a batch; TestStore implements a separate executor. Managed scheduling and ownership need changes in both paths. |
| Child composition and cancellation | [integrate](../../packages/core/src/lib/navigation/integrate.ts), [ifLetPresentation](../../packages/core/src/lib/navigation/if-let.ts), [scoped stores](../../packages/core/src/lib/navigation/scope.ts) | Preserve these foundations. Same-case replacement, effect-ID isolation, stale dispatch handles, and work emitted during removal require additional managed contracts. |
| Dismiss dependencies | [dismiss helpers](../../packages/core/src/lib/navigation/dismiss-dependency.ts), [effect types](../../packages/core/src/lib/types.ts) | An asynchronous cleanup captures parent dispatch without instance identity. Current `FireAndForget` effects have no group ownership or cancellation signal. |
| Presentation lifecycle types | [navigation types](../../packages/core/src/lib/navigation/types.ts) | Consumers manually repeat status transitions and completion wiring. Existing documentation describes retaining destination state until exit completion. |
| Modal, sheet, drawer, and other primitives | [navigation components](../../packages/core/src/lib/navigation-components/index.ts), [ModalPrimitive](../../packages/core/src/lib/navigation-components/primitives/ModalPrimitive.svelte) | They already own useful portal, focus, and rendering behavior, but expose caller-managed lifecycle callbacks and lack a general custom-motion contract. |
| Destination-to-view assembly | [DestinationRouter](../../packages/core/src/lib/navigation-components/DestinationRouter.svelte) | Useful starting point; current route configuration uses broad component/prop types, and does not assemble a complete managed presentation lifecycle. |
| Animation helpers, preferences, and scrolling | [animation exports](../../packages/core/src/lib/animation/index.ts) | Helpers are lower-level operations. Resource ownership, interruption policy, and reduced-motion handling are not uniformly centralized. |
| Animation guidance and tests | [current policy](../../guides/ANIMATION-GUIDELINES.md), [interruption tests](../../packages/core/tests/animation-interruption.test.ts) | The policy itself distinguishes human-reviewed invariants from its narrower mechanical checks. It prohibits some mechanisms, including pseudo-class transitions, without providing a general managed interaction replacement. |
| URL integration | [URL effect](../../packages/core/src/lib/routing/sync-effect.ts), [history adapter](../../packages/core/src/lib/routing/browser-history.ts) | Effect construction reads `window.location`; traversal suppression uses a 50 ms window and patches global history methods. |
| Public consumer guidance | [consumer guide](../../packages/core/docs/consumer.md), [animation guide](../../packages/core/docs/animation/animated-navigation.md) | Installation and individual APIs are covered; a single supported application assembly contract is missing. The animation guide actively teaches manual lifecycle management. |

The unsupported assembly work can take several forms in a consumer application:

- A shell component subscribes to state, compares revisions, schedules focus,
  connects history, and coordinates resize, scroll, and preference listeners.
- A motion helper combines visual choreography with snapshotting, temporary DOM
  layers, style restoration, cancellation, generation tracking, and completion timers.
- A routing adapter inspects an effect's leaf or alters history metadata to work
  around the published helper's behavior.
- A feature reducer mixes product decisions with motion revisions and repeated
  presentation lifecycle transitions.
- Consumer checks establish package provenance and isolation without checking
  who owns orchestration.

Such implementations can still use real composition, injected effects, and
cleanup. Some of these patterns follow current framework documentation. Fixing
the consumer contract requires changing the framework and its guidance together.

## 3. The application-authoring contract

| Responsibility | Application authors supply | Framework supplies and owns |
| --- | --- | --- |
| Feature state | Domain projections, drafts, selected destinations, validation and operation status | Store lifetime, dispatch execution, subscriptions, effect scheduling |
| Decisions | Pure reducers and explicit actions; acceptance or rejection of user requests | Composition, action lifting, scoped access, cancellation boundaries |
| External work | Typed ports, configuration, and result/error interpretation | Effect lifetime, replacement/cancellation, late-result gating |
| Routing | Route data, codecs, navigation policy, page mapping | Browser attachment, history writes/traversal, origin tracking, cleanup |
| Presentation | Which feature is presented, semantics, close policy, content, styling | Mount/exit retention, interaction eligibility, portal/layer lifetime, focus, scroll locks |
| Common motion | Optional presets, tokens, target identities, state-to-visual mappings | Execution, interruption, settlement, reduced motion, resource release |
| Custom motion | Geometry or rendering algorithms and explicit target/property needs | Scoped execution context, owned resources, deadlines, cancellation, fallback |
| Accessibility | Meaningful labels, document structure, content-specific choices | Reliable mechanics for supported primitives; testable focus and modality defaults |
| Integration | Backend protocol implementation and configuration | Managed lifetime boundaries; no invented backend authority |

Ordinary views may derive values, render markup, bind framework actions, and
dispatch feature actions. Form values, drafts, selections, expanded/collapsed
intent, loading state, navigation, and presentation intent remain in feature
stores, even when only one component reads them. Calling these values “local UI
state” does not move them outside the architecture.

Local mutable values are limited to rendering resources and disposable
interpolation/measurement caches. Managed interaction feedback can keep
framework-owned hover/press playback state as described in §4.2; it cannot become
the authoritative selected, checked, expanded, or submitted state of a feature.
`$effect`, `onMount`, or a Svelte action is not intrinsically a violation. The
question is which responsibility and state it owns.

Feature code must not construct presentation subscriptions, focus races, history
listeners, generic animation cleanup registries, or infrastructure timeouts.
Business time remains legitimate: an expiring offer or a search debounce is an
explicit business/effect decision, not a presentation timeout.

Rendering an editor, chart, canvas, or media engine may require imperative code.
Such integrations use the managed resource boundary and remain distinguishable
from feature reducers and ordinary views.

## 4. The supported application layer

### 4.1 A small assembly surface

Introduce an opt-in `@composable-svelte/core/application` entry point. Its first
responsibilities are ownership and assembly, not a new business execution model.
Use existing composition and routing types where possible.

Proposed roles:

- `defineApplication`: an inert, typed definition containing the feature reducer,
  initial-state factory, and selected capabilities. Importing it performs no I/O.
- `useApplication`: creates one owner during Svelte component initialization,
  accepts injected dependencies and initial data, and destroys that owner on
  teardown. It creates isolated instances for SSR.
- `ApplicationHost`: establishes capability context synchronously during component
  initialization, including the owner-scoped target registry. The registry accepts
  registrations before browser services attach; attachment reconciles existing
  registrations and later additions. Measurement, playback, and document listeners
  attach only after mounting. Context and registry availability cannot depend on
  whether a descendant's action runs before the host's mount callback. Server
  instances create no document coordinator or DOM resources.
- Managed route and presentation outlets: render the declared views with typed
  scoped stores and the framework's lifecycle handling.

Creation, attachment, and destruction must each have exactly one owner. Mounting
two hosts against the same owner is a diagnostic, not two copies of its services.
Advanced non-Svelte ownership can expose explicit `attach`/`destroy`; generated
applications use the component-owned path.

Startup actions run once per intended feature lifetime after browser attachment,
unless server-loaded initial data declares startup already satisfied. Rendering
or remounting an outlet must not repeat startup. Server preloading remains an
explicit request-scoped operation; skipped SSR effects are not implicitly replayed.

**Illustrative target API, not executable 0.12.2 code:**

```ts
const demoApplication = defineApplication({
  initialState,
  reducer: demoReducer,
  start: { type: 'load' },
  routing: routeBinding({
    read: state => state.route,
    request: route => ({ type: 'navigate', route }),
    receive: route => ({ type: 'routeReceived', route }),
    codec: demoRoutes,
    views: demoPages,
    motion: motion.page(),
    focus: 'pageHeading'
  }),
  presentations: {
    navigator: optionalPresentation('navigator', {
      view: Navigator,
      semantics: 'dialog',
      motion: navigatorTransition,
      initialFocus: 'navigatorInput',
      returnFocus: 'navigatorLauncher'
    }),
    dialog: destinationPresentation('dialog', dialogViews)
  }
});
```

Here `demoReducer` already contains the application's child reducer composition.
The presentation declarations bind rendering and lifecycle ownership to those
features; they do not run a second copy of each child reducer. Managed composition
helpers must provide the identity and close-request behavior specified in §7.
If a convenience helper assembles both reducer and view bindings, its output must
be explicit and must reject a second registration of the same logical slot.

Composition and rendering must share a typed slot identity. A typed token or
schema-derived key can provide that linkage; two unrelated strings cannot be
assumed to name the same managed feature. Literal misspellings, incompatible
child actions, and missing required bindings fail type qualification. Dynamic
definitions are validated before attachment, with no silent inactive slot.
Headless or deliberately unrendered capabilities must be explicitly declared.

Bindings use typed child action conventions, or explicit lenses/action mappings
for applications with different state shapes. There must be no field name guessing
beyond a declared convention and no `any` or casts required in consumer code.
Non-optional feature composition still uses ordinary reducer composition.
The nested helper calls above are sketches, not proof of contextual inference.
Stage 0 must compile their callbacks without implicit `any`; use a typed builder
or staged definition if inference requires it. Preserve the contract rather than
forcing this exact syntax.

```svelte
<script lang="ts">
  const app = useApplication(demoApplication, { dependencies });
</script>

<ApplicationHost {app}>
  <DemoChrome store={app.store} />
  <RouteOutlet route={app.routing} />
  <PresentationOutlet presentation={app.presentations.navigator} />
  <PresentationOutlet presentation={app.presentations.dialog} />
</ApplicationHost>
```

The outlets use definitions with exhaustive, typed view mappings. Layout placement,
snippets, and headless markup remain available; the framework must not require a
single app-shell layout or dictate a particular product's visual design. Applications should
not need every capability merely to animate an icon. The motion bindings must
also work under a small component-local owner.

The API spike must compare this shape with extending existing `integrate` and
`DestinationRouter`. Reuse is preferred where it preserves clarity; a second,
competing destination DSL is not a deliverable.

The application facade is optional assembly convenience. Pure lifecycle reducer
combinators and managed view bindings must remain independently usable with an
existing `createStore` and feature tree. Neither a single animation nor an embedded
feature may require a global application definition. Follow the existing
[abstraction principles](../../plans/phase-9/DESIGN-PRINCIPLES.md): prove the smaller
composable pieces first, then keep the facade only if it removes meaningful work.

### 4.2 State ownership without application bookkeeping

Use a composed root internally, implemented through the existing store/effect
system with the managed executor mode defined below. Conceptually it contains:

```ts
type ApplicationState<S> = {
  feature: S;
  lifecycle: FrameworkLifecycleState;
};

type ApplicationAction<A> =
  | { type: 'feature'; action: A }
  | { type: 'framework'; event: FrameworkLifecycleEvent };
```

The public feature-store facade exposes `S` and accepts `A`; it does not make
every application reducer handle the internal union. Composed internal actions
remain visible through a separate diagnostic/test interface. Application and
framework action namespaces cannot collide.

The root reducer runs the feature decision and pure capability transitions in a
defined order, returning effects through the extended existing executor. Internal events
update lifecycle state; a configured semantic outcome may map to one feature
action. No DOM reads, resource creation, wall-clock reads, or random IDs occur
inside this reducer. IDs derive from owner/slot identity and deterministic
counters; clocks and browser work are injected execution dependencies.

The order is part of the contract: validate the event's owner/instance, route a
feature action through its composed reducers exactly once, derive lifecycle
changes from the accepted before/after state, and return execution descriptions.
An internal lifecycle event cannot mutate `feature` directly. If it is mapped to
a semantic feature action, enqueue that action through the ordinary dispatch path
after the current action completes. Do not recursively dispatch during reduction
or subscriber notification.

**Managed dispatch is a store-level, opt-in FIFO mode implemented inside the
executor.** External dispatch, executor-supplied dispatch, subscriptions,
supported dependency callbacks, and lifecycle outcomes all enter that queue.
A wrapper around `app.store.dispatch` is insufficient: current executors retain
the store's internal function. Each managed turn:

1. Dequeues an action and revalidates any originating owner/instance token.
   Invalidated work is dropped before feature reduction.
2. Runs the composed pure reduction once, deriving new feature/lifecycle state
   and effect descriptions with their originating ownership.
3. Commits state, invalidates removed/replaced owners, and requests cancellation
   of their resources before subscriber notification or new effect execution.
   It does not await asynchronous cleanup. Cleanup failures are observed and
   cannot prevent other disposers from running.
4. Notifies state subscribers of changed state, then action subscribers, using
   that turn's committed state. It then visits effects in declared batch order.
   Eligibility is checked before each executor starts; removed-owner descriptions
   are discarded. Any resulting dispatch is enqueued.
5. Drains the next queued action only after the current turn's notifications and
   synchronous effect starts finish. A turn never waits for asynchronous I/O.

The outermost dispatch drains the synchronous queue before returning; a dispatch
made during a turn enqueues and returns without reducing recursively. Verify this
notification order, including a subscriber that dispatches again. Effects and callbacks retain origin tokens
through queueing, so becoming stale while queued is also covered.

This mode applies to the whole store, not individual subtrees. Legacy stores
retain their default dispatch behavior. A legacy reducer or adapter used in a
managed root must be qualified for the root's ordering; there is no hidden
per-subtree synchronous lane. Select the mode at store construction, not by
attaching an outlet or toggling a live store. A consumer can configure it through
`createStore` and use the pure combinators/bindings without the application facade.

Acceptance, rejection, defaults, and feature-state updates all belong to pure
composed reducers. Hosts, drivers, and view configuration cannot mutate the store
or privately clear a destination after a callback. Presentation policies that
read feature state must become testable reducer configuration, not hidden view
logic. Per-instance dependency factories are invoked at the owner boundary;
rendering adapters receive capabilities through injection, not a global locator.

**Three kinds of data must remain separate:**

1. Feature state: the application's authoritative UI/domain decisions.
2. Framework lifecycle state: coordinated presentation/run identities, statuses,
   and outcomes. Serializable and deterministically testable, but not normally
   persisted as application business data.
3. Runtime resources: elements, animation handles, abort controllers, listeners,
   observers, paint snapshots, and pending promises. Kept outside reducer state
   in owner-scoped registries. Recreated rather than hydrated.

Element-only decoration can use a framework-owned local controller composed from
the same pure reducer/effect primitives, with an explicit input-action stream and
TestStore-compatible tests. It is not permission to author an imperative state
machine in a feature view. Semantic inputs such as `expanded` come from the feature
store. Transient hover/press inputs may come from a managed browser binding when
they affect only rendering. Playback frames are execution data, not reducer
decisions, and do not require root-history actions.

Cross-feature visual sequencing belongs in composed framework lifecycle state.
Use an outcome-to-feature-action mapping only when an application has a semantic
reason to observe that outcome, not to make it implement the framework's next
animation phase. Do not hide a coordinating decision in a local callback. A
motion harness supplements pure tests with rendering and resource checks; it
does not replace reducer tests.

The feature-store facade must retain reactive state access and the subscription
protocol, using the documented managed dispatch order. Emit feature-state
notifications only when that projection changes, and expose internal history
separately. Do not advertise the full `Store` interface if a read/dispatch facade
intentionally omits lifecycle methods.
The composition API must accept the documented facade type without consumer casts.
Adapt `scopeTo`, `DestinationRouter`, and their internal consumers to the smallest
state/dispatch/subscription interface they actually need. Reuse the existing
`ScopableStore` concept where suitable. Do not expose `destroy` or fabricated
history merely to satisfy their current full-`Store` parameter types. Actual
resource destruction stays with the owner; diagnostic history is separate and
bounded by default for managed roots.

### 4.3 Resource ownership

An application owner has nested feature/presentation/element owners. A run owns
its playback handles, temporary styles, clones, listeners, observers, and timers.
Destroying an owner invalidates its tokens first, stops its resources, and then
releases them. Managed dispatch and resource operations check those tokens, so
late callbacks cannot affect a replacement instance through the supported APIs.
Raw element/engine access has the cooperative limits stated in §6.2.

Reuse existing effect groups for feature work. Establish a small common resource
scope for browser integrations; do not implement another general effect scheduler.
All public registration APIs return resources already enrolled in that scope.
Registration after disposal fails predictably or immediately disposes the resource.
One throwing disposer must not prevent subsequent cleanup.

Scoped IDs include instance identity. Two dialogs or two page roots using the
same local name must not cancel each other. This includes all named cancellable,
debounced, throttled, and subscription effects, their `cancel(id)` operations, and
group cancellation—not just motion IDs. Root/global ownership must be an explicit
declaration; a child-local name must never accidentally target sibling work.

Existing composition adds cancellation groups but does not namespace every
effect ID by instance. The managed path therefore needs a qualified effect-scoping
adapter, not an assumption that reusing current groups already provides isolation.
Its mapping must commute with action lifting and work through nested batches.
Use an opaque identity encoding rather than unescaped string concatenation.

Managed root throttle history has an explicit admission limit:
`execution.rootThrottleCapacity`, a finite positive safe integer, defaults to
1024 retained root/unowned channels per runtime. This is a safety policy, not a
measured performance ceiling. Existing channels remain usable at capacity; a new
channel reports `RootThrottleCapacityError` through the execution error pathway
before retaining history or starting work. It never evicts an existing channel.
The reducer turn remains committed and unrelated batch effects continue under
the normal execution-failure contract. Legacy execution is unchanged.

Throttle timing still follows the next invocation's interval. Group cancellation
preserves cooldown history and admission; explicit channel cancellation resets
history and releases admission. Root destruction clears history. Completed
cooldowns are not pending application work, while trailing timers are. Owned
channels remain tied to feature lifetime and are outside this root limit; the
limit bounds unowned entry count, not all live owned entries or identifier bytes.
Do not substitute prior-interval expiry, silent eviction, or consumer cleanup
timers for this contract. Reentrant cleanup must preserve admission accounting
without resurrecting retired history.

**Ownership identifies the originating instance, not the slot's current occupant.**
Managed composition stamps typed ownership from the originating reduction's
deterministic owner context when it creates or lifts an effect. That context must
be available to the pure composition layer; no ambient mutable owner lookup is
permitted. Every action/effect lift preserves the token. The executor compares
it with the post-reduction lifetime table before starting work. It must never
resolve an old slot name to a replacement's current epoch at registration time.
The precise internal metadata representation is a stage-0 design deliverable.

Ownership covers `Run`, cancellable/delayed/debounced/throttled work,
subscriptions, and `FireAndForget`. Cancellation descriptions preserve their
scope through nested batches as well. A parent cancelling a child's local ID
must use an explicit typed ownership capability; an identical root-local string
is not authority to cancel child or sibling work.

`FireAndForget` receives pre-start eligibility checks in the managed path. It
does not gain the ability to abort arbitrary asynchronous JavaScript. Supported
dependencies must use instance-checked dispatch/close capabilities, including
after an `await`; closing over raw parent dispatch defeats that guarantee and
is outside the managed contract. The existing cleanup/dismiss helper cannot be
advertised as instance-safe without this adaptation. Active I/O must cooperate
with its cancellation signal to stop transport or external work. Result gating
and resource release remain mandatory even when it does not cooperate.

The existing `Clock` dependency exposes time/date operations; it is not an owned
timer/frame scheduler. Define the small execution scheduler needed by the resource
scope explicitly, with production and deterministic-test implementations. In
managed mode, store timers and browser-resource timers use the same injected
time authority, with explicit timer and frame phases. Do not introduce unrelated
test clocks or reimplement debounce, delayed effects, and subscriptions in the
host. The store's dispatch, ownership, and scheduling seams are required, additive
work; existing defaults remain unchanged.

### 4.4 Production and test execution must agree

The production store and TestStore currently interpret effects independently.
Managed semantics must be implemented in both before a managed API is qualified.
Prefer extracting shared execution mechanisms within the existing architecture;
do not add a third interpreter to the application host. Stage 0 must either prove
a shared core or document why a bounded seam must remain separate.

In either case, run the same action/effect scenarios through production and test
execution and compare semantic transcripts: reductions, effect starts, delivery
or dropping of actions, cancellation, disposal, and cleanup failures. Test-only
assertion queues, fake time advancement, and UI frames need not be identical.
The contracts for owner eligibility, queued dispatch, ID/group resolution, and
observable outcomes must be identical. Verify the suite with deliberate drift
in one executor; shared code alone is not a parity test.

Include synchronous cancellation during executor setup, cancellation inside
nested batches, asynchronous subscription cleanup rejection, and callbacks
arriving after replacement or destruction. An already-aborted operation must
leave TestStore's pending-work count without waiting for its abandoned promise.
`finish()` must report real unfinished work rather than passing vacuously or
hanging on work that cancellation already ended.

## 5. Motion as a framework capability

### 5.1 Coverage at both scales

| Motion family | Default or declarative support | Customization examples |
| --- | --- | --- |
| Pages and navigation | Enter/exit, crossfade, directional navigation, bounded outgoing visuals | Page-specific geometry, multi-module travel, custom transition rendering |
| Modules and layout | Expand/collapse, keyed insertion/removal/reorder, shared-element transitions | Coordinated sidebar/content movement, custom layout transforms |
| Overlays | Modal, sheet, drawer, popover, alert, toast lifecycles | Launcher-to-panel expansion, custom overlay entrance and exit |
| Element state | Opacity, transform, size, color, numeric interpolation | An icon morph, a chart marker, a nonstandard progress visualization |
| Interaction | Managed hover, focus-visible, press, selection, bounded gesture response | Elastic response, custom drag feedback, unusual visual affordances |
| Continuous feedback | Managed progress/scroll/media-value bindings and decorative loops | A waveform, canvas treatment, or shader uniform driven by a supplied value |

“Default” does not mean everything must move. Built-in components should have a
coherent, restrained policy, including instant changes where appropriate. All
defaults are overridable or disableable through the same public surface.

Semantic feedback is immediate: checked/selected state, focus indication,
validation, and control eligibility reflect the accepted decision without waiting
for motion. A decorative indicator may transition afterward; it cannot postpone
the state change, accessible semantics, or a usable focus indicator.

### 5.2 Level 1: presets and tokens

Common components and outlets own their behavior without caller-provided
completion callbacks. A normal application selects a preset or accepts defaults.
Shared tokens cover durations, easings/springs, amplitude, and reduced-motion
behavior. Proposed public duration fields use **milliseconds**; convert to engine
units at one boundary. Legacy second-based helper signatures remain explicit.

Override order: framework defaults, application theme, component/slot preset,
explicit instance options. Accessibility reduction always applies after those
choices. Application preferences may reduce or disable OS-allowed motion; an
ordinary instance override cannot silently defeat an OS reduce preference.

Use typed options, not unstructured engine-option bags as the primary API.
Do not automatically animate a hydrated component merely because its initial
state is non-default. Initial entrance is an explicit option.

### 5.3 Level 2: declarative recipes

Recipes express targets, visual states, tracks, parallel/sequence relationships,
stagger, shared elements, and interruption policy. They do not express business
work, arbitrary timers, manual cleanup, or store subscriptions.

Provide a small set of composable functions rather than a new scripting language.
Recipes must be usable for one element or a group of registered targets. Dynamic
parameters are pure functions of supplied visual inputs or managed measurements.

**Illustrative element binding:**

```svelte
<MotionElement
  as="span"
  value={store.state.expanded ? 'open' : 'closed'}
  recipe={chevronMotion}
>
  <Chevron />
</MotionElement>
```

`chevronMotion` declares its two stable visual states and transition. The managed
element emits the stable styles during server rendering, then owns retargeting,
reduced motion, and teardown in the browser. An action-only binding cannot supply
server-rendered styles: Svelte actions do not execute during SSR. A headless
binding must expose the same pure stable-style projection for the consumer's
markup; it cannot require an imperative post-mount fix. It is not necessary to
add `chevronAnimationCompleted` to a feature action union.
[Svelte action lifecycle](https://svelte.dev/docs/svelte/use).

The headless contract includes both initial style projection and a managed
update binding. During hydration, the binding adopts the matching initial pose;
during playback, it is the sole writer of leased properties. Subsequent visual
inputs update the binding's stable target rather than an independent reactive
`style:transform` or full `style` attribute that competes with playback. Unleased
properties remain ordinary consumer styling. A naked style projection plus an
uncoordinated animation action does not satisfy the headless contract.

The semantic `expanded` value comes from the feature store. The binding does not
create another authoritative copy. Stable styles must be computable without
DOM measurements; geometry-dependent motion falls back to ordinary final layout
until measurements are available. A custom canvas or other specialized surface
must declare meaningful initial/fallback markup within its supported contract.

**Illustrative coordinated recipe:**

```ts
const navigatorTransition = motion.recipe({
  targets: ['surface', 'thumbnail', 'title', 'content'],
  tracks: [
    motion.shared('surface', { durationMs: 460 }),
    motion.shared('thumbnail', { durationMs: 460 }),
    motion.shared('title', { durationMs: 460, optional: true }),
    motion.stagger('content', { preset: 'fadeRise', afterMs: 260 })
  ],
  interruption: 'replace',
  reduced: 'instant'
});
```

Target registration uses scoped typed handles, illustrated by
`use:motionTarget={targets.title}`. No global `.page-content h1` search is needed.
Repeated targets require stable item keys. A shared target can have a source and
destination in a transition; unqualified duplicate live registrations are errors.
Missing optional targets skip their track. Missing required targets produce a
diagnostic and the declared stable fallback, not a broken route or hidden content.

### 5.4 Composition and property ownership

Macro and micro runs often overlap on the same subtree. Define ownership at the
level of **element plus animated property/channel**, not just element or page.

- A route transition on a surface wrapper can coexist with an icon animation.
- Independent properties on the same target may run together.
- Two writers to the same property require explicit composition or replacement.
  The default is a deterministic diagnostic and safe replacement within one
  channel, not timing-dependent last-writer behavior.
- Transform channels need one compositor or separate wrapper elements; layout
  translation, hover scale, and custom rotation cannot each overwrite `transform`.
- Recipe priority and channel names are declared data, not arbitrary CSS z-index
  or animation ordering tricks.
- A run releases only its own property leases. Its cleanup must never restore a
  stale style over a newer run's value or over a legitimate Svelte update.

Stable appearance is a pure projection of the latest accepted visual input.
Temporary playback overlays that projection. On settlement, release the overlay
and expose the latest stable value; do not restore the original mount-time style.
Replacement transfers property ownership before obsolete cleanup runs. If an
engine must commit styles, its adapter must preserve this same ordering.

Suppression of competing stable-style writes is part of the binding, including
Svelte updates during a run. Consumers do not manually freeze styles or restore
them on completion. Test both native animation and inline/ticker execution:
different engine precedence must not change who owns the property's final value.

The renderer provides read phases and write phases, batches geometry work, and
avoids repeating whole-page queries per frame. No layout measurement is required
for a simple opacity or icon-state transition.

### 5.5 Interruption and settlement

Every finite run receives an owner-scoped run ID and reaches one terminal outcome:
`completed`, `superseded`, `skipped`, `failed`, `timedOut`, or `disposed`.
Terminal settlement and cleanup are idempotent. A stale terminal signal cannot
change the current run's state. Cancellation is not reported as successful visual
completion merely to unblock a reducer.

Default policy is replacement toward the newest logical target. Retarget from
the current rendered value when the engine supports it; otherwise use a documented
stable fallback. Sequential choreography within one recipe is supported. Unbounded
queues of obsolete navigation intentions are not.

When a preference change alters an active playback plan, settle that run as
`superseded` with reason `preferenceChanged`, abort it, and replace it with the
new preference-compliant plan for the same accepted logical target. The default
reduced plan applies stable visuals immediately and settles as `skipped` with
reason `reducedMotion`; a qualified reduced recipe can run instead. Partially
played motion is never labelled `skipped`. Re-enabling motion while already
stable does not invent a new entrance. Only the replacement plan may settle the
current presentation phase or produce its configured semantic outcome.

For continuous drivers, lifetime ends with owner disposal or replacement rather
than a nominal animation duration. They cannot hold an overlay or route in a
finite transition phase indefinitely. Finite custom drivers require a declared
maximum duration; their watchdog is framework-owned. Default engine adapters
must also settle on interruption rather than depending on an unresolved promise.

Settlement has a defined effect on presentation state:

| Outcome | Lifecycle result |
| --- | --- |
| `completed` | Release the run; expose the accepted stable state. An accepted entrance is presented; an accepted exit has no outgoing visual. |
| `skipped` | Apply that same stable state without claiming that playback occurred; record the reason, such as reduced motion. |
| `failed`, `timedOut` | Apply the stable fallback, release retention/locks owned by the run, and report the failure. Logical acceptance is unchanged. |
| `superseded` | The newer plan owns the target; an old outcome cannot advance its phase or restore styles/focus. |
| `disposed` | The owner is invalidated and resources are released. No feature outcome is dispatched into that dead owner. |

Run cleanup releases playback resources only. A still-open logical dialog owns
its modality, focus containment, and scroll lock through the presentation owner;
successful or failed entrance motion must not release them. Accepted removal
ends that ownership, subject only to the bounded exit-lock policy in §7.4.

Optional semantic outcome mappings receive the actual terminal reason, not a
synthetic success for all outcomes. They are queued through the action path in
§4.2 and filtered by owner/instance/run identity. They cannot undo a previously
accepted business decision merely because its rendering failed.
An accepted terminal outcome may enqueue its mapping once: releasing that run's
resources must not by itself invalidate the accepted delivery. Replacement or
owner disposal before delivery does invalidate it. Outcomes of superseded runs
remain observable in diagnostics without advancing the replacement's lifecycle.

A finite transition has an end-to-end deadline covering capture, render/target
readiness, execution, and settlement; a driver's maximum duration is only its
playback budget. Missing targets or an unresolved async driver must not leave the
controller waiting forever before a watchdog starts. Cleanup and the stable
fallback cannot depend on that driver's promise resolving. Synchronous blocking
JavaScript remains outside what a watchdog can preempt.

The repository already tests Motion interruption behavior. Do not equate Motion's
promise contract with raw Web Animations: browser `Animation.cancel()` can reject
its current finished promise. Normalize engine-specific results in the adapter.
[Browser contract](https://developer.mozilla.org/en-US/docs/Web/API/Animation/cancel).

## 6. The managed custom-animation extension

### 6.1 One contract for a page, a module, or an element

A custom driver is a bounded rendering algorithm. It may interpolate unusual
geometry, draw into a supplied canvas, run a shader, or orchestrate visual tracks
across named targets. It receives no application store and cannot initiate
navigation, business I/O, focus changes, or its own presentation state machine.

**Illustrative contract:**

```ts
const curvedMotion = defineMotionDriver({
  id: 'curved-motion',
  targets: ['surface', 'marker'],
  sharedTargets: ['marker'],
  properties: { surface: ['opacity', 'transform'], marker: ['transform'] },
  maxDurationMs: 900,
  reduced: 'instant',
  async run(ctx) {
    const marker = ctx.layers.shared('marker');
    const path = calculateCurve({ x: 0, y: 0 }, marker.delta);
    await ctx.parallel([
      ctx.animate(ctx.targets.surface, surfaceFrames(ctx), { durationMs: 460 }),
      ctx.frames({ durationMs: 460 }, progress => {
        const point = pointOnCurve(path, progress);
        ctx.styles.set(marker.visual, { transform: `translate(${point.x}px, ${point.y}px)` });
      })
    ]);
  }
});
```

The same contract can drive a custom checkmark path on one element. Custom does
not imply full-page or brand-specific. The example omits application-specific
math; it is a proposed shape, not a promised implementation.

For this example, `layers.shared` leases a noninteractive source snapshot placed
at its captured origin in an untransformed viewport layer. `delta` is the
destination-minus-source position in that layer's CSS-pixel coordinates, and
`visual` is its managed target handle. The curve returns offsets from the source,
not absolute viewport positions applied as a local CSS transform. The target
schema declares the required source/destination pair; missing or unsupported
geometry uses the declared fallback. This example covers positional travel;
resizing, transformed coordinate spaces, and specialized surfaces require their
own qualified geometry policy.

### 6.2 Context capabilities

| Capability | Contract |
| --- | --- |
| `targets`, `from`, `to` | Registered target handles and immutable measurement/snapshot data; scoped to this run |
| `signal` | Aborted on replacement, disposal, preference-driven replacement, or failure recovery |
| `animate`, `parallel`, `sequence` | Tracked playbacks with normalized settlement; shared time origin |
| `frames` | Managed frame callback, elapsed/progress values, cancellation and continuous/finite modes |
| `styles` | Declared property leases over the stable visual projection; release respects successor ownership |
| `layers` | Inert visual layers and snapshots, created and disposed by the framework |
| `listen`, `observe` | Allowed scoped visual-input listeners/observers, automatically disposed |
| `resources.adopt` | Explicitly register a third-party handle with stop/dispose semantics and normalized settlement |
| `measure` | Batched geometry reads of declared targets, with coordinate-space information |

Native element access is permitted when a custom renderer genuinely needs it,
but only for registered targets and within its declared property/resource scope.
Use an explicit `ctx.element(handle)` escape point so review and checks can find
it. Directly acquired engine handles must be adopted immediately. The framework
must document which cleanup guarantees apply to such handles.

Managed context methods reject or ignore work from settled runs. A raw DOM node
cannot be revoked once handed to third-party code; direct access therefore also
requires a qualified stop/dispose adapter and tests for late writes. Token checks
alone do not guarantee safety for arbitrary retained native references.

A driver must not use global selectors, install independent browser-history or
focus handlers, subscribe to feature stores, or invent completion timers. It must
not retain target handles after settlement. A custom easing/path calculation is
ordinary code; a second application coordinator is outside this contract.

These capabilities are an architectural boundary, **not a JavaScript security
sandbox**. Code in the same realm can import forbidden APIs or block the main
thread. Types, checks, and qualification enforce the supported contract; a timer
cannot preempt a synchronous infinite loop. Do not claim otherwise.

### 6.3 Stable visual fallback

The framework knows the committed logical destination and renders its stable
state independently of driver success. Every driver declares the properties it
temporarily owns and the fallback needed for custom rendering surfaces. A failed
or timed-out run releases those properties and exposes the correct destination.
It cannot leave `opacity: 0`, an invisible click blocker, or a trapped focus owner.

Custom renderer fallback must itself be synchronous and bounded where practical;
if it throws, framework-owned layers/resources are still released. Recovery is
observable as a diagnostic outcome, not a silent claim that the animation passed.

Custom motion receives visual parameters, not unrestricted mutable feature state.
Typed visual markers may coordinate other tracks inside the same recipe. An
optional, declared outcome-to-feature-action mapping uses the pure composition
and queued dispatch contract in §4.2. It receives terminal reasons and is subject
to stale-run filtering; an arbitrary host callback may not mutate feature state.
Such mappings must not become a requirement for ordinary controls.

Diagnostic traces correlate owner, slot/element, run, chosen recipe/driver,
transition cause, and terminal reason. Keep a bounded history in development and
tests; do not log snapshots or full application data by default. A driver that
falls back must be distinguishable from one whose requested motion completed.

### 6.4 Where custom code lives

Ship a starter with a small, explicit structure:

```text
src/
  app/                    # application definition, capabilities, injected ports
  features/               # state, actions, reducers, feature views
  presentation/
    theme.ts              # tokens and default motion policy
    recipes/              # declarative visual composition
    drivers/              # registered custom motion algorithms
  integrations/           # registered external-service/rendering adapters
```

Registration in the application definition binds driver identity, target schema,
capabilities, and qualification tests. Directory placement alone has no meaning.
Unregistered modules cannot obtain a managed context through the supported API.
Do not force trivial custom recipes into many files; the structure is a boundary,
not a quota of boilerplate.

## 7. Presentation, navigation, and focus lifecycle

### 7.1 Logical dismissal and visual exit are different lifetimes

In the new managed path, accepting dismissal removes the logical child and
cancels its feature effects immediately. An outgoing visual may remain briefly
for exit motion, but cannot continue acting as the live child. Navigation likewise
commits independently of whether a transition finishes.

The host owns the outgoing visual separately from the live feature. The default
retention mechanism is a managed, inert snapshot of supported targets. If a
snapshot cannot be captured safely, render the destination and skip that exit
track. Do not promise that freezing a scoped store will freeze an arbitrary
Svelte subtree: its component effects, subscriptions, engine instances, and
mount/unmount hooks may still run independently.

A renderer may retain a separately qualified, render-only projection that takes
immutable state and has no live feature resources. It must not remount the live
feature component to manufacture a snapshot. Retention owns only bounded visual
resources; feature-owned action delivery and registered resource lifetimes end
at logical removal. Stopping already-started external I/O still requires the
cooperation described in §4.3. No obsolete application tree may remain live merely
to animate its appearance.

This is an intentional change from the existing `PresentationState` documentation,
which keeps destination state until dismissal completion. Preserve that legacy
mode for existing consumers; new managed slots must not mix both ownership modes.

Slot instance identity must distinguish close/reopen and same-case replacement.
Use a typed identity selector when the feature has a meaningful key, otherwise a
framework epoch for absent-to-present transitions. Replacing an item with another
item of the same case must use its identity or an explicit replace intention;
object identity and ordinary draft edits must not accidentally restart a slot.
Qualification must cover old results arriving after a same-case replacement.

The same rule applies to collections: element identity includes the collection
owner, item key, and lifetime epoch. Removing and later re-adding key `3` creates
a new lifetime; a retained handle for the old `3` must not reach it. Reordering or
editing a surviving item preserves its lifetime. Explicit same-key replacement
creates a new one. Do not require application IDs never to be reused as a
substitute for instance-safe framework handles.

Every managed child dispatch handle captures that slot instance, including
handles used by event callbacks, asynchronous work, and retained views. Once
invalidated, it cannot dispatch into a newly opened or replacement child. The
current generic scoped store forwards by field/case without this epoch check;
wrapping its state projection alone is insufficient. The managed binding needs
an instance-checked facade as well as effect cancellation.

Cancellation ordering must prevent new work for a child that the same action
removes. Current `integrate` composition can emit child work before its trailing
`CancelGroup`. In the managed path, pure reduction first establishes which
instances survive; execution invalidates removed instances, cancels their owned
work, and discards new effect descriptions owned by them before those descriptions
can start I/O. Parent-owned follow-up effects remain valid. This requires explicit
effect ownership and ordering, not a promise that aborting already-started work
reverses its external effects. Stores remaining in legacy mode retain their
existing execution behavior; entering managed mode is explicit for the whole root.

Managed composition must carry that ownership as typed internal metadata. A view
binding cannot reconstruct it reliably from arbitrary effect IDs or field names.
The API spike must prove how managed and legacy subtrees compose and diagnose
unsupported combinations; declaring a presentation outlet alone cannot silently
upgrade an unqualified subtree's execution semantics.

**Save-and-close needs an explicit surviving owner.** Distinguish these cases:

| Action/effect sequence | Managed contract |
| --- | --- |
| A child emits work while that same reduction removes it, including self-removal | Child-owned new work is discarded before execution. Parent-owned work from the same reduction remains eligible. |
| A child emits work, then a dismiss dependency dispatches a separate action | Work may start before the queued close action is reduced. Synchronous result and close actions follow FIFO order; later child results are dropped after removal. |
| Work must continue after the dialog closes | The child emits an explicit domain intention; a surviving parent accepts it and creates the effect under its own lifetime. Its results return to that parent. |
| Work has already reached an external service | Local cancellation does not roll back that write. Durability and compensation remain part of the service/business contract. |

Prefer parent observation or a typed domain-action delegation for save-and-close.
Do not offer arbitrary effect reparenting as a way to escape cancellation. The
parent must possess the data and own the decision before closing the child.
If completion must precede closure, keep the feature alive and close only after
its accepted success action. A batch is not a promise sequence or a durability
guarantee. Migrate the current dismiss-helper save example and qualify both
synchronous and asynchronous results rather than claiming all are discarded.

### 7.2 Requests, decisions, and defaults

Escape, outside click, and close buttons request dismissal. The feature decides
whether dismissal is accepted—for example, because of unsaved work or a submission
in progress. A managed slot maps those requests into a declared feature action
or a pure close policy before applying the accepted dismissal.
This declared request path is the managed default. An injected convenience
`dismiss` capability must use the same policy and originating-instance checks;
it cannot secretly bypass a veto or dismiss the slot's current occupant.

Do not feed a vetoable request directly into the current `integrate().with()`
automatic `PresentationAction.dismiss` path: that path clears the child before a
parent can treat the action as a request. The new binding must separate request
from acceptance, and only accepted removal invokes cancellation under the managed
identity and ordering rules above. Defaults may accept immediately, but the
override is a first-class business-rule boundary.

Opening/closing/replacing transitions are derived from accepted feature state
changes. The framework generates run identities and routes engine outcomes. No
`motionRevision` field or repeated `presentationCompleted` switch belongs in the
ordinary feature reducer.

### 7.3 The transition transaction

The renderer must coordinate the following phases for managed transitions:

1. Reduce the logical action, derive the pure transition plan, and invalidate/cancel
   removed feature instances before executing their effects or accepting callbacks.
2. Capture outgoing registered geometry/visuals while supported DOM is still
   available, using the renderer's before-update boundary or a valid prior snapshot.
3. Render the committed destination and detach the obsolete live view. Only the
   separately owned, bounded visual projection may remain for exit motion.
4. After the render update, resolve incoming targets and batch measurements.
5. Execute built-in tracks or the selected custom driver under an owned run.
6. Settle, release visual resources, and finish any pending presentation cleanup.

Focus and scroll are host policies coordinated with these phases, not automatic
waits for all decorative tracks to finish. The target is focused once its logical
view is ready; geometry measurement accounts for the chosen scroll behavior.

The Svelte renderer should use its before-update phase and render synchronization
internally. Ordinary `$effect` runs after DOM updates, so replacing the application's
subscription with an arbitrary `$effect` is insufficient for outgoing capture.
Multiple dispatches in one render batch must have a defined policy: commit every
logical decision, but coalesce visual work to the newest renderable target unless
an explicitly supported sequence says otherwise. See the official
[Svelte effect lifecycle](https://svelte.dev/docs/svelte/$effect).

Prove the capture ordering in a small implementation spike, including keyed view
removal. It is not established merely by choosing `$effect.pre`. Missing geometry,
late-loaded content, transformed ancestors, scroll containers, SVG/canvas targets,
or resize during capture must have documented fallback behavior. First release:
HTML targets with declared coordinate spaces; specialized snapshots are driver
capabilities, not assumed support for every browser surface.

Source snapshots are visual only: remove duplicate IDs and interactive behavior,
exclude them from accessibility and hit testing, and avoid copying live controls
as functioning form elements. Snapshot storage is transient and owner-scoped.

Feature cleanup is not delayed to obtain a better snapshot. If cancellation
disposes a rendering engine before capture, use a supported cached visual or skip
that track. Transferring a visual resource to an exit run must be explicit; it
does not transfer the feature's listeners, subscriptions, or business effects.

### 7.4 Focus, keyboard, modality, and scroll

Introduce a host-owned presentation layer manager, using existing actions where
their contracts fit. It owns:

- Active modal stack and topmost Escape/outside-click handling.
- Initial focus and tab containment, including no-focusable-child fallback.
- Focus restoration to a connected, eligible trigger on ordinary dismissal.
- Focus transfer to the new page when dismissal and navigation occur together.
- Background inertness and scroll-lock acquisition/release with nesting counts.
- Declarative shortcuts mapped to feature actions, with input/composition/repeat
  rules; the app supplies the shortcut and action, not browser listener plumbing.
- Optional page title and scroll policies selected from logical route state.

Focus priority is explicit: a newly active modal owns focus; otherwise accepted
navigation focuses its declared page target; otherwise dismissal restores its
trigger. If a target is unavailable, use a documented connected fallback. A stale
restore callback must never steal focus from a newer route or modal. Reduced
motion follows the same focus order without waiting for an animation timer.

Exit visuals are inert immediately. Whether background interaction remains locked
during a short exit is a host policy; it must be bounded and released on every
terminal outcome for that exit. A failed exit cannot leave an obsolete lock;
a failed entrance preserves the still-open dialog's required modality. Other
live presentations retain their own acquisitions.

This removes the need for application-level focus timers. The framework's focus-trap action
and its new layer manager must cooperate; adding another timer above the current
timer is not an implementation of this requirement.

Services affecting the whole document, such as scroll locks and topmost keyboard
ownership, need a document-scoped coordinator shared by attached hosts with
reference-counted acquisition. Destroying one root must not unlock another root's
modal. This registry contains browser resources and ownership metadata, not
shared feature state, and must never be instantiated during server rendering.

That coordinator is the sole dismissal authority for every participating overlay
in a document, including legacy primitives nested above or below managed ones.
Adapt legacy Escape handlers and the existing `clickOutside` layer stack to the
same ordering before advertising mixed adoption. Per-slot mutual exclusion alone
does not prevent one keypress from closing two different overlays. One event
requests dismissal only from the topmost eligible layer; rejection does not fall
through to the layer beneath it. An unsupported legacy/third-party integration
must be explicitly excluded from mixed-layer guarantees until adapted. Existing
standalone legacy mode can remain available without being labelled mixed-safe.

## 8. Browser routing changes

### 8.1 Repair existing helpers first

Make `createURLSyncEffect` pure to construct. Serialization may occur in the pure
phase; browser comparison and writes occur only during effect execution. A
no-change URL can become an execution-time no-op rather than requiring an eager
browser read. SSR construction must not access globals.

Replace history timestamp suppression and global method patching with explicit
navigation origin and equality checks. Calling `pushState`/`replaceState` does not
itself fire `popstate`; traversal must not be discarded because it happened soon
after a framework write. Browser behavior is documented in
[MDN's popstate reference](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event).

Debounced writes must belong to the store/route owner and be invalidated on
traversal, replacement, and teardown. A delayed query update from an old route
must not write over the page the user just reached with Back. Preserve unrelated
history metadata; keep framework metadata namespaced.
Reverting logical state to the browser's unchanged URL must also cancel an
obsolete pending write, even when the newest request requires no history mutation.

Remove the need for callers to inspect `effect._tag`, invoke `.execute()`, clear
`composableSvelteSync`, or install replacement history logic.

### 8.2 Managed route binding

The application supplies route state, parse/serialize functions, page mappings,
navigation actions, and explicit push/replace policy where defaults are insufficient.
The binding handles:

- Initialization from an injected server URL or browser location.
- Browser traversal as a distinct action origin, without echoing a new entry.
- Application navigation: one write after the reducer accepts a route change.
- Same-URL deduplication, canonicalization, query/hash handling, and invalid-route
  outcomes without silently changing every failure into Home.
- Links with ordinary browser behavior for modifier keys, external destinations,
  downloads, and new tabs; internal navigation dispatches a declared action.
- Scroll restoration keyed by entry, route focus policy, and optional motion.
- Cleanup of the one browser connection owned by the route binding.

Application rules may reject or redirect requested navigation. A rejected
application request performs no history write. A browser traversal is different:
the active entry has already changed when `popstate` arrives. Replacing its URL
is not equivalent to returning to the accepted entry; it alters the history stack.

The first managed browser port must specify and qualify these cases:

- Accepted traversal commits the received route without adding an entry. A
  redirect replaces that traversed entry according to declared canonicalization
  policy; it must not create a traversal/write feedback loop.
- Rejected traversal between entries recorded in the same managed history chain
  returns to the last accepted entry using their recorded index delta. A pending
  correction carries an expected entry identity. Its acknowledgment is not a new
  user request; unrelated or newer traversals must still be processed. There is
  no time-window suppression or unconditional “ignore next popstate” flag.
- When that delta cannot be known (for example, an entry lacks this port's
  metadata), exact rollback cannot be promised. The default fallback preserves
  accepted feature state and replaces the active entry's URL with the accepted
  URL, preserves unrelated metadata, starts a new managed chain, and reports
  `historyRebased`. Document that this overwrites the visited entry, rather than
  calling it a lossless rollback. An application may explicitly choose to accept
  such traversal instead; the policy is pure and testable.

After a rebase, entries from the previous chain are unknown to the new chain.
Further Back/Forward into them can trigger additional rebases and overwrite
additional visited entries under the same rejection policy. This repeated
consequence must be visible in diagnostics, tests, and blocker documentation;
rebasing does not recover the old chain's index relationship.
An entry whose identity/index cannot be established uniquely is unknown, even
if it contains copied framework metadata; the presence of a marker alone is
not evidence of a valid rollback delta.

Fragment behavior is declared by the route codec. If fragments are outside the
codec, preserve native anchor behavior and unrelated hash data; a fragment-only
change does not create a page transition or trigger a feature navigation veto.
The port still tracks the active history entry and cancels obsolete pending
writes. If the codec owns the fragment, normalize it into the ordinary route
decision path. Changes to both route and fragment remain route changes.

Do not infer route meaning from the event name alone. Qualify direct fragment
navigation, Back/Forward between fragment entries, and programmatic history
writes separately. A traversal can produce both `popstate` and `hashchange`;
deduplicate by the accepted entry/URL transaction, not a time window. Direct
`pushState`/`replaceState` calls do not themselves emit either event, including
when the fragment changes. See the browser contracts for
[popstate](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event)
and [hashchange](https://developer.mozilla.org/en-US/docs/Web/API/Window/hashchange_event).

Blockers in the first slice make synchronous feature decisions. The browser's
correction is still asynchronous and needs owner/transaction gating, invalidation
of pending writes, and tests for rapid traversal and teardown. Cross-document
navigation cannot be vetoed by this same-document port. Asynchronous blockers
need a separately qualified transaction contract; feature views must not invent
one. If the port cannot meet these cases, guarded browser traversal remains an
explicit unsupported capability rather than an advertised guarantee.

One history-writing authority is permitted per browsing context. Embedded roots
can use a memory/location port. A SvelteKit adapter must delegate to its router
rather than attach a second independent browser router. Qualify the Vite SPA path
first; do not advertise a SvelteKit integration until it is implemented and tested.

## 9. Effects, integrations, and backend boundaries

Keep application effects visible: reducers still decide when to load, save,
subscribe to domain updates, retry, or cancel. The new layer must not hide business
operations inside component lifecycle hooks or presentation configuration.

Provide owned bindings for recurring environmental concerns—motion preference,
document visibility, keyboard shortcuts, route changes, and focus—so every app
does not implement its own browser subscriptions. Add conveniences only where
they remove demonstrated repeated mechanics. Do not invent a generic plugin
system before the first capabilities need one.

For render engines, the integration contract declares its host element, visual
inputs, typed output events, and resource disposal. It can be used by charts,
editors, maps, canvas, or media components without granting arbitrary feature
orchestration rights. Existing satellite wrappers should adopt this common
resource scope incrementally rather than be rewritten wholesale.

Business-service adapters remain application-specific where protocols differ.
A demo's simulated gateway does not establish a production service contract.
UI request cancellation can stop transport/observation; it does not prove durable
backend work was cancelled. Backend authority and durable business execution
remain with the connected service, including Composable Runtime when used.
This proposal neither implements that integration nor creates a second
authoritative frontend business engine.

### 9.1 Operation identity within a live feature

An owner-instance token alone does not distinguish successive operations inside
the same live feature. Preassembled capabilities must also identify the request,
stream, save snapshot or challenge whose result is arriving. Their reducers
accept results only under the capability's declared concurrency policy.

- Streaming chat must define whether it serializes, supersedes or independently
  models concurrent replies. A chunk, completion or error belongs to its original
  stream. Clear/restore invalidates old streams before a subsequent reply can
  receive their callbacks; stop/dispose also releases the owned transport where
  supported. Transport cancellation and stale-result rejection are separate duties.
- Editor saves carry the submitted content/version. A completion updates the
  accepted saved baseline without marking newer edits clean. Overlapping saves
  need a declared ordering policy; ignoring a stale client result does not undo
  an external write already committed by the backend.
- A newly supplied authentication challenge resets the previous attempt's success,
  session, errors and input according to its contract, and invalidates obsolete
  verification results. This is frontend lifecycle correctness, not frontend
  authority to authenticate a user.
- Configured asynchronous form validators participate in submit validation for
  the submitted data snapshot. Submission must not bypass them because schema
  parsing succeeded. Changed data cannot be approved by stale validation; pending,
  failed and cancelled validation have explicit outcomes. Validation I/O remains
  in effects through dependencies, while validation rules remain feature data/configuration.

The packaged features supply this reusable coordination. Consumers supply rules,
ports and concurrency choices where the public API exposes them; they should not
repair the feature by maintaining competing stream handles or revision counters
in views. These requirements address [DEF-010](#def-010), [DEF-013](#def-013),
[DEF-014](#def-014), [DEF-015](#def-015) and [DEF-019](#def-019).

### 9.2 Public feature contracts and reusable resources

Clean assembly also depends on ordinary APIs behaving correctly. Keep table
totals separate from page rows, preserve absolute request URLs, and define
inclusive/exclusive boundaries for data transformations. Correct these in their
own small modules; they do not require a new application abstraction
([DEF-007](#def-007), [DEF-008](#def-008), [DEF-009](#def-009), [DEF-017](#def-017)).

Resource integrations distinguish a granted browser permission from a currently
usable resource. Deactivation invalidates/disposes a resource; subsequent use
must reacquire or recreate it under the supported lifecycle. Creating a timer or
listener after disposal must not allocate an unowned resource. Repeated instances
remain isolated. Wire transport messages through the supported adapter rather
than testing only the reducer actions those messages should produce
([DEF-016](#def-016), [DEF-018](#def-018), [DEF-020](#def-020)).

Motion cannot discard an otherwise accepted semantic change. A pointer leaving
during tooltip entrance must still result in the correct hidden state, and a
carousel's unchanged target or overlapping autoplay tick must settle or continue
according to policy. Prefer playback completion and owned scheduling over extra
consumer timers ([DEF-004](#def-004), [DEF-011](#def-011), [DEF-012](#def-012)).

## 10. Accessibility, SSR, performance, and failure behavior

These are part of the extension contract, not tasks left to each driver author.

| Concern | Required behavior |
| --- | --- |
| Reduced motion | Default to the correct stable visual state without motion; a preference change settles active motion immediately. Optional reduced recipes must be explicitly qualified. Custom drivers cannot opt out silently. |
| First render and hydration | Emit the correct stable HTML/CSS state. No hidden content waiting for JavaScript; no replayed transition merely because the initial state is open or selected. |
| Server execution | No DOM access at import, definition, or pure reduction time. Request-scoped instances; no serialized elements, handles, or active playback promises. |
| Continuous decoration | Owner-scoped; paused/stopped according to visibility and preference policy. Not a reason to keep a feature or modal alive. |
| Frame work | Keep per-frame updates out of business reducers; batch layout reads/writes; measure frame cost in the reference scenarios. No promise of a universal frame rate. |
| Rendering failure | Preserve the accepted logical outcome, show its stable view, release the failed run's resources, preserve usable focus/modality, and emit a diagnostic. |
| Nesting | Multiple roots, repeated components, stacked overlays, and shared target names remain isolated by owner identity. |
| No motion capability loaded | Normal state rendering and navigation still work. Basic components must not pull every animation engine or satellite into a bundle. |

The application entry point and motion-free lifecycle primitives must not import
the root barrel, engine adapters, or recipe constructors that eagerly load an
animation engine. Motion capabilities enter through explicit subpath imports
and injection. Verify the emitted import graph and consumer bundles, not just
source-level intent. Establish store-only, managed-without-motion, ordinary
managed-motion, and custom-motion baselines during stage 0.

Component-local ownership does not require one complete store per visual target.
Measure repeated micro bindings on a representative large list; prefer shared
owner services with keyed lifecycle records where they preserve composition and
isolation. Choose bounded managed history and registration cleanup based on those
measurements. Do not trade clean feature code for unmeasured per-element machinery.

Hydration starts from serialized feature state plus an explicitly injected initial
URL. Server and first client render must agree on that projection; the browser
adapter must not rewrite it midway through hydration. If the current browser URL
differs, reconcile through a declared route action after hydration. Initial
framework lifecycle state is derived as stable from that feature state; stale
active run IDs, pending playback, and server-skipped effects are not replayed.
Any mismatch/reload policy is explicit and tested. Establish Svelte context during
component initialization and attach DOM services after mounting.
[Svelte context contract](https://svelte.dev/docs/svelte/svelte#setContext).

Motion remains the initial supported playback engine. Do not add a second engine
for novelty. A custom driver may adopt a browser or third-party animation handle
through a qualified adapter. Native View Transitions are a potential later
implementation behind the same contract, not required for the first slice and
not a substitute for logical lifecycle ownership.

## 11. Architectural checks and policy authority

Ship a consumer architecture checker with a named, versioned policy. Keep it out
of browser runtime bundles. Whether distributed as a core CLI or a companion
tooling package is a packaging decision; its policy version and supported core
versions must be explicit.

Checks parse Svelte and TypeScript and resolve imported symbols. Inspect the
reachable local module graph, not just filenames or component script text. A
helper relocation, alias, re-export, or renamed `useShellSetup` cannot erase
the responsibility being checked. No claim of complete arbitrary-JavaScript
proof is appropriate; report unsupported dynamic constructs and opaque imports.

| Rule | Reject in ordinary features/views | Permitted path |
| --- | --- | --- |
| Routing ownership | Direct history writes/listeners; effect leaf execution | Managed route binding or an explicitly qualified router adapter |
| Presentation ownership | Store subscriptions coordinating lifecycle/focus; user-written generic completion timers | Managed presentation slots and outcomes |
| Motion ownership | Direct playback/frame scheduling requiring manual lifecycle; competing property writers | Recipes, bindings, registered managed drivers |
| Resource ownership | Unregistered listeners, observers, timers, or engine handles implementing promised capabilities | Framework resource scope with declared capabilities |
| Pure decisions | DOM, browser globals, unmanaged clock/randomness, I/O in reducers | Explicit inputs and injected effects |
| Integration boundaries | Driver imports of feature stores, business clients, routing or focus controllers | Typed visual inputs and scoped rendering resources |
| Policy integrity | Disabled required rules, unapproved suppressions, empty scan scope, hidden generated sources | Externally supplied policy and explicit reviewed exceptions |

The checker must distinguish business timers from presentation timers and normal
event-to-action handlers from orchestration. Avoid a blanket ban on lifecycle
hooks, DOM references, or the transient rendering data permitted in §3. Diagnostic
messages identify the responsibility, public replacement, and migration example.

Qualification for custom drivers includes a declared capability manifest and
contract tests. It does not mean that any file under `presentation/drivers` may
perform arbitrary side effects. External engines are opaque dependencies; their
adapters and versions must have an explicit trust/qualification record.

**The generator cannot be the authority over its own acceptance policy.** In an
application-generation workflow, the orchestrator supplies a pinned checker/policy, scan
entry points, and exception registry outside the generated project's writable
output. It evaluates the actual produced files independently of their npm scripts.
Policy changes and new privileges go through a separate review step. In an
ordinary developer-owned repository, the checker can detect policy changes but
cannot prevent an owner from removing it; make that limit explicit.

Every rule needs both a violating fixture and a legitimate neighboring example.
Add mutation controls for aliases, helper extraction, and fake driver registration.
An empty analysis, parser failure, unresolved required file, or missing policy
must fail qualification rather than report zero violations.

## 12. Documentation, examples, and discoverability

Library documentation must remain product-neutral. Examples may be complete and
sophisticated, but must use generic fictional domains and explicitly identify
themselves as demonstrations. Keep consumer-specific product names, source paths,
screenshots, and project histories outside the library's documents. Explain
framework limitations through library evidence and standalone reproductions.

Publish the following together with the APIs and checks:

1. A short application contract: ownership table, supported paths, and what to do
   when a capability is absent.
2. An application starter using the managed host, routing, one optional feature,
   one business effect, and a deterministic test.
3. A motion guide organized by user intent: page transition, module transition,
   enter/exit, reorder, value change, interaction, continuous feedback, custom driver.
4. Paired examples: preset, recipe customization, and custom driver for both a
   page-level transition and an individual element.
5. A capability catalog with typed import paths, supported targets, lifecycle
   guarantees, limitations, and test recipes.
6. A versioned agent entry document that directs consumers to this material and
   the qualification command. It is an entry point, not a substitute for APIs.
7. A gap-report template: desired behavior, existing capabilities tried, missing
   contract, smallest reproduction, and proposed boundary. An agent must identify
   a gap instead of silently building a competing coordinator.

Examples must be assembled from the actual public exports and executed from
release tarballs outside the workspace. Custom-driver examples must exercise
interruption and teardown, not just the happy-path animation.

Existing documentation must be reconciled deliberately:

- Mark manual `PresentationState`/callback examples as the legacy or advanced
  integration path after the managed API exists. Do not leave two equally
  recommended application patterns with contradictory ownership rules.
- Update `guides/ANIMATION-GUIDELINES.md`, its test, and contributor instructions
  together. Managed hover/focus/press animation is explicitly supported by this
  proposal; this changes the current blanket pseudo-class-animation policy.
- Include `CLAUDE.md`, `.claude/skills/composable-svelte-core/SKILL.md`,
  `.claude/skills/composable-svelte-navigation/SKILL.md`, and affected module skills
  in that reconciliation. Remove examples of unavailable effect helpers and
  stale routing signatures, or explicitly label future designs. Contributor
  examples need public-type checks alongside consumer examples; the external
  fresh-agent exercise intentionally does not load these internal skills.
- Keep the useful principle of one owner per animated property. Raw CSS/browser
  lifecycle animation remains outside the managed application contract unless a
  supported adapter owns it. Static styling and focus indicators remain normal CSS.
- Preserve immediate semantic feedback as defined in §5.1. Document any existing
  per-frame feature actions as legacy boundaries: for example, the chart
  primitive currently dispatches `zoomProgress` during playback. Its migration
  must separate accepted viewport decisions from render interpolation before it
  can claim compliance with the managed frame-work contract.
- Decorative infinite CSS loops can remain a documented exception with preference
  and lifecycle requirements; they do not acquire permission to sequence features.
- Do not imply that every visual detail must become a persistent feature-state
  field. Local managed motion and coordinated lifecycle are distinct.

This document does **not** activate those policy changes before implementation.
The policy migration must accompany the corresponding supported capabilities.

## 13. Generic reference demo and migration examples

Build a complete **Reference Demo**: a fictional item-collection application with
overview, list, detail, and settings pages. Its purpose is to demonstrate framework
assembly and qualify the supported architecture. It is not a production product,
customer implementation, or disguised copy of a particular application.

The demo should be sophisticated in interaction and architecture while remaining
simple in domain meaning. Use neutral items and collections, synthetic data,
generic names, and its own neutral visual theme. Display an explicit **Demo**
label in the UI and state its purpose and simulated behavior in the README.

Required example workflows:

- Browse, search, filter, and reorder items; navigate to a deep-linked detail page.
- Create or edit an item in a dialog, including validation, unsaved changes, and
  an explicit close rule during submission.
- Run injected asynchronous loads and saves, including controlled failure,
  cancellation, retry, and a stale response after a newer request.
- Open a navigation panel and transition its selected preview into a detail
  page using shared surface, thumbnail, and title targets.
- Coordinate a module expansion with page layout, and demonstrate managed
  selection, progress, and custom icon feedback at the element level.
- Exercise reduced motion, responsive layout, keyboard focus, interruption,
  and teardown across these workflows.

Use a deterministic simulated gateway with resettable fixtures. No credentials or
live services are required. Any optional browser persistence stores demo data
only and must be clearly documented. Simulation controls make failure and timing
reproducible; they are not a production authorization or backend example.

Keep the minimal starter small. Place the proposed full demo in
`examples/reference-demo/`, with walkthroughs explaining the assembly decisions.
Its qualification build must install registry packages or release tarballs into
an isolated consumer directory, not resolve workspace links, source aliases, or
patched dependencies. It may live in the repository without becoming part of
every core package installation. This section specifies a future deliverable;
it does not claim that the demo already exists.

Publish a generic migration walkthrough alongside the demo, showing how common
application-owned machinery is replaced by framework capabilities:

| Current application responsibility | Target after migration |
| --- | --- |
| Shell store creation, load dispatch, teardown | Component-owned application instance with declared startup action |
| Handwired browser-routing module | Route configuration and the managed binding; remove effect-tag and marker workarounds |
| `motionRevision` and completion switch | Framework lifecycle state and generated run identity |
| Shell subscription and focus timer | Managed presentation and route-focus policy |
| Resize/scroll/preference interruption listeners | Host motion policy and owned geometry services |
| DOM snapshot/layer/style cleanup in a custom motion coordinator | Shared motion/runtime services |
| Shared surface, thumbnail, title, and content choreography | A recipe where expressible; a small custom driver only for remaining geometry |
| Custom ordinary modal wrapper | Styled/headless managed dialog with feature-controlled close policy |
| Navigation selection, status feedback, and entrance actions | Managed micro bindings or recipes with the same interruption contract |
| Item validation, draft handling, and collection rules | Remain readable feature reducers with injected ports |

The migration must produce a responsibility diff, not only a line-count diff.
Report which infrastructure responsibilities disappeared from application code,
which custom algorithms remain, and why each remaining low-level operation is
inside the supported extension boundary. Count plumbing outside qualified
integrations, but do not use a small LOC total as proof of correctness.

Include both default behavior and progressively customized versions. The reader
should see what configuration is sufficient, when a recipe helps, and when a
small managed driver is justified. Keep the low-level custom algorithm separate
from the framework-owned lifetime machinery in every version.

## 14. Qualification and acceptance evidence

### 14.1 Separate four kinds of evidence

| Layer | What it establishes | What it does not establish |
| --- | --- | --- |
| Feature tests | Business/UI decisions, emitted effects/results, cancellation semantics | Correct DOM rendering or architectural ownership |
| Framework/driver tests | Lifecycle, rendering, accessibility mechanics, resource release | Whether an unfamiliar author chooses the right APIs |
| Architecture checks | Compliance with defined analyzable boundaries | Complete semantic proof or visual fidelity |
| Fresh-agent exercises | Whether published material supports reliable construction and modification | Universal success for every model or product |

Keep existing TestStore assertions exhaustive for feature actions. Add a managed
application harness with explicit lifecycle inspection and a fake motion/browser
environment. Internal framework events must not force business tests to assert
every paint detail, but they must remain available to lifecycle tests. Provide
`finish`/resource-leak assertions rather than silently ignoring pending work.

Do not drive Motion's real browser ticker with fake timers. Unit-test the pure
lifecycle against an injected scheduler and fake driver; browser-test actual
playback separately using the existing motion-testing tools where appropriate.
The production/TestStore transcript and mutation gate in §4.4 is required even
when a harness can exercise every proposed lifecycle state in isolation.

### 14.2 Required regression matrix

| Scenario | Required outcome |
| --- | --- |
| Open, close, reopen before completion | New instance wins; no old effect, callback, focus restore, or cleanup affects it |
| Same-case child replacement | Old child I/O and visual resources end according to identity; new child remains live |
| Stale view dispatch or dismiss after replacement | Old scoped handles cannot reach or close the new child |
| Collection key removed and reused | Old handles/results cannot reach the new epoch; reorder and edit preserve a live item's identity |
| Queued effect/subscriber dispatch | No nested reduction; declared FIFO turn order in production and TestStore |
| Instance removed while its action waits in the queue | Origin token is rechecked; action cannot become work for the replacement |
| Same local effect name in sibling/reopened children | Namespaced execution and cancellation; no cross-instance interference |
| Cancellation nested through batches and action lifts | Cancellation scope follows ownership without targeting an unrelated group |
| Child emits work while parent removes it | Removed child's new work never starts; valid parent-owned follow-up still runs |
| Same-reduction self-removal versus later dismiss action | Discard in the first case; started work and queued results follow §7.1 in the second |
| Save deliberately survives closure | Parent owns the accepted command and receives its result; no raw-dispatch or reparenting workaround |
| Async cleanup/dismiss after replacement | Old dependency capability cannot close the replacement; cleanup rejection is observed |
| Cancellation during executor setup | Aborted work leaves TestStore's pending count; late results stay gated |
| Old stream emits after clear/restore and a new send | Old chunk, error and completion cannot affect the new reply; owned transport is released |
| Edit while save is pending; save completions arrive out of order | Accepted saved baseline follows declared ordering; unsaved newer content remains dirty and saveable |
| New authentication challenge replaces a successful/pending attempt | No inherited success/session or old verification result authorizes the replacement UI |
| Submit with async validation pending, rejected, cancelled or stale | All configured validators participate for the submitted snapshot; invalid/stale results cannot authorize submission |
| Resource deactivated and used again; allocation after disposal | Reacquire a usable resource; no untracked timer/listener is created after disposal |
| Public data helpers at boundaries | Absolute URLs, client/server totals, bin maxima and constant data preserve their documented meanings |
| Close request rejected by feature policy | Original child, effects, and focus remain live; no exit starts |
| Navigate during opening/closing | New logical route commits; no leaked outgoing tree or modal lock |
| Exit projection of an effectful component | Live component resources end on removal; a snapshot cannot rerun its hooks |
| Multiple actions before one render | Defined visual coalescing; all accepted feature decisions preserved |
| Back/Forward immediately after push | Correct route, no dropped traversal or extra entry |
| Traversal during pending debounced write | Obsolete write cannot overwrite the traversed destination |
| State reverts to current URL before debounce fires | Pending obsolete write is cancelled even though the latest URL needs no write |
| Rejected traversal and rapid correction | Known entries restore by identity; unknown-entry fallback is reported; newer requests are not swallowed |
| Repeated traversal after history rebase | Older chains remain unknown; each fallback is explicit and does not create a correction loop |
| Fragment assignment, fragment traversal, and history writes | Declared codec policy; native anchors preserved where applicable; no duplicate feature navigation |
| Nested overlays | Topmost interaction/focus, correct restoration, no premature scroll unlock |
| Legacy and managed overlays in either nesting order | One document authority; one close request per event; rejected top-layer close does not reach the next layer |
| Failed entrance versus failed exit | Open dialog retains modality; removed dialog cannot retain an obsolete lock |
| Missing/disconnected targets | Stable fallback and diagnostic, not hidden content or crashed navigation |
| Reduced motion at startup or mid-run | Correct visuals/focus; active old run is superseded for preference change, not misreported as skipped |
| Selection and focus during decorative playback | Semantic and accessible feedback is immediate; animation does not gate control eligibility |
| Hydrate open dialog/selected control | Correct initial state, no invented entrance, subsequent dismissal still works |
| Descendant target registers before host attachment | Initialization-time registry accepts it; attachment reconciles it exactly once |
| SSR micro binding with a non-default value | Stable pose exists without JavaScript; hydration has no corrective flash |
| Different browser URL at hydration | First render matches serialized state; declared reconciliation runs afterward |
| Driver throw/reject/hang asynchronously | Bounded recovery and cleanup; terminal outcome exactly once |
| Missing readiness or capture completion | End-to-end deadline recovers before playback can begin |
| Accepted terminal outcome awaits queued delivery | Settlement cleanup does not erase a valid mapping; later replacement/disposal prevents stale delivery |
| Owner destroyed during any phase | No owned listeners/timers/handles remain; managed calls are gated; qualified native adapters stop late writes |
| Macro and micro runs overlap | Independent channels cooperate; conflicting property ownership is deterministic |
| Rapid hover/press/value updates | Current state wins without accumulating tasks or business-history frames |
| Old cleanup after stable-value change | Latest stable styles survive; mount-time styles cannot be restored over them |
| Headless stable input changes during a property lease | One managed writer across native and inline playback; SSR pose and post-settlement value remain correct |
| Late async data changes layout | Safe measurement/fallback; no permanent stale transform or hidden target |
| Repeated roots/components | IDs, cancellation, layers, and property leases remain scoped |

Run the packaged reference in Chromium, Firefox, and WebKit where supported by
the test tooling; report unsupported cases rather than implying all-browser proof.
Test responsive layout, keyboard-only use, reduced motion, and production builds.
Inspect actual visual checkpoints and accessibility semantics; reducer tests
cannot demonstrate either by themselves.

Resource regression checks repeat at least 100 open/close/replace cycles and
assert return to the registered-resource baseline after settlement. Capture heap
and frame profiles as supporting evidence, not as a substitute for deterministic
ownership assertions. Maintain the four stage-0 bundle baselines in §10 and set
reviewed regression budgets before expanding the catalog. Include the repeated
micro-binding measurement, so an implementation cannot hide large per-item costs.

Mutation controls must prove detection of at least: a missing disposer, ignored
abort, stale completion acceptance, duplicate terminal event, focus restoration
after navigation, resurrected history suppression, raw helper-extracted plumbing,
instance-ID aliasing, stale scoped dispatch, work started after logical removal,
action-only SSR styling, and a disabled/empty architecture scan. Also mutate one
executor's ordering or owner filter, preserve an obsolete dependency's dispatch,
and allow a stable-style update to overwrite an active lease. The corresponding
parity, instance, and rendering checks must fail for the intended reason.

### 14.3 Fresh-agent exercise

Use clean tasks with only a business brief, pinned published/prerelease packages,
and their consumer entry instructions. No library checkout, private contributor
skills, oral architectural corrections, or reference application supplied as an
answer to copy.

Each run must:

1. Build a small workflow with an injected asynchronous operation.
2. Add page navigation and a dismissible dialog with a close rule.
3. Add or customize one coordinated page/module transition and one element-level
   animation, using defaults where they suffice.
4. Handle interruption, reduced motion, and request cancellation.
5. Receive a change request that alters the workflow and presentation.

Use two generic scenarios: navigation-panel-to-detail choreography, and a
searchable list/detail workflow with a reorder and a custom status indicator.
Reading published demo examples is allowed; supplying a completed solution to
the requested exercise is not. Use held-out requirements and change requests to
measure assembly and adaptation rather than reproduction of the demo.
Record first-attempt violations, functional failures, repair cycles, human
interventions, checker version, package versions, agent configuration, and final
evidence. Preserve failures rather than reporting only the best run.

Initial release gate: three independent fresh runs per scenario; each must
complete with zero final architectural violations and no human architectural
intervention, with at most one repair cycle guided by published diagnostics.
“Complete” requires successful type/Svelte checks, functional tests, a production
build, and the held-out scenario/change acceptance tests, as well as the independent
architecture check. The orchestrator pins and runs those gates outside the
generated project's authority. A missing test, disabled assertion, skipped build,
or successful architecture scan alongside broken behavior fails the run.
Record first-pass success separately. Six runs provide a bounded acceptance gate,
not a statistical claim of general reliability. A repeated failure requires an
API/documentation/default revision and a fresh rerun, not a hidden instruction
added only to the benchmark prompt.

## 15. Implementation sequence

Do not begin with a large DSL, a broad static-analysis platform, or a rewrite of
all packages. Implement one coherent vertical path, then extend proven contracts.

| Stage | Deliverables | Exit condition |
| --- | --- | --- |
| 0a. Executor and parity proof | Internal opt-in FIFO dispatch, originating-instance metadata, pre-start filtering, ID/group scope, shared time authority; decision on shared production/TestStore mechanisms | Same semantic transcripts in both stores; mutation controls detect drift; legacy defaults preserved; stale work cannot acquire a replacement's epoch |
| 0b. Consumer and renderer spike | Small independently composable pieces, typed slot linkage, narrow facade compatibility, macro/micro fixtures; prove capture, registry attachment, SSR/style handoff, and four bundle baselines | Reviewable consumer code is substantially clearer; no `any`, casts, caller lifecycle timers, duplicate child reduction, or hidden state machine; facade retained only if it earns its cost |
| 1. Routing repair | Pure effect construction, traversal correctness, owned debounce; standalone regression cases | Consumer needs no leaf execution or marker mutation; old regressions fail when fixes are reverted |
| 2. Shared lifecycle foundation | Harden the stage-0 execution mechanisms; owner/resource scopes, outcomes/deadlines, close semantics, focus/layer manager, legacy dismissal bridges for supported mixed nesting | Pure and browser tests pass for ordering, disposal, replacement, inert retention, mixed-layer nesting, and reduced motion |
| 3. Defaults and recipes | Managed modal plus page outlet, element-state/interaction binding, shared-target/stagger recipes | Macro and micro reference interactions need declarations only; production browser checks pass |
| 4. Custom driver boundary | Scoped context, adopted handles, geometry/frames, watchdog/fallback, driver harness | One custom page/module and one custom element example pass the same interruption/resource contracts |
| 5. Generic reference demo | Complete fictional demo app and migration walkthrough with macro/micro interactions | Explicit demo labeling, public-package isolation, responsibility diff, and visual/functional regression matrix accepted |
| 6. External-consumer release candidate | Shipped contract, examples, minimal architecture checks, policy pinned outside generator output | Tarball checks and fresh-agent exercises pass; limitations are explicit |
| 7. Catalog expansion | Migrate remaining navigation/UI primitives and relevant satellites onto the proven services | Each advertised migrated component passes the shared contract suite; no unsupported coverage claims |

Architecture checks begin as fixtures during the spike and become a release gate
for the supported path; stage 6 is not the first time their design is considered.
Expand checks in response to observed bypasses and responsibilities, not a guess
that every imperative construct is forbidden.

Stage 0 comprises 0a and 0b. Establish the executor feasibility in 0a before
freezing consumer signatures in 0b; renderer exploration can proceed independently.
The first deliverable is a working composition/ownership proof, not a broad
`defineApplication` implementation. Required repairs to existing group lifting,
cleanup, or TestStore cancellation belong in this foundation, each with a
reproduction and a mutation-verified regression. Independent routing repairs may
proceed in parallel. Later catalog migration cannot defer the legacy dismissal
bridges required for an already-advertised mixed-overlay scenario.

Track current defects through §21 alongside the architectural stages. Foundation
items gate stages 0a–2 where referenced. Independent API, table, form, editor,
chat, auth, chart and media corrections can land on the existing public paths
without waiting for stage 7 or adopting a new facade. Fixing a legacy defect does
not by itself qualify the stronger managed contract, and adding the managed path
does not close a defect left reachable through a supported legacy API.

For each release candidate, list the affected DEF and AAM IDs. Close defects in
its advertised supported slice, or explicitly narrow that slice and document the
remaining limitation and reason. Unrelated satellite work need not block a
scoped core prerelease. A deferred or scope-excluded item stays open; it is not
reported as fixed. Candidate claims affecting the release must receive an
evidence-based disposition before that release is called qualified.

Do not publish under `latest` until the release candidate meets its gate. A
separate prerelease tag allows real npm-consumer evaluation without changing the
stable installation path.

### 15.1 Repository implementation map

The following are proposed work areas, not files to create mechanically before
the vertical slice proves their boundaries.

| Location | Required change |
| --- | --- |
| `packages/core/src/lib/application/` (new) | Typed definition, composed owner, Svelte lifecycle binding, host context, capability assembly; no duplicate business effect interpreter |
| `packages/core/src/lib/animation/` | Managed run/recipe/driver contracts, normalized engine adapter, scoped targets, property leases, shared geometry, preferences, and component-local bindings |
| `packages/core/src/lib/navigation/` | Identity-aware presentation binding, instance-checked scoped handles, effect ownership, close request/acceptance contract, generated lifecycle transitions, explicit legacy compatibility |
| `packages/core/src/lib/navigation-components/` | Managed route/presentation outlets; migrate primitives to common layering, focus, and motion services |
| `packages/core/src/lib/actions/` | Coordinate focus, portal and target registration with ownership; remove competing unmanaged restoration schedules from the new path |
| `packages/core/src/lib/routing/` | Repair eager browser reads and history suppression; add owned browser/memory ports and route binding |
| `packages/core/src/lib/store.svelte.ts`, `types.ts`, `effect.ts` | Required internal dispatch mode, originating ownership metadata, pre-start filtering, scoped cancellation, and scheduler injection; preserve legacy defaults and metadata through every lift/batch |
| `packages/core/src/lib/test/` and `packages/core/tests/` | Matching TestStore semantics; shared execution mechanisms where feasible; mandatory transcript/parity mutation suite, application/driver harnesses, pure lifecycle and real browser tests |
| `packages/core/src/lib/components/` | Apply common micro-motion and property-ownership contracts as each component is qualified |
| `packages/*/src/` in satellite packages | Incremental adoption for imperative rendering engines; document unmigrated boundaries |
| `packages/core/package.json` and build/export verification | Motion-free application entry, separate engine/recipe imports, explicit tooling; four bundle baselines and emitted Svelte/TypeScript declaration tests |
| `packages/core/docs/`, `consumer/`, README | Publish the authoritative contract, default assembly path, macro/micro recipes, custom-driver examples, and migration guide |
| `scripts/`, consumer verification, CI | Execute architecture checks and the external packaged reference; keep generation acceptance policy outside generated output |
| `guides/ANIMATION-GUIDELINES.md`, `CLAUDE.md`, `.claude/skills/`, policy tests | Reconcile examples and signatures, immediate-feedback policy and legacy frame actions; ship guidance changes with corresponding qualified behavior |

No production backend adapter or change to Composable Runtime is required to
prove this frontend slice. A deterministic injected gateway is sufficient for
its effect/cancellation qualification, with the production limitation kept visible.

## 16. Compatibility, package scope, and migration

The first implementation belongs primarily in core. Add deliberate public export
paths, package docs, and tooling; preserve import isolation for consumers that
only need stores, UI atoms, or testing. Do not make all satellite engines mandatory.

Keep existing `createStore`, reducers, effects, composition, and manual navigation
APIs usable. Introduce the managed path additively, document it as the preferred
new-application path only when qualified, and provide an explicit migration guide.
Never silently change a legacy slot's destination-retention behavior.
Likewise, scheduling is selected per root: managed roots use §4.2's ordering,
and legacy roots keep their synchronous default. Mixing old and new APIs within
a root does not permit two execution orders. Document the supported combinations
and provide diagnostics for unsupported composition. Cross-root browser layering
uses the single document authority in §7.4.

The scope is larger than a documentation patch. Plan a core minor release on the
0.x line, with satellite peer-range updates and checks following repository policy.
Small routing corrections can be isolated earlier if independently qualified.
Exact versions are selected at implementation time, not invented by this proposal.

| Existing surface | Proposed treatment |
| --- | --- |
| `createStore`, `Effect`, `scope`, `integrate`, `scopeTo`, TestStore | Required additive executor/ownership seams and narrow scoping interfaces; qualify matching production/test semantics before managed adoption |
| `PresentationState` and completion callbacks | Preserve legacy support; new managed path generates and owns bookkeeping |
| Modal/Sheet/Drawer/Popover/stack primitives | Adapt onto shared services incrementally; prevent simultaneous legacy and managed ownership |
| `DestinationRouter` | Reuse or evolve into typed managed presentation assembly; avoid duplicate routing concepts |
| Low-level `animate*` exports | Retain for advanced/legacy consumers; expose managed adapters as the recommended new path |
| Focus/portal/scroll helpers | Integrate with shared ownership and nesting semantics; eliminate competing restore schedules |
| Consumer starter and guides | Replace the default assembly example; keep an explicit low-level integration chapter |
| Satellite rendering integrations | Adopt the resource scope as each is qualified; do not claim automatic migration |

The new APIs must carry both TypeScript and Svelte generic inference through the
published declarations. Tests cover wrong target names, wrong child actions,
missing destination cases, misspelled/missing slot links, invalid driver
capabilities, nested callback inference, and scoping a facade that lacks
`destroy`/history. Prefer rejecting a bad configuration at the declaration site
to a runtime cast in an outlet. Unsupported dynamic declarations fail explicit
initialization validation before browser attachment.

## 17. Main risks and constraints on the design

- **A second framework inside the framework.** Avoid a replacement reducer/effect
  engine. The host composes existing machinery and owns browser resources.
- **Too much configuration.** An ordinary modal and a micro state animation must
  remain small examples. No target registry or driver definition for a default
  component that already knows its elements.
- **Lost visibility.** Generated lifecycle work must appear in diagnostic traces
  and test harnesses. Hidden behavior is not an acceptable price for clean views.
- **A universal animation language.** Stop recipes at common track composition.
  Custom algorithms belong in ordinary typed driver code.
- **Lifecycle ambiguity.** Logical removal, outgoing visuals, effect cancellation,
  and focus ownership are separate contracts with a defined order. Tests must
  prove their interaction instead of treating `animation.finished` as authority.
- **Overpromised extension safety.** Managed contexts cannot sandbox arbitrary
  JavaScript. Qualification and externally owned policy remain necessary.
- **Expanding beyond the evidence.** Nested stacks, complex gestures, specialized
  rendering surfaces, router integrations, and third-party engines are supported
  only as their adapters and contract tests land. Document gaps explicitly.
- **Rewriting the user's design to fit a preset.** The reference must preserve
  custom motion at both scales. A clean API that can only fade a generic modal
  does not satisfy this specification.

## 18. Definition of done

The supported slice is ready when an application feature reads as its state,
decisions, content, and presentation; the user does not need to inspect subscription
or cleanup choreography to understand it.

Concretely:

- The reference demo has no handwritten presentation subscription, revision
  bookkeeping, focus timer, history-marker workaround, or generic animation
  cleanup engine.
- Ordinary page, overlay, and element motion works from framework defaults;
  recipes customize common behavior without manual lifecycle code.
- A custom macro animation and a custom micro animation use the same understandable
  managed extension contract and pass its failure/interruption tests.
- Feature decisions remain explicit, pure, and independently testable. Rendering
  failures cannot change business outcomes or strand navigation.
- Managed dispatch order, original-instance ownership, pre-start filtering, and
  cleanup have matching production/TestStore evidence. A facade-only queue or
  passing pure lifecycle tests cannot substitute for that proof.
- Save-and-close, collection key reuse, delayed dependency callbacks, mixed
  overlays, and headless style ownership satisfy the explicit contracts above.
- Qualified components own reduced motion, SSR initial rendering, focus, resource
  lifetime, and interruption within their documented capabilities.
- The published instructions, examples, types, checks, and implementation agree.
- The affected defect and architecture entries in §21–22 have linked closure
  evidence. Unverified candidates have not been silently counted as fixed, and
  any remaining limitation is consistent with the advertised release scope.
- Fresh-agent construction **and modification** pass the bounded qualification
  exercise, including type checks, functional acceptance and production builds,
  without repeated architectural correction from the user.

No existing test count, package-install success, or self-reported agent compliance
substitutes for these outcomes.

## 19. Review resolution and evidence limits

This consolidation incorporates the original design review and the independently
reviewed findings below. It does not adopt every proposed mechanism literally.
The [verbatim hostile review](../../plans/application-authoring-review-2026-09-18/FABLE-REVIEW.md)
and [assessment](../../plans/application-authoring-review-2026-09-18/DISCUSSION-NOTES.md)
remain historical evidence; their provisional recommendations do not override
the contracts in this document.

The table below resolves design recommendations, not implementation work.
[§22](#22-architecture-delivery-checklist) tracks actual implementation closure
for each AAM ID; [§21](#21-confirmed-defect-register) tracks concrete defects.

| Review finding | Resolution in this specification |
| --- | --- |
| AAM-01: facade cannot control internal dispatch | Accepted. §4.2 and stage 0a require a store-level FIFO mode across all dispatch entry paths, with explicit legacy compatibility. |
| AAM-02: removal filtering and effect ownership | Accepted, with a corrected mechanism. §4.3 preserves the originating instance; registration must not assign stale work the slot's current epoch. |
| AAM-03: fire-and-forget and delayed dismiss | Accepted with cooperative limits. §4.3 covers pre-start eligibility and instance-checked dependency callbacks; it does not promise cancellation of arbitrary captured code or external writes. |
| AAM-04: TestStore is a separate executor | Accepted. §4.4 requires matching mechanisms and mutation-verified transcript parity even if implementation is shared. |
| AAM-05: save-and-close migration | Accepted as an ownership requirement, with the overstatement corrected. §7.1 separates same-reduction removal from a later dismiss action and distinguishes synchronous results, late results, and external writes. |
| AAM-06: legacy/managed overlay competition | Accepted. §7.4 and stage 2 require one document dismissal authority before mixed nesting is qualified. |
| AAM-07: registration before host attachment | Accepted as a lifecycle requirement. §4.1 permits early registration without relying on an unproven universal mount order; the renderer spike must establish actual call order. |
| AAM-08: slot linkage and nested inference | Accepted as type/initialization gates, not a proven failure of every possible signature. §4.1 and §16 require typed linkage and negative fixtures; exact token/builder syntax remains provisional. |
| AAM-09: facade versus full Store types | Accepted. §4.2 requires compatible narrow interfaces, without leaking destruction or manufacturing history. |
| AAM-10: competing stable-style writes | Accepted. §5.3–5.4 require a managed headless handoff and sole writing authority during property leases. |
| AAM-11: collection identity reuse | Accepted. §7.1 extends epoch protection to removed/re-added and explicitly replaced collection entries. |
| AAM-12: motion-free import boundary | Accepted. §10 and stage 0b require separate motion imports and measured bundle/import graphs. |
| AAM-13: immediate feedback and frame actions | Accepted with scope clarified. §5.1 keeps semantic feedback immediate; §12 schedules explicit legacy chart migration rather than claiming it already complies. |
| AAM-14: preference outcomes, fragments, rebasing | Accepted with corrected browser precision. §5.5 uses reasoned supersession; §8.2 declares codec semantics and repeated-rebase consequences without assuming all fragment changes emit the same events. |
| AAM-15: functional success in agent gate | Accepted. §14.3 requires type checks, tests, production build, held-out acceptance, and architectural compliance. |
| AAM-16: stale contributor skills | Accepted. §12 and §15.1 explicitly include internal skills and contributor examples in versioned reconciliation. |

The review's useful implementation trade-offs are also incorporated: prove small
pieces before retaining the facade, bound managed history, measure per-element
overhead, share scheduling time, and prefer semantic close requests. Exact
internal types, allocation strategy, and facade syntax remain stage-0 decisions
with explicit exit criteria. They are not prerequisites that application authors
must invent for themselves.

Focused [source probes](../../plans/gemini-source-audit-2026-09-18/probes.mjs)
reproduced internal dispatch bypass and stale dependency dismissal, and supplied
a synchronous save-result counterexample. Other independently reproduced
foundation defects include nested cancellation scope, cleanup rejection, eager
URL reads, stale debounced writes, and TestStore self-cancellation accounting;
the [completed source audit](../../plans/gemini-source-audit-2026-09-18/README.md)
records their verification boundaries. They motivate targeted foundation gates,
not wholesale acceptance of that audit's unverified candidates. All 1,327 files
now have accepted review coverage; the [coordinator assessment](../../plans/gemini-source-audit-2026-09-18/ASSESSMENT.md)
distinguishes 20 bounded reproductions from the remaining candidates. No proposed managed API, browser lifecycle, emitted type
surface, or fresh-agent success rate is certified by these baseline probes.

## 20. Combined evidence and remediation scope

This document is the live implementation and closure authority for the original
architecture review, Fable review, and coordinator-verified Gemini findings.
The historical reports remain unchanged evidence, not competing status lists.

- [Original design review](application-authoring-and-motion-review.md) supplies the authoring and motion rationale retained in §§3–18.
- [Fable review](../../plans/application-authoring-review-2026-09-18/FABLE-REVIEW.md) supplies 16 architecture findings, resolved in §19 and tracked for delivery in §22.
- [Gemini assessment](../../plans/gemini-source-audit-2026-09-18/ASSESSMENT.md) records 1,327 reviewed files and 316 candidate entries. Twenty distinct defects have bounded coordinator reproductions and are tracked below.
- One additional stale-dismiss defect reproduced while assessing Fable is DEF-021. Internal dispatch bypass is evidence for AAM-01's proposed managed contract, not a second claim that documented legacy dispatch is broken.

Source links below point to repository files; labels retain baseline line numbers
from `dd2caad` for orientation, not permanent locations after edits. Report IDs
and preserved probes retain the original evidence. Priorities are coordinator
triage priorities within the stated verification boundary, not independently
established security severities.

**Closure protocol:** leave each checkbox open until its corrected-behavior
regression fails before the fix and passes afterward, affected package checks
pass, and required browser or installed-consumer qualification is recorded.
Replace “Pending” with commit/PR, test paths, exact commands/results, and the
applicable package version or consumer check. A historical probe that asserts
the defect exists is evidence, not the corrected-behavior regression. Record
implementation closure and npm availability separately. A merged fix must not
be described as published until its released version is verified.

## 21. Confirmed defect register

These 21 entries are accepted remediation work. “Confirmed” means the bounded
failure described in the evidence was reproduced; it does not certify every
consequence asserted by a reviewer. All remain open at consolidation time.

#### DEF-001

- [ ] **Open — P1: Nested batch cancellation loses parent namespace.**

**Source:** [packages/core/src/lib/effect.ts:359](../../packages/core/src/lib/effect.ts)
(`EffectImpl.prefixGroups`, `mapGroups`).
**Finding:** [B007-02](../../plans/gemini-source-audit-2026-09-18/reports/B007.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** Effect transformation; standalone cancellation is the positive control.

**Close when:** Retain the parent namespace through nested batches and action mappings. Test nested and standalone cancellation, sibling isolation, and production/TestStore parity.

**Closure evidence / released version:** Pending.

#### DEF-002

- [ ] **Open — P1: Async subscription cleanup rejection escapes the store.**

**Source:** [packages/core/src/lib/store.svelte.ts:498](../../packages/core/src/lib/store.svelte.ts)
(`createStore`, `executeEffect`).
**Finding:** [B009-02](../../plans/gemini-source-audit-2026-09-18/reports/B009.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** Actual compiled store; observed unhandledRejection.

**Close when:** Observe asynchronous cleanup rejection and run cleanup exactly once for cancellation, replacement, destruction, and cancellation during setup. Assert error reporting without an unhandled rejection.

**Closure evidence / released version:** Pending.

#### DEF-003

- [ ] **Open — P1: Synchronous self-cancellation leaves TestStore pending work.**

**Source:** [packages/core/src/lib/test/test-store.ts:726](../../packages/core/src/lib/test/test-store.ts)
(`TestStore`, `_runExecutor`, `_executeEffect`).
**Finding:** [B010-03](../../plans/gemini-source-audit-2026-09-18/reports/B010.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/test-store-abort.probe.test.ts).
**Evidence boundary:** Group and ID cancellation probes; later-cancellation controls.

**Close when:** Account for synchronous self-cancellation by both ID and group. Assert pending-work exhaustion and finish completion, with later-cancellation controls and matching production traces.

**Closure evidence / released version:** Pending.

#### DEF-004

- [ ] **Open — P2: Tooltip hover exit during entrance is lost.**

**Source:** [packages/core/src/lib/components/ui/tooltip/tooltip.reducer.ts:78](../../packages/core/src/lib/components/ui/tooltip/tooltip.reducer.ts)
(`tooltipReducer`).
**Finding:** [B006-1](../../plans/gemini-source-audit-2026-09-18/reports/B006.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** Reducer action trace; no browser rendering claim.

**Close when:** Preserve the latest hover intent during entrance. Test leave-before-enter-completes and normal leave, including a mounted browser interruption regression; application timers must not be required.

**Closure evidence / released version:** Pending.

#### DEF-005

- [ ] **Open — P1: URL effect construction reads window during reduction and fails under Node/SSR.**

**Source:** [packages/core/src/lib/routing/sync-effect.ts:109](../../packages/core/src/lib/routing/sync-effect.ts)
(`createURLSyncEffect`).
**Finding:** [B009-01](../../plans/gemini-source-audit-2026-09-18/reports/B009.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** Direct helper call without browser globals.

**Close when:** Construct URL effects without reading browser globals. Perform environment access during execution through the routing boundary. Test Node/SSR construction and the supported browser path.

**Closure evidence / released version:** Pending.

#### DEF-006

- [ ] **Open — P1: Reverting to current URL leaves an obsolete pending history write.**

**Source:** [packages/core/src/lib/routing/sync-effect.ts:130](../../packages/core/src/lib/routing/sync-effect.ts)
(`createURLSyncEffect`).
**Finding:** [B009-06](../../plans/gemini-source-audit-2026-09-18/reports/B009.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** Deterministic browser/timer collaborators, not browser history integration.

**Close when:** Invalidate an older debounced write even when the newest state already equals the current URL. Test revert, replacement, traversal, and destruction with controlled time and browser integration.

**Closure evidence / released version:** Pending.

#### DEF-007

- [ ] **Open — P1: Absolute API request URL is joined to the base host.**

**Source:** [packages/core/src/lib/api/pipeline.ts:51](../../packages/core/src/lib/api/pipeline.ts)
(`normalizeURL`).
**Finding:** [B001-01](../../plans/gemini-source-audit-2026-09-18/reports/B001.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Actual URL helper; relative and no-base controls. No network request sent.

**Close when:** Preserve absolute request URLs and their query/fragment while retaining documented relative-base joining. Test public live/mock client parity without sending unintended requests.

**Closure evidence / released version:** Pending.

#### DEF-008

- [ ] **Open — P1: Client table reload replaces dataset total with page length.**

**Source:** [packages/core/src/lib/components/data-table/table.reducer.ts:178](../../packages/core/src/lib/components/data-table/table.reducer.ts)
(`createTableReducer`).
**Finding:** [B002-002](../../plans/gemini-source-audit-2026-09-18/reports/B002.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Actual reducer: 25 records with page size 10 become total 10.

**Close when:** Compute client totals from the filtered dataset before pagination. Test reload, filtering, empty results, and page changes with more than one page of records.

**Closure evidence / released version:** Pending.

#### DEF-009

- [ ] **Open — P1: Server table refresh drops the server-reported total.**

**Source:** [packages/core/src/lib/components/data-table/table.reducer.ts:211](../../packages/core/src/lib/components/data-table/table.reducer.ts)
(`createTableReducer`).
**Finding:** [B002-003](../../plans/gemini-source-audit-2026-09-18/reports/B002.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Actual store and fake fetchData: total 250 becomes 10.

**Close when:** Carry the server-reported total through the response action and reducer independently of page rows. Test a 10-row page with total 250, refresh, and empty pages without fetching the entire dataset.

**Closure evidence / released version:** Pending.

#### DEF-010

- [ ] **Open — P1: Form submit bypasses configured async validation.**

**Source:** [packages/core/src/lib/components/form/form.reducer.ts:325](../../packages/core/src/lib/components/form/form.reducer.ts)
(`createFormReducer`).
**Finding:** [B002-004](../../plans/gemini-source-audit-2026-09-18/reports/B002.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Actual store submits despite validator failure; field-validation control calls the same validator.

**Close when:** Run configured asynchronous submit validation for the submitted snapshot. Test invalid, valid, rejected, canceled, and stale validation; invalid or superseded snapshots must not reach onSubmit. Keep I/O in effects.

**Closure evidence / released version:** Pending.

#### DEF-011

- [ ] **Open — P2: One-slide carousel enters a transition with no index change.**

**Source:** [packages/core/src/lib/components/ui/carousel/Carousel.svelte:97](../../packages/core/src/lib/components/ui/carousel/Carousel.svelte)
(`Carousel`, `carouselReducer`, `handleSlideChange`).
**Finding:** [B004-1](../../plans/gemini-source-audit-2026-09-18/reports/B004.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Store state reproduced; completion suppression checked in view source, not mounted browser.

**Close when:** Avoid an unfinishable transition when navigation cannot change the index. Test zero/one-slide boundaries, both directions, and ordinary multiple-slide navigation in the mounted component.

**Closure evidence / released version:** Pending.

#### DEF-012

- [ ] **Open — P2: Autoplay tick during transition drops the next tick.**

**Source:** [packages/core/src/lib/components/ui/carousel/carousel.reducer.ts:124](../../packages/core/src/lib/components/ui/carousel/carousel.reducer.ts)
(`carouselReducer`, `autoPlayTick`, `autoPlayStarted`, `autoPlayStopped`).
**Finding:** [B004-2](../../plans/gemini-source-audit-2026-09-18/reports/B004.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/probes.mjs).
**Evidence boundary:** Reducer/effect descriptions; actual animation timing not exercised.

**Close when:** Preserve autoplay scheduling across a tick that overlaps a transition. Test eventual progress, pause/resume, interruption, and destruction with no duplicate timer chains or consumer scheduling workaround.

**Closure evidence / released version:** Pending.

#### DEF-013

- [ ] **Open — P1: New MFA challenge retains previous success status and session.**

**Source:** [packages/auth/src/lib/flows/mfa-challenge/reducer.ts:145](../../packages/auth/src/lib/flows/mfa-challenge/reducer.ts)
(`mfaChallengeReducer`, `MfaChallengeState`, `challengeProvided`, `CHALLENGE_EFFECT_ID`).
**Finding:** [B041-1](../../plans/gemini-source-audit-2026-09-18/reports/B041.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual reducer. Client lifecycle defect; no server-side authorization bypass established.

**Close when:** Reset prior success/session and attempt-local input/errors when a new challenge arrives. Invalidate old verification results and test pending replacement and method changes. This closes client lifecycle behavior, not a server authorization claim.

**Closure evidence / released version:** Pending.

#### DEF-014

- [ ] **Open — P1: Concurrent chat streams append stale chunks to the current reply.**

**Source:** [packages/chat/src/lib/streaming-chat/reducer.ts:304](../../packages/chat/src/lib/streaming-chat/reducer.ts)
(`streamingChatReducer`, `chunkReceived`, `canSendMessage`, `ActionButtons`, `ContextMenu`).
**Finding:** [B049-01](../../plans/gemini-source-audit-2026-09-18/reports/B049.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual store and controlled transport callbacks. First chunk clears waiting state; no real backend.

**Close when:** Define and enforce stream concurrency policy and correlate every chunk, failure, and completion with its operation. Test a second send after the first chunk and late old callbacks; stop obsolete transport work.

**Closure evidence / released version:** Pending.

#### DEF-015

- [ ] **Open — P1: Clearing chat leaves old callbacks able to corrupt a new conversation.**

**Source:** [packages/chat/src/lib/streaming-chat/reducer.ts:817](../../packages/chat/src/lib/streaming-chat/reducer.ts)
(`streamingChatReducer`, `clearMessages`, `restoreMessages`).
**Finding:** [B049-02](../../plans/gemini-source-audit-2026-09-18/reports/B049.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual store; late old chunk and completion affect new reply. Clear branch reproduced; restore branch remains source-based.

**Close when:** Invalidate and release old streams on clear and restore. Test both branches separately, then new-send plus late old chunk/completion, stop, and destruction. Clear is reproduced; restore requires its own regression.

**Closure evidence / released version:** Pending.

#### DEF-016

- [ ] **Open — P2: Post-disposal interval remains live and untracked.**

**Source:** [packages/chat/src/lib/streaming-chat/cleanup-tracker.ts:82](../../packages/chat/src/lib/streaming-chat/cleanup-tracker.ts)
().
**Finding:** [B048-4](../../plans/gemini-source-audit-2026-09-18/reports/B048.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual CleanupTracker with fake interval registry; normal-disposal control.

**Close when:** Prevent post-disposal resource allocation from leaving a live interval. Test allocation after disposal, normal cleanup, and repeated disposal with an observable timer registry.

**Closure evidence / released version:** Pending.

#### DEF-017

- [ ] **Open — P2: Histogram binning drops the maximum value.**

**Source:** [packages/charts/src/lib/utils/data-transforms.ts:250](../../packages/charts/src/lib/utils/data-transforms.ts)
().
**Finding:** [B046-2](../../plans/gemini-source-audit-2026-09-18/reports/B046.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual D3-backed transformation; constant-valued input loses every record.

**Close when:** Include the maximum endpoint in the final histogram bin. Test distinct and constant values, empty input, declared invalid-value behavior, and consistency between bins and returned metadata.

**Closure evidence / released version:** Pending.

#### DEF-018

- [ ] **Open — P2: Incoming heartbeat frame never updates peer lastSeen.**

**Source:** [packages/chat/src/lib/streaming-chat/collaborative-reducer.ts:104](../../packages/chat/src/lib/streaming-chat/collaborative-reducer.ts)
().
**Finding:** [B048-1](../../plans/gemini-source-audit-2026-09-18/reports/B048.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual socket subscription callback; direct heartbeat action works. No automatic offline-transition failure established.

**Close when:** Handle heartbeat frames through the actual socket subscription bridge. Test lastSeen updates with controlled time and preserve other frame behavior. Do not expand the claim to an unproven automatic offline transition.

**Closure evidence / released version:** Pending.

#### DEF-019

- [ ] **Open — P1: Save completion clears dirty status for newer code edits and blocks the next save.**

**Source:** [packages/code/src/lib/code-editor/code-editor.reducer.ts:150](../../packages/code/src/lib/code-editor/code-editor.reducer.ts)
().
**Finding:** [B051-4](../../plans/gemini-source-audit-2026-09-18/reports/B051.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual store and controlled pending save; stored/current versions differ but dirty flag is false.

**Close when:** Correlate save results with the saved content/version. Saving A must not clear dirty status for newer B or block its next save. Test overlapping saves under the declared policy and failures; client correlation alone cannot order external backend writes.

**Closure evidence / released version:** Pending.

#### DEF-020

- [ ] **Open — P1: Deactivated voice input retains a stale device and cannot record again through normal activation.**

**Source:** [packages/media/src/lib/voice-input/reducer.ts:621](../../packages/media/src/lib/voice-input/reducer.ts)
(`voiceInputReducer`, `deactivateVoiceInput`, `activateConversationMode`, `startPushToTalkRecording`).
**Finding:** [B059-01](../../plans/gemini-source-audit-2026-09-18/reports/B059.json).
**Reproduction:** [probe](../../plans/gemini-source-audit-2026-09-18/resumption/satellite-probes.mjs).
**Evidence boundary:** Actual reducer/store with a device fake matching inspected AudioManager cleanup/start contract. No real microphone or browser codec exercised.

**Close when:** Separate granted permission from a currently live device. Reacquire after deactivation and dispose owned subscriptions/resources. Test activate-record-deactivate-reactivate using the actual adapter boundary, plus browser qualification for supported recording capabilities.

**Closure evidence / released version:** Pending.

#### DEF-021

- [ ] **Open — P1: delayed cleanup dismisses a replacement presentation.**

**Source:** [dismiss-dependency.ts:145](../../packages/core/src/lib/navigation/dismiss-dependency.ts),
`createDismissDependencyWithCleanup`, including the await at baseline line 156.
**Finding:** [Fable AAM-03](../../plans/application-authoring-review-2026-09-18/FABLE-REVIEW.md).
**Reproduction:** [actual-store stale-dismiss probe](../../plans/gemini-source-audit-2026-09-18/probes.mjs).
**Evidence boundary:** cleanup for an old presentation resumes after replacement
and dispatches dismissal into the parent; arbitrary external work was not canceled.

**Close when:** bind delayed dismiss to the originating instance; never resolve
its identity from the current occupant on completion. Test that the old callback
is inert, the live callback works, and cleanup rejection is observed. Provide a
compatible framework-owned scoped handle rather than requiring application
counters. This defect is one part of [AAM-03](#aam-03), not its complete closure.

**Closure evidence / released version:** Pending.

## 22. Architecture delivery checklist

The AAM IDs retain Fable's identifiers and the resolutions in §19. Every item
below is open implementation work even though its design recommendation has been
accepted. The [original report](../../plans/application-authoring-review-2026-09-18/FABLE-REVIEW.md)
contains the source anchors and counterexamples for each ID. §§3–18 and their
stage gates remain the complete contract, including original-review requirements
that overlap these findings; this checklist does not replace them.

#### AAM-01

- [ ] **Open — Store-wide dispatch ordering.**

**Contract and delivery gate:** §4.2; stage 0a.

**Close when:** Prove the managed FIFO contract across public, synchronous effect, subscription, and reentrant dispatch paths. Preserve explicitly documented legacy defaults and run mutation-verified ordering traces.

**Closure evidence / released version:** Pending.

#### AAM-02

- [ ] **Open — Originating effect ownership.**

**Contract and delivery gate:** §4.3; stages 0a and 2.

**Close when:** Capture instance identity before effect lifting/registration, filter removed-child work before start, and prove that replacement cannot give stale work a new epoch.

**Closure evidence / released version:** Pending.

#### AAM-03

- [ ] **Open — Fire-and-forget and dependency callback lifetime.**

**Contract and delivery gate:** §4.3; stages 0a and 2.

**Close when:** Enforce pre-start eligibility and instance-checked managed dependency callbacks, including DEF-021. Test late callbacks and document cooperative limits on already-started native/external work.

**Closure evidence / released version:** Pending.

#### AAM-04

- [ ] **Open — Production and TestStore semantic parity.**

**Contract and delivery gate:** §4.4; stage 0a.

**Close when:** Qualify both executors with shared semantic traces and mutation controls, even if mechanisms are shared. Include DEF-001–003; passing only the production executor is insufficient.

**Closure evidence / released version:** Pending.

#### AAM-05

- [ ] **Open — Save-and-close ownership.**

**Contract and delivery gate:** §7.1; stage 2 and migration.

**Close when:** Test same-reduction removal separately from later dismissal, including synchronous save results and late callbacks. Give surviving work a parent owner and document limits on external write cancellation.

**Closure evidence / released version:** Pending.

#### AAM-06

- [ ] **Open — One document dismissal authority.**

**Contract and delivery gate:** §7.4; stage 2.

**Close when:** Qualify nested legacy/managed overlays with topmost-only semantic dismissal, veto, event deduplication, and preserved behavior in both paths.

**Closure evidence / released version:** Pending.

#### AAM-07

- [ ] **Open — Registration before browser attachment.**

**Contract and delivery gate:** §4.1; stages 0b and 2.

**Close when:** Prove registry initialization and once-only initial reconciliation in a real Svelte rendering spike, including SSR/hydration and dynamic registration. Do not rely on assumed mount ordering.

**Closure evidence / released version:** Pending.

#### AAM-08

- [ ] **Open — Typed slot linkage.**

**Contract and delivery gate:** §4.1 and §16; stages 0b and 6.

**Close when:** Ship positive and negative emitted-declaration fixtures for keys, nested inference, and mismatched configuration. Prove dynamic configuration is registered before attachment; provisional syntax is not a gate result.

**Closure evidence / released version:** Pending.

#### AAM-09

- [ ] **Open — Compatible narrow feature facade.**

**Contract and delivery gate:** §4.2; stages 0b and 6.

**Close when:** Compile and run supported scopeTo and DestinationRouter usage through narrow interfaces without exposing destruction authority or inventing history. Retain the facade only if the spike meets its gates.

**Closure evidence / released version:** Pending.

#### AAM-10

- [ ] **Open — Sole property writer and headless handoff.**

**Contract and delivery gate:** §5.3–5.4; stages 0b and 2–4.

**Close when:** Prove stable SSR projection, hydration handoff, and one writer during property leases. Test interruption and latest-authority cleanup across inline/native styles and managed headless adapters.

**Closure evidence / released version:** Pending.

#### AAM-11

- [ ] **Open — Collection instance identity.**

**Contract and delivery gate:** §7.1; stage 2.

**Close when:** Test remove/re-add and explicit replacement with reused keys; invalidate old work while preserving identity for ordinary edits and reordering.

**Closure evidence / released version:** Pending.

#### AAM-12

- [ ] **Open — Motion-free import boundary.**

**Contract and delivery gate:** §10; stages 0b and 6.

**Close when:** Measure emitted import graphs and bundles for store-only, managed-without-motion, ordinary motion, and custom motion consumers. Keep renderer/motion dependencies outside the promised core boundary.

**Closure evidence / released version:** Pending.

#### AAM-13

- [ ] **Open — Immediate feedback and legacy frame actions.**

**Contract and delivery gate:** §5.1 and §12; stages 3 and 7.

**Close when:** Keep semantic feedback immediate and playback bookkeeping outside feature state. Qualify the documented exceptions and migrate legacy chart behavior explicitly before claiming it conforms.

**Closure evidence / released version:** Pending.

#### AAM-14

- [ ] **Open — Preference changes and history rebasing.**

**Contract and delivery gate:** §5.5 and §8.2; stages 1, 2 and 4.

**Close when:** Test old-run supersession and new skipped outcomes, declared fragment codec/event policy, event deduplication, and repeated known/unknown history rebasing under the supported browser matrix.

**Closure evidence / released version:** Pending.

#### AAM-15

- [ ] **Open — Fresh-agent functional and architectural qualification.**

**Contract and delivery gate:** §14.3; stage 6.

**Close when:** Run isolated package-only construction and held-out modification with type checks, functional acceptance, production build, and externally controlled architecture checks. Record violations, repair attempts, and human interventions.

**Closure evidence / released version:** Pending.

#### AAM-16

- [ ] **Open — Versioned contributor and consumer guidance.**

**Contract and delivery gate:** §12 and §15.1; stage 6.

**Close when:** Reconcile CLAUDE guidance, internal skills, consumer instructions, and published examples with actual APIs. Compile examples against the same release and remove stale competing instructions.

**Closure evidence / released version:** Pending.

## 23. Candidate triage and review dispositions

The [complete finding index](../../plans/gemini-source-audit-2026-09-18/FINDINGS-INDEX.md)
and [machine-readable findings](../../plans/gemini-source-audit-2026-09-18/FINDINGS.json)
retain all 316 original entries, severity labels, source locations, and report
links. Full file coverage means each assigned file was reviewed; it does not mean
all defects were found or all candidate claims were proven.

Promote a candidate into a new stable DEF entry only after identifying the
supported contract, proving a concrete failure, bounding its consequences, and
specifying the corrected-behavior regression. Keep the original reviewer ID as
an alias. Record rejected, deferred, improvement-only, and duplicate dispositions
with reasons and evidence. Duplicate entries close through their canonical
tracker; they must not inflate the number of independently confirmed defects.
Deferred work remains open, with release scope and rationale recorded.

The [coordinator dispositions](../../plans/gemini-source-audit-2026-09-18/COORDINATOR-ASSESSMENT.json)
preserve these established distinctions:

| Candidate | Disposition |
| --- | --- |
| B017-1, B018-04 | Duplicates of B009-01 / DEF-005. |
| B011-04 | Duplicate candidate of B010-05; still requires verification. |
| B005-10 | Duplicate candidate of B013-01; documented action-object behavior must be distinguished from a misleading factory-based test. |
| B020-2 | Duplicate candidate of B021-3; still requires verification. |
| AUTH-B044-002 | Duplicate candidate of B039-02; still requires verification. |
| B045-1, B043-2, B043-3 | Coverage improvements without a demonstrated runtime failure. |
| B046-7 | Unused-calculation housekeeping, not a demonstrated selection failure. |
| B051-8 | Explicit configuration is a valid typed API choice absent a documented zero-argument promise. |
| B051-7 | Evaluate missing assertions and timing assumptions; using createStore in integration tests is not itself a violation. |
| B058-2 | The blanket current-Safari codec claim is not accepted. Test capability detection against the supported matrix; see the assessment's primary-source correction. |

The narrower MFA, heartbeat, chat-restore, carousel, and voice-input verification
boundaries are retained directly in §21. Their broader reviewer wording must not
silently become an accepted security, browser, or rendering guarantee.

During implementation, update this document's live entries and attach new test
or issue/PR links here. Preserve the original Fable report, Gemini reports, read
receipts, and baseline reproductions as historical evidence. Neither editing the
specification nor checking off a design resolution constitutes a runtime fix.
