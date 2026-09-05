# R1 — adversarial review, 5 September 2026

**Verdict.** R1 is not complete, accurate or error-free. The eight critical
findings are closed in substance — every sampled fix re-executes as its commit
message says, the strict baseline kills all eight entries, the pinned-defect
sweep matches, the R1.5 proof reproduces, the whole-repository gate passed
once — but the review found two new defects of the severity the audit was
about, one broken commit whose record is false, duplicated tests and changelog
text at HEAD, a test suite whose green depends on frame timing, and a body of
documentation the commits claimed to have corrected and did not.

**Method.** Eight independent reviewers against main at `61bcea4` (tree
identical to the reviewed head `330c9f1`): records versus reality; the five
code areas; a whole-repository documentation sweep; and one runner that
re-executed ten commit-message mutations, the strict baseline, the proof and
the core gate one suite at a time. Every finding below marked **reproduced**
was re-run by the lead against `packages/core/dist` or the files; **verified**
means the lead read the code or record and confirmed the reviewer's claim;
**agent-verified** means the reviewer ran or read it and the lead did not
repeat it; **reasoned** means inferred from code, not executed.

## 1. Defects in the library R1 shipped

### 1.1 CRITICAL — an error on a live WebSocket ends `failed` with no `disconnected` and no reconnect (W3, W8 not closed; worse than before R1) — reproduced

`packages/core/src/lib/websocket/live-client.ts:322-341`. `onerror` decides
"never opened" by `ws.readyState !== WebSocket.OPEN`. The HTML specification
runs, for every `error` a browser fires on a WebSocket, one task that first
sets `readyState` to `CLOSED`, then fires `error`, then `close`. So in a
browser `readyState` is never `OPEN` inside `onerror`; every error on an
established connection takes the `attemptFailed` path, which nulls the
socket's `onclose`, sets status `failed`, and emits only `error`. The `close`
that follows reaches nothing: no `disconnected` event, no ladder, a queued
wrapper that queues forever, a heartbeat that stops on its next send. Before
R1 the same error set `failed` but `onclose` still emitted `disconnected`.

Reproduced against dist with a stub in spec order: `status=failed`, events
`["error"]`, one socket. In the order the test harness produces (`error` while
still `OPEN`, `tests/helpers/scripted-websocket.ts:74-76`) the same sequence
gives `reconnecting` and a second socket — the order no browser produces. The
R1.4.e test "an error on an established socket does not suppress the
reconnect" passes against dead code, and its recorded mutation kill is a kill
against dead code. Fix: decide "never opened" with a per-socket flag set in
`onopen`; make the harness's `error()` set `readyState = CLOSED` first so the
existing test goes red; add the error-then-close sequence on an opened socket.

### 1.2 HIGH — a caller that never aborted is rejected "Request cancelled" if it repeats a request during the window after the last caller's abort (A7's fix opens a new hole) — reproduced

`packages/core/src/lib/api/deduplication.ts:109-121, 157-160`. When the last
subscriber detaches, the shared controller is aborted but the entry stays in
the map until the aborted fetch rejects (a macrotask later; with retries, the
whole backoff sleep, up to 30 s). A new `join` for the same key in that window
attaches to the dead attempt and is rejected with the non-retryable
`APIError('Request cancelled', status null)`, which `isNetworkError()` reports
as a network failure. The documented cancellation pattern (abort the previous
controller, issue the next request in the same reducer turn) hits it whenever
the new key equals the old. Reproduced against dist: abort caller A, issue the
same GET synchronously → `second: REJECTED APIError: Request cancelled`, one
fetch. Fix: delete the entry (guarded by identity) when the controller is
aborted, or have `attempt()` ignore an entry whose signal is already aborted.

### 1.3 MEDIUM — the skip-override marker is defined non-writable, so wrapping either plugin with `fastify-plugin` throws — verified

`packages/core/src/lib/ssr/middleware/plugin.ts:27` uses
`Object.defineProperty(plugin, SKIP_OVERRIDE, { value: true })`, which yields
`writable: false, configurable: false`. `fastify-plugin` (5.1.0 and 6.0.0 in
this tree) assigns that property in strict mode and throws
`TypeError: Cannot assign to read only property`. The plan itself named
`fastify-plugin` as the alternative form. Fix: `writable: true, configurable:
true`, or plain assignment.

### 1.4 MEDIUM — the direct-call plugin form now fails open on a bad config — reasoned

Both plugins are `async` since R1.6.b, and `fastifyRateLimit` constructs the
limiter (which validates) before `addHook`. Every documented direct call is
unawaited (`examples/ssr-server/src/server/index.ts:41,49`, the deployment
skill, `SECURITY.md`). A bad `max` is now an unhandled rejection with no
limiter installed; under a process that logs unhandled rejections instead of
exiting, the server runs unlimited — the fail-open shape SS3 was closing,
moved from the register form to the direct-call form. Before R1.6.b the same
call threw synchronously at startup. Fix: document and use `await`, or keep
the validation synchronous ahead of the async body.

### 1.5 MEDIUM — TestStore hands executors no lifetime signal, while the store and the docs now say they receive one — verified

`packages/core/src/lib/test/test-store.ts:640` (`Run`) and `:699`
(`AfterDelay`) call `effect.execute(dispatch)`; the store passes
`lifetime.signal` (`store.svelte.ts`), and `docs/core-concepts/store-and-reducers.md:139-141`
tells consumers to check `signal.aborted`. An executor written as documented
throws `TypeError` under TestStore and, since R1.9.d, fails the test — the
production/test divergence R1.9 existed to remove. The shipped
`EffectExecutor` JSDoc (`src/lib/types.ts:30-34`) and `docs/core-concepts/effects.md:339-341`
still say the signal is `undefined` for `run` and `afterDelay`.

### 1.6 MEDIUM — TestStore's "on the clock" and "waits for everything" are weaker than recorded — verified

- Vitest's `vi.waitFor` advances fake timers by its poll interval (50 ms) on
  every check (`node_modules/vitest/dist/chunks/vi.*.js:3520,3553`), so under
  fake timers `receive()` and `finish()` move the clock silently. A debounce
  test that omits `advanceTime()` still passes after a few polls; the
  combobox test at `tests/combobox.test.ts:344-347` receives an action due at
  150 ms when its own timeline says 100 ms, for this reason.
- `finish()` checks pending `AfterDelay` timers only; an armed `Debounced` or
  `Throttled` timer passes `finish()` silently (`test-store.ts:483-520`).
- A rejection that lands after the owning test has finished is swallowed by
  the `onTestFinished` fallback (`test-store.ts:430-443`); before R1.9.d it
  failed the run as an unhandled rejection.
- `stableStringify` renders `Date`, `URL`, `FormData` and any `toJSON`-only
  object as `{}` (reproduced: `stableStringify(new Date(1)) === '{}'`), so
  `receive({ type: 'saved', at: new Date(1) })` now matches an action carrying
  any date; the old `JSON.stringify` matching did not.

### 1.7 MEDIUM — dedup and cache keys collide for non-plain bodies; interceptor-added identity is outside the key — reproduced / agent-verified

`requestKey` uses `stableStringify`, so two POST bodies `{ since: Date(2020) }`
and `{ since: Date(2021) }`, or two different `FormData`, produce one key
(reproduced) — with `deduplicate: true`, the second caller gets the first
response. Headers added by a request interceptor (the documented way to add
`Authorization`) are not in the key, so on one shared client two callers with
different interceptor-injected tokens share one fetch and one cached body
(agent-verified with a script). The A1 test never sends two concurrent
identical GETs with different headers on one client, so a key without headers
would pass it. Also: `structuredClone` strips prototypes, so joiners and cache
hits see different object shapes from the creator; a joiner's `retry` config
is silently replaced by the creator's; invalidation compares the raw path
while the key normalises it (`get('products')` survives
`invalidateCache('/products')` — verified); the warn-once set for uncloneable
responses is unbounded.

### 1.8 MEDIUM — N8 is closed on case-name identity only — agent-verified at runtime

`destination.ts:357` drops a stale effect result only when the case *type*
changed. Dismiss `addItem`, reopen `addItem`, and the first form's in-flight
save lands in the fresh form. Same for `handleStackAction` with the `screenId`
the docs recommend (`s => s.step`): pop step 2, push a new step 2, the stale
result lands. The register line ("drops a result whose case is gone") is true
as written and the reopened-same-case hole is real.

### 1.9 LOW — smaller code findings — verified unless marked

- `disconnect(code)` with a code the browser refuses (anything but 1000 or
  3000–4999) leaves the socket open behind a `disconnected` state: the close
  throws inside the try after the handlers were detached (`live-client.ts:461-474`).
  `Effect.websocket.disconnect(client, code)` passes any code through.
- `reconnect()` and `disconnect()` while `reconnecting` emit a second
  `disconnected` for a connection that already reported one (agent-verified).
- `connect()` rejects with "Disconnected before the connection opened" if a
  `connected` listener calls `disconnect()`, because listeners are notified
  before the promise settles (agent-verified).
- The mock client's `reconnect()` diverges from the live one with reconnection
  disabled and while reconnecting; its JSDoc claims the same order (agent-verified).
- `Effect.map`'s `AfterDelay` case does not return the executor's promise
  (`effect.ts:374-376`), so a rejecting async AfterDelay reached through
  `scope()` is unguarded in the store and untracked in TestStore — a
  pre-existing hole under both the N3 and N9 claims.
- `serializeState` still returns `undefined` for a root with no JSON form;
  R1.7.d fixed `serializeStore` only.
- `generateAlternateLinks` applies `encodeURI` to the path, which double-encodes
  an already-encoded path and misplaces `?lang=` after a `#` (agent-verified).
- SSG containment is lexical; a symlink inside `outDir` routes writes outside
  it (agent-verified). A refused path still reaches `getInitialState` and
  `getServerProps` before it is refused.
- `maxKeys` at capacity costs a full-map scan per new key (41 µs at 10 000,
  168 µs at 50 000, agent-measured); "oldest" is first-ever-seen, so long-lived
  clients are evicted ahead of fresh spoofed keys.
- The ICU failure cache is unbounded and an invalid locale string is itself a
  cached failure per message (agent-verified); reachable only by a server that
  passes `Accept-Language` through unvalidated.
- `is()` is true for a dismiss when the parent's field shares a case's name,
  and a parent-level action whose `type` equals a case name matches a prefix
  path (agent-verified); `isCaseAction` uses `in`, so `hasOwnProperty` is a
  "case" (N16's class).
- `StackActionOptions` is not exported, so the seventh argument's type cannot
  be named.
- `maxEntries: 0` disables the cache, `NaN` makes it unbounded; `timeout: 0`
  or `Infinity` rejects at once; none validated.

## 2. The suite

### 2.1 HIGH — the gate is not deterministic: frame-sampling animation tests — reproduced by the runner

The runner's unmutated core gate at HEAD failed once on
`tests/select-animation.test.ts` "fades in rather than appearing instantly"
(`opacity stuck at 0`), the same class as the chat test T7 fixed — a
`wait(20)` then a mid-flight opacity sample. The class is in at least six
files across core and chat (`select-animation`, `attachment-fade`,
`animations/fade`, `message-entry`, `cursor-visibility`, and more). Every
"green" in the records is one sample of a suite that can fail without a code
change; T7 fixed one instance.

### 2.2 HIGH — the R1.9.a+c+e commit shipped six tests its own tree cannot pass, and HEAD carries them twice — verified

`2e58327` contains the `finish()` and rejection test blocks (six tests) while
its `finish()` is still `advanceTime(0); assertNoPendingActions()`; its gate
log (2,267) predates them, and its message does not mention them. Cause: a
"dry run" of the R1.9.b+d script neutralised one write call and not the
append, so two files were written to the tree between the gate and the
commit; the two dirty files were seen and dismissed. `59809be` then appended
the same block again: `tests/test-store.test.ts:607-674` and `:675-742` are
byte-identical, and `CHANGELOG.md` holds the "finish() waits for every
effect" entry twice. Consequences: the 2,279 browser count, the "+89" and the
4,851 include six duplicate tests; the baseline's M1 detail lists each extra
failure twice; the commit is red as committed (bisect-hostile) and its record
is false — the class of error R0's review found in R0.

### 2.3 MEDIUM — tests that prove less than their names or the commits say — verified / agent-verified

- The A1 key test never isolates headers (2.7 above).
- "Cancellable: the throw is logged and the id is released" asserts only
  `not.toThrow()`.
- "receive() and send() report it too" exercises only `send()`.
- The combobox "cancel previous" rewrite asserts `isLoading === false` after
  the load has already completed; only the `toHaveBeenCalledTimes(1)` proves
  the point (agent-reasoned).
- `integrate.test.ts` "processes children in order" holds with `reduceRight`
  replaced by `reduce` (agent-verified).
- PUT/PATCH/DELETE non-coalescing is asserted for POST only; HEAD/OPTIONS
  coalescing not at all.

## 3. Records

- **`R1-EXIT.md` numbers.** The gate-log accounting is wrong: 38 R1 rows not
  36, 28 core gates not 24, eight re-runs not four (R1.1.b, R1.3.b, R1.3.e,
  R1.3.f, R1.4.e, R1.4.g, R1.6.b, R1.8.a, plus the killed R1.8.b). The
  whole-repository breakdown attributes five workspaces wrongly (44/482 is
  graphics, 11/81 code, 8/106 maps, 12/94 media, 9/93 the auth-server
  example, 24+2 chat) and counts "18 workspaces" that are 15. "Two surviving
  mutations" is one. "M1 and M7 each list a second test" undercounts M1.
  "60-odd mutations" is about 73. The staleness arm was run red only before
  the DA-H12 deletion, not "each". `CLAUDE.md` was not "corrected" for its
  test counts. The 2,279 / +89 / 4,851 figures carry six duplicates.
- **Gate logs.** Each R1 log holds one filtered run; the README rows that say
  "both logged" or describe a first failed run have no log for it. The
  directory README still titles itself "for R0 and its closure" and calls the
  logs raw. Four of 28 fix commits have a red log; the rest rely on the
  mutation sentence.
- **Register.** Two entries are labelled `T7` (line 188 R1's, line 189 the
  pre-existing mutation-plan note). The self-measured header still says 165
  entries; the grep gives 167. The W3 and W8 closure lines are false in a
  browser (1.1). N8's line is true but incomplete (1.8).
- **Plan.** R1.9's proof cites skill lines 16, 62 and 486 "becoming true";
  line 62 became false (`finish()` is no longer the shorthand) and 486 is a
  brace. R1.1.d's tick sits on text describing effect tagging
  `createDestinationReducer` never did. R1.1.g's proof names M5 where the
  guard added is R1-N2. R1.6.d's "verbatim" snippet is not verbatim.
- **CHANGELOG.** The duplicate entry; `reconnect()` added as a required
  interface method without a BREAKING marker (the file marks the same class
  of change breaking elsewhere); `shouldReconnect`, `StackActionOptions` and
  `ClientCacheConfig` unnamed under Added; pre-R1 additions released under
  Fixed as-is.
- **The baseline exit log** ends at "Rebuilding core…" with no exit line;
  the runner's re-run (exit 0, identical table) covers it.

## 4. Documentation the commits claimed to have corrected

HIGH (a reader following them writes broken code or misses a break):

- `docs/dsl/destinations.md:208-213` and `docs/navigation/tree-based.md:563-568`
  embed `Destination.reducer` without the `presented` wrapper — the N2 shape,
  in the first example a reader of `createDestination()` sees; `integrate.ts:61`
  JSDoc likewise.
- `docs/api/reference.md:1656-1664` still defines `DestinationAction` with the
  inner `PresentationAction`; `:1049` and `src/lib/navigation/types.ts:119`
  still call `handleStackAction` with four arguments; `guides/NAVIGATION-GUIDE.md:318`
  passes the parent action.
- `docs/core-concepts/testing.md:296-314` and the testing skill `:524-548`
  send twice before receiving — the new exhaustive `send()` throws.
- `vi.restoreAllMocks()` after fake timers survives in `test-store.ts:76`
  (the header's own complete example), `docs/core-concepts/testing.md:528,605`,
  `docs/api/reference.md:2081`.
- Root `README.md:51-54` says the repository is at 0.11.2 with `^0.11.0` peers.

MEDIUM: `src/lib/types.ts:30-34` and `effects.md:339-341` (signal
cancellable-only); `testing.md:124`, the skill `:61`, `test-store.ts:145`
(`finish()` is the shorthand); `reference.md:2159-2168` (avoid nested partials);
`testing.md:1304-1307` ("order doesn't matter"); `docs/backend/dependencies.md:343`
("all six are required"); `websocket.md:486-495` manual-reconnection snippet
races the ladder and rejects; `websocket.md:767-768` lists error codes never
emitted; `api-client.md:478-483` retries `TimeoutError` per attempt, which
cannot happen now; the navigation skill `:218-257` and `NAVIGATION-GUIDE.md:90-121`
parent-observation examples test `action.action.action.type` (always the case
name) and hand the case action to the child reducer; the skill `:1344-1356`,
`CLAUDE.md:168` and `navigation-spec.md:2570` still teach `createDestinationReducer`;
`server-rendering.md:727-749` API reference shows wrong signatures beside
R1's new prose; `examples/auth-server/src/store.ts:9-13` says core's limiter
never unrefs; `CLAUDE.md:453` (4,641 tests) and `:116,255` (1900+);
`packages/maps/README.md:31`, `packages/charts/README.md:32` (`^0.11.0`);
`gate-logs/README.md` header.

LOW: the spec reference sketches (`navigation-dsl-spec.md:471-552, 640-663`,
`composable-svelte-spec.md:2132`, `animation-integration-spec.md:1625`),
`plans/phase-8/websocket.md`, `plans/ssr-production-readiness/*`,
`troubleshooting.md:339-350`, `api-client.md:443-455, 735`.

## 5. What held

- Every one of the ten re-executed mutations fails the tests its commit names
  (two with explained differences: one kill lives in a suite the runner was
  not asked to run; one gained a kill from a later test).
- The strict baseline: 8 of 8 killed, identical to the recorded table.
- Pinned defects: D5 and D6 only. The R1.5 proof renders `View 3 comments`;
  P13 reproduces.
- The register's 39 closure lines all name mechanisms and tests that exist;
  the three registers' sizes (42 / 1 / 18) are as recorded; the ledger's
  hashes match; the CI run ids and outcomes match; core 0.12.0 and the seven
  `^0.12.0` peers are in place; the porcelain listings in all 28 gate logs
  match their commits' files.
- The navigation DSL chain composes end to end at runtime (agent-probed); the
  P5 types resolve; `integrate()` is child-first; the P1 chain is protected
  for all three entries.
- The WebSocket ladder, `disconnect()` detachment, the close-code table for a
  close without an `error`, heartbeat reconnect, config types, and the queued
  wrapper behave as recorded — except for 1.1, which sits under all of them.
- Per-client dedup and cache, the LRU, clones in both directions, custom-key
  invalidation, `deduplicate` resolution, per-caller abort, and the
  non-retryable abort error hold — except for 1.2 and 1.7.
- ICU under Node, the SSG refusal corpus (37 probes), attribute escaping,
  fail-closed `renderToHTML`, the security-header merge, limiter validation,
  `unref` and `onClose`, and `app.register()` installation hold.
- The store guards and `destroy()` hold as described; the shadow measurement's
  categories map onto exactly what was rewritten.

## 6. What closing this review would take

1. Fix 1.1 with a red-first test in the browser's event order (harness
   change included), and re-close W3 and W8 honestly.
2. Fix 1.2 and 1.3 (each a few lines) with tests; decide 1.4 (await, or
   synchronous validation) and 1.5 (pass the signal in TestStore; fix the
   executor JSDoc); decide the 1.6 and 1.7 items that are design choices and
   document the rest.
3. Remove the duplicate test block and changelog entry; record 2.2 in the
   exit report as R0's review recorded its own class of error; re-gate.
4. Decide the animation-sampling class (2.1): fix it across the six files or
   register it; without that the gate is a sample.
5. Correct the records (3) and the documents (4) — the HIGH set at least, in
   one docs commit with the doc-typecheck and skill guards run.
6. Re-run the whole-repository gate and CI, and revise `R1-EXIT.md` the way
   `R0-EXIT.md` carries its review.
