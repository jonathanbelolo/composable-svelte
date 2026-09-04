# R0 — exit report, 4 September 2026 (revised after review)

**What R0 was.** Step R0 of `AUDIT-REMEDIATION-PLAN.md`: make every later fix
provable. No library code changed. The instruments were repaired, and every
defect a repaired instrument revealed is pinned, not fixed, in a form that
fails on the day the fix lands.

**What this revision is.** The first exit report was written at `2751a41`.
An adversarial review of R0 on 4 September — seven reviewers, five reading
the tree and two mutating isolated worktrees — found that the substance held
and the record did not, and found three tests, one guard and the baseline
script still able to pass for the wrong reason. R0.5 closed those; the
section "The review, and what it changed" lists each finding and the commit
that answered it. Claims the first report made that the tree did not support
are corrected in place below, not preserved.

**Where it ends.** The last code commit of R0 is `3760b29`; this document is
committed on top of it. Nothing published, tagged or version-bumped.

## The gate at the exit

| Step | Command | Result at `a2add99` |
|---|---|---|
| build | `pnpm --filter @composable-svelte/core build` | exit 0 |
| typecheck | `pnpm --filter @composable-svelte/core typecheck` | exit 0 |
| test | `pnpm --filter @composable-svelte/core test` | 2190 browser + 583 node passed, **0 skipped** |
| check | `pnpm --filter @composable-svelte/core check` | 0 errors, 0 warnings |

Every commit in the ledger that touches `packages/core` carries the same four
lines, run on that commit's tree; the script-only commit `f7a5fbd` records
that the core gate is unaffected, and the docs commits carry the
whole-repository line. The raw gate outputs are in
`plans/hardening/gate-logs/`, one per commit, with their original times in
that directory's README: each ends between the previous commit and its own,
and its counts are specific to its tree. The first revision of this report
said four R0 commits (`fb57248`, `9187e4b`, `a4d8062`, `0c38b97`) carried
the gate of a batch, because the review had estimated a core gate at several
minutes and those commits were 68 to 100 seconds apart; the logs show the
gates, and a core gate measures under a minute (Vitest runs files in
parallel: browser 13–24 s wall clock, node 4–11 s, build about 10 s, check
about 6 s). Commit `b0a4742`'s message repeats the wrong inference.

The whole-repository gate (`pnpm -r build && pnpm -r typecheck && pnpm -r
--workspace-concurrency=1 test && pnpm -r check`), run at the same tree:
every workspace green — build and typecheck exit 0, 4,734 tests passed across all
workspaces with **0 skipped**, svelte-check 0 errors and 0 warnings in all 20.

At the start of R0 the core gate read 2,169 passed with **3 skipped** in the
browser project and 511 node: the R0.1.a gate (`gate-logs/gate-R0.1.a.log`)
reads 2,172 + 511 after the three were un-skipped and nothing else changed.
`plans/hardening/PHASE-1-STATE.md` at `37afb0d` gives the whole-repository
line, 4,641 passed with 3 skipped.

**Continuous integration has run this branch.** `.github/workflows/ci.yml`
triggers on pushes and pull requests to `main` and `develop` only, so every
gate above was local (macOS, Node 24) until the branch was pushed and draft
pull request #1 opened on 4 September:
https://github.com/jonathanbelolo/composable-svelte/pull/1. Its first run,
https://github.com/jonathanbelolo/composable-svelte/actions/runs/33910380963
at `ad09f09` on Ubuntu with Node 20.20.2, passed every step: install,
Playwright, build, typecheck, tests (4,734 passed under
`--workspace-concurrency=1`, the same count as the local whole-repository
gate), svelte-check, and the auth integration browser suite. Later pushes
re-run it; the record here is that first run.

## The audit's mutations, re-run

`node scripts/mutation-baseline.mjs --strict` at `a2add99`. Since R0.5.e the
script runs the seven suites clean first and calls a mutation KILLED only
when the test named in its `expect` field is among the failures; anything
else is SUSPECT.

| id | mutation | suite | verdict |
|---|---|---|---|
| M1 | TestStore exhaustivity | tests/test-store.test.ts | **KILLED** |
| M2 | destroy() aborts in-flight cancellables | tests/store.test.ts | **KILLED** |
| M4 | matchPresentationAction requires the presented wrapper | tests/navigation/operators.test.ts | **KILLED** |
| M5 | scope() lifts child effects to parent actions | tests/composition.test.ts | **KILLED** |
| M6 | the heartbeat's missed-pong branch | tests/websocket/heartbeat.test.ts | **KILLED** |
| M7 | the ICU formatting-error fallback | tests/i18n/icu.test.ts | **KILLED** (a second icu test also failed) |
| M9 | the query-param decode fallback | tests/routing/query-params.test.ts | **KILLED** |

Baseline green before the first mutation; sources byte-identical after;
exit 0. M4 survived the script's first run on 4 September and is killed by
a test added in `2751a41`, the same commit that added the script. The first
version of the script read any non-zero exit as a kill and had no clean
run, so its "seven of seven" was "seven suites exited non-zero"; the
verdicts above are by name.

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

Every one was shown live by the review: a fix-like change to the source it
names turned it red, and restoring the source turned it green again. The
structural P1 pin was also red under a *partial* fix that lists only the api
barrel in `sideEffects` — which does not fix the bundle — and would have
told a fixer to delete it while the defect stood; since `cba25a6` it asserts
the chain is reported whichever link is unprotected, and goes red only on
the whole chain.

## Registered findings

| Register | Where | Entries | Staleness arm |
|---|---|---|---|
| `REGISTER` | `tests/repo/doc-typecheck.test.ts` | 48: G6 25, DA-H12 4, DA-X1 17, EXCERPT 2 | yes |
| `KNOWN_MISSING_SKILLS` | `tests/repo/front-door.test.ts` | 1 (`composable-svelte-frontend.md`, G3) | yes |
| `NOT_COMPILED` | `tests/repo/skill-examples.test.ts` | 18 (DA-X2) | yes |

The first report gave `REGISTER` as 49 and `NOT_COMPILED` as 19. One
register entry was the guard's own Vite shim typing `import.meta.env` keys
narrower than Vite does, against a correct README (`a2add99` fixes the
shim); two are what an elided excerpt produces and are now under their own
`EXCERPT` header rather than counted as API claims. One `NOT_COMPILED` entry
was a valid ssr `<svelte:head>` fence that one component cannot hold twice;
a second fixture holds it live (`560a5fe`). R4 empties all three registers.

## What the console guard measured

`55cfdb1`'s message records that, with the guard strict before any test was
converted, 14 browser and 2 node tests emitted undeclared `console.error` or
`console.warn`, every one exercising a logging path on purpose. No log of
that run was retained, so the count rests on the message. All sixteen
declare their output with `expectConsole`, as do the eight sites that used
`vi.spyOn(console, …)` before. Since `d407b32` a declaration means exactly
one call unless it says otherwise; every declaring file passed under that
default without a count, so no site logs more than once today.

What the guard cannot see, recorded in `tests/helpers/console.ts`: a call
made after the test's `afterEach` has put the original console back lands on
whichever test is running by then, and is lost if none is.

## Task ledger

Every commit in `37afb0d..HEAD`, in order.

| Task | Commit | What it did |
|---|---|---|
| — | `ae26201` | the remediation plan and the findings register, before R0 |
| R0.1.a | `180b57f` | the three TestStore tests run (T1) |
| R0.1.b | `55cfdb1` | undeclared console output fails the test that produced it (T2); one commit where the plan said a report-only commit first |
| R0.1.c | `e583ec7` | CI no longer silences test output (T2) |
| R0.1.d | `9cae3fe` | seventeen tests rewritten to assert what their names claim (T4); three still could not, see R0.5.a |
| R0.1.e | `0c38b97` | destroy() is asserted to tear down, and N7 is pinned |
| R0.2.e | `b4be3f9` | guard-integrity checks the styles guards and its own predicates (T5) |
| R0.2.c | `063d6b2` | CLAUDE.md is read by the doc guards (G3, G8) |
| R0.2.b | `ebe96b1` | doc-typecheck admits the four codes it was blind to (G7) |
| R0.2.a | `ff989f5` | side-effects sees an import-time assignment, and pins P1 (P1, T5) |
| R0.2.d | `f857011` | positive controls for seven guards (T5); animation-policy already had one |
| R0.2.f | `9a76281` | flat-barrel parses each declaration once, and proves a gap is reported (T5) |
| R0.3.a | `fb57248` | the real API client gets a scripted fetch, and A1 is pinned |
| R0.3.b | `9187e4b` | the real live client gets a scripted socket, and W1 is pinned |
| R0.3.c | `a4d8062` | the real storage adapters run against the browser's, and D5, D6 are pinned |
| R0.3.d | `55b6442` | every exported subpath is imported by a plain Node process, and I1 is pinned |
| R0.2.g | `bd717ac` | every skill's svelte fences are pinned by a typechecked fixture (G9) |
| R0.3.e | `6f39c8c` | a real bundler probe, and P1 is pinned; committed with the node gate red, by its own message |
| — | `02fc6b1` | typecheck-coverage tolerates the load the new probes add; the gate is green again |
| R0.4.a | `2751a41` | the baseline script, a test that kills M4, and the first exit report |
| — | `c79ca25` | the first report records the whole-repository gate, run after the exit commit |
| R0.5.a | `165030c` | the three tests that could not fail for the code they name now do |
| R0.5.b | `d407b32` | the console guard expects exactly one call; the harnesses restore themselves |
| R0.5.c | `949c185` | side-effects, guard-integrity, public-exports and dist-freshness repaired |
| R0.5.d | `cba25a6` | the structural P1 pin holds under a partial listing |
| R0.5.e | `f7a5fbd` | the baseline script kills by name, after a clean run |
| R0.5.f | `560a5fe` | skill fixtures pin what they say; DA-X2 corrected |
| R0.5.f | `a2add99` | doc-typecheck's Vite shim matches Vite; DA-X1 corrected |
| R0.5.g | `b0a4742` | the findings register annotated, the plan and this report corrected; its message repeats the batch-gating inference this revision withdraws |
| R0.5.h | `3760b29` | the sub-barrel extractor sees async, abstract and declare declarations |
| R0.5.h | `ad09f09` | the record corrected after the review of the closure; the gate logs committed |
| R0.5.i | this commit | the branch pushed, draft pull request #1 opened, its first CI run recorded |

## The review, and what it changed

Verified by mutation in a worktree or by reading, then closed:

1. **Three rewritten tests still passed with their named code broken.** The
   heartbeat "stop" test passed with the public `stop()` a no-op, because
   the pong timeout stopped the heartbeat first and R0.1.b had declared that
   very warning. The routing "prevents infinite loops" test passed with the
   popstate guard deleted, because a pushState never fires popstate. The
   Select "never invisible-but-open" test asserted a shape a stuck
   `presenting` cannot take. → `165030c`; each now red under that mutation.
2. **`expectConsole` accepted one or more calls**, where the plan said one;
   twenty-seven sites used the bare form. → `d407b32`.
3. **The import-mutation marker matched only column zero.** Indenting the
   `Effect.api` assignment by two spaces made the guard report core's api
   chain clean. → `949c185`: leading whitespace, bracket access and logical
   assignments match; a minified dist fails a named arm instead of silencing
   every regex in the file.
4. **The baseline script counted any non-zero exit as a kill**, never ran the
   suite clean, and had no interrupt handling. → `f7a5fbd`.
5. **The structural P1 pin went red on a partial fix.** → `cba25a6`.
6. **The doc-typecheck register carried the guard's own shim error and two
   excerpt artefacts as documentation defects.** → `a2add99`.
7. **DA-X2 called a valid fence invalid, called all nineteen "not valid
   Svelte", and was silent on thirteen import-outside-script fences and the
   forms stand-ins; four fixture headers described a comment-pinning
   mechanism the guard no longer used.** → `560a5fe`; the fence line numbers
   corrected again in R0.5.h (thirteen import-outside-script fences, cited by
   their `import` line).
8. **Guard registration was a substring search over the config text**, and
   nothing pinned the styles glob or the setup control. → `949c185`.
9. **`public-exports` could not see a symbol declared in place in a
   sub-barrel; `dist-freshness`'s control was satisfied by a constant.** →
   `949c185`.
10. **The harnesses' cleanup was an `afterEach` a file had to remember.** →
    `d407b32`, via `onTestFinished`.
11. **The findings register showed every R0 finding untouched; four ticked
    plan lines described work that shipped differently; the first report
    misstated the whole-repository gate, the ledger, M4, animation-policy and
    CLAUDE.md coverage.** → `b0a4742`.

### Review of the closure

R0.5 was reviewed the same way on 4 September, after the closure. Every proof
the eight commits claim was re-run as a plant or mutation in a fresh worktree
at `b0a4742` and behaved as claimed: the three tests fail under the mutation
of the code they name; the console guard fails one-declared-two-logged and
accepts explicit counts under both configs; the harnesses restore themselves
after two scripted fetches in one test and after an install from a nested
`beforeEach`; the mutation marker reports an indented or block-wrapped
assignment and the shape arm names a minified file; guard registration by
comment fails both arms and the glob and setup entries are pinned; an
in-place declaration and a constant `newest()` are caught; the structural P1
pin passes under barrel-only and leaf-only listings and fails under the whole
chain; the baseline script reports a wrong expected name as SUSPECT, a moved
anchor as ERROR, and stops at a planted red baseline; a typo in the new ssr
fixture fails the guard and svelte-check; a fence moved into a fixture's
script fails the guard; reverting the shim or deleting an EXCERPT entry fails
doc-typecheck. What did not hold was the record, corrected in R0.5.h:

1. The plan ticked R0.5.g as done including a push and pull request that
   never happened (refused by the permission layer). → the tick names only
   what shipped; the push is R0.5.i, done once the user authorised it.
2. This report said four R0 commits carried the gate of a batch. The retained
   logs refute it; see the gate section. → corrected, logs committed.
3. "Every R0.5 commit carries the same four lines" was false for the
   script-only and docs commits. → corrected.
4. DA-X2 cited the components fences by fence-opener line, the code and media
   fences by import line, and missed the eleventh components fence, whose
   `import` spans two lines. → all thirteen cited by import line.
5. The start-of-R0 figure cited the whole-repository line for a core split
   derived from the R0.1.a gate. → cited correctly.
6. `declaredExports` in `public-exports` missed `export async function` and
   `export abstract class` (planted, not caught). → widened; the plant is
   caught.
7. The gate logs lived only in the session's scratch directory. → committed.

Known and left as they are, each recorded where it applies:

- The console guard's attribution of late logs (`tests/helpers/console.ts`).
- The mutation marker now also matches an assignment inside a function
  body: an accepted false positive, zero across every package's dist today
  (`tests/repo/side-effects.test.ts`).
- `CLAUDE.md` is compiled for its one fence that names the package; the
  fences carrying `G1` and `G2` do not, and wait for R4.
- `NOT_COMPILED` keys on a 72-character prefix, so an edit beyond it stays
  exempt until the entry is re-keyed.
- The graphics fixture typechecks none of the sound markup halves of the
  fences it registers; maps does for its one. Left for R4.5 with the skill.
- `component-coverage`'s control proves the filter, not the resolver;
  `INTENTIONALLY_PRIVATE`'s staleness arm checks declaration, not export;
  `ROLLUPS`'s checks a substring; the skills-tree parser in `front-door`
  yields nothing for a tree without a trailing slash. Low, unchanged.
- The plan's report-only console-guard commit was never made; the strict
  measurement stands on `55cfdb1`'s message alone.

## What R0 did not do

- The `Domain=` half of D6 cannot be shown on the test origin (Chromium
  refuses `Domain=localhost`); R2.5 covers it on a dotted host.
