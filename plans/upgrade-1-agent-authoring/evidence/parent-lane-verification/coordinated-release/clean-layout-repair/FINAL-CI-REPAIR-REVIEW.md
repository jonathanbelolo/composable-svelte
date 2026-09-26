# FINAL-CI-REPAIR-REVIEW: independent narrow review of the 4 non-shipped CI/example repair paths

**Verdict: CLEAR TO LAND** (for these 4 paths only; limitations below).

Scope: `packages/{maps,charts,graphics}/tsconfig.test.json` and `examples/styleguide/src/lib/components/demos/SidebarDemo.svelte` in `candidate/`, compared with the previously approved `review-ci/` snapshot and the parent clean checkout `/private/tmp/composable-release-git`. The authoring reports were `CI-REPAIR-MANIFEST.md`, the appended sections of `FINAL-CI-REVIEW.md`, and `REPAIR-BEFORE-HASHES.txt` / `REPAIR-AFTER-HASHES.txt` (all in the runtime root). I edited no source. All my work ran in a scratch rsync copy, which I have deleted.

## 4-path hash handoff (verified)

| Path | Before (= review-ci = clean checkout) | After (= candidate) |
|---|---|---|
| `packages/maps/tsconfig.test.json` | `188418207d6e7acbb0ba1216a065e06a106c33a9d6f9da1bde6133e27b22101e` | `a7c73938af5148e099d38ec9c9a7133f582108239dc2ccb3ad3e7703180dc0b3` |
| `packages/charts/tsconfig.test.json` | `efdd0e366b1d4c5b3f55aa38bed807606d7daa475f695e60f1aee43dd65d7c1e` | `933f0c72ea81e87cc69e55baa3924bd5a1869c5ff5c65e8ed8404216d5e0ade1` |
| `packages/graphics/tsconfig.test.json` | `efdd0e366b1d4c5b3f55aa38bed807606d7daa475f695e60f1aee43dd65d7c1e` | `44afb681b165322fe4b224604fb744716e01202299261b5e2339c2b9dbf51762` |
| `examples/styleguide/src/lib/components/demos/SidebarDemo.svelte` | `018db771f9583fd8c9852b7cfabc30aa1702d56284cc712c58b95089265b1b92` | `39e8d72f56afc5ae504ceb493946b246505b6bd648ae2da52290c7a03e64d915` |

- I recomputed all hashes. They match `CI-REPAIR-MANIFEST.md` and both hash files.
- The clean checkout still has the before-hashes for all four paths, so it was not mutated.
- `diff -u review-ci candidate` for each path is exactly the manifest diff:
  - three `+ "paths": { "@composable-svelte/<pkg>": ["."] }` additions;
  - one removed line, `import { onDestroy } from 'svelte';`. `onDestroy` has no other reference in the file.
- Excluding `node_modules`, `dist` and build caches, `diff -rq` of `packages/` and `examples/` between candidate and the clean checkout shows only these four files.

## Resolution fix (verified)
- **Config semantics.** There is no `baseUrl` and no inherited `paths` anywhere in the chain (`tsconfig.test.json` → package `tsconfig.json` → root `tsconfig.json`). The parsed options give `pathsBasePath = packages/<pkg>` and `moduleResolution = bundler`. The strict flags are still inherited and unchanged (`strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, …). `include` still has `fixtures/**/*` (5 / 7 / 6 fixture TS files parsed for maps / charts / graphics). The check script still uses `--fail-on-warnings`.
- **Fresh `ts.resolveModuleName`** (TS 5.9.3, `ts.sys` host, no shared cache). Run against the clean-checkout layout, whose per-package `node_modules/@composable-svelte` holds only `core`, so there are no self-links:
  - After the repair, every importer resolves to `packages/<pkg>/dist/index.d.ts`, the public built declarations and not `src`. The importers were the fixture `model.ts` and `StandaloneTypes.ts`, and in-package `tests/doc-examples/*` and `tests/optional-peer-isolation.test.ts`.
  - Before the repair (review-ci configs), every fixture importer is **UNRESOLVED** for all three packages. In-package tests resolve through package self-reference (`exports.types`). This confirms the old Charts/Graphics pass depended on resolution-cache order.
- **Strict checks** in a fresh rsync of the clean checkout with the 4 after-files: `pnpm run check` for maps, charts and graphics each gave `svelte-check found 0 errors and 0 warnings`, exit 0. Styleguide also gave 0/0, exit 0.
- **Pre-repair control** (same scratch):
  - Maps svelte-check exit 1, 5 errors, including `Cannot find module '@composable-svelte/maps'`. This reproduces the original failure.
  - Charts and Graphics svelte-check pass, which is the order-dependent accident.
  - Plain `tsc` reports TS2307 for the charts and maps fixtures.
- **Injected fixture error** (`const __reviewProbe: number = "x"` appended to each fixture `model.ts`): all three checks fail (exit 1, 1 error, `Type 'string' is not assignable to type 'number'`). The fixtures really are type-checked. I restored the files and confirmed the restore with `cmp`.
- **`dist/` moved aside**: all three checks fail (exit 1). Unresolved self-imports: maps 2, charts 5, graphics 7. There is no silent fallback to private `src`. I restored `dist/`.

## Not shipped, no repack (verified)
- The R4 maps, charts and graphics tarballs match `archives-r4/MANIFEST.json`.
- No archive contains a `tsconfig.test.json` or `SidebarDemo`. The only shipped tsconfigs are the fixture `tsconfig.json` / `tsconfig.nodenext.json`.
- The shipped fixture tsconfigs, `model.ts` and `verify.mjs` in the tarballs are byte-identical to candidate.
- Candidate `package.json` equals the clean checkout. The tarball `package.json` matches candidate except for `scripts` and `devDependencies`, which I excluded from the comparison and did not examine.
- Styleguide is `private: true`.
- **No repack is needed.**

## Observations and limitations
- **Sidebar change is cosmetic.** The pre-repair SidebarDemo also passes styleguide `svelte-check` (0/0), so removing the import is a no-op cleanup (an unused import), not a fix for a failing check. It is harmless.
- **Scratch `tsc` output.** Plain `tsc -p tsconfig.test.json` still exits 2 after the repair in all three packages. The errors are TS7006 implicit-any and TS2578 from `.svelte`-typed code that `tsc` can't see. That is the same class of errors as before the repair, and `tsc` is not the gate: svelte-check is.
- **Out-of-scope drift.** `review-ci/` differs from candidate in two paths outside this scope: `SHIPPED-REPAIR.md` and `packages/core/consumer/package.json` (0.13.0 → 0.13.1). Both predate this repair (14:09, the R4 work). The core consumer file equals the clean checkout and the R4 core tarball. I did not review them here.
- **Maps subpath.** The `paths` entry maps only the exact root specifier. The maps `./mapbox` subpath is not mapped. No checked file imports it: the only occurrences are in comments.
- **What I did not run.** No broad suites, browser jobs or the runtime matrix. I did not rerun `pnpm -r check` over the other 17 projects, which are unchanged. No commit, push or publish.
