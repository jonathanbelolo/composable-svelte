# Audit remediation plan — 4 September 2026

**What this is.** The task-by-task plan for closing every finding of the
3 September 2026 adversarial audit of `packages/core`, in the order that makes
each fix provable. The findings themselves, with file:line citations and
verification labels, are in `AUDIT-2026-09-03-FINDINGS.md` beside this file;
task lines below cite them by ID (`A1`, `N1`, `W1`, …) so nothing is restated
twice and nothing can drift from its evidence.

**Where it starts.** Commit `37afb0d`, branch `phase-1-feature-surface`, gate
green: 4,641 passed, 3 skipped. Those three skips are the first task.

**How to read the sizes.** S = under a day, M = one to three days, L = a week or
a design decision. They are judgements, not measurements; the register's own
rule about hand-kept numbers applies to them.

**How it maps onto the approved plan.** `PHASE-1-STATE.md` lists Phases 2–6.
This plan replaces their contents but not their intent: R0–R2 here are the
"make every claim true" work of Phase 2 done properly, R5 is Phases 3 and 4, R4
is Phase 5, R6 is Phase 6. Nothing is released until the owner says so; that
constraint is unchanged.

---

## Ground rules — every task, no exceptions

1. **A failing test before the fix.** Write the test that demonstrates the
   defect, watch it fail, then fix. For the seven mutations that survived the
   audit (`MUTATION RESULTS` in the register), the test must kill the mutation
   before the task is done.
2. **Mutation-verify every fix** (`guides/VERIFICATION-PROTOCOL.md` rule 1).
   Revert the fix, run the test, see it fail, restore.
3. **The whole gate before each commit**, not the touched package. Phase 1 went
   red twice by running one package's suite.
4. **Real implementations, not mocks.** A task that touches `client.ts`,
   `live-client.ts`, `cookie-storage.ts` or `local-storage.ts` is not done until
   a test imports that file. The audit found all four tested only through mocks.
5. **One commit per task line**, message naming the finding ID. This is how the
   register stays true without being rewritten by hand.
6. **Fix the document in the same commit as the code.** A doc that still
   teaches the old behaviour after the fix is a new finding.

---

## The sequence

| Step | Name | Unblocks | Size |
|---|---|---|---|
| R0 | Make fixes provable | everything below — without it, fixes cannot be proven | M |
| R1 | The eight criticals | production | L |
| R2 | High severity, by area | production | L |
| R3 | Medium and low, batched | polish | M |
| R4 | Documentation | consumers | M |
| R5 | Surface decision, consumer probes, CI | release | M |
| R6 | Definition of done | the release button | S |

R0 first, then R1 and R2 may interleave per area. R4 runs after the code in
its area is stable, because code fixes change what is true. R5 needs decisions
D1–D7 below, which the owner can make at any point; the earlier the better,
because D2 shrinks R2.

---

## Decisions only the owner can make

The plan carries a recommendation for each. Until decided, the recommendation
is what the tasks assume.

- **D1 — Canonical destination action shape.** The three DSL layers disagree
  (`N1`). Recommendation: the shape `scopeTo().case()` already emits —
  `{ type: field, action: { type: 'presented', action: { type: caseType, action: child } } }`
  — becomes canonical; `createDestination().reducer` stops expecting a second
  `presented` wrapper inside the case; `.case().dismiss()` emits the outer
  `{ type: 'dismiss' }`. Breaking for anyone who hand-built the double-wrapped
  form, which the audit found nobody has.
- **D2 — Keep or cut the public APIs with no caller.** `createAPIClient`,
  `createLiveWebSocket`, `createCookieStorage`, `createLocalStorage`,
  `createDestination`, `DestinationRouter`, `forEachElement`,
  `createHeartbeat`, `createQueuedWebSocket`, `createChannelRouter` have no
  consumer in any package or example. Recommendation: keep the store, effects,
  navigation and forms surface; fix the API client, WebSocket and storage
  modules only if a consumer is committed to. Every module cut removes a block
  of R2 and R4.
- **D3 — Dedup and cache scope.** Module-global today (`A1`, `A2`).
  Recommendation: per-client-instance, with the module-global form gone.
- **D4 — `zod` and `motion` become peer dependencies** (`P4`, `P7`).
  Recommendation: yes; `zod ^3.25 || ^4`, `motion ^12`.
- **D5 — Bounded action history by default** (`N13`). Recommendation: default
  `maxHistorySize` of 100 with the unlimited form opt-in. Breaking in
  behaviour, not in types.
- **D6 — Reduced motion in all 31 animation helpers** (`C10`, `U14`).
  `guides/ANIMATION-GUIDELINES.md` calls it mandatory; 3 of 31 honour it.
  Recommendation: honour it in all, completion event still dispatched.
- **D7 — Version.** R1 and R2 contain breaking changes beyond the four already
  on the branch. Recommendation: `0.12.0`, with `1.0.0` reserved for after R6
  has been green for one full release cycle.

---

## R0 — Make fixes provable

The suite is green because defective code has no exercised path. These tasks
give every later fix a way to fail.

### R0.1 — Tests that cannot fail

- [x] R0.1.a `tests/test-store.test.ts`: import `vi`; the three `skipIf` tests
      run. Expect at least one to fail; that failure is `N9` and is fixed in
      R1.9. Proof: 0 skipped in the gate. (`T1`) — S
- [x] R0.1.b `tests/setup.ts` wired into both vitest configs: a `console.error`
      spy that fails a test on an unexpected call, with explicit opt-out for
      the six suites that spy locally. Proof: the setup file's own test plants
      a `console.error` and fails. (`T2`) — S
- [x] R0.1.c `silent:` gated on `SILENT_TESTS` only, never on `CI`. Proof: CI
      log shows a planted `console.warn`. (`T2`) — S
- [x] R0.1.d Each vacuous test in `T4` rewritten to assert the behaviour it is
      named for, or deleted with the name recorded here. Proof: the matching
      mutation from the register is killed. — M
- [x] R0.1.e `tests/store.test.ts:395` asserts `destroy()` aborts a live
      cancellable, runs subscription cleanups, and clears debounce and
      throttle timers. Proof: mutation M2 killed. — S

### R0.2 — Guards that report zero for the wrong reason

- [x] R0.2.a `side-effects.test.ts` walks binding re-exports
      (`export { x } from`) as well as bare imports, and gains a positive
      control: a planted unlisted side-effect module must be reported. Proof:
      the guard fails on `37afb0d` and passes after R1.2. (`P1`, `T5`) — S
- [x] R0.2.b `doc-typecheck.ts`: admit TS2322, TS2353, TS2561, TS2774 in the
      fences it already compiles. Widening the fence *selection* to every
      `ts`/`svelte` fence was measured at 820 noise findings and rejected, so
      `CLAUDE.md`'s coverage is the one fence that names the package. 49
      findings registered (48 after the R0 review removed one the guard's own
      Vite shim produced); they are R4's list. Proof: the guard fails on
      `37afb0d`. (`G7`, the `DA-` section's method note) — M
- [x] R0.2.c `doc-typecheck.ts` reads `CLAUDE.md`; `front-door.test.ts` links
      from it resolve. Proof: `CLAUDE.md:140` (nonexistent skill) fails.
      (`G3`, `G8`) — S
- [x] R0.2.d Positive controls added to `changelog-shape`, `dist-freshness`,
      `doc-examples` compile arm, `component-coverage`, `optional-props`
      function-type rule, `styles/public-exports`. `animation-policy` already
      ran its real scanner over its registered files and was left as it was.
      Proof: each control fails when its rule is emptied. (`T5`) — M
- [x] R0.2.e `guard-integrity.test.ts` asserts `package.json#scripts.test`
      still runs the node config. Proof: dropping the second clause fails.
      (`T5`) — S
- [x] R0.2.f `flat-barrel.test.ts > read real export sets` builds its programs
      at module scope or carries an explicit timeout; the known load-sensitive
      failure stops. Proof: full node-config run green three times. (`T5`) — S
- [x] R0.2.g `skill-examples.test.ts` `PINNED` covers every skill with a
      `svelte` fence, not one. Proof: a planted missing-prop fence fails.
      (`G9`) — M

### R0.3 — Harnesses for the untested modules

Only harnesses here; the tests arrive with each fix in R1 and R2.

- [x] R0.3.a `tests/api/client.test.ts` scaffold with a scripted
      `globalThis.fetch` (delays, aborts, non-JSON bodies). Proof: one smoke
      test through `createAPIClient` passes. — S
- [x] R0.3.b `tests/websocket/live-client.test.ts` scaffold with a scripted
      `WebSocket` class and virtual timers. Proof: one open/close smoke test.
      — S
- [x] R0.3.c `tests/dependencies/cookie-storage.real.test.ts` and
      `local-storage.real.test.ts` in browser mode against the real
      `document.cookie` and `localStorage`. Proof: one round-trip each. — S
- [x] R0.3.d `tests/repo/dist-import.test.ts` (node config): imports every
      `dist` subpath in a plain Node child process and exercises one call per
      module. This is the test that would have caught `I1`, which it pins.
      Proof: fails on `37afb0d` for ICU. — S
- [x] R0.3.e `tests/repo/bundle-probe.test.ts` (node config): bundles a
      consumer with esbuild (a core devDependency, pinned 0.25.12) and asserts
      on the output text that `Effect.websocket` is registered and — pinned as
      `P1` until R1.2 — that `Effect.api` is not. Proof: the pin goes red under
      the fix. (`P1`) — S

### R0.4 — Baseline

- [x] R0.4.a Re-run the audit's seven surviving mutations (`MUTATION RESULTS`)
      and record which still survive. This number must reach zero by the end
      of R2. — S

### R0.5 — Closure, after the adversarial review of R0

Seven reviewers (five read-only, two mutating isolated worktrees) took R0
apart on 4 September 2026; `plans/hardening/R0-EXIT.md` records what held and
what did not. Each item below is one commit with its own core gate.

- [x] R0.5.a The three rewritten tests that still could not fail for the code
      they name — heartbeat stop, the routing popstate guard, the Select
      interruption — now do; each shown red under a mutation of that code.
- [x] R0.5.b `expectConsole` expects exactly one call by default; a live-path
      control; the scripted `fetch`/`WebSocket` harnesses restore themselves
      via `onTestFinished`.
- [x] R0.5.c `side-effects` sees indented and bracketed assignments and fails
      loudly on minified dist; `guard-integrity` reads the config arrays and
      pins the glob entries; `public-exports` sees in-place declarations;
      `dist-freshness` has a real mtime control.
- [x] R0.5.d The structural `P1` pin holds under a partial `sideEffects`
      listing and goes red only on the whole chain.
- [x] R0.5.e `scripts/mutation-baseline.mjs` runs the suites clean first and
      kills by the named test; SUSPECT for anything else.
- [x] R0.5.f The skill fixtures drop the commented copies the guard never read;
      ssr's second `<svelte:head>` is pinned by a second fixture; `DA-X2` and
      `DA-X1` corrected; the doc-typecheck Vite shim matches Vite.
- [x] R0.5.g The findings register carries R0's status on every finding it
      touched; this plan and `R0-EXIT.md` describe what shipped.
- [x] R0.5.h After the review of the closure: the record corrected (a false
      tick, a batch-gating admission the retained gate logs refute, two
      overstated claims, DA-X2's line numbers), the gate logs committed under
      `plans/hardening/gate-logs/`, and `public-exports`' extractor widened to
      `async`/`abstract`/`declare` declarations.
- [x] R0.5.i The branch pushed and draft pull request #1 opened
      (https://github.com/jonathanbelolo/composable-svelte/pull/1); its first
      CI run, at `ad09f09` on Ubuntu with Node 20.20.2, passed every step —
      4,734 tests, the local count. Every gate before it was local (macOS,
      Node 24).

---

## R1 — The eight criticals

Each task ends with the register ID it closes. Order within R1 is by
dependency, not severity: R1.1 needs D1, R1.3 needs D3.

### R1.1 — Navigation DSL composes with itself (`N1`, `N2`) — L, needs D1

- [x] R1.1.a End-to-end test first: `createDestination` → `integrate().with()`
      → real store → `scopeTo().case().dispatch(child)` → child reducer sees
      `child`; `.dismiss()` clears the field; a child `Effect.run` that
      dispatches lands back in the child. All three fail on `37afb0d`.
- [x] R1.1.b `createDestination().reducer` takes `{ type: caseType, action: child }`
      and maps the child effect with `Effect.map(e, a => ({ type: caseType, action: a }))`.
- [x] R1.1.c `scopeTo().case().dismiss()` emits the outer `{ type: 'dismiss' }`;
      `ifLetPresentation` unchanged.
- [x] R1.1.d `createDestinationReducer` and `handleStackAction` tag effects
      with the case or screen identity they were produced under and drop
      results whose target is gone (`N8`). `handleStackAction` takes the
      parent field name instead of hardcoding `'stack'` (`N11`).
- [x] R1.1.e `integrate()` runs the child before core, or documents that core
      first means the child never sees an action core consumes (`N14`).
- [x] R1.1.f `scopeTo().case()` and `.optional()` return typed stores, not
      `ScopedStore<any, any>` (`P5`).
- [x] R1.1.g `destination.test.ts:295-323` executes the effect it asserts on.
      Proof: mutation M5 killed; the R1.1.a suite green; `specs/frontend/navigation-dsl-spec.md`
      and `docs/dsl/destinations.md` updated in the same commit.

### R1.2 — Effect.api survives bundling (`P1`) — S

- [x] R1.2.a `src/lib/index.ts` bare-imports `./api/effect-api.js` exactly as
      it does for websocket; `sideEffects` lists `dist/api/index.js` and
      `dist/api/effect-api.js`.
- [x] R1.2.b The comment at `effect.ts:396-401` claiming the members "genuinely
      are on this object at runtime" is corrected to say when.
      Proof: R0.3.e green; R0.2.a green.

### R1.3 — Dedup and cache cannot cross identities (`A1`, `A2`, `A7`, `A11`) — M, needs D3

- [x] R1.3.a Tests first, in R0.3.a's harness: two clients with different
      default headers and base URLs, concurrent identical GETs → two fetches;
      client-level `deduplicate: false` honoured; a cache hit is not the stored
      reference; POST is never deduplicated by default.
- [x] R1.3.b Dedup map and cache move onto the client instance; key includes
      the resolved full URL and the merged headers.
- [x] R1.3.c `deduplicate` client option wired through (`client.ts:158`).
- [x] R1.3.d Dedup restricted to safe methods unless opted in.
- [x] R1.3.e Cache returns a structured clone or frozen object; cache bounded
      by an LRU with a documented default; custom `key` entries invalidate.
      (`A2`; the API reviewer's cache-by-reference, unbounded-cache and custom-key items are folded into `A2`.)
- [x] R1.3.f Shared-promise semantics: an aborting caller does not reject the
      others (`A7`).
      Proof: every test in R1.3.a green; `docs/backend/api-client.md:575`
      rewritten.

### R1.4 — WebSocket reconnects until told to stop (`W1`, `W2`, `W3`, `W4`) — M

- [x] R1.4.a Tests first, in R0.3.b's harness: unclean drop → failed attempt →
      second attempt scheduled with backoff → `maxAttempts` reached →
      `MAX_RECONNECTS` event; server close 1001/1012/1013 reconnects; close
      1000 and 1008 do not; old socket's late `onclose` after `disconnect()` +
      `connect()` is ignored; heartbeat timeout leads to a reconnect, not a
      terminal disconnect; the documented object `pongMessage` matches.
- [x] R1.4.b Internal `attemptReconnect()` separate from user `connect()`, so
      the attempt counter is only reset by the user.
- [x] R1.4.c `onclose` reschedules on a failed attempt; the false comment at
      `live-client.ts:395` goes.
- [x] R1.4.d `disconnect()` detaches the old socket's handlers before nulling
      it (`W2`, `W6`).
- [x] R1.4.e Reconnect predicate by close code, not `wasClean`; `onerror` does
      not set a terminal `failed` on an established socket (`W3`, `W8`).
- [x] R1.4.f Heartbeat calls an internal reconnect path; pong matching by
      predicate or deep equality; ping and pong framing documented (`W4`).
- [x] R1.4.g `WebSocketConfig.url/protocols/heartbeat/queueSize` either wired
      or removed from the type (`W7`); `ReconnectConfig` fields optional with
      defaults (`DA-H12`).
- [x] R1.4.h Queued wrapper: `isConnected` from the client's state not the
      event; queue cleared on `disconnect()`; wrapper created after connect
      does not queue (`W5`).
      Proof: R1.4.a green; mutation M6 killed; `docs/backend/websocket.md`
      reconnection sections rewritten against the tests.

### R1.5 — ICU works under plain Node (`I1`) — S

- [x] R1.5.a `icu.ts:36` → `import { IntlMessageFormat } from 'intl-messageformat'`
      (named export exists in both the CJS and ESM builds — verified).
- [x] R1.5.b Compile failures are cached and surfaced once, not re-thrown per
      render (`I9`).
      Proof: R0.3.d green; the example's `tsx` dev path renders a plural.
      (5 September: the `tsx` path cannot start — P13; the vite-built server
      bundle under `node` rendered the plural, `gate-logs/proof-R1.5.a.log`.)

### R1.6 — Security middleware installs the documented way (`SS3`, `G5`) — S

- [ ] R1.6.a Both plugins carry `Symbol.for('skip-override')` (or are wrapped
      with `fastify-plugin`) so `app.register()` reaches the parent scope.
- [ ] R1.6.b An empty options object gets the defaults; `fastifyRateLimit`
      validates `max` and refuses `NaN` (`SS3`).
- [ ] R1.6.c Rate limiter: `onClose` clears its interval and the interval is
      `unref()`'d (`SS8`); key generator documented and `trustProxy` required
      for header-derived keys, with the map bounded (`SS4`).
- [ ] R1.6.d Test through a real Fastify instance via `register`, asserting
      headers on a root route and a 429 on the second request.
      Proof: the two documented snippets, run verbatim, produce headers.
      `middleware/index.ts:24-25`, the SSR skill and `docs/README.md:307`
      corrected in the same commit (`SS10`, `DA-C5`).

### R1.7 — Server rendering does not write or emit attacker input (`SS1`, `SS2`, `SS5`) — S

- [ ] R1.7.a `pathToFilePath` resolves and rejects any target outside
      `outDir`; `/a` and `/a/` produce one file; a data path of `/404` cannot
      overwrite the real 404 (`SS1`, `SS11`).
- [ ] R1.7.b Canonical `href` attribute-escaped (`SS2`).
- [ ] R1.7.c `generateAlternateLinks` escapes `path`, `locale`, `baseUrl`;
      its JSDoc no longer instructs `{@html}` with the request path (`SS5`).
- [ ] R1.7.d `renderToHTML` fails closed on a serialization error, matching
      `buildHydrationScript` (`SS7`).
      Proof: the SSG traversal corpus writes nothing outside `outDir`; the
      canonical and alternate-link corpora parse as intended.

### R1.8 — Store runtime contains what the docs say it contains (`N3`, `N7`) — S

- [ ] R1.8.a `Run`, `Cancellable`, `FireAndForget` executors wrapped in
      try/catch as `Subscription` already is; the timer callbacks likewise; a
      throw in one `Batch` member does not skip the rest (`N3`).
- [ ] R1.8.b `destroy()` tracks and clears `AfterDelay` timers, sets a
      destroyed flag that makes `dispatch` a logged no-op, and aborts in-flight
      `Run` executors through a signal (`N7`).
      Proof: `docs/core-concepts/effects.md:851` becomes true for sync
      executors; mutation M2 killed.

### R1.9 — TestStore keeps its promises (`N9`, `T1`, `T6`) — M

- [ ] R1.9.a `receive()` enforces order and fails on an unexpected action when
      exhaustivity is on.
- [ ] R1.9.b `finish()` awaits pending effects, including `AfterDelay` under
      real timers, and fails with the list of unasserted actions.
- [ ] R1.9.c `Debounced` and `Throttled` are modelled with the test clock, not
      executed immediately, so `Effect.cancel` on a debounce is testable.
- [ ] R1.9.d A rejecting `Run` fails the test rather than the process.
- [ ] R1.9.e `send()` assertion sees the state after the reducer, before the
      effect's synchronous prefix (`N9` last item).
      Proof: mutation M1 killed; the three formerly skipped tests pass;
      `.claude/skills/composable-svelte-testing/SKILL.md:16,62,486` become true.

---

## R2 — High severity, by area

Each area is one issue with tasks. Every task: failing test, fix, mutation.
Areas are independent and may be parallelised, except that R2.1 precedes R2.3.

### R2.1 — Store and effects

- [ ] R2.1.a `Effect.map` forwards `signal` for `Cancellable` and awaits
      `AfterDelay` (`N5`, `N6`). Proof: `effect.test.ts:256,294` rewritten to
      pass a signal and an async child.
- [ ] R2.1.b Re-entrant dispatch from a subscriber is queued until the current
      action's effects are issued; action subscribers receive the state that
      action produced (`N4`).
- [ ] R2.1.c Throttle trailing call runs the latest effect (`N10`).
- [ ] R2.1.d Effect ids namespaced by composition path, or the collision
      documented loudly with an escape hatch (`N12`). Needs a decision; the
      recommendation is namespacing in `Effect.map` with an opt-out.
- [ ] R2.1.e `Subscription` taking an id held by a `Cancellable` aborts it;
      listener added mid-notification is called once (`N15`).
- [ ] R2.1.f `history` returns a frozen copy; `maxHistorySize` default per D5
      (`N13`, `P10`).

### R2.2 — SSR and security, remainder

- [ ] R2.2.a Rate limiter key: `req.ip` only with `trustProxy`; documented;
      bounded map with eviction (`SS4`).
- [ ] R2.2.b `allowDataUri` controls `ALLOWED_URI_REGEXP`, not
      `ALLOW_DATA_ATTR`; per-tag `allowedAttributes` honoured (`SS6`, `SS11`).
- [ ] R2.2.c Default CSP without `'unsafe-inline'` for scripts; `X-XSS-Protection: 0`;
      `object-src`, `base-uri`, `frame-ancestors` present (`SS9`).
- [ ] R2.2.d Tagged serializer refuses a user-shaped `{ __composableType }`
      object or namespaces the tag so it cannot collide (`SS11`).
- [ ] R2.2.e `serializeStore` throws on an unserialisable root instead of
      returning `undefined` (`SS11`).
- [ ] R2.2.f `renderToHTML` accepts `lang` and `dir`; `<title>` emitted only
      when not supplied by `head` (`I11`, `SS11`).
- [ ] R2.2.g `hydrateStore` looks up `script#__COMPOSABLE_SVELTE_STATE__[type="application/json"]`
      (`SS11`).
- [ ] R2.2.h `isServer()` documented for workers; effect deferral default
      documented per environment (`SS11`).

### R2.3 — Forms and data

- [ ] R2.3.a Submit runs async validators, waits for in-flight ones, and
      refuses while any field carries an error (`F1`).
- [ ] R2.3.b Sibling refresh preserves non-Zod errors (`F2`).
- [ ] R2.3.c `FormField` reads by `readAtPath` (`F3`).
- [ ] R2.3.d `submitTriggered` ignored while `isSubmitting` or `isValidating`
      (`F5`).
- [ ] R2.3.e Successful whole-form validation clears stale field errors;
      transforms do not write output into `data`; `formReset` cancels pending
      validation; root-level refine visible per-field and cleared when
      disproved (`F6`).
- [ ] R2.3.f Combobox `openingCompleted`/`closingCompleted` guarded by status;
      `loadOptions` carries a request token (`F7`).
- [ ] R2.3.g DataTable `pagination.total` is the unpaginated row count;
      server-side `result.total` honoured; page clamped after `dataLoaded`
      (`F4`).
- [ ] R2.3.h Toast: `duration: Infinity` and `> 2^31−1` mean never; cap
      eviction dismisses with callback and exit animation (`F8`).
- [ ] R2.3.i Lightbox focus effect keyed on `isOpen`, not the whole state
      object (`F9`).
- [ ] R2.3.j `zod` as peer per D4; `safeParse` on submit instead of
      `parse` + `instanceof` (`P4`).

### R2.4 — Components and accessibility

- [ ] R2.4.a Sheet and Drawer attach `clickOutside` to the content element as
      Modal does (`C1`).
- [ ] R2.4.b Body scroll lock reference-counted in one shared module (`C2`).
- [ ] R2.4.c Escape handled by the topmost dismissable layer only; Sidebar
      gated on `interactionsEnabled` (`C3`).
- [ ] R2.4.d Popover and Tooltip keep their positioning transform across the
      `presented` style rewrite (`C4`, `U9`).
- [ ] R2.4.e One z-index scale for all overlays (`C5`).
- [ ] R2.4.f `focusTrap`: focus the container when nothing focusable; wrap from
      the container itself; stack-aware restore; `returnFocusTo` forwarded by
      every styled wrapper (`C6`, `C9`, `C15`).
- [ ] R2.4.g Tabs, Accordion, Combobox, Collapsible, RadioGroup, Command use
      `$props.id()`; every `aria-controls`/`aria-labelledby` resolves (`C7`,
      `U12`, `F10`, `U17`).
- [ ] R2.4.h Popover is non-modal: no trap, no focus steal, has an accessible
      name (`C8`).
- [ ] R2.4.i `<Accordion items>` renders its items (`U1`); collapsed content is
      `inert` (`U4`).
- [ ] R2.4.j DropdownMenu syncs `items`; one `arrowDown` per key; no page-wide
      key hijack; trigger not double-wrapped; `aria-activedescendant` (`U2`,
      `U7`).
- [ ] R2.4.k Tooltip: `hoverEnded` during presenting queues a dismiss; Escape
      dismisses; `id` + `aria-describedby`; re-enter during exit shows (`U3`,
      `U6`, `U16`).
- [ ] R2.4.l Carousel: autoplay reschedules through a transition; pause
      control; `aria-live="off"` while playing; hidden slides `inert`; scoped
      `<style>` and raw palette removed (`U5`, `U14`, `U15`, `U16`).
- [ ] R2.4.m Select: search focus on open; `aria-activedescendant`; option ids;
      `scrollIntoView`; generic `T` (`U8`).
- [ ] R2.4.n `Input type="number"` clearable; `Switch` merges consumer
      `onclick`; Checkbox indeterminate stays in sync (`U10`, `U11`, `U16`).
- [ ] R2.4.o Untranslatable ARIA strings become props with defaults, across
      navigation components and UI (`C13`, `U13`).
- [ ] R2.4.p Reduced motion per D6 in every animating component and primitive
      (`C10`, `U14`).
- [ ] R2.4.q `aria-hidden`/`inert` on background content behind modals
      (`C11`); `clickOutside` defers touch to `click` (`C12`); animation
      completion callbacks cancelled on unmount (`C14`).
- [ ] R2.4.r Every component that creates a store destroys it on unmount (forms
      section, last bullet of `F11`).

### R2.5 — Storage and routing

- [ ] R2.5.a Cookie parsing guards `decodeURIComponent` per cookie and skips
      foreign ones it cannot decode (`D5`).
- [ ] R2.5.b Cookie removal uses configured `domain`/`path`; `clear()` reads
      `document.cookie` (`D6`).
- [ ] R2.5.c Real storage tests in R0.3.c cover value encoding, size budget,
      SameSite rules, quota errors; mocks brought to parity or their
      divergence documented (`D4`, `D16`).
- [ ] R2.5.d `window.localStorage` getter inside the try; storage listener
      disposable; cross-tab `clear()` reported (`D7`, `D8`, `D18`).
- [ ] R2.5.e `createURLSyncEffect` compares via `new URL(expected, origin)`
      against `location`, preserves hash, and syncs array reorders (`D1`,
      `D17`).
- [ ] R2.5.f popstate handler wrapped; parse errors dispatched as an action;
      the 50 ms guard removed; history patch restored in any cleanup order
      (`D9`, `D10`, `D11`).
- [ ] R2.5.g `parseQueryParams` uses own-property lookup on a null-prototype
      object (`D12`).
- [ ] R2.5.h `basePath` matches at a segment boundary; trailing slash
      normalised; `parseDestination` leading-slash behaviour decided and made
      consistent with `createParserConfig` (`D15`, the open item in
      `README.md:455`).
- [ ] R2.5.i Patterns compiled eagerly in `createParserConfig` so a bad pattern
      fails at boot (`D3`).
- [ ] R2.5.j `InvalidJSONError`/`SchemaValidationError` thrown where
      documented, or removed with the docs; `setItem` validates; `has()` agrees
      with `getItem()` (`D14`).
- [ ] R2.5.k `MockClock` gains timers, or the testing skill stops claiming it
      drives them (`D13`).
- [ ] R2.5.l `path-to-regexp` to `^8.4.2` (`P2`).

### R2.6 — Internationalisation

- [ ] R2.6.a `hydrateI18nOnClient` applies the state it computes (`I2`).
- [ ] R2.6.b Locale persistence: the detector reads through the same storage
      abstraction the reducer writes through (`I3`).
- [ ] R2.6.c `decodeURIComponent` guarded in both detectors (`I4`).
- [ ] R2.6.d Formatters: invalid date returns a documented fallback string,
      never throws; `undefined` does not mean today (`I5`).
- [ ] R2.6.e Accept-Language: base-language match considered in preference
      order; `q=0` excluded; case-insensitive `q`; script subtag preserved
      (`I6`).
- [ ] R2.6.f `isICUMessage` recognises typed arguments without a style; one
      escaping grammar for both paths; missing variable renders a placeholder,
      not the source (`I7`, `I8`, `I9`).
- [ ] R2.6.g Translation lookup by own property on a null-prototype object
      (`I10`).
- [ ] R2.6.h `lang` and `dir` from locale in `renderToHTML`; RTL table from
      `Intl.Locale` where available (`I11`, `I12`).
- [ ] R2.6.i Timezone in i18n state, passed to `formatDate` (`I13`).
- [ ] R2.6.j Loader validates the response shape and the locale string; glob
      loader accepts the caller's key shape (`I14`, `I15`).

### R2.7 — Packaging

- [ ] R2.7.a Svelte peer `^5.20.0`; a guard that derives the floor from the
      newest `@since` used (`P3`).
- [ ] R2.7.b `zod` and `motion` as peers per D4 (`P4`, `P7`).
- [ ] R2.7.c `declarationMap` off (`P9`); `| undefined` on the 245 optional
      properties or `optional-props` extended to `.ts` (`P10`).
- [ ] R2.7.d `Dependencies` default `unknown`, with the migration noted (`P6`).
- [ ] R2.7.e One `Unsubscribe` type; stale `@ts-ignore` removed; `SvelteComponent`
      typed (`P11`).

---

## R3 — Medium and low, batched

Everything in the register labelled MEDIUM or LOW that R1 and R2 did not
absorb. Group by file, one commit per file, failing test per behaviour.

- [ ] R3.1 API client remainder: interceptor semantics, `onRequest` changing
      body/params/url, endpoint id encoding, URL joining, header case merge,
      `timeout: 0` meaning none, `Retry-After` parsing, `shouldRetry` called
      once, mock/spy fidelity, fetch-init passthrough (`A8`–`A15`).
- [ ] R3.2 Navigation remainder: `matchPresentationAction` on primitives,
      prototype-key guards in `createDestinationReducer` and `matchPaths`,
      `Destination.is` exact match, stack dismiss at index 0, `setPath([])`,
      `forEach` duplicate ids, reducer-throw history, `combineReducers` key
      loss (`N16`).
- [ ] R3.3 WebSocket remainder: timeout double-report, deliberate cancel not
      an error, jitter range, `connectionTimeout: 0`, byte counting (`W8`,
      `W9`).
- [ ] R3.4 SSG bookkeeping: `generatedFiles` accuracy, `result.errors`
      completeness, `getServerProps` shape (`SS11`).
- [ ] R3.5 Forms and data remainder: `FormControl` `oninput`, `FieldPath` on
      `File`/`Map`/`Set`, `dirty` reversal, `setFieldValue` revalidation,
      record keys with dots, sort comparator, rows without id, refresh race,
      Command selection and `onSelect`, tree helpers, calendar `minDate` and
      first day, file-upload URL revocation and `accept`, toast exit timing
      (`F11`).
- [ ] R3.6 UI remainder: Banner role, Input `describedBy`, Textarea `resize`,
      Slider clamp, Avatar reset, Progress/Skeleton ARIA, Badge/Banner raw
      colours, `[key: string]: any` props, `IconButton` requires `aria-label`
      (`U17`).
- [ ] R3.7 Routing and storage remainder: case sensitivity and decoding of
      params, server-safe sync effect, schema edge cases, quota units, SameSite
      error class, serializer prototype lookup, prefix collisions, `+` decoding
      (`D18`).
- [ ] R3.8 i18n remainder: `rerouteWithLocale`, relative-time thresholds,
      `any` in public d.ts, typed keys (`I16`).

---

## R4 — Documentation

Run after the code in each area is stable. The doc guard from R0.2.b is the
acceptance test: it must be green with an empty register.

- [ ] R4.1 Remove every documented API that does not exist: `Effect.merge`,
      `Effect.animated`, `Effect.transition`, `Effect.browser`,
      `Destination.on`, `createLiveAPI`, `GlobTranslationLoader`,
      `TestStore.setDependencies`, `WebSocketClient.on`,
      `ValidationError.getFieldErrors`, `APIError.url`, `MockWebSocket`,
      `MockAPIClient`, `RenderOptions.includeState`, `clock.setTimeout`,
      `clock.runAll`, `ScopeBuilder.build` (`G1`, `G2`, `G12`, `DA-C2`, `DA-H1`–`DA-H17`).
- [ ] R4.2 Correct every signature: `handleStackAction` arity,
      `createBrowserLocaleDetector` config, `generateStaticPage`,
      `PresentationActionHelpers` as the value export, `ReconnectConfig`
      partials, `parseQueryParamsWithSchema` with `object()`,
      `syncBrowserHistory` config, `APIResponse` without `ok` (`DA-C1`,
      `DA-H4`–`DA-H6`, `DA-H11`, `DA-H12`, `DA-H15`, `DA-H17`; `D2`; `G6`).
- [ ] R4.3 Correct every behavioural claim the code now establishes:
      retry policy, dedup and cache scope, jitter, reconnection, heartbeat,
      TestStore guarantees, "effects never crash", "no scoped CSS",
      "production-ready SSR", `hydrateI18nOnClient`, `MockClock.advance`
      (`A-DOC`, `DA-M1`–`DA-M4`, `DA-L2`, `DA-L3`, `G4`, `G5`, `D13`, `T6`, `I2`).
- [ ] R4.4 `CLAUDE.md`: counts re-measured with the command beside each;
      `lib/` in every path; the nonexistent skill file removed or created; 12
      examples; phase list; `motion` as declared; `$derived` vs `$store`
      recommendation reconciled with the core skill (`G3`, `G10`, `G11`,
      `G12`).
- [ ] R4.5 Skills: the 24 failing fences in `G6`; i18n storage examples;
      `loadNamespace` with locale; forms `field.oninput`; `keyof T` →
      `FieldPath<T>`; SSR `isServer()` call; the DSL example once R1.1 lands
      (`G5`–`G6`, `I16`, `F11`, `D13`).
- [ ] R4.6 `CHANGELOG.md`: the four additions moved to `### Added`; the
      `messagesQueued` break under `### Changed`; every R1/R2 breaking change
      recorded with a migration note; `docs/migration.md:872` corrected (`P8`,
      `DA-M5`, `DA-M6`, `DA-M8`).
- [ ] R4.7 JSDoc `@example` blocks that ship: `query-params.ts:174`,
      `types.ts:119` (navigation), `websocket/index.ts:16`, `test-store.ts:26`
      (`DA-C1`, `DA-H6`, `DA-H12`, `DA-L6`).
- [ ] R4.8 `ANIMATION-GUIDELINES.md` helper table lists all 31 and 12 presets
      (`G12`).

---

## R5 — Surface decision, consumer probes, CI

- [ ] R5.1 D2 executed: each cut API removed from `index.ts`, its docs, its
      changelog entry written as a removal; each kept API has a real
      implementation test and at least one consumer in `examples/`. — M
- [ ] R5.2 Consumer probes as repo guards, node config: bundled consumer
      (R0.3.e), plain-Node `dist` import (R0.3.d), `nodenext` typecheck of a
      scratch consumer, a Svelte-floor compile of every shipped `.svelte`
      against the declared peer minimum. — M
- [ ] R5.3 CI: Node 20 and 24 matrix; `pnpm audit --prod` step failing on
      high; `verify:package` step; actions pinned by SHA; `permissions:`
      block; concurrency group. — S
- [ ] R5.4 Guard coverage for what this audit found by hand: a Svelte-floor
      guard, a bundle probe, a dist-import probe, a `CLAUDE.md` reader, and
      a mutation set that CI runs against the seven survivors and fails if any
      survives. — M

---

## R6 — Definition of done

Production means all of the following are measured true at one commit, and
that commit is the release candidate.

| Check | Command | Must read |
|---|---|---|
| Gate | `pnpm -r build && pnpm -r typecheck && pnpm -r --workspace-concurrency=1 test && pnpm -r check` | exit 0, **0 skipped** |
| Audit mutations | R5.4's mutation guard | 7 of 7 killed |
| Real implementations tested | `grep -l "client.js\|live-client.js\|cookie-storage.js\|local-storage.js" tests/**/*.test.ts` | ≥ 1 file each |
| Bundled consumer | R0.3.e | `Effect.api` is a function |
| Plain-Node consumer | R0.3.d | every subpath imports and one call succeeds |
| Doc guard | R0.2.b with full corpus and all codes | 0 failures, empty register |
| Security corpus | SSG traversal, canonical, alternate links, hydration, sanitizer | 0 escapes |
| Dependency audit | `pnpm audit --prod` filtered to `packages/core` | 0 high |
| Peer floors | R5.2 Svelte-floor compile | green at the declared minimum |
| Register | `AUDIT-2026-09-03-FINDINGS.md` | every ID closed by a commit naming it |

The release button is pressed by the owner, after D7, and not before every row
above has been read from a command run at the candidate commit.

---

## Cross-reference — register ID to task

| IDs | Task |
|---|---|
| P1 | R1.2 |
| P2 | R2.5.l |
| P3–P11 | R2.7, R1.1.f, R2.1.f |
| A1, A2, A7, A11 | R1.3 |
| A3–A6 | R3.1 (retry, abort, body parsing, FormData are HIGH but land with the client rewrite in R1.3's harness) |
| A8–A15, A-DOC | R3.1, R4.3 |
| N1, N2, N8, N11, N14 | R1.1 |
| N3, N7 | R1.8 |
| N9 | R1.9 |
| N4, N5, N6, N10, N12, N13, N15 | R2.1 |
| N16 | R3.2 |
| W1–W8 | R1.4 |
| W9 | R3.3 |
| SS1, SS2, SS5, SS7 | R1.7 |
| SS3, SS8, SS10 | R1.6 |
| SS4, SS6, SS9, SS11 | R2.2, R3.4 |
| I1, I9 | R1.5 |
| I2–I8, I10–I15 | R2.6 |
| I16 | R3.8 |
| D1, D3, D5–D18 | R2.5, R3.7 |
| D2, D4, D13 | R4.2, R2.5.c, R2.5.k |
| C1–C15 | R2.4 |
| U1–U17 | R2.4, R3.6 |
| F1–F10 | R2.3 |
| F11 | R3.5, R2.4.r |
| T1–T6 | R0.1, R1.9 |
| G1–G13 | R0.2, R4 |
| STRUCTURAL | R0.3, R5.1 |
| MUTATION RESULTS | R0.4, R6 |
| DA-C1, DA-H1–DA-H17, DA-M1–DA-M8, DA-L1–DA-L6 | R4.1, R4.2, R4.3, R4.6, R4.7 |
| DA-C2 | R4.1 (remove) or R2.2.f (implement); recommendation: remove |
| DA-C3, DA-C4, DA-C5 | the doc commits of R1.3, R1.2, R1.6 |
