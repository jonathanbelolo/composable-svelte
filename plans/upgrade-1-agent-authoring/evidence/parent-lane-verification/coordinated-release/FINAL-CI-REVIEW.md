# Final CI / example integration review

Scope: only the 14 paths in `CI-CHANGED-PATHS.json`. Each one is byte-identical between `review-ci` and `candidate`. I ran the checks in `candidate` because the frozen snapshot has no deps. Its per-package `node_modules` link siblings to candidate. No source was edited. Nothing in main was touched. Nothing was committed, pushed or published.

## Verdict: no blockers

None of the changed paths ship in a tarball: `tsconfig.test.json`, `tests/`, examples and the root README/CONTRIBUTING are all absent from `archives-r4`. The CI delta does not require repacking.

## Items verified

| Item | Result | Evidence (commands run in this review) |
|---|---|---|
| Peer floors use the exact full version | PASS | `expectedRange(v) = ^${v}`. The unit test asserts `0.13.1 → ^0.13.1`, `not ^0.13.0`, and `0.13.0-next.1 → ^0.13.0-next.1`. Every manifest matches: core 0.13.1; auth/charts/graphics/maps 0.3.0; chat/code/media 0.5.0; all satellites peer `core ^0.13.1`; chat peers `code ^0.5.0` and `media ^0.5.0`. `vitest --config vitest.node.config.ts peer-ranges + optional-props`: 2 files, 44 tests passed. |
| optional-props bare-`never` exemption | PASS | `isBareNever` parses `type T = …` with the TS AST and accepts only `SyntaxKind.NeverKeyword`. `() => never`, `never[]` and `Record<string, never>` all return false. The exemption is checked after `acceptsUndefined` and before the register. The tmp-file scan test expects exactly `['callback','ordinary']` as offenders, so ordinary optionals and function-returning-never are still flagged. The trigger is the new auth `?: never` props (MfaEnrolment, OAuthCallback). |
| Six recipe/fixture tests are type-checked | PASS | chat/code/media `recipes/managed/managed.test.ts` and charts/graphics/maps `fixtures/installed-consumer/src/installed.browser.test.ts` are now inside `tsconfig.test.json`, which `pnpm check` uses (`svelte-check --fail-on-warnings`). `pnpm run check` in all six packages: exit 0, 0 errors and 0 warnings each. |
| Explicit callback types (Gallery/Styleguide tests) | PASS | Both tsconfigs include `tests/**/*.ts`. `pnpm run check` for styleguide and product-gallery: exit 0, 0/0. |
| Code command readiness | PASS, deterministic | The arbitrary `settle()` is replaced by a `vi.waitFor` on `.cm-editor` plus `EditorView.findFromDOM` for each row, with a 5 s bound. Gated and non-queue setups still `settle()`. It is sound: `createEditorView` constructs the view with `parent` synchronously and returns it, and `binding.attach` / `attach:a#1` run in the next microtask. waitFor polls on timers, so microtasks have drained before a check can pass. Fresh setups have a single attachment per label, so this is `a#1`. `command-queue.managed.test.ts` ×3: 25/25 each run. `vitest --config vitest.ssr.config.ts`: 1 file, 5 tests passed. |
| SidebarDemo destroyed-root callback | PASS, real fix | Root cause: `{@const sidebarView = scopeTo(...)}` is a lazy derived value. The 300 ms animation callback re-evaluated it after unmount, and `managed-integration.ts:411` throws `Cannot bind a destroyed root store`. The fix captures the already-bound `PresentationView` with a `use:` action (update on change, clear on destroy). The runtime throw is intact, cleanup is unchanged, and no error is caught or swallowed. **Regression proof:** scratch copy of candidate styleguide with the baseline SidebarDemo → `managed-demo-families.test.ts` ×3: exit 1 every time, with Vitest's unhandled `Cannot bind a destroyed root store` (SidebarDemo.svelte:66). Candidate SidebarDemo in the same scratch setup ×3: exit 0, 5/5. Full styleguide: 5 files, 23 passed. Full product-gallery: 8 files, 68 passed. |
| Root README / CONTRIBUTING | PASS | Labelled "Proposed release train"; the earlier "available on npm" claim is gone. Versions and ranges match the manifests. The "track core exactly / `^<version>`" wording matches the guard. CONTRIBUTING's "the moment core's version moves" is now true for patch bumps too. |

## Non-blocking notes (optional; each is small and could be corrected in this context if authorized)

1. `examples/styleguide/src/lib/components/demos/SidebarDemo.svelte:2`: `import { onDestroy } from 'svelte';` is unused. svelte-check doesn't flag it because `noUnusedLocals` is off. Fix: delete the line.
2. No dedicated Sidebar regression test was added. The guard is the existing `managed-demo-families` test, which fails through Vitest's unhandled-error handling. I showed it catches the bug 3/3, but it depends on timing (animation outliving unmount). It would be stronger with an explicit test: unmount mid-presentation, advance past the animation, assert no error.
3. The Code readiness check keys on `data-proof-editor=<label>` rather than `data-attachment`/`attach:<label>#N`. It is correct for fresh setups. Asserting the attach log entry would be more direct.
4. README: "Svelte `^5.20.0` / Code `^5.30.0`" is slightly ambiguous; it means the code package's svelte peer. The "Proposed" banner will need changing at publish time.
5. Outside the scoped list: `review-ci` root contains the process notes `ARCHIVE-READY.md`, `IMPLEMENTATION.md`, `QUESTIONS.md` and `SHIPPED-REPAIR.md`. Make sure they don't land in main by accident.
6. Environment caveat: the example `node_modules` resolve `svelte` 5.43.3 through main's pnpm store, so the example suites ran on that version. This is the same as baseline and was not investigated further.

Scratch directory `scratch-ci/` (used for the baseline-vs-candidate Sidebar comparison) has been removed.
