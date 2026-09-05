# Gate logs for R0 and its closure

The raw outputs of the core gate (`pnpm --filter @composable-svelte/core build
&& … typecheck && … test && … check`) as it was run before each commit of R0
and R0.5, retained from the session that made them and committed on
4 September 2026 after the review of the closure. ANSI colour codes are
stripped; nothing else is edited. Each log's original modification time is
the moment its last step finished; the gate's steps ran in sequence, and the
whole gate measures under a minute on the machine that ran it (Vitest runs
files in parallel: browser 13–24 s wall clock, node 4–11 s, build about 10 s,
svelte-check about 6 s). Start times were not recorded.

Why they are here: the review of R0 inferred from commit spacing that four
commits could not have had their own gate, and the first revision of
`R0-EXIT.md` repeated that. These files are the evidence either way. Read
them against the table: a log that ends after the previous commit and before
its own, with counts specific to that commit's tree, is that commit's gate.

Times are local to the machine, 4 September 2026.

| Log | Precedes commit (author time) | Log ends | Previous commit | Counts, browser + node |
|---|---|---|---|---|
| gate-R0.1.a.log | `180b57f` 08:50:55 | 08:49:44 | `ae26201` 08:48:25 | 2172 + 511 |
| gate-R0.1.b.log | — (first run for `55cfdb1`; one failure, `select-animation` "fades in rather than appearing instantly", a known flake; re-run alone per the verification protocol) | 08:55:27 | `180b57f` 08:50:55 | red: 1 failed |
| gate-R0.1.b-2.log | `55cfdb1` 08:58:06 | 08:57:32 | `180b57f` 08:50:55 | 2178 + 517 |
| gate-R0.1.c.log | `e583ec7` 09:00:59 | 08:58:52 | `55cfdb1` 08:58:06 | 2178 + 517 |
| gate-R0.1.d.log | `9cae3fe` 09:05:51 | 09:05:21 | `e583ec7` 09:00:59 | 2178 + 517 |
| gate-R0.1.e.log | `0c38b97` 09:07:22 | 09:06:36 | `9cae3fe` 09:05:51 | 2179 + 517 |
| gate-R0.2.e.log | `b4be3f9` 09:09:49 | 09:09:24 | `0c38b97` 09:07:22 | 2179 + 519 |
| gate-R0.2.c.log | `063d6b2` 09:12:12 | 09:11:19 | `b4be3f9` 09:09:49 | 2179 + 523 |
| gate-R0.2.b.log | `ebe96b1` 09:15:47 | 09:15:30 | `063d6b2` 09:12:12 | 2179 + 524 |
| gate-R0.2.a.log | `ff989f5` 09:18:28 | 09:17:55 | `ebe96b1` 09:15:47 | 2179 + 529 |
| gate-R0.2.d.log | `f857011` 09:21:41 | 09:20:06 | `ff989f5` 09:18:28 | 2179 + 556 |
| gate-R0.2.f.log | `9a76281` 09:24:39 | 09:23:13 | `f857011` 09:21:41 | 2179 + 557 |
| gate-R0.3.a.log | `fb57248` 09:26:19 | 09:25:52 | `9a76281` 09:24:39 | 2181 + 557 |
| gate-R0.3.b.log | `9187e4b` 09:27:27 | 09:27:08 | `fb57248` 09:26:19 | 2183 + 557 |
| gate-R0.3.c.log | `a4d8062` 09:29:04 | 09:28:46 | `9187e4b` 09:27:27 | 2188 + 557 |
| gate-R0.3.d.log | `55b6442` 09:35:06 | 09:30:10 | `a4d8062` 09:29:04 | 2188 + 563 |
| gate-R0.2.g.log | `bd717ac` 09:55:02 | 09:54:17 | `55b6442` 09:35:06 | a NOT_COMPILED staleness proof, `pnpm -r check` over 20 workspaces, then 2188 + 566 |
| gate-R0.3.e.log | `6f39c8c` 09:58:54 | 09:58:39 | `bd717ac` 09:55:02 | 2188; node config red — four `typecheck-coverage` timeouts. Committed red; its message says so |
| gate-R0.3.e-2.log | `02fc6b1` 10:02:26 | 10:02:01 | `6f39c8c` 09:58:54 | 2188 + 570 |
| gate-R0.4.a.log | `2751a41` 10:06:16 | 10:03:25 | `02fc6b1` 10:02:26 | the mutation baseline (7/7 by exit code, the first script) then 2189 + 570 |
| gate-R0-end.log | `c79ca25` 10:16:36 | 10:13:07 | `2751a41` 10:06:16 | whole repository; the summary lines were lost to a colour-blind filter, so the test step was re-run: |
| gate-R0-end.test.log | `c79ca25` 10:16:36 | 10:16:13 | `2751a41` 10:06:16 | whole repository, every workspace, 4,720 tests |
| gate-R0.5.a.log | `165030c` 15:35:52 | 15:35:10 | `c79ca25` 10:16:36 | 2189 + 570 |
| gate-R0.5.b.log | `d407b32` 15:40:45 | 15:38:11 | `165030c` 15:35:52 | 2190 + 571 |
| gate-R0.5.c.log | `949c185` 15:43:49 | 15:42:29 | `d407b32` 15:40:45 | 2190 + 583 |
| gate-R0.5.d.log | `cba25a6` 15:45:54 | 15:44:53 | `949c185` 15:43:49 | 2190 + 583 |
| baseline-main-final.out | `f7a5fbd` 15:49:03 | 15:46:48 | `cba25a6` 15:45:54 | `node scripts/mutation-baseline.mjs --strict`: baseline green, 7/7 KILLED by name, exit 0. A scripts-only commit; the core gate is unaffected |
| gate-R0.5.f1.log | `560a5fe` 15:51:01 | 15:50:28 | `f7a5fbd` 15:49:03 | 2190 + 583 |
| gate-R0.5.f2.log | `a2add99` 15:52:31 | 15:52:07 | `560a5fe` 15:51:01 | 2190 + 583 |
| gate-R0-end2.log | `b0a4742` 15:59:10 | 15:58:04 | `a2add99` 15:52:31 | whole repository, every workspace, 4,734 tests, 20/20 svelte-check |
| gate-R0.5.h1.log | `3760b29` 20:46:59 | 20:45:43 | `b0a4742` 15:59:10 | 2190 + 583 |

The commit that adds this directory cannot carry its own log; its gate is
recorded in its message.

## R1

R1's commits land test and fix together; the test's red run at the tree
before the fix is kept as `red-R1.x.y.log`, and the gate as `gate-R1.x.y.log`.

| Log | Commit | What it shows |
|---|---|---|
| red-R1.1.b.log | R1.1.b (with c) | `tests/navigation/dsl-end-to-end.test.ts` at `6cd4801`: five of six red — a child dispatched through `scopeTo().case()` throws on `undefined.type`, `.dismiss()` leaves the field set; the `.optional()` control passes |
| gate-R1.1.b.log | R1.1.b (with c) | core gate at that tree: 2200 browser + 583 node, 0 skipped, check clean. The first run failed `dist-freshness` for five satellites because switching to the old main and back had rewritten their sources; `pnpm -r build` and a re-run, both logged |
| gate-R1.1.d.log | R1.1.d | core gate: 2204 browser + 583 node, 0 skipped, check clean |
| gate-R1.1.e.log | R1.1.e | core gate: 2208 browser + 583 node, 0 skipped, check clean; product-gallery's tests (39) and check run separately, green |
| gate-R1.1.f.log | R1.1.f | core gate: 2210 browser + 583 node, 0 skipped, check clean; the type-level proof is svelte-check going red (3 errors in scope.test.ts) with the returns reverted to `any` |
| baseline-R1.1.g.out | R1.1.g | `node scripts/mutation-baseline.mjs --strict` with the new `R1-N2` entry: baseline green, 8/8 KILLED by name, exit 0 |
| gate-R1.1.g.log | R1.1.g | core gate: 2210 browser + 583 node, 0 skipped, check clean |
| gate-R1.2.log | R1.2 | core gate: 2210 browser + 583 node, 0 skipped, check clean; the two P1 pins replaced by positive assertions, and removing `dist/api/effect-api.js` from sideEffects turns both red |
| gate-R1.3.b.log | R1.3.b | core gate: 2212 browser + 583 node, 0 skipped, check clean. The first run failed `optional-props` on a bare optional in the new `RequestIdentity` type; fixed and re-run |
| gate-R1.3.c.log | R1.3.c | core gate: 2213 browser + 583 node, 0 skipped, check clean |
| gate-R1.3.d.log | R1.3.d | core gate: 2214 browser + 583 node, 0 skipped, check clean |
| gate-R1.3.e.log | R1.3.e | core gate: 2218 browser + 583 node, 0 skipped, check clean. The first run failed svelte-check on a type in the new test's interceptor fixture; fixed and re-run |
| gate-R1.3.f.log | R1.3.f | core gate: 2223 browser + 583 node, 0 skipped, check clean. The first run had every test green but one unhandled rejection from a test that aborted a caller before attaching its expectation; the test was reordered and the gate re-run |
| gate-R1.4.bc.log | R1.4.b+c | core gate: 2224 browser + 583 node, 0 skipped, check clean |
| gate-R1.4.d.log | R1.4.d | core gate: 2227 browser (125 files, the new effect-websocket suite) + 583 node, 0 skipped, check clean |
| gate-R1.4.e.log | R1.4.e | core gate: 2239 browser + 583 node, 0 skipped, check clean (a first run failed check on the new test's untyped helper parameter; fixed, re-run) |
| gate-R1.4.f.log | R1.4.f | core gate: 2242 browser + 583 node, 0 skipped, check clean |
| mutation-baseline-R1.4.f.log | R1.4.f | `node scripts/mutation-baseline.mjs` after M6 was re-anchored on the reconnect: 8 of 8 KILLED (M1, M2, M4, M5, M6, M7, M9, R1-N2) |
| red-R1.4.g.log | R1.4.g | `doc-typecheck` after the docs and types were fixed but before the four DA-H12 `REGISTER` entries were deleted: the staleness arm fails naming them |
| gate-R1.4.g.log | R1.4.g | core gate: 2242 browser + 583 node, 0 skipped, check clean (a first run failed the optional-props ratchet, which asks for its count to follow the six bare optionals fixed; lowered 311 → 305, re-run) |
| gate-R1.4.h.log | R1.4.h | core gate: 2246 browser + 583 node, 0 skipped, check clean |
| red-R1.5.b.log | R1.5.b | `tests/i18n/icu.test.ts` with the two I9 tests added and the source untouched: a malformed message logged three times, not once |
| proof-R1.5.a.log | R1.5.a | a plural rendered by core's dist under plain Node through the example's vite-built server bundle; the `tsx` dev path the plan named cannot start (P13) |
| gate-R1.5.log | R1.5 | core gate: 2248 browser + 583 node, 0 skipped, check clean |
| red-R1.6.a.log | R1.6.a | the new real-Fastify suite before the skip-override marker: the three `register` tests fail (no header, no 429 on a root route), the direct-call control passes |
| gate-R1.6.a.log | R1.6.a | core gate: 2248 browser + 587 node (the new `tests/ssr/middleware-fastify.test.ts`), 0 skipped, check clean |
| gate-R1.6.b.log | R1.6.b | core gate: 2248 browser + 596 node, 0 skipped, check clean (a first run failed the optional-props ratchet, 305 → 297, and two test typings against Fastify's `register` overloads; fixed, re-run) |
| gate-R1.6.c.log | R1.6.c | core gate: 2248 browser + 600 node, 0 skipped, check clean |
| gate-R1.7.a.log | R1.7.a | core gate: 2248 browser + 607 node (seven SSG tests and the new `tests/ssr/ssg-fs.test.ts`), 0 skipped, check clean |
| gate-R1.7.bc.log | R1.7.b+c | core gate: 2248 browser + 609 node, 0 skipped, check clean |
| gate-R1.7.d.log | R1.7.d | core gate: 2248 browser + 611 node, 0 skipped, check clean |
| gate-R1.8.a.log | R1.8.a | core gate: 2256 browser + 611 node, 0 skipped, check clean (a first run failed check on an `it.each` fixture whose executor type inferred as unknown; typed, re-run) |
| gate-R1.8.b.log | R1.8.b | core gate: 2258 browser + 611 node, 0 skipped, check clean (a first run was killed: an existing destroy test's dispatch-after-destroy now warns and had to declare it) |
| red-R1.9.0.log | R1.9.0 | the shadow measurement before TestStore's semantics change: per-file counts of out-of-order receives (9), leftovers at send (7), immediate debounces (17) and send-assertions after a synchronous dispatch (27) across core and auth; nothing in flight at finish anywhere; chat and graphics clean |
| gate-R1.9.ace.log | R1.9.a+c+e | core gate: 2267 browser + 611 node, 0 skipped, check clean; auth's suites (537 + 30) green against the rebuilt dist |
| gate-R1.9.bd.log | R1.9.b+d | core gate: 2279 browser + 611 node, 0 skipped, check clean |
| gate-R1-exit.log | R1 exit | whole-repository gate at `95a7a3b`: `pnpm -r build && pnpm -r typecheck && pnpm -r --workspace-concurrency=1 test && pnpm -r check` — 4,851 tests passed, 0 skipped; svelte-check clean in all 20 workspaces |
| mutation-baseline-R1-exit.log | R1 exit | `node scripts/mutation-baseline.mjs --strict` at `95a7a3b`: 8 of 8 KILLED, exit 0 |
| gate-C0.log | C0 (R1 closure) | core gate, one run: 2273 browser (the six duplicate tests gone) + 611 node, 0 skipped, check clean; porcelain = the two files committed |
| red-C1.log | C1 | `tests/websocket/live-client.test.ts` with only the harness change (`error()` sets `readyState = CLOSED` first, the browser's order): the R1.4.e test for an error on an established socket fails — `expected 'failed' to be 'connected'` |
| gate-C1.log | C1 | core gate, one run: 2290 browser + 611 node, 0 skipped, check clean; porcelain = the files committed |
| red-C3.log | C3 | the middleware suites with the new tests and the sources restored: `fp(plugin)` throws `Cannot assign to read only property`, the direct call with a bad config does not throw, first-seen eviction drops the long-lived client (4 fail) |
| gate-C3.log | C3 | core gate, one run: 2290 browser + 616 node, 0 skipped, check clean; porcelain = the files committed |
| red-C7-node.log | C7 | the SSR, SSG and i18n node suites with the new tests and the sources restored: 9 fail — the SSG path refused after the loaders ran, the `.html` segments accepted, the symlink write allowed, the canonical and alternate links unencoded, `serializeState` returning `undefined` |
| red-C7-browser.log | C7 | `tests/i18n/icu.test.ts` and `tests/i18n/reducer.test.ts` with the sources restored: 2 fail — the failure cache unbounded, the locale outside `availableLocales` accepted |
| gate-C7.log | C7 | core gate, one run after a two-error svelte-check fix in the new SSG test (untyped mock parameters), whose first run is not logged: 2292 browser + 623 node, 0 skipped, check clean; porcelain = the files committed |
| red-C2a.log | C2a | the new `stable-stringify`, `errors` and rewritten `client` shared-attempt tests against the restored sources and harness: 4 fail (a Date renders as `{}`, `undefined` properties kept), 2 suites cannot import `CancelledError` and `deferred` |
| gate-C2a.log | C2a | core gate, one run: 2304 browser + 623 node, 0 skipped, check clean; porcelain = the files committed |
| red-C2b.log | C2b | the new pipeline, registry and mock-parity tests against the restored sources: 49 fail (interceptors after the key and inside every attempt, a dead attempt joined, FormData stringified, headers case-sensitive, `timeout: 0` accepted, raw-path invalidation, no mock coalescing), and `deduplication.test.ts` cannot import `isPlainData` |
| gate-C2b.first.log | C2b | core gate, first run: 2398 browser + 623 node green, svelte-check 1 error — a generic response interceptor wrapped in `vi.fn` in the new pipeline test lost its type parameter |
| gate-C2b.log | C2b | core gate, second run after that test's fix: 2398 browser + 623 node, 0 skipped, check clean; porcelain = the files committed |
| red-C4.log | C4 | the new Effect.map, store and TestStore tests against the restored sources: 8 fail — the AfterDelay arm returns nothing (its rejection unhandled, finish() passing), Debounced and Throttled executors see no signal, every dispatch after destroy() warns |
| gate-C4.log | C4 | core gate, one run: 2403 browser + 623 node, 0 skipped, check clean; porcelain = the files committed |
| red-C5.log | C5 | the new TestStore tests against the old implementation with only `real-timers.ts` in place: 22 fail — `receive()` moving the fake clock, an armed debounce passing `finish()`, no signal to four executor kinds, no `destroy()`, rejections reported only at the timeout, no array form, the import guard absent |
| gate-C5.first.log | C5 | core gate, first run: 2428 browser green, 2 node failures (the doc-typecheck register's staleness arm: `receive()`'s new signature changed five registered messages), svelte-check 2 errors in the new tests |
| gate-C5.second.log | C5 | core gate, second run: tests green, svelte-check 14 errors — a register line pasted with the assertion's trailing text |
| gate-C5.log | C5 | core gate, third run: 2428 browser + 623 node, 0 skipped, check clean; porcelain = the files committed |
