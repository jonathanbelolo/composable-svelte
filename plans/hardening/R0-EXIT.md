# R0 — exit report, 4 September 2026

**What R0 was.** Step R0 of `AUDIT-REMEDIATION-PLAN.md`: make every later fix
provable. No library code changed. The instruments were repaired, and every
defect a repaired instrument revealed is pinned, not fixed, in a form that
fails on the day the fix lands.

**Where it ends.** The commit that adds this file, on `phase-1-feature-surface`
(its parent is `02fc6b1`). Gate green at that tree; the counts and the command
behind each are below. Nothing published,
tagged or version-bumped.

## The gate at the exit commit

| Step | Command | Result |
|---|---|---|
| build | `pnpm --filter @composable-svelte/core build` | exit 0 |
| typecheck | `pnpm --filter @composable-svelte/core typecheck` | exit 0 |
| test | `pnpm --filter @composable-svelte/core test` | 2189 browser + 570 node passed, **0 skipped** |
| check | `pnpm --filter @composable-svelte/core check` | 0 errors, 0 warnings |

At the start of R0 the same gate read 2,172 browser + 511 node passed with
**3 skipped** (`git show 37afb0d`, and the first gate log of this step).

## The audit's mutations, re-run

`node scripts/mutation-baseline.mjs` at the exit commit:

| id | mutation | suite | verdict |
|---|---|---|---|
| M1 | TestStore exhaustivity | tests/test-store.test.ts | **KILLED** |
| M2 | destroy() aborts in-flight cancellables | tests/store.test.ts | **KILLED** |
| M4 | matchPresentationAction requires the presented wrapper | tests/navigation/operators.test.ts | **KILLED** |
| M5 | scope() lifts child effects to parent actions | tests/composition.test.ts | **KILLED** |
| M6 | the heartbeat's missed-pong branch | tests/websocket/heartbeat.test.ts | **KILLED** |
| M7 | the ICU formatting-error fallback | tests/i18n/icu.test.ts | **KILLED** |
| M9 | the query-param decode fallback | tests/routing/query-params.test.ts | **KILLED** |

Positive controls for the harness itself were run on 3 September (hydration
escaping, ifLet null guard: both killed) and are unchanged.

## Pinned defects

Each is a plain test asserting the *defective* value, named with its finding
ID and the words `(pinned defect)`, so it fails the moment the fix lands and
must be removed in the same commit. `it.fails` is not used: in Vitest 4 it
passes on any failure, including a typo.

`grep -rn "(pinned defect)" packages/core/tests --include='*.ts' | grep "it("`:

- api/client.test.ts :: 'A1 (pinned defect): two clients with different default headers share one in-flight GET'
- dependencies/cookie-storage.real.test.ts :: 'D5 (pinned defect): one foreign cookie with a raw percent sign makes every read throw'
- dependencies/cookie-storage.real.test.ts :: 'D6 (pinned defect): clear() by a fresh instance removes nothing'
- repo/bundle-probe.test.ts :: 'P1 (pinned defect): drops the Effect.api registration'
- repo/dist-import.test.ts :: 'I1 (pinned defect): ICU returns the raw message under plain Node'
- repo/side-effects.test.ts :: "P1 (pinned defect): core's Effect.api registration chain is uncovered"
- store.test.ts :: 'N7 (pinned defect): an AfterDelay scheduled before destroy() still fires into the destroyed store'
- websocket/live-client.test.ts :: 'W1 (pinned defect): a failed reconnect attempt is the last'

## Registered doc findings

`doc-typecheck.test.ts` `REGISTER`: 49 entries (G6 26,
DA-H12 4, DA-X1 19), each keyed machine- and index-independently,
with the existing staleness arm. `front-door.test.ts` `KNOWN_MISSING_SKILLS`:
1 (`composable-svelte-frontend.md`, G3). R4 empties both.

## What the console guard measured

First strict run, before any test was converted: 14 browser + 2 node tests
emitted undeclared `console.error`/`console.warn`, every one exercising a
logging path on purpose. All sixteen now declare it with `expectConsole`; the
eight pre-existing `vi.spyOn(console, …)` sites use the same mechanism.

## Task ledger

| Task | Commit | Proof |
|---|---|---|
| R0.1.a | `180b57f` | the three TestStore tests run (T1) |
| R0.1.b | `55cfdb1` | undeclared console output fails the test that produced it (T2) |
| R0.1.c | `e583ec7` | CI no longer silences test output (T2) |
| R0.1.d | `9cae3fe` | seventeen tests now assert what their names claim (T4) |
| R0.1.e | `0c38b97` | destroy() is asserted to tear down, and N7 is pinned |
| R0.2.e | `b4be3f9` | guard-integrity checks the styles guards and its own predicates (T5) |
| R0.2.c | `063d6b2` | CLAUDE.md is read by the doc guards (G3, G8) |
| R0.2.b | `ebe96b1` | doc-typecheck admits the four codes it was blind to (G7) |
| R0.2.a | `ff989f5` | side-effects sees an import-time assignment, and pins P1 (P1, T5) |
| R0.2.d | `f857011` | positive controls for seven guards that reported zero for the wrong reason (T5) |
| R0.2.f | `9a76281` | flat-barrel parses each declaration once, and proves a gap is reported (T5) |
| R0.3.a | `fb57248` | the real API client gets a scripted fetch, and A1 is pinned |
| R0.3.b | `9187e4b` | the real live client gets a scripted socket, and W1 is pinned |
| R0.3.c | `a4d8062` | the real storage adapters run against the browser's, and D5, D6 are pinned |
| R0.3.d | `55b6442` | every exported subpath is imported by a plain Node process, and I1 is pinned |
| R0.2.g | `bd717ac` | every skill's svelte fences are pinned by a typechecked fixture (G9) |
| R0.3.e | `6f39c8c` | a real bundler probe, and P1 is pinned |
| — | `02fc6b1` | typecheck-coverage tolerates the load the new probes add |
| R0.4.a | this commit | seven of seven mutations killed; this report |

R0.2.g pinned fifteen skills through fifteen fixtures (148 markup-bearing
fences), every one clean under svelte-check. The nineteen fences that are not
valid Svelte are registered in `NOT_COMPILED` (DA-X2) for R4.5.

## What R0 did not do

- The `Domain=` half of D6 cannot be shown on the test origin (Chromium
  refuses `Domain=localhost`); R2.5 covers it on a dotted host.
- The `animation-policy` end-to-end control (lowest priority in R0.2.d) was
  not added; its helper-level controls were already the strongest in the
  directory.
