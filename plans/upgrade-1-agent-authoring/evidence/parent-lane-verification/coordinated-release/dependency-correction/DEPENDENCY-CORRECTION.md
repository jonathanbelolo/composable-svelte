# Dependency-extension correction (AppB Gap 1 and G5)

Applied by Opus 5.5 on 2026-09-26, under parent authorization. The change implements `DEPENDENCY-EXTENSION-ASSESSMENT.md` in the candidate only. Nothing was repacked, published, committed or pushed, and main was not edited. **It awaits fresh independent review; the coordinator packs afterwards.**

## Change

**Core, type-only.** Exactly two signatures changed. No comments, casts, `any`/`unknown`, new abstractions or policy were added.

- `packages/core/src/lib/types.ts:219-220`:

  ```ts
  export type ManagedReductionAdapter<State, Action, Dependencies> = <Supplied extends Dependencies>(
    input: ManagedReductionInput<State, Action, Supplied>
  ) => …unchanged
  ```

- `packages/core/src/lib/navigation/managed-integration.ts:383`:

  ```ts
  reduce<Supplied extends D = D>(state: S, action: A, deps: Supplied, context: Context, core: Reducer<S, A, Supplied> = this.reducer): Result<S, A> {
  ```

**Effect.** `ManagedComposition<S, A, D>` is no longer invariant in `D`. A child composition, such as `createAuthFeature().composition`, can be nested with `.with` or `.forEach` under a parent whose dependencies extend its own. These cases stay rejected:

- a parent that lacks a dependency the child requires;
- a child that needs more than its parent supplies;
- a store built without the parent's extra services.

**Inference.** The parent's `D` is still inferred from its reducer, and `defineApplication`, `createStore` and `createTestStore` infer the extended type.

**Docs.**

- **Core CHANGELOG:** one `### Fixed` entry under `0.13.1`. That release section had no Fixed subsection, so the changelog-shape gate holds.
- **Core `docs/consumer.md`:** one paragraph plus a typed example, at `:47-81` in "State, dependencies and lifecycle".
- **Auth README:** two additions in the managed sign-in section, after the handoff paragraph, followed by one typed example (`:91-146`).
  - **Dependency extension (`:91-93`):** the application's dependency type can extend `AuthFeatureDependencies` with its own services.
  - **After sign-out (`:95-107`):**
    - `logout` removes every flow.
    - A refused handoff (`loggingOut`) removes the finished flow.
    - The feature never reopens a flow; dispatch `openLogin`, which is refused only while a temporary flow is live.
    - An expiry retires the settings flows only, with the ended session-refresh caveat.

## Changed paths

Exactly 13 paths changed: 10 modified and 3 added. The candidate's full tree went from 6,998 to 7,001 files, with 0 unrelated changes. Pre-correction bytes are kept read-only in `dependency-correction/baseline/`.

| Path | Ships in | sha256 before → after |
|---|---|---|
| `packages/core/src/lib/types.ts` | — | `60df5635e7ab` → `a1ea53585a66` |
| `packages/core/src/lib/navigation/managed-integration.ts` | — | `a3aa12289b99` → `05fb61783193` |
| `packages/core/dist/types.d.ts` | core | `9e435b9187be` → `ae221395587f` |
| `packages/core/dist/types.d.ts.map` | core | `52f2fec41a1c` → `8a84e016e991` |
| `packages/core/dist/navigation/managed-integration.d.ts` | core | `69ece6112991` → `a3c40f946271` |
| `packages/core/dist/navigation/managed-integration.d.ts.map` | core | `e8af1b7a9180` → `944ea71ec688` |
| `packages/core/CHANGELOG.md` | core | `27b8e21ca294` → `a06299329da9` |
| `packages/core/docs/consumer.md` | core | `56d387f93e4d` → `232b7b46fa2f` |
| `packages/core/tsconfig.application-public-managed-types-emitted.json` (adds the new emitted test) | — | `f35a44e54a73` → `91df1dda9317` |
| `packages/auth/README.md` | auth | `e5f118647f3e` → `32dfa7e539d3` |
| `packages/core/tests/managed-dependency-extension.types.ts` | — | new `32c141613cfd` |
| `packages/core/tests/managed-dependency-extension.emitted.types.ts` | — | new `f6db2d915189` |
| `packages/auth/tests/managed-auth-dependency-extension.types.ts` | — | new `f93a8c37ba7d` |

- **Full hashes:** `DEPENDENCY-CORRECTION-HANDOFF.json`.
- **Applied diff:** `dependency-correction/APPLIED-CHANGE.diff`, sha256 `82b23795752bfc0c4eac77400376e71e2aaf1906af9c937c27b6ab4394ee0e94`.
- **Baseline proof:** a scratch copy of the candidate, with `baseline/` restored and the new files removed, hashes identical to the pre-correction snapshot (6,998 of 6,998 files).

## Runtime equality with R4

Builds ran in scratch mirrors, using the package's own `svelte-package -o dist && emit-svelte-declaration-bridges` and its tsconfig, svelte, postcss and tailwind config.

1. **Build oracle.** The unchanged source rebuilt to exactly the R4 core archive's `dist`: 1,163 of 1,163 files byte-identical. A first attempt without `postcss.config.cjs` showed four autoprefixer CSS differences. It was corrected before any edit.
2. **Corrected source compared with the R4 `dist`.**
   - **All 471 non-declaration files are byte-identical:** every `.js`, `.svelte`, CSS and other runtime asset.
   - **Only 4 files differ:** `types.d.ts`, `navigation/managed-integration.d.ts` and their `.d.ts.map` files. The maps differ only in `mappings`.
   - **The `.d.ts` diff is exactly the two signatures** (`evidence/dist-declaration.diff`).
3. **Candidate `dist`.** It now equals the complete corrected build (1,163 of 1,163 files). Only those four files were copied in.
4. **Shipped file lists** still equal R4:
   - **core:** 1,258 files. The changed shipped files are the four declaration files, `CHANGELOG.md` and `docs/consumer.md`.
   - **auth:** 404 files. The changed shipped file is `README.md` only; auth `dist` is unchanged.
5. **Archive re-pack scope.** Core 0.13.1 and auth 0.3.0 must be re-packed; the other archives are unchanged. The R4 and R5 manifests were re-verified by sha256.

## Regression evidence

Each check was compared, where meaningful, against the original source or the R4 archive state. Logs are in `dependency-correction/evidence/`.

| Check | After | Control (original src / R4) |
|---|---|---|
| Core `src` `tsc --noEmit` (incremental off; no tsbuildinfo written) | exit 0 | — |
| New core src-level types test | exit 0 | exit 2: only the positive `.with` and `.forEach` lines fail. Every `@ts-expect-error` negative is still rejected. |
| New core public-declaration test (emitted config; outDir sent to scratch) | exit 0, declarations emitted | exit 2: positive line only |
| Existing core `*.types.ts` plus the 10 `_reduce` seam tests (plain `tsc`) | identical 10 pre-existing tsc-only errors | same 10 errors (inference preserved) |
| Core `svelte-check --fail-on-warnings` (the gate for the new files) | 1,674 files, 0 errors, 0 warnings | — |
| New Auth types test (core resolved through public `dist`) | exit 0 | exit 2: only TS2769 at the composition line (Gap 1). Negatives are still rejected. |
| Auth `svelte-check --fail-on-warnings` | 745 files, 0 errors, 0 warnings | — |
| Auth `src` `tsc --noEmit` | exit 0 | — |
| Core repo gates: doc-typecheck, doc-examples, changelog-shape, typecheck-coverage, dist-freshness, front-door, published-files, export-surface | 123 passed and 5 failed, plus a `front-door` load error | Identical per-test status. All failures come from `.claude/`, `guides/` and `CLAUDE.md`, which are absent from this candidate tree. |
| New doc fences, compiled with doc-typecheck's `dist` path mapping | exit 0 | TS2769 at each `.with` line |
| **Installed-layout public `.d.ts` tests** (R4 archives overlaid with the candidate's shipped files and installed as real packages; assessment files r1, r2, c1, p1, n1, the doc fences and the G5 example) | Only the 3 intended negatives fail (listed below) | Pristine R4 additionally fails r1, r2, p1, n1:25 and both doc fences with TS2769 |

The three intended negatives in the installed-layout test:

- `n1:12` TS2769: `fetchAccount` missing.
- `n1:21` TS2769: `fetchRows` missing, the reverse direction.
- `n1:27` TS2322: `fetchActivity` missing.

Broad runtime suites were not run. The emitted JavaScript is byte-identical, so runtime behavior cannot change.

## Incidental effects (outside the tree scope, not shipped)

- **Vitest cache:** vitest updated its existing duration cache, `packages/core/node_modules/.vite/vitest/…/results.json`.
- **`.vite-temp`:** vitest also created an empty `packages/core/node_modules/.vite-temp`; I removed it.
- **Stray `node_modules` link:** the symlink `packages/core/node_modules/node_modules` dates from 13:45, before this work, and was not touched.

## For the reviewer

1. **Signatures and runtime.** Confirm that the diff is two signatures (`APPLIED-CHANGE.diff`) and that runtime equality holds (`evidence/compare-r4-vs-build-after.json`).
2. **Negatives are real.** Confirm the negatives are genuine rejections. The installed-layout output names the missing member for each; the `@ts-expect-error` lines fail with TS2578 if they ever stop erroring.
3. **Auth README semantics.** Check the README against `auth/src/lib/application/feature.ts`:
   - logout: `:1179-1185`;
   - handover: `:2179-2186`;
   - `openLogin` guard: `:1188-1190`;
   - subject-change rule: `:1080-1130`.
4. **Coordinator.**
   - Rebuild or repack core 0.13.1 and auth 0.3.0 from the candidate. Core `dist` is already the corrected build.
   - Rerun the installed-layout set in `dependency-correction/installed-consumer/` against the new tarballs.
   - Run the core and auth package gates in a full repository tree, which has `.claude/` and `guides/`.
