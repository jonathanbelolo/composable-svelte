# Application authoring contract

**Read this first when building or changing an application, including with an AI agent.** Applications describe content, presentation and business rules. Composable Svelte supplies the machinery that executes and coordinates them.

This is the normative application-authoring policy for the core 0.13 API. It takes precedence over lower-level tutorials when choosing application architecture; it does not add capabilities to the installed version. Read the matching [release scope](./prerelease.md). Use installed package documentation and public exports; a library checkout or private agent skill is unnecessary.

## Responsibility boundary

| Application authors supply | Framework mechanisms own |
| --- | --- |
| State, typed actions, pure business decisions | Store execution and composed child ownership |
| Effect intents and injected service implementations | Effect execution, managed cancellation and retirement |
| Markup, styling, content, view declarations | Scoped view binding and presentation authority |
| Pure route decisions and initial request data | Managed browser history attachment and reconciliation |
| Motion states, recipes and target bindings | Managed playback, reduced motion and target cleanup |

Injected service implementations may perform I/O. Reducers must remain pure and immutable: return next state and effects, with business-relevant results and failures represented by actions. Use the documented effect cancellation policies; injection alone does not make an operation cancellable. An injected operation must honor cancellation where its underlying API supports it. Keep asynchronous work in the executor's returned promise; independently continuing callback sources belong in subscription effects with cleanup. See [managed execution](./managed-execution.md).

## Required application path

1. **Own the application declaratively.** Define it with `defineApplication`; use `ApplicationRoot` to create and retire the instance and `ApplicationHost` to attach managed services. Descendants use the Root's snippet value or `useApplication(definition)`. Do not recreate stores or lifecycle cleanup inside each feature. See [ownership](./application-ownership.md).
2. **Compose features through managed ownership.** When there are child features, register typed slots with `ManagedIntegrationBuilder`. Use `defineViews`, `FeatureViews` and `FeatureOutlet` to declare and place their views; keep ordinary markup and stateless components simple. The optional framework-supplied `surface` registers an HTML element for presentation capture; omitting it deliberately skips capture. Follow [views](./application-views.md). Do not duplicate child state or implement a second feature-lifetime coordinator.
3. **Keep business behavior in reducers and effects.** Views render reactive state and dispatch user intent. Inject clocks, transport and other external services. Use local Svelte state for genuinely local visual details; do not mirror business state or start a competing asynchronous workflow in `$effect` or `onMount`.
4. **Use genuine presentation views.** Obtain them from managed view bindings or typed `scopeTo(app.store, slot)`. Never fabricate `{ state, dispatch, dismiss }`, cast a raw store into a presentation view, or reconstruct child self-dismissal with an unscoped parent dispatch. A parent may remove a child as a business decision, retiring its owner. Declare lifetime replacement through the slot's `replaceOn` policy; an ordinary immutable child update preserves ownership. Child dismissal and visual completion use the captured view. Legacy read/dispatch scopes do not grant dismissal authority. See [dismissal](./navigation/dismiss.md).
5. **Declare routing and motion when needed.** Follow [routing](./application-routing.md) and [motion](./application-motion.md). Do not add a competing history writer, duplicate a framework overlay's documented focus coordination, or replace its completion callback with guessed timing. Custom markup remains responsible for its own accessibility. Browser SPA routing is the supported managed path; SvelteKit navigation coordination is not implied. Do not run competing history writers.

The [consumer guide](./consumer.md) covers setup and testing. Copy the bundled [managed starter](../consumer/README.md) for a minimal route-free application, then use the ownership, views and routing examples above as features require them. Isolated `createStore` tutorials teach lower-level primitives; they do not override this contract.

## Native commands from child views

When a feature component wraps a native editor, media element or canvas, it may
need to turn a reduced child action into a local imperative call. Pass the
genuine `FeatureViewProps.store`, `composition.bind` result or typed `scopeTo`
view to `observeChildActions` from `@composable-svelte/core/application`.
The observer sees only actions reduced by that exact owner, in the child's
action type, after state subscribers and root action subscribers. A nested
parent and its leaf have separate domains. An action dispatched by an observer
starts a later turn.

The [compiled dual-path example](./examples/agent-patterns/src/native-commands.ts)
uses `isManagedChildView` to distinguish a genuine managed view from a standalone
`Store`. Standalone stores may offer `subscribeToActions`; the hook is optional,
so a missing hook should warn while ordinary state rendering continues. Passing
a wrapper, an `ApplicationStore` projection or a view from a second copy of core
does not create managed authority. `observeChildActions` rejects such a value
with a `TypeError` and guidance; `isManagedChildView` returns false.

Attach the observer when the native engine is ready and return its cleanup on
unmount or store replacement. No command is buffered: dispatch before
attachment drops it. A listener attached during a turn starts with the next
committed turn. Removal, replacement or root destruction retires the owner and
silently stops delivery; even an action that retires its own owner is not
delivered. Reconfigure durable native state from the child state, so a missed
one-shot command does not become an invisible configuration dependency.

Use this observer for native commands such as focus, selection or seek. Route
business results and failures through the parent reducer, which sees the
child's routed action and can update application state or return an effect.
An observer attached to a component is not a durable business handoff.

## Examples and counterexamples

| Requirement | Conforming approach | Architectural violation |
| --- | --- | --- |
| Load a record | Dispatch intent; reducer returns an effect using an injected client; result action updates state | Fetch in a component effect and maintain a second copy of feature state |
| Open a dialog | Set the composed child state and render its genuine presentation view | Subscribe to a store to synchronize a separate dialog controller |
| Change pages | Dispatch navigation intent and declare pure route decisions | Handwrite `popstate` listeners and history writes in application features |
| Animate a panel or several modules | Declare a supported single-target or grouped motion recipe under the Host | Manage playback timers and detached-element cleanup in each view |

Moving a violation into `useWorkspaceSetup()`, `helpers/` or `adapters/` does not change its responsibility.

## Custom integrations and current exceptions

Custom motion can be a page-level composition or a small element detail. Start with `useMotion` or `useMotionGroup` from `@composable-svelte/core/application/motion`. Local visual state, normal DOM event handlers, CSS styling and Svelte rendering are permitted; there is no blanket ban on lifecycle hooks. The question is whether code introduces independent ownership of a framework responsibility.

For managed motion, use recipes rather than direct `svelte/transition`, `svelte/animate`, `svelte/motion`, transition/animate directives, frame loops, Web Animations or View Transitions. If a recipe cannot express the requirement, report the missing capability. Ordinary CSS transitions and animations remain permitted, provided they do not compete with managed playback for the same property or substitute for presentation lifecycle coordination.

The intended framework supplies common motion and contains custom rendering algorithms behind managed extension points. Today, authored recipes support declared properties and fixed target sets; there is **no public custom motion-driver extension or shared-layout transition system**, and automatic presentation animation remains incomplete. Do not infer those capabilities from this contract.

For explicit animated dismissal, follow the complete [managed presentation example](./application-presentation.md) and [deferred dismissal protocol](./navigation/dismiss.md#explicit-animated-exits): opt the slot into deferred dismissal, retain the current child during exit, tolerate repeated requests, and dispatch a distinct completion action through its captured child view. The parent handles that routed action to clear the slot. Completion comes from the presentation component's callback, not `useMotion` or `useMotionGroup`, which expose no completion API. Deferred dismissal does not select or run an animation; the documented explicit `PresentationState` bridge remains a compatibility exception. Do not use a second dismiss request as completion or revive a child from a presentation snapshot.

A low-level integration is acceptable only through an explicitly documented public extension point whose contract states ownership and cleanup, with those obligations satisfied. Keep it in one focused integration module, expose a small typed interface, and test teardown, interruption and replacement where applicable. A directory name or wrapper is not an exemption. If the installed API cannot express the integration, report a capability gap; do not invent an undocumented driver or claim that ad hoc plumbing conforms.

## Agent workflow and acceptance

Before coding, identify the installed version, read this contract and the relevant linked guides, and map requirements to supported capabilities. Use public export paths and their declarations. For this core release, respect the companion-package compatibility limits; do not force incompatible peer dependencies.

The optional development-only `@composable-svelte/architecture` CLI checks five
bounded families: manual routing authority, subscription-driven presentation
orchestration, impure reducer decisions, unowned infrastructure, and competing
motion playback. Its bundled-policy command is author feedback, not release
qualification. Manual source review remains mandatory, including genuine
presentation authority and least-authority boundaries. Read the installed
`node_modules/@composable-svelte/architecture/README.md` for the analysis command,
limits, and externally controlled qualification guidance.

When blocked by a capability gap, describe the required behavior, the documented APIs considered, the missing ownership or lifecycle guarantee, and the smallest proposed framework extension or explicitly agreed temporary deviation. Continue independent supported work. Do not silently implement the substitute or broaden an exception.

Before declaring completion:

- Run application type/Svelte checks, relevant tests and a production build. Use `createTestStore` from `@composable-svelte/core/test` with managed execution for managed behavior: use the composition's reducer and execution configuration when testing composed features, or `execution: { mode: 'managed' }` for a standalone reducer. The TestStore default is legacy mode. Assert emitted actions, explicitly advance test time where needed, cancel long-lived subscriptions, and await `finish()`.
- TestStore establishes reducer/effect behavior. Use rendered component/browser tests for Host attachment, routing, focus, motion, reduced motion and teardown. Lifetime tests must use genuine framework-bound views and the real composition; do not fabricate authority or replace owner-bound dispatch with a parent-dispatch mock. Ordinary stateless-view unit tests may still use data stubs.
- Bind a raw composed store with `composition.bind(store, slot)`; `scopeTo(app.store, slot)` requires the typed application projection. For browser motion tests, keep native animation time intact; control business time through injected dependencies. See [testing](./core-concepts/testing.md#testing-time-based-effects) for the clock boundary.
- For deferred exits, verify retained ownership through repeated requests, distinct captured-view completion, stale completion after declared replacement, and retirement on parent removal. Test SSR isolation when SSR is used.
- Review architecture separately: no duplicated business state, fabricated presentation authority, unmanaged orchestration, or hidden infrastructure moved behind a helper.
- Report remaining gaps and deviations explicitly. Do not weaken checks or relabel feature code as infrastructure to obtain a pass.

Passing functional tests does not establish architectural compliance. This contract is a review standard; it does not claim that automated enforcement or unfamiliar-agent qualification is complete.
