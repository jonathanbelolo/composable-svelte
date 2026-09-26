# Public Reference Gaps and Ambiguities Report

**Application**: Brief B - Authenticated Account Dashboard  
**Packages Analyzed**:
- `@composable-svelte/core` (0.13.1)
- `@composable-svelte/auth` (0.3.0)
- `@composable-svelte/charts` (0.3.0)
- `svelte` (5.55.3)

This document records the exact missing, ambiguous, or under-documented areas discovered while authoring an authenticated dashboard using only public package artifacts and their shipped documentation.

---

### Gap 1: `ManagedIntegrationBuilder` Dependency Invariance Across Composed Child Features

- **Observed Behavior**:
  `ManagedIntegrationBuilder<S, A, D>` enforces strict type invariance on `D`. When integrating a package-owned feature like `auth.composition` (whose dependency type is `AuthFeatureDependencies`), calling `.with(authSlot, auth.composition)` on a builder initialized with an extended dependency interface (e.g., `interface AppDependencies extends AuthFeatureDependencies { fetchAccount: ... }`) causes TypeScript compiler error `TS2345: Type 'ManagedComposition<AuthFeatureState, ...>' is not assignable to type 'ManagedComposition<AuthFeatureState, ...>'`.
- **Public Reference Status**:
  The shipped documentation in `@composable-svelte/core/docs/` demonstrates composing basic stores with empty `{}` or standalone dependency records. It does not document the typing strategy when composing a pre-packaged feature that already declares concrete required dependencies (`AuthFeatureDependencies`).
- **Resolution**:
  The application modeled `AppDependencies` directly around `AuthFeatureDependencies` by declaring `fetchAccount` as part of `AuthFeatureDependencies` or parameterizing `ManagedIntegrationBuilder` with `AuthFeatureDependencies` directly. A clearer guideline or type variance helper in core docs would eliminate trial-and-error.

---

### Gap 2: `FeatureViews` Mandatory Outlet Placement Invariant

- **Observed Behavior**:
  `FeatureViews` enforces that every declared non-headless view in `defineViews` must have a corresponding `<FeatureOutlet>` registered during component mount. If an author writes conventional Svelte conditional rendering like:
  ```svelte
  {#if isAuth && state.chart}
    <FeatureOutlet view={views.chart} />
  {/if}
  ```
  `placement.svelte.js` throws an unhandled runtime error: `Missing FeatureOutlet placement for 'chart'`.
- **Public Reference Status**:
  Shipped documentation does not highlight that `FeatureOutlet` must be mounted **unconditionally** in the layout, and that when a slot's state is `null` (e.g. `chart: null` before login), `FeatureOutlet` safely renders empty content without throwing or leaking.
- **Resolution**:
  The layout unconditionally mounts `<FeatureOutlet view={views.chart} />` (or controls its visibility via container class / CSS), satisfying the placement registry while preserving route segregation.

---

### Gap 3: Form-Backed Auth Flow Submission Contract in Tests

- **Observed Behavior**:
  Auth flows (`LoginForm`, `ChangePasswordForm`, `MfaChallengeForm`) do not expose top-level intent actions such as `loginRequested` or `submitPassword`. Instead, they are form-first reducers driven by `@composable-svelte/core/components/form` actions:
  `{ type: 'form', action: { type: 'fieldChanged', field: ..., value: ... } }` followed by `{ type: 'form', action: { type: 'submitTriggered' } }`.
- **Public Reference Status**:
  `@composable-svelte/auth` documentation describes the high-level flow lifecycle and outcomes (`handoff`, `changePasswordOutcome`), but does not document how to construct actions for headless testing in `TestStore`. Furthermore, with `TestStore` default `exhaustivity: 'on'`, intermediate form actions (`formValidationStarted`, `formValidationCompleted`, `submissionStarted`, `submissionSucceeded`) cause exhaustiveness check failures unless `store.exhaustivity = 'off'` is set.
- **Resolution**:
  Documented the exact action structure for form submission in application tests and set `store.exhaustivity = 'off'` when asserting high-level domain transitions.

---

### Gap 4: `defineApplication` Opaque Token vs. State Factory Export

- **Observed Behavior**:
  `defineApplication` produces an opaque branded token `ApplicationDefinition<S, A, D, I, Routed>` intended for `<ApplicationRoot definition={...} />`. The options passed to `defineApplication` (such as `initialState`) are stored in an internal WeakMap and are not public properties of the returned object.
- **Public Reference Status**:
  Tutorials and examples show `defineApplication` being passed to `<ApplicationRoot>`, but lack guidance on how external test suites or custom SSR runners should generate initial state.
- **Resolution**:
  The application exports `createInitialAppState(input?: ApplicationInitialInput): AppState` as a standalone named function and passes it to `defineApplication`, allowing both runtime mounting and testing to share the identical initial state factory.

---

## Independent review assessment of these gaps (2026-09-26)

- **Gap 1: confirmed** with a minimal compile check
  (`review-receipts/gap-check/deps-variance.ts`, `tsc` exit 2, TS2769): composing
  `auth.composition` into a builder whose dependency type *extends*
  `AuthFeatureDependencies` fails, because `ManagedComposition` is invariant in its
  dependency type. Practical consequence in this app: the chart rows cannot come from an
  injected activity service without widening Auth's dependency type, so they are synthesized
  locally (`buildActivityMetrics`). This is a core/auth typing or reference gap (owning scope:
  core `ManagedIntegrationBuilder` variance, or documentation of the supported pattern).
- **Gap 2: partly a misreading.** `core/docs/application-views.md` states: "Place each
  rendered slot handle in exactly one outlet … Required outlets cannot simply be omitted
  while their layout remains active." The author's workaround was still conditional and
  crashed the real browser (review R1). The **remaining genuine gap** is detectability:
  placement is validated only at client attachment, so TestStore, `svelte-check` and SSR all
  pass while the browser fails. The reference could say so and recommend a browser smoke test.
- **Gap 3: valid, minor.** Managed form-action construction for headless tests is not shown
  in the Auth README; the shipped consumer proves forms only through the browser.
- **Gap 4: low.** Exporting the initial-state factory is a reasonable, documented-compatible
  approach.
- **New gap G5 (minor):** "Where the user goes next is the containing application's
  decision" and "A flow opened after [logout] is new intent and stays live" appear only in
  `auth/dist/application/feature.js` comments. The README's managed sign-in section does not
  state that session `logout` (and a refused handoff) clears the login flow, so a parent that
  shows a sign-in route must reopen it (review R3).

## r6 status (2026-09-26)

- **Gap 1: resolved in the reviewed r6 Core.** The resolution is type-only: `ManagedComposition.reduce`
  and `ManagedReductionAdapter` are generic over `Supplied extends D`. It is documented in
  `core/docs/consumer.md` and the Auth README.
  - Positive probe: `review-receipts/r6-refresh/final/gap-superset-positive.*`, exit 0.
  - Negative probe: `gap-superset-negative.*`, exit 0. A parent lacking Auth services, and a store missing
    the extra service, are both still rejected, as `@ts-expect-error` confirms.
  - The app now uses an injected `fetchActivity`.
- **G5: resolved in the r6 Auth README.** Its "After sign-out" section documents that the parent must
  dispatch `openLogin`, and that doing so is safe.
