# R1 — exit report, 5 September 2026 (revised 5 September after the review)

> **Revised.** The adversarial review of R1 (`R1-REVIEW.md`, 5 September)
> found this report's accounting wrong in eight places and the branch
> carrying a duplicated test block; every correction is made in place below
> and marked *(corrected)*, and the section "The review, and what it changed"
> at the end records what the closure (`hardening/r1-closure`, core 0.12.1)
> did about each finding.

**What R1 was.** Step R1 of `AUDIT-REMEDIATION-PLAN.md`: the eight critical
findings of the 3 September audit — N1/N2 (the navigation DSL could not
compose with itself), P1 (`Effect.api` dropped by bundling), A1 (one in-flight
map for every API client), W1 (one reconnect attempt), I1 (ICU dead under
plain Node), SS3 (`app.register()` installed nothing), N3/N7 (a synchronous
throw escaped `dispatch()`; `destroy()` left the store live) and N9 (a
`TestStore` that could not fail) — with the high-severity findings that share
their code paths. The owner decisions it needed were taken on 4 September:
D1 (the `scopeTo().case()` action shape is canonical), D2 (the API client,
WebSocket client and storage stay public and are fixed), D3 (dedup and cache
per client), D7 (version 0.12.0 at the end); and on 5 September: API `timeout`
per caller over the whole request, `WebSocketConfig` loses its four unread
fields, `TestStore.receive()` strict by default with the affected tests fixed.

**Where it starts and ends.** Main was at `6cd4801` (R0 merged). R1 is the 29
commits `6cd4801..95a7a3b` on `hardening/r1`, one per plan line or per group
of lines whose tests could only be written once (each such group says so in
its message), every one carrying a core gate run on its own tree; the last
code commit is `95a7a3b`, the version. After it: this report (`0bc106b`), the
chat test fix CI demanded (`db87c84`, `0c106c9`), and the docs commit that
records both. The core package goes from 0.11.2 to 0.12.0.

## The gate at the exit

| Step | Command | Result at `95a7a3b` |
|---|---|---|
| build | `pnpm --filter @composable-svelte/core build` | exit 0 |
| typecheck | `pnpm --filter @composable-svelte/core typecheck` | exit 0 |
| test | `pnpm --filter @composable-svelte/core test` | 2,279 browser + 611 node passed, **0 skipped** |
| check | `pnpm --filter @composable-svelte/core check` | 0 errors, 0 warnings |

R0 left the core gate at 2,190 browser + 583 node. R1 adds 83
browser tests and 28 node tests and deletes the six pinned-defect
tests it fixed *(corrected: the first form said 89; six of the 2,279 were
the block `59809be` appended a second time — see 2.2 in the review and C0 in
the closure — so the tree at `95a7a3b` did hold 2,279, of which six were
duplicates)*.

The whole-repository gate (`pnpm -r build && pnpm -r typecheck && pnpm -r
--workspace-concurrency=1 test && pnpm -r check`), run at `95a7a3b`
(`gate-logs/gate-R1-exit.log`): every workspace green — build and typecheck exit 0; 4,851 tests passed across the 15 workspaces that have tests (core 2,279 browser + 611 node; auth 537 + 30; charts 191; code 81; graphics 482; maps 106; media 94; chat 235 + 5; the seven examples with tests 93 + 39 + 25 + 18 + 13 + 8 + 4), **0 skipped**; svelte-check 0 errors and 0 warnings in all 20 workspaces. R0's exit read 4,734 passed. *(corrected: the first form attributed five of these counts to the wrong workspaces — 81 to chat, 482 to code, 106 to graphics, 94 to maps, 93 to media — and counted "18 workspaces" and "nine examples"; the six duplicate tests are inside the 2,279 and the 4,851.)*

Every gate log is in `plans/hardening/gate-logs/` with a row in that
directory's README (38 R1 rows: 28 core gates, the two baseline outputs —
after R1.1.g and after R1.4.f — the R1.9.0 measurement, four red runs, one
proof, and the two exit logs) *(corrected: the first form said 36 rows and
24 gates)*. Eight gates were run twice — R1.1.b (dist-freshness after a
branch switch), R1.3.b and R1.4.g and R1.6.b (the optional-props ratchet,
311 → 305 → 297), R1.3.e and R1.4.e and R1.8.a (`check` on a test typing),
R1.3.f (an unhandled rejection in a test) — and R1.8.b was killed mid-run
and restarted after a test had to declare a console call the fix introduced
*(corrected: the first form named four, and R1.7.b+c's restart was not a
gate run)*. Each README row describes the first run; only the passing run
has a log. From the closure on, every completed run is logged.

**Continuous integration.** Draft pull request #2
(https://github.com/jonathanbelolo/composable-svelte/pull/2), opened at
`0bc106b`. Its first run,
https://github.com/jonathanbelolo/composable-svelte/actions/runs/33927994844,
passed every workspace but chat: one test, `message-entry.test.ts`'s
"animates a message the list marks as new", read an opacity of 0 at a
fixed 20 ms after mount — the same failure main's own run at `6cd4801`
(https://github.com/jonathanbelolo/composable-svelte/actions/runs/33914399070)
had shown, which no local run reproduces. Registered as T7 and fixed in two
commits: `db87c84` polled for "above 0", which the element's resting 1 satisfies
before the first frame — it failed locally and was pushed anyway by a chained
command that did not stop on the red run (its run,
…/33928751650, failed the same way); `0c106c9` polls for a frame strictly
between 0 and 1. Its run,
https://github.com/jonathanbelolo/composable-svelte/actions/runs/33928820257,
passed every step on Ubuntu with Node 20: install, Playwright, build,
typecheck, tests under `--workspace-concurrency=1`, svelte-check, and the
auth integration browser suite. This closing docs commit is the last on the
branch; its own run is the one the merge waits for.

## The audit's mutations, re-run

`node scripts/mutation-baseline.mjs --strict` at `95a7a3b`
(`gate-logs/mutation-baseline-R1-exit.log`): 8 of 8 KILLED — M1, M2, M4, M5, M6, M7, M9 and R1-N2 — exit 0. M1 lists further tests that also fail under it (the `finish()` tests, each twice at that tree because of the duplicated block) and M7 one (the missing-parameters test), which the script reports as detail; a verdict is KILLED when the named test is among the failures *(corrected: "each list a second test")*. That log ends at "Rebuilding core…" with no exit line; the review's re-run gave exit 0 and an identical table, and the closure's exit regenerates it. Since R1.4.f the M6
entry anchors on the heartbeat's `client.reconnect(...)` call and expects the
renamed test; since R1.1.g the script carries R1-N2 (`createDestination` maps
the child's effect into its case). M1's anchor — `assertNoPendingActions()`'s
predicate — is unchanged; `send()`'s new leftover check writes the same
predicate with its operands reversed so the anchor stays unique.

Beyond the baseline, every fix in R1 was mutation-verified in place: the
fix reverted or mutated, the named test watched fail, the source restored —
about 73 mutations by the review's count *(corrected: "60-odd")*, each
recorded in its commit message with the tests it killed. One is recorded as
surviving on purpose *(corrected: "two")*: the SSG path check's second guard
(the resolved target under `outDir`) cannot be reached past the first on
POSIX and is there for a Windows drive-letter segment and as depth on a file
write; the pair removed together is killed by four tests (R1.7.a).

## Pinned defects

`grep -rn "(pinned defect)" packages/core/tests --include='*.ts' | grep "it("`
at `95a7a3b` lists two, both R2.5's:

- dependencies/cookie-storage.real.test.ts :: 'D5 (pinned defect): one foreign cookie with a raw percent sign makes every read throw'
- dependencies/cookie-storage.real.test.ts :: 'D6 (pinned defect): clear() by a fresh instance removes nothing'

The six R0 pinned for R1 — A1, I1, N7, P1 (two arms), W1 — each went red on
the commit that fixed its finding and was deleted or replaced there: A1 by
the two-client dedup tests (R1.3.b); I1 by the positive `'1 item'` assertion
under plain Node (R1.5); N7 by three destroy tests (R1.8.b); P1's bundle-probe
arm by "keeps the Effect.api registration" and its side-effects arm deleted
with core's exclusion (R1.2); W1 by the ladder tests (R1.4.b+c).

## Registered findings

| Register | Where | Entries at `6cd4801` | At `95a7a3b` | Staleness arm |
|---|---|---|---|---|
| `REGISTER` | `tests/repo/doc-typecheck.test.ts` | 48 | 42: G6 23, DA-X1 17, EXCERPT 2 | yes — run red before the DA-H12 deletion (`red-R1.4.g.log`); R1.6.a's G5 deletion has no red log *(corrected: "before each deletion")* |
| `KNOWN_MISSING_SKILLS` | `tests/repo/front-door.test.ts` | 1 | 1 | yes |
| `NOT_COMPILED` | `tests/repo/skill-examples.test.ts` | 18 | 18 | yes |

Six `REGISTER` entries went: the four DA-H12 lines (R1.4.g made every
`ReconnectConfig`/`HeartbeatConfig` field optional and rewrote the fences)
and the two G5 lines (R1.6.a corrected `strictTransportSecurity`/`xFrameOptions`
and `hsts.preload` in the SSR and deployment skills).

## The findings register

39 findings carry a `**Closed by R1.x:**` line naming what changed and where
it is tested; SS11 carries a `**Partly closed**` line naming its remainder
(R2.2's). By area:

| Area | Closed | Left for R2, and why |
|---|---|---|
| Navigation DSL | N1, N2, N8, N11, N14, P5 | N5 (`Effect.map` drops the `Cancellable` signal — R1.8.b forwards the store's lifetime signal for `Run`/`AfterDelay` only), N16 |
| Bundling | P1, DA-C4 | — |
| API client | A1, A2, A3, A7, A11 | a retry backoff sleep can outlive the last detach (`retry.ts` is not signal-aware; noted in R1.3.f) |
| WebSocket | W1, W2, W3, W4, W5, W6, W7, W8, DA-H12 | — |
| i18n | I1, I9 (the cache half) | I9's other half: a missing variable renders the raw message — deliberate, the most debuggable fallback; R2.6 may prefer the key |
| SSR security | SS1, SS2, SS3, SS4, SS5, SS7, SS8, SS10, G5, DA-C5, SS11 (partly) | SS11's remainder: `getServerProps` string spread, the tagged serializer's user-object confusion, per-tag `allowedAttributes` flattening, `isServer()` |
| Store runtime | N3, N7 | — |
| TestStore | N9, T1, T6 | — |

One finding was added: P13 — `examples/ssr-server`'s `dev` script (`tsx
watch`) cannot start, `ERR_UNKNOWN_FILE_EXTENSION` on `App.svelte`; the
README's documented dev workflow has never run. Found by R1.5.a's proof,
which the plan had written against that path; the vite-built server bundle
under `node` — the same plain-Node consumption of core's dist — rendered the
plural instead (`gate-logs/proof-R1.5.a.log`). For R5.1's consumer pass.

One note from the R1.1 design was checked and not registered: the thought
that `matchPresentationAction` cannot resolve a three-segment path through a
case level while the matcher spec says it can. It cannot — the helper
requires a `presented` wrapper at every intermediate level — but no
document, spec or JSDoc shows a three-segment path to it; every example is
two segments. Not a defect.

## What the tests measured before the semantics changed

R1.9 changed what `TestStore` promises. Before the change, a shadow
instrumentation (`scratchpad/shadow-r19.py`, logs only) ran every consumer
suite — core browser and node, auth, chat, graphics — and reported, per file,
what the new rules would reject (`gate-logs/red-R1.9.0.log`): 9 out-of-order
receives, 7 leftovers at `send()`, 17 immediate debounces, 27 send-assertions
after a synchronous dispatch, across eight files in core and auth; nothing in
flight at `finish()` anywhere; chat and graphics clean. The change then broke
fewer tests than that (four in core, three in auth): the immediate debounces
mostly just became slower, and the 27 assertions all held on the pre-effect
state. Every broken test was rewritten against the real transcript rather
than switched off. One had been passing for the wrong reason: the combobox's
"should cancel previous debounced search" named a cancellation that never
happens — the reducer debounces with `afterDelay` and a staleness guard, so
the earlier timer fires and is discarded, which the test now says.

## Version

`@composable-svelte/core` 0.12.0 (`95a7a3b`). The `[Unreleased]` section
became `[0.12.0] - 2026-09-05` with every R1 entry under it — Added, Changed
(the breaking changes: the D1 destination action shape and `is()` on
dismiss; `integrate()`'s child-first order; per-client dedup and the bounded,
cloned cache; `WebSocketConfig`'s four fields; `renderToHTML` failing closed;
`TestStore`'s ordered `receive()`, exhaustive `send()`, on-the-clock debounce
and waiting `finish()`; `dispatch` after `destroy()`), Deprecated
(`createDestinationReducer`), Fixed (the register IDs above). The seven
sibling packages declare `"@composable-svelte/core": "^0.12.0"` — pre-1.0,
`^0.11.0` refuses `0.12.0`, and `tests/repo/peer-ranges.test.ts` requires the
range to match core's minor — each with a line in its own changelog.

## Task ledger

Every commit in `6cd4801..95a7a3b`, in order.

| Task | Commit | What it did |
|---|---|---|
| R1.1.b+c | `b241d99` | the navigation DSL composes with itself (N1, N2) |
| R1.1.d | `ac98848` | stack effects carry their screen's identity; createDestinationReducer deprecated (N8, N11) |
| R1.1.e | `cd76e33` | integrate() runs each child before the core reducer (N14) |
| R1.1.f | `cdfc552` | scopeTo().case() and .optional() return typed stores (P5) |
| R1.1.g | `d46be71` | R1.1 closes (N1, N2, N8, N11, N14, P5) |
| R1.2 | `5edf423` | Effect.api survives bundling (P1, DA-C4) |
| R1.3.b | `6259d8e` | dedup and cache are per client, keyed by the request as sent (A1, A2; D3) |
| R1.3.c | `e21a96a` | the client's deduplicate option is read (A1) |
| R1.3.d | `7432475` | mutations are not deduplicated unless the request opts in (A11) |
| R1.3.e | `580cbd9` | the response cache is bounded, hands out clones, and invalidates custom keys by path (A2) |
| R1.3.f | `761944c` | every caller of a coalesced request has its own promise, signal and timeout (A7, A3) |
| R1.4.b+c | `3141d93` | the WebSocket client climbs its reconnect ladder (W1) |
| R1.4.d | `07dc0b4` | disconnect() detaches the socket first and reports at once (W2, W6) |
| R1.4.e | `d6155ab` | the WebSocket client reconnects by close code, not by wasClean (W3, W8) |
| R1.4.f | `fceb0ef` | a missed pong reconnects; the pong is matched structurally (W4) |
| R1.4.g | `5069b3a` | WebSocketConfig is what createLiveWebSocket reads (W7, DA-H12) |
| R1.4.h | `39d3c07` | the queued wrapper sends by the client's status (W5); R1.4 records |
| R1.5 | `2cf9e9c` | ICU formats under plain Node, and a malformed message is reported once (I1, I9) |
| R1.6.a | `51dea25` | app.register() installs the security plugins (SS3, SS10, G5, DA-C5); R1.6.d the real-Fastify suite |
| R1.6.b | `aca161d` | security-header options merge over the defaults; the rate limiter refuses a bad config (SS3) |
| R1.6.c | `bad5e5a` | the rate limiter goes with the server and bounds its keys (SS4, SS8); R1.6 records |
| R1.7.a | `45e7b5e` | SSG cannot write outside outDir (SS1); one file per target (SS11) |
| R1.7.b+c | `33f43b6` | the canonical link and generateAlternateLinks escape what they interpolate (SS2, SS5) |
| R1.7.d | `416ce40` | renderToHTML fails closed on a state it cannot serialize (SS7, SS11); R1.7 records |
| R1.8.a | `8bb8ddf` | a synchronous throw in an effect body is logged, not thrown (N3) |
| R1.8.b | `a36a625` | destroy() stops the store (N7); R1.8 records |
| R1.9.a+c+e | `2e58327` | TestStore's transcript is ordered, exhaustive and on the clock (N9, T1, T6) |
| R1.9.b+d | `59809be` | finish() waits for every effect; a rejecting executor fails the test (N9, T6); R1.9 records |
| D7 | `95a7a3b` | the R1 changes, and the siblings' peer ranges follow |
| — | `0bc106b` | this exit report, first form |
| T8 (the commits say T7) | `db87c84` | the chat entry-animation sample polls instead of reading at 20 ms — first form, failed locally, pushed by mistake |
| T8 (the commits say T7) | `0c106c9` | the sample polls for a frame strictly mid-flight; CI green *(corrected: the register already had a `T7` meta line, so the finding is `T8`)* |
| — | (this commit) | the report records CI and the two commits above |

## What R1 did not do

- **R2's findings.** Everything the plan lists under R2.1–R2.7 is untouched,
  including the high-severity items named above as left.
- **The dev script.** P13 is registered, not fixed; `examples/ssr-server`
  runs from its build.
- **The Cancellable signal through `Effect.map`.** N5, R2.1's: R1.8.b threads
  the store's lifetime signal for `Run` and `AfterDelay` and says so. *(The
  closure's C4 forwards the signal through every arm of `Effect.map` and
  hands Debounced and Throttled executors the lifetime signal; C6 gives a
  grouped effect its own.)*
- **Redundant guards as tested behaviour.** The SSG containment check is
  kept as depth and documented as surviving its own mutation on POSIX.
- **`fastify-plugin`.** Core sets `Symbol.for('skip-override')` itself; if
  Fastify changes the marker, `tests/ssr/middleware-fastify.test.ts` is the
  guard. *(The marker was defined non-writable and `fastify-plugin` could
  not wrap the plugins — review 1.3, closed by C3, which pins `fp()`.)*
- **A per-request `timeout` that also bounds a retry sleep.** `retry.ts`'s
  backoff is not signal-aware; a caller that detaches during the sleep waits
  it out before the abort is seen (R1.3.f). *(Closed by C2b: the backoff
  sleep ends when the last caller detaches.)*

## The review, and what it changed

`R1-REVIEW.md` (5 September 2026) is the adversarial review of the branch
above; its closure is `hardening/r1-closure`, core 0.12.1, one commit per
closure line, every fix with a red log, a mutation and a gate under the same
protocol, with the porcelain rule added (the files a commit contains are the
files its gate saw). The review's findings and where each closed:

| Review | Finding | Closed by |
|---|---|---|
| 1.1 CRITICAL | an error on a live WebSocket ended `failed` with no `disconnected` and no reconnect — browsers set `readyState = CLOSED` before firing `error` | C1 (`9299eed`): "never opened" is remembered per socket; the harness fires in the browser's order |
| 1.2 HIGH | a caller repeating a request in the window after the last caller's abort joined the dead attempt | C2b (`8aafea5`): the attempt leaves the registry in the step that aborts it |
| 1.3 MEDIUM | the skip-override marker was non-writable, so `fastify-plugin` threw | C3 (`a297d98`) |
| 1.4 MEDIUM | the direct-call plugin form failed open on a bad config | C3: it throws synchronously; registered, `ready()` rejects |
| 1.5 MEDIUM | TestStore handed executors no lifetime signal | C4 (`67c4200`), C5 (`e0bf9cd`) |
| 1.6 MEDIUM | `receive()`/`finish()` moved the fake clock through `vi.waitFor`; an armed debounce passed `finish()`; rejections reported late or to the wrong test | C5: waits on the real clock, one timer registry, `destroy()`, `receive([...])`, the hook registered while the owning test is current |
| 1.7 MEDIUM | dedup and cache keys collided for non-plain bodies; interceptor-added identity was outside the key | C2a (`43048c2`), C2b: `isPlainData`, the pipeline keys after the interceptors |
| 1.8 MEDIUM | N8 closed on the case name only | C6a (`036b50d`), C6b (`3bb547b`): cancellation groups; the operators cancel on dismiss, a parent null, a case change, a pop and a shrinking `setPath` |
| 1.9 LOW | the smaller code findings | C1, C2b, C3, C4, C5, C6b, C7 (`27d4371`), each named in its commit |
| 2.1 HIGH | sixteen frame-sampling animation tests | C8: `src/lib/test/animation.ts` and every site rewritten; ten local runs each |
| 2.2 HIGH | `2e58327` shipped six tests its tree could not pass; HEAD carried them twice | C0 (`f5459da`): the block and the duplicated changelog entry removed; the cause recorded there and here |
| 2.3 MEDIUM | tests proving less than their names | C2b (the A1 key test isolates headers; PUT/PATCH/DELETE and HEAD/OPTIONS asserted), C5 (the combobox cancel test), C6b (the integrate order test) |
| 3 | this report's numbers, the gate-log README, the register's two `T7`s, the plan's proof lines, the changelog | C9 (this revision) |
| 4 | the documents the commits claimed to have corrected | C1–C8 in their own commits, C10 for the front doors |

**The ungated commit, recorded plainly.** `2e58327` (R1.9.a+c+e) contains
the `finish()` and rejection test blocks while its `finish()` is still the
old shorthand; its gate log (2,267) predates them. Cause: a "dry run" of the
R1.9.b+d edit script against the live tree neutralised one write and not
the append, two files changed between the gate and the commit, and the two
dirty files were seen and dismissed. `59809be` then appended the same block
again, so `tests/test-store.test.ts` held it twice and the changelog its
entry twice. The closure removed the duplicates first (C0), and its rule is
that no edit script is dry-run against the live tree and that the commit's
porcelain must equal the gate's.
