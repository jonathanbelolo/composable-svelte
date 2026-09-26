# Independent review: Core dependency-superset repair and Core/Auth guidance

## Verdict: CLEAR

There are no blockers. The coordinator may repack core 0.13.1 and auth 0.3.0 from the candidate and run exact archive qualification (conditions at the end).

**Reviewer:** Claude Opus 5.5 (`claude-opus-5-5`), fresh independent session, 2026-09-26.

**Inputs:**
- `DEPENDENCY-EXTENSION-ASSESSMENT.md`
- `DEPENDENCY-CORRECTION.md`
- `DEPENDENCY-CORRECTION-HANDOFF.json`
- `dependency-correction/APPLIED-CHANGE.diff`
- The applicable AGENTS file, `candidate/packages/core/consumer/AGENTS.md`. The review followed its rules: public exports only, no invented APIs, no weakened checks.

**Constraints honored:**
- The candidate was only read. No source edits, repack, publish, commit or push.
- Main was not touched.
- All experiments ran in `scratch-dependency-independent-review/`.
- After the review the candidate tree still hashes identical to the implementer's `tree-after.json` (7,001 files).

## 1. Exact delta (independently re-derived)

**Handoff hashes:**
- `APPLIED-CHANGE.diff` sha256 is `82b23795…0e94`, matching the handoff.
- All 13 handoff paths match `sha256After`.
- Every `baseline/` copy matches `sha256Before`.

**Changed files:**
- A walk of the whole candidate tree, excluding `node_modules`, compared against `tree-before.json` gives exactly these 13 paths: 10 modified and 3 added.
- An mtime sweep since 15:59 finds the same 13 files and no others.

**Source delta, compared with `baseline/`:** exactly two signatures, with no comment, cast, `any` or runtime change.

- `src/lib/types.ts:219-220`: `ManagedReductionAdapter` becomes `<Supplied extends Dependencies>(input: ManagedReductionInput<State, Action, Supplied>) => …`.
- `src/lib/navigation/managed-integration.ts:383`: the method becomes `reduce<Supplied extends D = D>(…, deps: Supplied, …, core: Reducer<S, A, Supplied> = this.reducer)`.

**Other changes:**
- `tsconfig.application-public-managed-types-emitted.json` adds only the new emitted test to `include`.

**Companion packages:** a grep of every non-core package, `node_modules` excluded, finds no reference to `_reduce`, `ManagedReductionAdapter` or `ManagedReductionInput`.

## 2. Runtime equality with the original immutable R4 archives

I extracted the archives fresh from `archives-r4/`, which is `dr-xr-xr-x`:

| Archive | sha256 |
|---|---|
| core | `30e044e1…d18b` |
| auth | `ac13e9a8…6e62` |

I compared every archive file with the candidate package.

**Core (1,258 archive files):**
- No archive file is missing from the candidate, and the candidate has no extra `dist` file.
- Exactly these differ:
  - `dist/types.d.ts`
  - `dist/navigation/managed-integration.d.ts`
  - their two `.d.ts.map` files, which differ only in the `mappings` key
  - `CHANGELOG.md`
  - `docs/consumer.md`
  - `package.json`
- The `package.json` difference is only the pack transform: `prepack` and `prepublishOnly` are stripped. That is pre-existing and not part of this change.
- **Every `.js`, `.svelte`, CSS and other runtime asset is byte-identical to R4.**
- The `.d.ts` diffs are exactly the two signatures above.

**Auth (404 archive files):**
- Only `README.md` differs, plus the same pack transform of `package.json` (`workspace:*` → `0.13.1`, scripts stripped).
- Auth `dist` is byte-identical.

## 3. Type soundness of the two signatures

Where the dependency type `D` appears:

- **Root use:** `turn-queue.ts:429` calls the adapter with its own `this.dependencies` and `reduceOnce`, so `Supplied` is the store's dependency type.
- **Nested use:** nested compositions are only called as `composed.reduce(value, action, deps, ctx)` (`managed-integration.ts:540`, `:613`). The fourth argument, `core`, defaults to the child's own reducer, and `deps` is the parent's superset.
- **Other positions** are all contravariant:
  - `reducer: Reducer<S, A, D>`
  - `_initial(state, dependencies: D, …)`
  - `_initialization.startupDecision(state, D)`
  - the policies (`onCreate`, `startup`)
- **No covariant position:** nothing yields a `D` to a caller. `bind` and `catalogTypes` do not involve `D`.

Contravariance is therefore the sound variance. The generic `Supplied` keeps `dependencies` and `reducer` tied to the same type, so the old unsound pairing cannot appear.

`ApplicationDefinition` brands `D` invariantly: `D` sits in both parameter and return position of `definitionBrand`. `ApplicationRoot` and `createApplication` take `options.dependencies: NoInfer<D>`. **Root dependencies therefore stay pinned to the full extended type.**

## 4. Independent installed-layout evidence

### Setup

I wrote my own probes; they are not the implementer's files.

Two installed trees:

| Tree | Contents |
|---|---|
| `before/` | pristine R4 core and auth |
| `after/` | R4 overlaid with only the candidate's changed shipped files; equal to candidate core except the packed `package.json` |

Both trees:
- install the packages as real `node_modules/@composable-svelte/{core,auth}`;
- symlink the other dependencies to the app-b install;
- use TypeScript 5.9.3 in strict mode, also re-run with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`;
- use no casts and no `any`.

The probes are `probes/core-probe.ts` and `probes/auth-probe.ts`. Results:

| Tree | Result |
|---|---|
| `after/` | **exit 0** under both option sets. Every `@ts-expect-error` negative is a real rejection; an unused one would raise TS2578. |
| `before/` | exit 2, only at the positive lines: TS2769/TS2345 on the `execution._reduce` path, plus the direct-assignment and generic cases. |

### Positives in `after/`

- **Core-only child with narrower dependencies, three levels deep:** a grandchild needs `Clock`, a child composition needs `Mid`, and the root supplies `App`. It works through both `.with` (optional slot) and `.forEach` (keyed slot).
- **Direct contravariance:** `ManagedComposition<C, CA, Clock>` assigns to `ManagedComposition<C, CA, App>`.
- **Generic helper:** `<D extends Mid>(r: Reducer<S, A, D>) => builder(r).with(slot, child)` compiles.
- **Auth:** `createAuthFeature().composition` works under `interface AppDeps extends AuthFeatureDependencies { fetchActivity… }`, together with `defineViews`, `defineApplication`, `createStore`, `bind(store, nestedSlot(slot, auth.loginSlot))` and `createMockAuthDeps` from the public `@composable-svelte/auth/testing`.

**Inference stays typed and exact.** Each of these is asserted with a type-equality check, `Eq<…>`, which fails on `any`:
- the built composition's `D` equals `App` (and `AppDeps` for Auth);
- the `onCreate` and `startup` policy `deps`, and `defineApplication` `startup` `deps`, equal `App`, and `deps.nope()` is an error;
- `defineApplication` returns `ApplicationDefinition<S, A, App, unknown, false>`;
- `createTestStore` returns `TestStore<S, A, App>`, and `TestStore<State, Action, AppDeps>` for Auth;
- `createStore` accepts a wider-than-required dependency object.

### Negatives in `after/`

Each negative is rejected for the right reason; the compiler names the missing or conflicting member.

**Missing required service:**
- core parent `Clock` with a child needing `tag()`, through both `.with` and `.forEach`;
- generic `D extends Clock`;
- Auth parent `Omit<AuthFeatureDependencies, 'fetchAccount'>`, reported as `fetchAccount` missing.

**Every-key sweep:** removing any single key from `AuthFeatureDependencies` is rejected, except exactly the optional keys: `clock`, `leadMs`, `tickMs`, `linkOAuthProvider`, `pendingOAuth` and `redirect`. The accepted set equals `OptionalKeys`, shown by an `Eq` assertion.

**Reverse direction:**
- a wider child composition under a narrower parent, through `.with` and `.forEach`;
- `ManagedComposition<…, Mid>` assigned to `<…, Clock>`.

**Conflicting member type:** a parent `now(): string` against a child `now(): number`.

**Incomplete root dependencies:**
- `createStore`, both with `{ reducer, execution }` and with a `...composition` spread;
- `createTestStore`;
- `ApplicationRoot`, through its public call signature;
- `execution` alone with a dependency-free replacement reducer.

For Auth, dependencies of exactly `AuthFeatureDependencies` fail on `fetchActivity` in `createStore`, `createTestStore` and `ApplicationRoot`.

## 5. The candidate's own tests

I ran each test in isolation with its package config. No tsbuildinfo was written and all output went to scratch.

| Check | Result |
|---|---|
| Core `tsc --noEmit -p tsconfig.json` (composite and incremental off) | exit 0 |
| Core `tsc -p tsconfig.application-public-managed-types-emitted.json --outDir <scratch>` | exit 0; both `.d.ts` emitted, so the exported types stay nameable |
| `core/tests/managed-dependency-extension.types.ts` (via `tsconfig.test.json`) | exit 0 |
| `auth/tests/managed-auth-dependency-extension.types.ts` (via auth `tsconfig.test.json`; `--listFiles` shows core resolved from public `dist`) | exit 0 |
| Core emitted test copied into the pristine R4 installed tree | exit 2, only at its positive line 42 (TS2769/TS2345), so it is not vacuous |

**What the tests cover:**
- They exercise the real exported surface: `@composable-svelte/core`, `/test`, `/application`, `/navigation` and `@composable-svelte/auth/application`.
- The core src-level twin exercises the source.

**Casts and `any`:** there are none, and no policy is widened.

**False assumptions:** none found; every claim the tests make holds.

**Non-blocking advisory:** the `startup` checks (`const fetchRows: AppDeps['fetchRows'] = deps.fetchRows`) would also pass if `deps` were `any`.
- Exact typing is established by my `Eq` probes.
- It is also guarded indirectly: if `D` degraded to `any`, the tests' store and assignment negatives would trip TS2578.
- An exact-type assertion could be added later; it is not required for this release.

## 6. Core guidance

**CHANGELOG:**
- The new entry is a `### Fixed` section under the unpublished `0.13.1`. The npm registry shows core at `0.13.0` at most and auth at `0.2.1` at most, so repacking at the same versions is valid.
- The release previously had Added, Changed and Notes, so changelog-shape's "names each kind of change once per release" still holds.
- The text is accurate: type-only, `.with` and `.forEach`, the three rejections, and JavaScript unchanged.

**`docs/consumer.md:47-81`**, under "State, dependencies and lifecycle", sits directly after the existing "inject … through dependencies" rule:
- The prose is accurate. Rejection happens at `.with` and `.forEach`. "A store or Root over the composed parent requires the whole extended object" is confirmed by the `createStore`, `createTestStore` and `ApplicationRoot` probes.
- Extracted verbatim from the installed `after` package, the fence compiles (exit 0). The same fence fails in `before` with TS2769 at `.with`.
- The implementer's gate log shows `doc-typecheck > report no error that is not registered` passing with the new fences.
- The per-test statuses of the 8 repo gates are identical before and after. The 5 failures come from `.claude/`, `guides/` and `CLAUDE.md`, which are absent here, and the failure messages differ only in ordering.

## 7. Auth guidance (`README.md:91-146`)

I checked the text against `src/lib/application/feature.ts` and `src/lib/session/establish.ts`.

**Dependency extension (`:91-93`):** accurate, as shown by the Auth probes.

**`logout` removes every flow:** confirmed.
- `feature.ts:1179-1185` spreads `allFlowsNull`, which covers `noFlows` plus every settings slot and `sessionRefresh`.
- It applies even from an anonymous session, and removing the flows retires their owners, so late results are dropped.

**A refused handoff removes the finished flow and keeps the session signing out:** confirmed.
- `handOver` (`:2177-2186`) spreads `noFlows` and sets `session: decision.state`.
- `decideSessionEstablished` refuses only while `status === 'loggingOut'`, and returns the state unchanged.
- Strictly, `noFlows` removes every temporary flow. Because every `open…` action is refused while one is live, that is the finished flow in practice. No change is needed.

**No route and no reopen; `openLogin` is new intent and stays live; refused only while a temporary flow is live:** confirmed.
- The file header says "the feature has no route" (`:83-84`).
- `case 'openLogin'` is guarded only by `hasLiveTemporaryFlow` (`:1188-1190`).

**Other subject changes retire only the settings flows:**
- An expiry to anonymous retires the settings flows, keeps an ended session-refresh view, and leaves the sign-in flow in place. This is confirmed by `authFeatureCore` (`:1080-1130`), including `keepEndedRefresh`.
- "As described below" correctly points to `README.md:348`.

**Existing Auth runtime tests** pin these semantics, and they run on runtime JavaScript that is byte-identical to R4:
- `auth-feature.test.ts:414` "pulses refused with loggingOut…": after `logout`, `openLogin` is live, a refused handoff leaves `login === null`, and the session keeps its subject.
- `auth-feature.test.ts:840`, `:579`, `:610` and `:1468`.

**The snippet:**
- It compiles verbatim against the installed `after` packages (exit 0) and fails on `before` with TS2769.
- Its comment, "runs after the auth child in the same reduction", matches `ManagedComposition.reduce`, which reduces children first and then `core`.
- `handoff` is cleared at the start of every auth reduction (`:1144-1168`), so a refusal triggers one reopen. It cannot loop.

## 8. Informational notes (not blockers)

- **Optional Auth services:** a parent may now omit Auth's optional services from its type, for example `clock`. That is ordinary optional-property assignability, identical to the plain-reducer child path that already existed. It is not a policy widening.
- **Runtime suites:** broad runtime suites were not run, by instruction. The emitted runtime JavaScript and assets are byte-identical to the already-qualified R4, so runtime behavior is unchanged.

## Coordinator conditions (after this CLEAR)

1. **Repack from the candidate** with the same pnpm and scripts-disabled procedure: core 0.13.1 and auth 0.3.0. The other archives stay unchanged.
2. **Qualify the new archives** by comparing them file by file with R4.
   - Core must differ in exactly `CHANGELOG.md`, `docs/consumer.md`, `dist/types.d.ts`, `dist/types.d.ts.map`, `dist/navigation/managed-integration.d.ts` and `dist/navigation/managed-integration.d.ts.map`.
   - Auth must differ in exactly `README.md`.
   - The packed `package.json` must equal R4's.
3. **Re-run the installed-layout checks against the new tarballs:**
   - my probes, fences and emitted test in `scratch-dependency-independent-review/{probes,after/fences,after/emitted}`;
   - the implementer's `dependency-correction/installed-consumer/`.
   - Expected: my probes exit 0; the implementer's set shows only its 3 intended negatives.
4. **Run the core and Auth package gates** in a full repository tree that has `.claude/`, `guides/` and `CLAUDE.md`. This lets doc-typecheck, doc-examples and front-door run completely.

## Receipts (`/private/tmp/companion-runtime-release/scratch-dependency-independent-review/`)

- `cmp.py`: the archive-to-candidate comparison.
- `r4core/` and `r4auth/`: fresh extractions of R4.
- `before/` and `after/`: the installed trees, each with:
  - `probes/tsc.out`;
  - `fences/`: the verbatim `consumer.md` and README fences;
  - `emitted/`: the candidate's emitted test.
- `after/probes-neg/out.txt`: the negatives with the `@ts-expect-error` lines removed, showing each rejection reason.
- `emit-after/`: the emitted declarations.
- `tsconfig.core-test.json` and `tsconfig.auth-test.json`: the isolated runs of the candidate tests.
