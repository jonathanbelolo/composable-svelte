# Dependency-extension (AppB Gap 1) and G5 assessment

- **Assessor:** Claude Opus 5.5 (`claude-opus-5-5`), running a bounded assessment through the user-authorized Claude CLI. Date: 2026-09-26.
- **Scope:**
  - The candidate `/private/tmp/companion-runtime-release/candidate` was read only.
  - Nothing was edited, repacked, committed, pushed or published.
  - No runtime or archive changes were made.
  - All experiments ran in `/private/tmp/companion-runtime-release/scratch-dependency-extension/`.
- **Applicable AGENTS:** `candidate/packages/core/consumer/AGENTS.md`. It points to the contract, forbids inventing APIs or weakening checks, and requires public exports. It was honored: no casts, no `any`/`unknown` escapes, and no policy widening in any reproducer or prototype.
- **Archives under test:** the exact installed archives in `/private/tmp/composable-final-authoring/app-b/node_modules`:
  - core 0.13.1, sha256 `30e044e1…d18b`
  - auth 0.3.0, sha256 `ac13e9a8…6e62`
  - These are byte-identical to `archives-r4/`, and `archives-r5-chat/MANIFEST.json` references them unchanged. They are therefore the current release candidate's core and auth.
  - Toolchain: TypeScript 5.9.3, `strict`.

## Verdict

| Item | Finding | Owning scope | Release |
|---|---|---|---|
| Gap 1 | **Confirmed.** Public typing truly blocks it, and no legitimate typed workaround exists. It is a core generic-variance defect, not an Auth defect. | **core** (`ManagedReductionAdapter` / `ManagedComposition.reduce`) | **Block.** A minimal, type-only fix is prototyped, compiled and shown sound (see below). |
| G5 | **Confirmed documentation gap.** The semantics are correct and intentional, but they appear only in source and dist comments. | **auth README** (docs only) | **Does not block alone.** Fix it in the same repack if core is repacked. |

## Gap 1: parent dependencies that are a superset of `AuthFeatureDependencies`

### Root cause (exact public signatures)

The installed `core/dist/types.d.ts` defines the managed reduction seam as follows.

- **Lines 212–218:**

  ```ts
  export interface ManagedReductionInput<State, Action, Dependencies> {
      readonly dependencies: Dependencies;                         // D in parameter position
      readonly reducer: Reducer<State, Action, Dependencies>;      // D in a parameter of a parameter
      ... }
  ```

- **Line 230:**

  ```ts
  export type ManagedReductionAdapter<State, Action, Dependencies> = (input: ManagedReductionInput<State, Action, Dependencies>) => …;
  ```

- **Line 241:** `readonly _reduce?: ManagedReductionAdapter<State, Action, Dependencies>` inside `StoreExecutionConfig`.
- **Source:** `core/src/lib/types.ts:201-207`, `:218-221` and `:233`.

`ManagedComposition<S, A, D>` exposes this seam publicly.

- The declaration is `readonly execution: StoreExecutionConfig<S, A, D>`, at `core/dist/navigation/managed-integration.d.ts:226` and in source at `managed-integration.ts:355`.
- `_reduce` is a function-typed *property*, so `strictFunctionTypes` applies. Its `input.dependencies` makes `D` contravariant, and `input.reducer` makes `D` covariant. **`D` is therefore invariant.**
- The other occurrences of `D` do not cause the invariance:
  - `reducer: Reducer<S, A, D>` and `_initial` are contravariant.
  - `reduce` and `initial` are methods, so their parameters are compared bivariantly.
- The compiler names this exact path: `The types of 'execution._reduce' are incompatible … Types of property 'reducer' are incompatible`.

`ManagedIntegrationBuilder<S, A, D>.with(slot, child: Reducer<C, CA, D> | ManagedComposition<C, CA, D, CC>)` fixes `D` from the parent (`managed-integration.ts:478`, dist `:241+`).

- A **plain reducer** child with narrower dependencies is accepted, by ordinary function contravariance. Auth itself relies on this: `feature.ts:929` builds its composition from `Reducer<…, LoginDependencies>` and similar reducers under `AuthFeatureDependencies`.
- A **`ManagedComposition`** child must have exactly the parent's `D`.

### The invariance is a typing artifact, not a runtime requirement

Runtime behavior (`managed-integration.ts`):

- **Nested use:** a nested composition is only ever called as `composed.reduce(value, routed.action, deps, ctx)` and `composed.initial(value, deps, …)` (optional slots `:540`, `:566`; keyed slots `:613`, `:644`). Both receive the parent's dependency object, which is a superset, and read only the members they declare.
- **Root use:** the `reducer` field of the `_reduce` input is used only when that composition is the store root (`:362-372`, `turn-queue.ts:429`), where it is the store's own reducer at the store's own dependency type.

No path ever hands a child's `D` to a parent reducer, so treating `D` as contravariant is sound.

### Compile evidence against the installed archives

Everything below is under `scratch-dependency-extension/`, and every run has saved `tsc.stdout` and `tsc.exit` files.

**Baseline (`repro/`, node_modules linked read-only to the installed app-b tree): exit 2.**

| File | What it tests | Result |
|---|---|---|
| `r1-auth-extended.ts` | The AppB shape: `interface ExtendedDeps extends AuthFeatureDependencies { fetchActivity… }`, then `.with(slot, auth.composition)` | **TS2769** |
| `r2-core-only.ts` | **No Auth at all.** A core child composition with deps `{now}` nested under parent deps `{now, fetchRows}` | **TS2769**, same `execution._reduce` chain. This proves core owns the defect. |
| `p1-downstream.ts` | Extended root passed through `defineApplication`, `createStore` and `createTestStore` (`tsc2.stdout`) | **TS2769** at `.with` |
| `c1-controls.ts` | A plain narrower reducer under a wider parent, and `auth.composition` under exactly `AuthFeatureDependencies` | Compiles |

**Prototype, d.ts level (`proto-dts/`: private copies of the installed core and auth, patch in `dts.diff`): exit 2, from exactly the three intended negatives.**

| File | Expected | Result |
|---|---|---|
| `r1` | compiles | ✅ compiles |
| `r2` | compiles | ✅ compiles |
| `c1` | compiles | ✅ compiles |
| `p1-downstream` | compiles, with `startup`'s `d.fetchActivity` typed from the extended `D` | ✅ compiles |
| `n1`: parent missing an Auth-required service (`Omit<AuthFeatureDependencies,'fetchAccount'> & …`) | must fail | ✅ TS2769, `fetchAccount` missing |
| `n2`: reverse direction, a wider-deps child composition under a narrower parent | must fail | ✅ TS2769, `fetchRows` missing |
| `n3`: an extended root store constructed with only `AuthFeatureDependencies` | must fail | ✅ TS2322, `fetchActivity` missing |

The correction therefore widens nothing: every required dependency is still enforced, only in the sound direction.

**Prototype, source level (`proto-src/`: a copy of the candidate core `src`, patch in `src.diff`):**

- `tsc --noEmit -p packages/core/tsconfig.json`: baseline exit 0, patched exit 0 (`patched-tsc.exit`). No casts were added.
- The 10 core test files that hand-write `_reduce` adapters (`tsconfig.seam-tests.json`) show an identical error set before and after the patch. That set is one pre-existing environment error, `ImportMeta.env`, caused by the narrowed config and unrelated to this change. The patch adds no new errors.
- Emitted JavaScript is **byte-identical** for both changed files (`transpileModule` comparison): the change is type-only, with zero runtime change.
- Emitted `.d.ts` lines equal the hand-patched d.ts used in `proto-dts/` (`emit-dts/`).

### Is there a legitimate workaround with existing API? No.

| Candidate | Result |
|---|---|
| A parent `D` that extends `AuthFeatureDependencies` (the documented dependency-injection pattern, `core/docs/consumer.md:39-43`: "inject clocks, HTTP functions and other external work through dependencies") | Blocked (r1). |
| A generic parameter on `createAuthFeature` | Does not exist. The signature is `createAuthFeature(): AuthFeature` (`auth/src/lib/application/feature.ts:909`), with `composition: ManagedComposition<…, AuthFeatureDependencies, …>` (`:726-731`). |
| A dependency-mapping or adapter API (`pullback`/`mapDependencies`-style) | None in core or auth (grepped). |
| `.with(slot, auth.composition.reducer)` | Type-checks, but it is only the feature core ("does not run its managed flow children"). All flows would lose management and view catalog registration. Semantically wrong. |
| Module augmentation of Auth's dependency interfaces | Global policy widening of a package type. It breaks other Auth consumers, such as `createMockAuthDeps`. Not allowed. |
| Parent `D` exactly `AuthFeatureDependencies`, with extra services captured by a reducer-factory closure | Cast-free, but contrary to the consumer guide's dependency-injection rule. It bypasses `ApplicationRoot`'s per-instance `dependencies` (`application-ownership.md:3,7`) and couples the inert definition to a service. It is not a supported pattern; at most an undocumented stopgap. |
| AppB's actual outcome | Synthesized chart data locally (review N3). This is the practical cost. |

**Consequence:** any application that composes `auth.composition` can only use services that are already inside `AuthFeatureDependencies`. The same limit applies to any app-authored child composition (r2). No shipped document covers the case:

- core docs only nest plain reducers (`application-views.md:32`, `docs/examples/agent-patterns/src/application.ts:46`);
- the Auth consumer uses exactly `AuthFeatureDependencies` (`auth/consumer/src/model.ts:129,134,250`).

### Minimum sound correction (core only)

`core/src/lib/types.ts:219-220`:

```ts
export type ManagedReductionAdapter<State, Action, Dependencies> = <Supplied extends Dependencies>(
  input: ManagedReductionInput<State, Action, Supplied>
) => readonly [...unchanged];
```

`core/src/lib/navigation/managed-integration.ts:383`:

```ts
reduce<Supplied extends D = D>(state: S, action: A, deps: Supplied, context: Context, core: Reducer<S, A, Supplied> = this.reducer): Result<S, A> {
```

Why this is minimal:

- **Blast radius:**
  - `ManagedReductionAdapter` and `StoreExecutionConfig` are not exported by name (see `core/src/lib/index.ts:21-32` and `application/index.ts:9-10`).
  - No companion package references `_reduce`, `ManagedReductionAdapter` or `ManagedReductionInput`. A grep of auth, charts, chat, media, code, maps, graphics and architecture `src` returned no hits.
  - Identity checks on `execution._reduce` (`create-application.ts:77`, `store-access.ts:35`) are unaffected.
- **Scope:**
  - Only the core archive changes. Auth, charts and the other companions need no source change; auth's peer range is `^0.13.1`.
  - Add a core CHANGELOG line: "`ManagedComposition` is now contravariant in its dependency type; a composition may be nested under a parent whose dependencies extend its own."
  - Add one line with an example to `core/docs/application-views.md`, or to the consumer guide's "State, dependencies and lifecycle" section: nesting a package composition such as `createAuthFeature().composition` under `interface AppDependencies extends AuthFeatureDependencies`.
- **Verification after applying:**
  - Core `tsc --noEmit` and the emitted-types check.
  - The focused seam tests listed above.
  - Rerun `r1`, `r2`, `p1` and the negatives `n1`–`n3` against the repacked archive.
  - The rest of the runtime matrix is unaffected, because the JavaScript is byte-identical.

Rejected alternatives:

- **Auth-only generic, `createAuthFeature<D extends AuthFeatureDependencies>()`.** This is sound (Auth's own reducers are contravariant). It still leaves r2, app-authored child compositions, blocked, and it pushes the same pattern onto every future package. Use it only as a fallback if core cannot be repacked.
- **Dropping `reducer` from `ManagedReductionInput`.** This changes runtime semantics, because the root store reducer would no longer be the core.
- **Typing it as `any`.** Forbidden.
- **Documentation only.** That would publish "apps composing Auth cannot inject their own services" as a limitation of the flagship integration.

### Severity and release decision

- **Severity: major.** There is no runtime unsoundness or crash; this is an expressiveness defect. It does, however, block the documented dependency-injection pattern for every real application that composes Auth, and forces data synthesis or closure-injection workarounds. It was observed in the release authoring exercise (AppB N3).
- **Release: BLOCK the current core 0.13.1 archive** until the two-line, type-only core correction is applied and repacked. The fix is small, verified sound, runtime-neutral (identical JavaScript) and confined to core. Shipping would freeze the invariant public type into a release that presents Auth as composable into applications.
- **If the coordinator decides core cannot be repacked:** release only with an explicit known-limitation note in both the core and Auth READMEs, stating that the parent dependency type must equal `AuthFeatureDependencies`. Treat that as a conscious scope reduction, not a clear.

## G5: logout, reopen and refused-handoff guidance

### Exact semantics (source and installed dist)

1. **`session` → `logout` removes every flow**, both the temporary flows and every settings flow, in that same reduction, even from an anonymous session.
   - Source: `auth/src/lib/application/feature.ts:1179-1185` (`{ ...withRefresh, ...allFlowsNull }`), with `allFlowsNull` at `:1045-1055`.
   - Owners retire, so late results are dropped.
   - "A flow opened after this point is new intent and stays live" (`:1183`; dist `feature.js:430`).
2. **The feature never reopens a flow and has no route.** "Where the user goes next is the containing application's decision" (`feature.ts:83-84`; dist `feature.d.ts`/`feature.js:81-84`). After logout, a parent that still shows a sign-in surface renders an empty outlet unless it dispatches `openLogin`. This was AppB defect R3.
3. **A refused handoff**, `{ kind: 'refused', source, reason: 'loggingOut' }` (`:236-253`):
   - It happens only when a flow completes while the session is `loggingOut` (`session/establish.ts:45-46`).
   - `handOver` still removes the temporary flows (`...noFlows`, `:2179-2186`), and the session keeps its state.
   - The parent must not route as signed in, and must reopen sign-in if it keeps one on screen.
   - This matters because a login reopened immediately on `logout` is live during `loggingOut`, and a fast submit is then refused.
4. **`openLogin` is refused only while a temporary flow is live** (`:1188-1190`, `hasLiveTemporaryFlow` `:1057-1068`). Dispatching it after either transition is idempotent and loop-safe.
5. **A subject change by any other route does not remove temporary flows.** Examples are expiry to anonymous and a session resolved to someone else. It retires only the settings flows (`:1080-1130`; README `:217`, `:261`, `:291`). A parent decides whether to open sign-in there.

The Auth README (`README.md:86-89`) states only that the handoff is a one-reduction output and that "a refused handoff carries a reason; the current reason is `loggingOut`".

- It never says that logout or a refusal removes the sign-in flow, and it never says who reopens it.
- The shipped consumer reopens only through manual buttons (`consumer/src/App.svelte:196,207`), so no reference shows it.

### Minimum documentation

- **Location:** `packages/auth/README.md`, in the "Managed sign-in…" section, directly after the handoff paragraph (after line 89).
- **Optionally:** one line in the "Session lifecycle" section (`:459-486`), and one sentence in `consumer/README.md` pointing to it.
- **No code or API change.**

Proposed text:

> **After sign-out.** `session` → `logout` removes every flow (sign-in attempts and settings) in that reduction and drops their late results. A refused handoff (`reason: 'loggingOut'`) also removes the finished flow while the session keeps signing out. The feature has no route and never reopens a flow: if your layout still shows sign-in, dispatch `openLogin` (it is new intent and stays live; it is refused only while another temporary flow is live, so re-dispatching is safe). Other subject changes (expiry, account switch) retire only settings flows.

Proposed example, compiled against the installed archives (`scratch-dependency-extension/g5-example/g5-example.ts`, `tsc` exit 0):

```ts
const openLogin = (): Effect<Action> =>
  Effect.run<Action>(async (dispatch) => {
    dispatch({ type: 'auth', action: { type: 'presented', action: { type: 'openLogin' } } });
  });

// Runs after the auth child in the same reduction: `state.auth.handoff` is this reduction's output.
export const reducer: Reducer<State, Action, AuthFeatureDependencies> = (state, action) => {
  if (action.action.type !== 'presented' || state.auth === null) return [state, Effect.none()];
  const routed = action.action.action;
  const handoff = state.auth.handoff;
  if (handoff?.kind === 'accepted') return [{ ...state, route: 'home' }, Effect.none()];
  const loggedOut = routed.type === 'session' && routed.action.type === 'logout';
  if (loggedOut || handoff?.kind === 'refused') return [{ ...state, route: 'signIn' }, openLogin()];
  return [state, Effect.none()];
};
```

The same pattern was independently verified in AppB after review (`app-b/src/lib/model.ts:97-100,200-204,222-223`): TestStore "logout offers a fresh sign-in…" and the browser test "logout removes…".

**Severity: minor (documentation).** It does not block on its own. Include it in the Gap 1 core and Auth repack if one happens. If only core is repacked, Auth's README change can land with the next Auth archive.

## Receipts

All receipts are under `/private/tmp/companion-runtime-release/scratch-dependency-extension/`.

- **`repro/`:** `r1-auth-extended.ts`, `r2-core-only.ts`, `c1-controls.ts`, `p1-downstream.ts`, `tsconfig.json`, and `tsc.stdout`/`tsc.exit` (exit 2).
  - `tsc.stdout` covers the r1, r2 and c1 run.
  - `tsc2.stdout` adds p1.
  - `node_modules` is a symlink to the installed app-b tree, used read-only.
- **`proto-dts/`:** `dts.diff`, the same files plus `n1-negative.ts`, and `tsc.stdout`/`tsc.exit` (exit 2, only `n1` lines 12, 21 and 27).
- **`proto-src/`:**
  - `src.diff`
  - `baseline-tsc.stdout` (exit 0) and `patched-tsc.stdout`/`.exit` (exit 0)
  - `seam-tests-baseline.stdout` and `seam-tests-patched.stdout` (identical)
  - `emit-dts/`
- **`g5-example/`:** `g5-example.ts` and `tsc.stdout`/`tsc.exit` (exit 0).

The assessment stopped here: no runtime or archive changes were made.
