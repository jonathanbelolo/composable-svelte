# Audit finding register — 3 September 2026

**What this is.** Every finding of the adversarial audit of `packages/core`,
measured at commit `37afb0d` on `phase-1-feature-surface`, working tree clean
and left unmodified. The remediation tasks live in `AUDIT-REMEDIATION-PLAN.md`
and cite these IDs; this file is the evidence, the plan is the work.

**How it was produced.** Twelve reviewers, one per surface, forbidden from
writing to the repository. Every claim below was re-checked by the lead before
entry: the reproduction re-run, the cited lines read, or both. Where two
reviewers disagreed, the case was run again and the resolution is recorded
under *CONFLICT RESOLVED*. Nine source mutations were then applied one at a
time and restored; results are under *MUTATION RESULTS*.

**Label key.** `L-VERIFIED` = the lead re-ran the reproduction; `L-READ` = the
lead read the cited code and confirmed the logic; `agent VERIFIED` /
`agent REASONED` = carried with the reviewer's own evidence, not independently
re-run. Reproduction script paths refer to the audit session's scratch
directory and are not in the repository; each finding's file:line citation is
sufficient to reproduce it.

**Counts, measured from this file's own entries** (`grep -cE '^- [A-Z]+[0-9]+ \['`):
164 entries; by severity label CRITICAL 7 (+ P1, upgraded in the packaging
section: 8), HIGH 52, MEDIUM 75, LOW 13, compound labels 6, unlabelled meta
entries 11. Lead-verified or lead-read: 91. Several entries bundle related
defects, so the defect count is higher than the entry count.

---


## Packaging / supply chain

- P1 [L-VERIFIED, HIGH] `Effect.api`/`apiFireAndForget`/`apiAll` dropped by tree-shaking. `dist/api/effect-api.js` attaches at import (`src/lib/api/effect-api.ts:183-185`) but is not in `package.json#sideEffects`; reached via binding re-export (`src/lib/api/index.ts:71`), which `tests/repo/side-effects.test.ts` cannot see (BARE_IMPORT regex only). esbuild: main entry consumer calling `Effect.api` → `.api = api` absent, `.websocket =` present. rollup with `moduleSideEffects` mirroring the list: same. Docs teach `Effect.api(` 17x in `packages/core/docs/backend/api-client.md`. Repro: scratchpad/bundle/run2.mjs, rollup.mjs.
- P2 [L-VERIFIED, MEDIUM] `path-to-regexp@8.3.0` pinned (lockfile) in core runtime tree: GHSA-j3q9-mxjg-w52f (high, sequential optional groups) and GHSA-27v5-c462-wpq7 (moderate, multiple wildcards ReDoS). Fixed 8.4.0; latest 8.4.2. Pattern-dependent exploitability; `parser.ts:239` compiles consumer patterns.

## API client (`src/lib/api/`) — agent claims re-run by lead (scratchpad/api-client/*.mjs)

- A1 [L-VERIFIED, CRITICAL] Dedup map is module-global (`deduplication.ts:82`), key = method+raw path+params+body+per-request headers (`:55-65`), no baseURL, no client default headers. Two clients with different `Authorization` defaults, concurrent GET /me → 1 fetch, both get first user's body. `deduplicate` client option destructured at `client.ts:158` and never used → cannot be disabled per client.
- A2 [L-VERIFIED, CRITICAL] Response cache module-global (`cache.ts:24`), key = method+raw path+params (`:76-95`). Cross-client/cross-host/cross-header hits. Cache returns stored object by reference (mutation poisons). Unbounded within TTL.
- A3 [L-VERIFIED, HIGH] Caller AbortSignal: only `addEventListener('abort')` (`client.ts:202-204`), no `signal.aborted` check, listener never removed (50 listeners after 50 requests); any AbortError → `TimeoutError` (`:306-307`), which is retryable → request re-sent after caller abort and resolves.
- A4 [L-VERIFIED, HIGH] Non-JSON/non-text bodies → `response.text()` twice → "Body is unusable" → `NetworkError` retryable; status lost (`client.ts:105-111`). Malformed JSON → NetworkError retryable.
- A5 [L-VERIFIED, HIGH] Client-level `retry: true|{...}` retries POST/PATCH; `retry.ts:164` guard `config === undefined` is unreachable because `client.ts:365` always passes `defaultRetry` (false). Doc `api-client.md:444-452` says otherwise.
- A6 [L-VERIFIED, HIGH] FormData/Blob/URLSearchParams bodies → `JSON.stringify` → `"{}"` with `Content-Type: application/json` (`client.ts:193-195,226`). Uploads impossible; distinct FormData POSTs dedup into one.
- A7 [L-VERIFIED, HIGH] Dedup shares one promise: caller1 abort fails caller2; caller2 timeout ignored.
- A8 [L-VERIFIED, MEDIUM] Interceptor throw → NetworkError retryable, retried with backoff, 0 fetches. `onRequest` cannot change body/params/url (only headers read back, `client.ts:213`).
- A9 [L-VERIFIED, MEDIUM] Endpoint helpers interpolate id unencoded (`endpoints.ts:93,109,117,125`): `'../admin'`, `'1/roles'`, `'1?admin=true'`.
- A10 [L-VERIFIED, MEDIUM] URL building: `?` in path + params → `?a=1?b=2`; absolute URL appended to baseURL; params after `#`. Header merge case-sensitive (both `Content-Type` and `content-type` sent). `timeout: 0|Infinity|>=2^31` → immediate TimeoutError (no disable value).
- A11 [L-VERIFIED, MEDIUM] Identical concurrent POST/PUT/PATCH/DELETE deduped by default (`deduplication.ts:139`).
- A12 [L-VERIFIED, MEDIUM] `parseRetryAfter`: `-5` → -5000ms; `120abc` → 120s; ISO date → 2026s (doc promises ISO). `shouldRetry` called twice per failure with attempt 0 then N.
- A13 [L-VERIFIED, MEDIUM] `createMockAPI` misreads bodies containing `error`/`delay` keys (`mock-client.ts:131,136`). `Effect.api` reports an `onSuccess` mapping exception as an API failure (`effect-api.ts:47-62`).
- A14 [L-READ, MEDIUM] No `credentials`/`mode`/`redirect`/`keepalive` passthrough (`client.ts:218-222`).
- A15 [agent VERIFIED, LOW] `apiAll` uses Promise.all (siblings keep running); `Effect.api` is `Effect.run` (not cancellable); cyclic body → RangeError; spy records by reference; unescaped regex in `callsMatching`/mock routes; response interceptors run in registration order; `Headers` instance as headers dropped; `Request` re-export shadows global; `Interceptor.onResponse` generic method signature forces casts.
- A-DOC: 12 false claims in `api-client.md` (table in agent report), incl. `error.getFieldErrors()` (does not exist), `api.head()` 404 semantics, jitter ±30% vs 50–100%, `isRetryable` false for 4xx (408/429 retryable), `types.ts:55` retry default.
- Coverage gap: `tests/api/` never exercises `createAPIClient`/`client.ts`/`retry.ts`/`deduplication.ts`; `cache.ts` only via mock.

## Store / effect (lead reading, awaiting nav-runtime agent verification)

- S1 [L-READ] sync throw in `Effect.run` executor escapes `dispatch()` (`store.svelte.ts:155` — `Promise.resolve(effect.execute(dispatch))` does not catch sync throws) and skips remaining Batch effects; Subscription has try/catch, Run/Cancellable/timers do not.
- S2 [L-READ] `destroy()` does not track AfterDelay/Run executors → late dispatch into destroyed store; docstring says "Cancels all in-flight effects".
- S3 [L-READ] Throttled trailing call executes the FIRST effect of the window (`store.svelte.ts:270-281` closure), dropping the latest.
- S4 [L-READ] `Effect.map` drops `signal` for Cancellable (`effect.ts:774-776`) and does not await AfterDelay (`:789-791`) → unhandled rejection.
- S5 [L-READ] `actionHistory` unbounded by default (`store.svelte.ts:63-69`, `types.ts:1016`).
- S6 [L-READ] re-entrant dispatch from a subscriber: action subscribers receive latest `state` not the reduced state for that action; effects of outer action run after inner.

## Non-findings / clean (lead)

- Secrets scan: clean (only jwt.io sample in `tests/routing/query-params.test.ts:109`).
- Runtime dep licenses: MIT/BSD-3/0BSD only.
- CI: Node 20 only (engines >=20, no 22/24 matrix), no `verify:package` step, no audit step, actions pinned by tag, no `permissions:` block, no concurrency group. Phase 4 lists CI hardening; note as observations.
- Local pnpm 9.0.0 == packageManager.

## Navigation / composition / store / TestStore — agent claims re-run by lead (scratchpad/nav-runtime/*.mjs)

- N1 [L-VERIFIED+L-READ, CRITICAL] DSL shape mismatch. `scopeTo().case()` emits `{destination:{presented:{caseType:{child}}}}` (`scope.ts:372-401`); `ifLetPresentation` (`if-let.ts:175-202`) strips `presented` and hands `{type:caseType, action:child}` to `createDestination().reducer`, which expects `{type:caseType, action:{type:'presented', action:child}}` and reads `action.action.action` (`destination.ts:344-352`) → child reducer receives `undefined` (throws on `action.type`). `scopeTo().case().dismiss()` emits `{destination:{caseType:{dismiss}}}` (`scope.ts:403-427`) → `ifLetPresentation` sees neither `dismiss` nor `presented` → no-op; destination never cleared. `DestinationRouter.svelte:105` uses `scopeTo().case()`. Spec `navigation-dsl-spec.md:719,733-739,957` prescribes exactly this wiring. Only in-repo consumer (product-gallery) hand-writes its destination reducer. Tests: each layer tested against a stub/vi.fn(), never end-to-end.
- N2 [L-VERIFIED+L-READ, CRITICAL] `createDestination().reducer` returns child effect unmapped (`destination.ts:366-367`, comment "already in parent action type"). Through `ifLetPresentation` the child's `{type:'saved'}` becomes `{destination:{type:'saved'}}` → dropped. Any async child under `createDestination` is stuck. `destination.test.ts:295-323` asserts only `_tag === 'Run'`.
- N3 [L-VERIFIED, HIGH] Sync throw in Run/Cancellable/FireAndForget executor escapes `dispatch()` and skips rest of Batch (`store.svelte.ts:155,215,296`); in Debounced/Throttled/AfterDelay timers → uncaught exception. Mapped (via scope) version is caught → behaviour depends on composition depth.
- N4 [L-VERIFIED, HIGH] Re-entrant dispatch from subscriber: effects run out of order (`Effect.cancel` before the `cancellable` it targets is registered → job runs uncancelled); action subscribers get wrong state. `store.svelte.ts:85-105`.
- N5 [L-VERIFIED, HIGH] `Effect.map` drops `signal` for Cancellable (`effect.ts` map arm) → every scoped child gets `signal === undefined`.
- N6 [L-VERIFIED, HIGH] `Effect.map(AfterDelay)` discards executor promise → unhandled rejection / uncaught timer exception.
- N7 [L-VERIFIED, HIGH] `destroy()` leaves store live: AfterDelay timers and in-flight Run untracked; dispatch after destroy reduces state and re-arms timers. `tests/store.test.ts:395-411` only checks subscribers cleared.
- N8 [L-VERIFIED, HIGH] Stale child effects misrouted: `createDestinationReducer` routes by current `destination.type` (`destination-reducer.ts:88-113`) → addItem's late effect applied to editItem state; `handleStackAction` routes by index (`stack.ts:209-259`) → popped screen's effect lands on the new screen at that index.
- N9 [L-VERIFIED, HIGH] TestStore: `finish()` passes with in-flight Run/AfterDelay (`test-store.ts:371-374`); `receive()` uses findIndex → order not enforced (`:322-336`); `send()` does not fail on unasserted pending received actions; Debounced/Throttled execute immediately every time (`:560-564`) so `Effect.cancel(debounceId)` is untestable; rejecting Run → process-level unhandled rejection, finish passes; `send()` assertion sees post-effect state for sync-dispatching executors (`:275-280`).
- N10 [L-VERIFIED, MEDIUM] Throttle trailing call runs first-queued executor, not latest (`store.svelte.ts:270-283`): scroll 100,200,300,400 → executed [100,200].
- N11 [L-VERIFIED, MEDIUM] `handleStackAction` hardcodes parent action type `'stack'` (`stack.ts:249-256`).
- N12 [L-VERIFIED, MEDIUM] Effect ids not namespaced by composition: sibling `cancellable('fetch')` cancel each other; `forEachElement` items sharing `debounced('autosave')` → one fires. Undocumented.
- N13 [L-VERIFIED, MEDIUM] `actionHistory` unbounded by default and exposed as live mutable array (`store.svelte.ts:63-69,410-412`).
- N14 [L-VERIFIED, MEDIUM] `integrate()` runs core first (`integrate.ts:180`) → parent clearing destination on child's save means child never sees save; `.with()` dismiss nulls field ignoring `presentation.status` and allocates new state even if already null.
- N15 [L-VERIFIED, MEDIUM] Subscription taking an id held by in-flight Cancellable does not abort it (`store.svelte.ts:301-304` vs `166-169`); listener added during notification called twice.
- N16 [L-VERIFIED, LOW] `matchPresentationAction` throws on primitive/null nested payload (`matchers.ts:75`); `createDestinationReducer` with `destination.type` = `toString`/`constructor`/`__proto__` → garbage or throw (`destination-reducer.ts:90`); `Destination.is(x,'addItem.')` and `'addItem.save.extra'` match (`destination.ts:407`); `matchPaths` with own `__proto__` key throws; stack dismiss at index 0 empties stack while `pop` refuses (`stack.ts:221-227` vs `71-74`); `setPath([])` allowed; `forEach` duplicate ids update first only; reducer throw leaves action in history; `combineReducers` drops uncovered keys (reasoned).
- Note: `dist/store.svelte.js` ships uncompiled `$state.raw` (normal for svelte-package; consumer compiles).

## WebSocket — agent claims re-run by lead (scratchpad/websocket/scenarios.mjs) + code read

- W1 [L-VERIFIED+L-READ, CRITICAL] Reconnection makes exactly one attempt. `connect()` resets `reconnectAttempts: 0` (`live-client.ts:164-169`) including when called from the reconnect timer (`:386`); `onclose` reschedules only if `state.status === 'connected'` (`:293,309`) but a failing attempt goes connecting→failed→disconnected. Comment `:395` false. `maxAttempts`/`MAX_RECONNECTS`/backoff unreachable; every `reconnecting` event says attempt 1. No `live-client` test exists.
- W2 [L-VERIFIED+L-READ, HIGH] `disconnect()` nulls `socket` without detaching handlers (`:330-337`); old socket's late `onclose` runs against new state → `status=reconnecting` with an OPEN socket, reconnect `connect()` throws "Already connected", queued wrapper queues forever.
- W3 [L-VERIFIED+L-READ, HIGH] Reconnect predicate `!event.wasClean` (`:309`) → server-initiated 1001/1012/1013 never reconnect; `onerror` sets `status='failed'` (`:242`) so error-then-close on an established socket also suppresses reconnect.
- W4 [L-VERIFIED+L-READ, HIGH] Heartbeat: `client.disconnect(1001,…)` (`heartbeat.ts:89,105`) nulls `url` → `scheduleReconnect` returns (`:349`) → never reconnects; `message.data === pongMessage` reference equality (`heartbeat.ts:76`) so documented object pong never matches → disconnect every cycle; ping sent via JSON serializer (`"PING"` quoted) so bare `PONG` reply is INVALID_MESSAGE.
- W5 [L-VERIFIED, MEDIUM] `createQueuedWebSocket` over live client: `send` right after `disconnect()` rejects (isConnected flips on later close task); queue not cleared on disconnect → flushes to a different URL; wrapper created after connect queues while OPEN.
- W6 [agent VERIFIED, MEDIUM] Re-issuing `Effect.websocket.connect` with same id delivers old socket's close through new subscription (`effect-websocket.ts:61-75`).
- W7 [agent VERIFIED, MEDIUM] `WebSocketConfig.url/protocols/heartbeat/queueSize` accepted by type, ignored at runtime (`live-client.ts:90-99`); doc/README snippets (`reconnect: { enabled: true }`, `delayMs`, `intervalMs`) fail tsc.
- W8 [L-VERIFIED, LOW/MEDIUM] Connection timeout double-reports error; `disconnect()` during CONNECTING reports CONNECTION_FAILED and rejects the caller's connect(); `failed` never a resting status.
- W9 [agent, LOW] jitter +0..30% vs doc ±30%; `connectionTimeout: 0` → 10000; bytes counted as UTF-16 units; doc pool example unhandled rejection.

## SSR / security — agent claims re-run by lead (scratchpad/ssr-security/*.mjs) + code read

- SS1 [L-VERIFIED+L-READ, HIGH] SSG path traversal: `pathToFilePath` (`ssg.ts:436-452`) strips one slash then `join(normalized,'index.html')`; `join(outDir, filePath)` (`:392`) normalises `..` → `/../../escaped2` writes outside outDir. Build-time arbitrary file write from data-derived paths.
- SS2 [L-VERIFIED+L-READ, HIGH] Canonical `<link href="${config.baseURL}${path}">` raw (`ssg.ts:287`) → stored XSS from a path.
- SS3 [L-VERIFIED, HIGH] Documented `app.register(fastifySecurityHeaders)` / `app.register(fastifyRateLimit, …)` (`middleware/index.ts:24-25`, SSR skill) installs nothing on root routes (Fastify encapsulation; plugin not wrapped with fastify-plugin) → 0 headers; with `{}` opts the `= defaultSecurityHeaders` default never applies (`security-headers.ts:79`); `fastifyRateLimit` with no opts → NaN → every request 500. `ready()` silent.
- SS4 [L-VERIFIED, HIGH] Rate limiter keyed on `req.ip` (`rate-limiting.ts:112`): no trustProxy → whole site shares one bucket; trustProxy → leftmost XFF spoof bypass + unbounded key growth (+201MB / 20k keys measured).
- SS5 [L-VERIFIED+L-READ, HIGH] `generateAlternateLinks` (`i18n/ssr.ts:349-361`) interpolates `path`/`locale`/`baseUrl` raw into attributes; JSDoc instructs `{@html …}` in `<svelte:head>` with the request path → reflected XSS.
- SS6 [agent VERIFIED, MEDIUM] `allowDataUri` sets `ALLOW_DATA_ATTR` not data-URI control (`sanitize.ts:80-83`) → inert.
- SS7 [agent VERIFIED, MEDIUM] `renderToHTML` fails open: serialization error → embeds `{}` (`render.ts:133-139`) while `buildHydrationScript` throws.
- SS8 [L-VERIFIED, MEDIUM] Rate limiter cleanup interval never cleared/unref'd (`rate-limiting.ts:33`) → `app.close()` hangs (5 live timers).
- SS9 [agent REASONED, MEDIUM] Default CSP `script-src 'self' 'unsafe-inline'` (`security-headers.ts:29`); `X-XSS-Protection: 1; mode=block` deprecated value; no `object-src`/`base-uri`/`frame-ancestors`.
- SS10 [L-VERIFIED, MEDIUM] Security docs use nonexistent keys (`strictTransportSecurity`, `xFrameOptions`, `hsts.preload`, `noSniff`) → silently fewer headers; `plans/production-deployment/SECURITY.md` imports plugins from wrong subpath. `plans/` skipped by doc-typecheck; TS2353 not in SURFACE_CODES.
- SS11 [agent VERIFIED, LOW] SSG: `/a` and `/a/` collide (double-counted); `/404` data path overwrites 404 page; failed 404 not in `result.errors`; `getServerProps` string spread. `serializeStore` returns undefined for unserialisable root → `render.ts:255` TypeError. Tagged serializer: user object `{"__composableType":"Map","value":"ab"}` makes `hydrateStore` throw for every visitor; Date type confusion. `allowedAttributes` per-tag map flattened globally (`sanitize.ts:70-72`). `isServer()` true in Web Workers → effects dropped. Hydration `getElementById` clobberable. `hydrateI18nOnClient` computes and never applies (`i18n/ssr.ts:257-280`). SSR skill `isServer` used without call (always truthy). `render.ts:149,153` hardcode `lang="en"` and emit `<title>` before `result.head` (double title).
- Clean (agent, 17-string corpus): hydration script breakout — none; prototype pollution via parseState — none; DOMPurify default vectors — stripped; no `{@html}` in core .svelte.

## i18n — agent claims re-run by lead (scratchpad/i18n/*.mjs) + code read

- I1 [L-VERIFIED+L-READ, CRITICAL] ICU never works under native Node ESM. `icu.ts:36` `import IntlMessageFormat from 'intl-messageformat'`; the dep (10.7.18) has no `exports`, `main` is CJS, so Node's default import is the exports object → `new IntlMessageFormat()` throws "not a constructor" → `compileICU` catch (`icu.ts:131-136`) returns `() => message` → every ICU message renders as raw source (`"View {count, plural, …}"`), uncached, `console.error` per render. Affects any non-bundled Node consumer (Fastify/tsx SSR, SSG runners; the example's own `tsx` dev path). Bundlers pick `module` field → works, which is why tests (Vite) and `pnpm start` pass.
- I2 [agent VERIFIED, HIGH] `hydrateI18nOnClient` computes new state and discards it (`ssr.ts:257-279`, "conceptual implementation"); exported and documented as zero-FOIT hydration.
- I3 [L-VERIFIED+L-READ, HIGH] Persisted locale never restored with the library's own storage: reducer persists via `createLocalStorage` which JSON-encodes (`local-storage.ts:141` → `"\"fr\""`); `createBrowserLocaleDetector` reads raw `localStorage.getItem` and `includes()` (`detector.ts:137-138`) → never matches → next visit `en`. This is the package's own "Basic Usage" wiring (`index.ts:36-41`).
- I4 [L-READ, HIGH] `decodeURIComponent(value)` unguarded in cookie locale detection (`detector.ts:261` SSR, `:156` browser) → `Cookie: locale=%` → URIError → `initI18nOnServer`/`createI18nHandle` throw → 500 for that client on every route.
- I5 [L-VERIFIED+L-READ, HIGH] Formatter error fallback `date.toISOString()` (`formatters.ts:104-112`, `:182-227`) itself throws for invalid Date/string/null → `formatters.date('')`, `.date('not a date')`, `.date(NaN)`, `.relativeTime(null)` throw from inside the component; `.date(undefined)` → today's date; `.date(null)` → 1970.
- I6 [L-VERIFIED, HIGH] Accept-Language/navigator matching: exact matches across all preferences tried before any base-language match (`detector.ts:64-86`, `:166-186`) → `pt-BR,en;q=0.5` with `[en,pt]` → `en`; `zh-Hant-TW` → `zh-Hans-CN`; `sr-Latn` → `sr-Cyrl` (normalizeLocale keeps 2 subtags, uppercases second); `Q=`/`q=`/`q=abc` → NaN; `q=0` treated acceptable.
- I7 [agent VERIFIED, MEDIUM] `isICUMessage` (`icu.ts:71`) requires a comma after the type → `{n, number}`/`{d, date}` not ICU and not simple → rendered literally.
- I8 [agent VERIFIED, MEDIUM] Two escaping grammars: non-ICU messages go through `interpolate()` which ignores ICU quoting → `It''s {name}` renders doubled apostrophe.
- I9 [agent VERIFIED, MEDIUM] Missing ICU variable renders entire ICU source to user (`icu.ts:117-125`); compile failures not cached.
- I10 [agent VERIFIED, MEDIUM] `key in translations` on JSON object (`translator.ts:49`): `t('hasOwnProperty')`/`valueOf` throw; `t('constructor')` returns an object; params `in` check (`:23`) renders `function Object()` for `{constructor}`.
- I11 [agent VERIFIED, MEDIUM] `<html lang="en">` hardcoded, no `dir` (`render.ts:149`; `RenderOptions` has no lang/dir); example renders fr/es pages with `lang="en"`.
- I12 [L-VERIFIED, MEDIUM] RTL table incomplete/case-sensitive (`reducer.ts:38-40`): ps, sd, ug, dv, ckb, yi → ltr; `AR` → ltr.
- I13 [agent VERIFIED, MEDIUM] `formatDate` never sets `timeZone`; no timezone in i18n state → SSR/client date mismatch west of server.
- I14 [agent VERIFIED, MEDIUM] Loader returns `response.json()` unchecked (`loader.ts:148-149`) → non-object JSON cached and every `t()` throws; `loadNamespace` never validates locale (`../../evil` → state key and URL).
- I15 [agent REASONED, MEDIUM] `createGlobLoader` fixed key `../locales/${locale}/${namespace}.json` (`loader.ts:240`) vs skill's `import.meta.glob('/src/locales/*/*.json')` keys → never loads; `supportedLocales` unused.
- I16 [agent, LOW] `rerouteWithLocale` strips every segment equal to locale (`ssr.ts:411`); relative-time rounding vs thresholds ("in 60 seconds", "in 24 hours"); skill examples that cannot run (`loadNamespace` without locale, `storage: new Map()`, `storage: localStorage`, "Loads before completing" false — client FOIT); `any` in public i18n d.ts (`types.d.ts:32,171`, `ssr.d.ts:195-197`, `loader.d.ts:101`); keys untyped despite "type-safe" claim.
- Clean (agent): locale-switch race; loader dedup & no negative caching; hydration escaping shared with state; no `{@html t()}`; Accept-Language parser linear on 27KB; `Intl` only after `includes()` validation; `__proto__` in translation JSON does not pollute; formatter cache key complete; cookie parsing.

## Dependencies + routing — agent claims re-run by lead (scratchpad/deps-routing/*.mjs) + code read

- D1 [L-VERIFIED+L-READ, HIGH] `createURLSyncEffect` compares `serialize(state)` to `window.location.pathname` as raw strings (`sync-effect.ts:110-132`); browser normalises (`%20`, `%C3%A9`, `/a/../b`, `'`→`%27` which `serializeQueryParams` leaves) → mismatch forever → `pushState` on every dispatch (5 identical dispatches → 5 entries). Also Pitfall-3 recipe with ≥2 unsorted params → 4 pushes.
- D2 [agent REASONED, HIGH] Navigation and SSR skills show `syncBrowserHistory({ serializers, parsers, getDestination, destinationToAction })` — config shape does not exist (`browser-history.ts:20-70`); forced → `config.parse` undefined → TypeError on first Back.
- D3 [agent VERIFIED, HIGH] Routing guide (`docs/routing/url-sync.md:477,481,485,535-545,583,610-627,1599-1600`) documents seven path-to-regexp v6 pattern forms that throw `PathError` in v8; compile deferred to `matchPath` per call (`parser.ts:239`) → throws inside popstate/boot.
- D4 [agent VERIFIED, HIGH] Real `createCookieStorage`/`createLocalStorage`/`createSessionStorage` have zero tests (tests import only mocks).
- D5 [L-VERIFIED+L-READ, HIGH] `cookie-storage.ts:185` `decodeURIComponent` on every cookie name/value in `document.cookie` → one foreign cookie with raw `%` (`promo=50%off`) → `getItem`/`has`/`keys`/`size` all throw URIError, out of `dispatch`.
- D6 [L-VERIFIED+L-READ, HIGH] Cookie removal after reload ignores `config.domain` (`cookie-storage.ts:239` fallback omits Domain) → logout leaves session cookie; `clear()` iterates registry only (`:284-293`). README/SECURITY.md claim "reliable removal via internal registry".
- D7 [agent VERIFIED, MEDIUM] `window.localStorage` getter evaluated outside try (`local-storage.ts:48`, `:239`) → blocked storage escapes as raw DOMException, not `EnvironmentNotSupportedError`; SECURITY.md fallback recipe never fires.
- D8 [agent VERIFIED, MEDIUM] Every `createLocalStorage()` registers a permanent `window` storage listener with no dispose (`local-storage.ts:94-121`).
- D9 [L-VERIFIED, MEDIUM] `syncBrowserHistory` monkey-patches global `history.pushState` (`browser-history.ts:125-140`); out-of-order cleanup leaves a stale wrapper; clobbers other libraries' patches.
- D10 [L-VERIFIED, MEDIUM] popstate listener has no try/catch (`browser-history.ts:159-167`); documented `parseQueryParamsWithSchema` throws on `?page=abc` → handler throws, no action dispatched; same at `deep-link.ts:97` → boot crash.
- D11 [L-VERIFIED, MEDIUM] 50ms "loop guard" (`browser-history.ts:147-153`) guards an event that cannot happen (pushState never fires popstate) and drops a real Back within 50ms of a push.
- D12 [agent VERIFIED, MEDIUM] `parseQueryParams` reads `params[key]` on a plain object (`query-params.ts:84-92`): `?__proto__=x` changes the result object's prototype; `?constructor=`/`toString=` → `getQueryParam` returns a Function; `hasQueryParam(p,'toString')` always true.
- D13 [agent VERIFIED, MEDIUM] Testing skill claims `mockClock.advance(3000)` drives time-based effects (`SKILL.md:282-306`); `clock.ts:189-191` only increments a number; no timers; `Date.now` untouched → example cannot pass.
- D14 [agent VERIFIED, MEDIUM] `InvalidJSONError`/`SchemaValidationError` exported and documented but never thrown; `setItem` never runs validator; `has()` true while `getItem()` null.
- D15 [agent VERIFIED, MEDIUM] `basePath` is a string prefix (`parser.ts:178,183`): `/app` matches `/appetite`; trailing-slash basePath breaks hand-written parsers.
- D16 [L-VERIFIED, MEDIUM] Mocks diverge: cookie size measured raw JSON (mock) vs encoded+attributes (real) — 2802B accepted vs 8430B rejected; mock doesn't enforce SameSite=None+Secure; `MockStorage` cannot raise quota errors.
- D17 [L-VERIFIED, MEDIUM] Sync effect drops hash fragments (`sync-effect.ts:141`); sorted-normalised query means array reorder never syncs.
- D18 [agent, LOW] `matchPath` case-insensitive/trailing-slash tolerant and never percent-decodes params (`parser.ts:249-254`) while tests claim case-sensitive; sync effect reads `window.location` at reduce time → ReferenceError on server (product-gallery/styleguide reducers unguarded); schema edge cases (`array(...,{minLength})` bypass on undefined, `number()` accepts `0x10`/`1e3` with `integer:true`, `string().parse([])` → undefined); guide `url-sync.md:2021` passes bare schema map → TypeError; nonexistent `matchPattern`; quota `attemptedSize` UTF-16 units; SameSite error is plain Error; `serializeDestination` prototype lookup; cross-tab `clear()` dropped; prefix `auth` clears `auth:` keys; `+` not decoded as space; sync-effect sync throw escapes dispatch (pushState SecurityError on `//evil.com`); `any` in routing signatures; `RouteConfig` unused.
- Clean (agent): cookie encoding symmetric, no attribute injection; HttpOnly not offered; SameSite=None requires Secure; noop storage; no module-scope browser access; `isDev()`; error classes; MockClock negative advance; no open redirect (pushState refuses cross-origin); history state payload tiny.

## Navigation components / animation / actions — agent probes in Chromium (scratchpad/nav-components/harness, run1.log/run2.log read by lead) + code read

- C1 [L-READ+probe, HIGH] Sheet and Drawer cannot be dismissed by clicking their backdrop: `use:clickOutside` is on the container wrapping backdrop+content (`SheetPrimitive.svelte:243-247`, `DrawerPrimitive.svelte:244-248`) so `node.contains(target)` is always true; Modal/Alert attach to content via `bindContent` and work. Probe: modal 1, sheet 0, drawer 0. Tests fire pointerdown on `document`.
- C2 [L-READ+probe, HIGH] Body scroll lock not reference-counted (`ModalPrimitive.svelte:202-224`, Sheet `:210-227`, Drawer `:211-228`, Alert `:196-216`): each captures/restores `body.style.overflow`; two overlays closed together → `hidden` forever; non-LIFO close unlocks under an open modal. `paddingRight` same.
- C3 [L-READ+probe, HIGH] Every primitive has its own `<svelte:window on:keydown>` Escape handler with no layer awareness (Modal/Sheet/Drawer/Alert/Popover/Sidebar/NavigationStack) → one Escape dismisses all open overlays; Sidebar has no `interactionsEnabled` gate.
- C4 [probe, HIGH] Popover strips `transform:` from `style` for animation; at `presented` Svelte rewrites the style attribute and the positioning transform is lost (`Popover.svelte:140,109-120`) → popover jumps by its offset every open.
- C5 [agent REASONED, MEDIUM-HIGH] Z-index: Sheet `z-[60]/[61]` vs Modal/Alert/Drawer/Popover `z-50/[51]` in sibling portals → any overlay opened from a Sheet renders beneath it and is dismissed by the next click.
- C6 [probe, MEDIUM] focusTrap (`focusTrap.ts:84-109`) wraps only when activeElement is exactly first/last; container itself (tabindex=-1) + Shift+Tab escapes; no focusable children → focus never enters, Tab escapes; container never focused.
- C7 [probe, MEDIUM] Tabs static ids `tab-{index}`/`tabpanel-{index}` (`Tabs.svelte:157-158,171-172,138`) → two instances collide; ArrowRight in B focuses A; `aria-controls` points at unrendered panels.
- C8 [probe, MEDIUM] Popover `aria-modal="false"` but `use:focusTrap` (`PopoverPrimitive.svelte:199`) traps and steals focus; no accessible-name prop.
- C9 [agent REASONED, MEDIUM] Styled wrappers (Modal/Sheet/Drawer/Alert/Popover/AlertDialog) do not forward `returnFocusTo`; Safari/Firefox mouse click does not focus buttons → focus restored nowhere.
- C10 [agent REASONED, MEDIUM] Reduced motion: 28 helpers ignore it; Motion itself forces instant for positional keys only → per-property mix (opacity fades, x/y jump; transform-string helpers full amplitude). No deadlock.
- C11 [agent REASONED, MEDIUM-LOW] No `aria-hidden`/`inert` on background content behind modals.
- C12 [probe, MEDIUM-LOW] `clickOutside` acts on `pointerdown` alone → touch scroll gesture (pointerdown+pointercancel) dismisses.
- C13 [agent, MEDIUM-LOW] Untranslatable ARIA strings: `Sidebar.svelte:144`, `Tabs.svelte:152`, `NavigationStack.svelte:113,119`, `AnimatedNavigationStack.svelte:270,273`; `'Bottom sheet'` emitted for `side="left"`.
- C14 [probe, LOW] Animation completion `.then` dispatches after unmount (`ModalPrimitive.svelte:151-157` and siblings): store believes overlay presented 800ms after unmount.
- C15 [agent REASONED, LOW] Focus restore not stack-aware (`focusTrap.ts:119-128`); `bindContent` twice leaks a dismissable layer (`ModalPrimitive.svelte:252-253`, Alert `:253-254`); `AnimatedNavigationStack` dedup key `status:null:len` without content id refuses replace-top; `AlertDialog` `hasTitle`/`hasDescription` never reset (`AlertDialog.svelte:98-110`).
- Clean (agent): re-open animates new element; `(status, content)` guard in all six primitives; dismiss during presenting gated; hydration at presenting/presented; no module-scope DOM access; `$effect` cleanups; portal removal; listener references; AlertDialog ids via `$props.id()`; scroll follower; DestinationRouter null path.

## Test quality — agent report, key items lead-verified

- T1 [L-VERIFIED, HIGH] `tests/test-store.test.ts:45,204,233` use `it.skipIf(typeof vi === 'undefined')` but the file imports only `describe, it, expect` and `vite.config.ts` has no `globals: true` → all three always skip. `:204` is the only test that asserts `assertNoPendingActions()` throws in exhaustive mode. PHASE-1-STATE treats the 3 skips as benign baseline; they hide the TestStore's core guarantee. `test-store.ts:349` → `if (false)` would keep the gate green.
- T2 [agent VERIFIED, HIGH] `silent: process.env.CI === 'true'` (`vite.config.ts:82`, `vitest.node.config.ts:69`) hides every console line in GitHub Actions, including the store's swallowed-error logs. No test asserts `console.error` is not called; no setupFiles.
- T3 [agent VERIFIED] Real `createAPIClient`, `createLiveWebSocket`, `createCookieStorage`, `createLocalStorage`/`createSessionStorage` have no tests in any package; suites test the mocks.
- T4 [agent VERIFIED/REASONED] Vacuous or weak tests: `store.test.ts:395` (destroy → subscriber count only), `:284` (throttle count only), `:214`; `effect.test.ts:256,294` (map Cancellable/AfterDelay without signal/async); `heartbeat.test.ts:286` passes via timeout path not the branch it names; `integration.browser.test.ts:396` decorative; `icu.test.ts:238,244` sole `toBeTruthy` passing via fallback; `form.test.ts:843` relies on TestStore executing Debounced immediately; `animation-interruption.test.ts:144` sole expect inside `if`; `spy-client.test.ts:544` "verifies retry" touches no retry code; `message-queue.test.ts:462`; `select.test.ts:600`, `test-store.test.ts:112` zero assertions; `scope-to-destination.test.ts:771` expects inside `if` no else; `operators.test.ts:686` passes for the wrong reason; `composition.test.ts:85` asserts `_tag` only; body-scroll tests assert `hidden` only, never restore.
- T5 [agent REASONED] Guards without positive control: `side-effects` (three arms), `changelog-shape` (no package floor), `dist-freshness`, `doc-examples` compile arm, `component-coverage`, `optional-props` function-type rule, `intentionally-unused` external branch, `flat-barrel` (load sensitivity diagnosed: 7 `ts.createProgram`s inside the `it` under 5s default timeout), `animation-policy` end-to-end, `styles/public-exports` dead extractor, `guard-integrity` does not check `package.json` still runs the node config.
- T6 [agent] TestStore fidelity: Debounced/Throttled execute immediately; `finish()` blind to pending AfterDelay; `receive` never fails on extras; partial match JSON-key-order sensitive; JSDoc teaches `vi.restoreAllMocks()` after `vi.useFakeTimers()` (does not restore timers).
- T7 Mutation plan (25 items) received; to be run by lead after all agents finish.

## Packaging / types — agent report, key items lead-verified

- P1 (dup, upgraded) [L-VERIFIED + agent Vite lib build, CRITICAL] `Effect.api` undefined in every bundled consumer; fix proven: `sideEffects` must list BOTH `dist/api/index.js` and `dist/api/effect-api.js` (or bare-import `./api/effect-api.js` from `dist/index.js` as websocket does). `effect.ts` comment "genuinely are on this object at runtime" false for bundled consumers.
- P3 [L-VERIFIED, HIGH] Svelte peer `^5.0.0` but `AlertDialog.svelte:92` uses `$props.id()` (`@since 5.20.0`); shipped `.svelte` compiled by consumer → `navigation-components` subpath fails to compile on Svelte 5.0–5.19. No guard checks a Svelte floor.
- P4 [L-READ, HIGH] `zod` is a hard dependency (4.1.12) while forms accept consumer schemas; `form.reducer.ts:333` `schema.parse` + `:342` `instanceof ZodError` (core's copy) → a Zod 3 consumer gets `fieldErrors={}` and a raw JSON dump as the form error (agent repro). Should be peer `^3.25 || ^4` with `safeParse`.
- P5 [L-READ, MEDIUM] `scopeTo().case()`/`.optional()` return `ScopedStore<any, any> | null` (`scope.ts:225,313`) while JSDoc promises typed stores → every DSL-built view has untyped state/actions.
- P6 [agent VERIFIED, MEDIUM] `Dependencies = any` throughout (`types.d.ts:147,155`, store, test-store, scope, if-let, integrate, combine-reducers, hydrate) → dependency-name typos compile.
- P7 [agent VERIFIED, MEDIUM] `motion` types fail under `skipLibCheck:false` (`framer-motion/dist/dom.d.ts:264` `HTMLWebViewElement`) via `dist/animation/animate.d.ts:16`; `motion` is a dependency (^12) while CLAUDE.md says peer ^11 → possible duplicate copies.
- P8 [agent VERIFIED, MEDIUM] CHANGELOG `[Unreleased]` files additive/breaking entries under `### Fixed` (`createParserConfig` :64, serializers :80, `messagesQueued` :96 self-described breaking, `createMockStorage` :110); `70a656c fix(ui)!` unlogged as breaking; `docs/migration.md:872` claims v1.0.0.
- P9 [agent VERIFIED, LOW] 281 `.d.ts.map` files (13% of unpacked size) ship pointing at unshipped `../src`; `declarationMap` inherited from root.
- P10 [agent VERIFIED, LOW] 245 optional props in non-Svelte public `.d.ts` lack `| undefined` (breaks consumers under `exactOptionalPropertyTypes`, which the repo recommends); `optional-props` guard covers `.svelte` only.
- P11 [agent REASONED, LOW] Two `Unsubscribe` types (storage `() => void` vs websocket `() => void | Promise<void>`), root barrel exports storage's; stale `@ts-ignore` at `render.ts:8`; `type SvelteComponent = any` ships in `render.d.ts:11`; `domPurifyConfig?: any`.
- Clean (agent): exports map targets exist, `types` first everywhere; nodenext + bundler/verbatimModuleSyntax consumer typecheck 0 errors (skipLibCheck true); 104/104 `.svelte.d.ts`; shipped `.svelte` TS erasable only, no legacy syntax; published files clean (no tests/tsbuildinfo/coverage/$lib/absolute paths); README/LICENSE hard links pack real bytes; `import.meta.env` guarded; no Node>20 APIs; only two import-time mutations; `Effect.websocket` survives bundling; client entries don't reach dompurify/fastify; CSS v3/v4 split coherent; `vitest` only via dynamic import in `receive()`; `@ts-ignore` ×2, `as unknown as` ×4 internal, `!` ×23 all guarded.

## UI components (52 files / 32 dirs) — agent report, key items lead-read

- U1 [L-READ+agent SSR, HIGH] `<Accordion items={…}>` (the JSDoc's own example, `Accordion.svelte:35-41`) renders nothing: template is `{@render children?.()}` (`:127-129`); items only seed the store.
- U2 [L-READ, HIGH] `DropdownMenu` never syncs `items` after mount (no `$effect`; `$store.items` from `createInitialDropdownMenuState(items)` `:70`); label/disabled/locale changes never show.
- U3 [L-READ+agent reducer run, HIGH] Tooltip sticks open: `hoverEnded` while `presenting` ignored (`tooltip.reducer.ts:100-101`) → presented forever; no Escape handling (WCAG 1.4.13). `tooltip.test.ts:189` asserts the ignore.
- U4 [agent SSR, HIGH] Collapsed `AccordionContent` stays mounted at `height:0; opacity:0` without `hidden`/`inert` (`AccordionContent.svelte:96-109`) → links inside are tabbable and read by AT.
- U5 [L-READ+agent reducer run, HIGH] Carousel autoplay dies silently: `autoPlayTick` during `isTransitioning` returns `Effect.none()` without rescheduling (`carousel.reducer.ts:124-127`); `isAutoPlaying` stays true; no pause control, `aria-live="polite"` while autoplaying, ignores reduced motion (WCAG 2.2.2).
- U6 [agent REASONED, HIGH] Tooltip never announced: `role="tooltip"` without `id`, trigger has no `aria-describedby` (`TooltipPrimitive.svelte:157-168`, `Tooltip.svelte:122-132`).
- U7 [agent, MEDIUM] DropdownMenu: ArrowDown on closed trigger highlights second item (trigger handler + window handler both dispatch `arrowDown`, `:108-113`/`:127-130`); window keydown hijacks Enter/Space/Arrows page-wide while open; wrapper `div role=button` around consumer `<Button>` → two tab stops; items `tabindex=-1`, no `aria-activedescendant`.
- U8 [agent REASONED, MEDIUM] Select search focus inverted (`Select.svelte:150-158`: checks `!$store.isOpen` after toggling); listbox has no `aria-activedescendant`/option ids/`aria-controls`; no scrollIntoView; `SelectProps<T>` instantiated as `SelectProps` so `T` always string.
- U9 [agent REASONED, MEDIUM] Tooltip goes invisible after scroll/resize while presented (style attribute rewrite clobbers Motion's committed `opacity:1`, `TooltipPrimitive.svelte:167`) — same class as Popover C4.
- U10 [agent VERIFIED compiled output, MEDIUM] `Input type="number"` cannot be cleared: `Number('')` → 0 (`Input.svelte:121`) after `bind_value` set null → field shows 0.
- U11 [L-READ, MEDIUM] Consumer `onclick` on `Switch` replaces the toggle (`onclick` before `{...restProps}`, `Switch.svelte:110-115`, `[key:string]:any` props).
- U12 [agent SSR, MEDIUM] Accordion ARIA: `aria-labelledby="accordion-trigger-${id}"` but trigger has no `id`; content ids `accordion-content-${itemId}` collide across instances.
- U13 [agent, MEDIUM] Hardcoded English not overridable: Carousel (9 strings), Select ("Clear selection", "Search...", "No options found"), Button/IconButton `aria-label="Loading"` inside button (name becomes "Loading Save"), Label `aria-label="required"`, BreadcrumbEllipsis sr-only dead under `aria-hidden`.
- U14 [agent, MEDIUM] Reduced motion ignored by every animating component in scope (Switch, Accordion, Collapsible, Carousel, DropdownMenu, Select, Tooltip).
- U15 [agent SSR, MEDIUM] Carousel ships scoped `<style>` (`Carousel.svelte:281-298`, `svelte-14wxk1s` hash) with `outline: 2px solid #3b82f6` on `:focus`; raw palette utilities (`bg-white/90`, `text-gray-800`…) bypass tokens, no dark variant. Badge/Banner also use raw colours.
- U16 [agent, MEDIUM] RadioGroup unnameable (no rest spread); `aria-checked` on native inputs; Checkbox indeterminate desyncs after click; Tooltip re-enter during exit never shows (`tooltip.reducer.ts:151-164`); Carousel hidden slides tabbable, dots misuse `tablist`.
- U17 [agent, LOW] `Math.random()` ids in Collapsible/RadioGroup (SSR/hydration mismatch; `$props.id()` exists); Banner defaults every variant to `role="alert"`; Input drops hint id from `aria-describedby` when error present; Textarea `resize` computed once; Slider fill unclamped (`NaN%` when max===min); Avatar `imageError` never reset on `src` change; Carousel never calls `store.destroy()` (post-unmount tick); `[key:string]:any` props on Checkbox/Radio/Switch; Badge rest typed `{}`; IconButton doesn't require `aria-label`; Progress indeterminate lacks `aria-busy`; Skeleton lacks `aria-hidden`; Accordion no arrow/Home/End navigation.
- Clean (agent): all 48 SSR renders succeed; no `{@html}`; no browser globals at module/script scope; barrels consistent; Button/Breadcrumb/Slider/Spinner/Progress/Textarea/Input basics sound.

## Forms + data components — agent claims re-run by lead (scratchpad/forms-data/*.mjs) + code read

- F1 [L-VERIFIED+L-READ, HIGH] Submit never runs async validators and ignores existing field errors: `submitTriggered` → `formValidationStarted` runs only `schema.parse` (`form.reducer.ts:322-392`); `hasErrors` counts Zod issues only (`:400`). Field showing "Username taken" (async or `setFieldError`) → `onSubmit` called. Submit during in-flight async validation succeeds, error lands after.
- F2 [L-VERIFIED, HIGH] Sibling refresh wipes non-Zod errors on other fields (`form.reducer.ts:270-281`): validating `email` clears `username`'s async/server error.
- F3 [L-READ, HIGH] `FormField.svelte:34` reads `$store.data[name]` as a flat key → nested `name="address.zip"` reads `undefined` (Phase 1.1 keyed errors by path, not values; `readAtPath` exists unused).
- F4 [L-VERIFIED+L-READ, HIGH] DataTable `pagination.total` = paginated slice length (`table.reducer.ts:181`), server-side `result.total` discarded (`:174`) → 25 rows/pageSize 10 → total 10, page 2 unreachable. Masked by fixture with exactly 10 rows.
- F5 [L-VERIFIED, HIGH] Double submit → `onSubmit` twice (no `isSubmitting` guard, `form.reducer.ts:309`, `Form.svelte:48-51`).
- F6 [L-VERIFIED, MEDIUM] Successful whole-form validation leaves stale field errors (`:446-459` clears formErrors only); type-changing transforms write output into `data` → second submit fails (`:456`); `formReset` cancels nothing (`:536-540`) → debounced/in-flight validation dirties pristine form; root-level `.refine()` invisible outside submit and form-level errors never clear until next submit (`:234-238`; `form.types.ts:273-277` claims live).
- F7 [L-VERIFIED+L-READ, MEDIUM] Combobox `openingCompleted`/`closingCompleted` have no status guard (`combobox.reducer.ts:103-113,125-140`) → Escape during opening → reopens by itself; `loadOptions` race: older slow response wins (`:237`, plain `Effect.run`).
- F8 [L-VERIFIED, MEDIUM] Toast `duration: Infinity`/`>2^31-1` → `setTimeout` clamp → dismissed after 1ms (`toast.reducer.ts:76`); cap eviction of a live toast fires no `onToastDismissed`/exit animation (`:62-66,221`) despite in-code "exactly once" claim.
- F9 [agent REASONED, MEDIUM] Lightbox focus effect re-runs on every store action (`ImageLightbox.svelte:49,243-270`) → focus jumps to Close on every navigation/touchMove.
- F10 [agent, MEDIUM] A11y: Combobox hardcoded `id="combobox-dropdown"` (`Combobox.svelte:299,381`), no `aria-activedescendant`; Command `role=dialog aria-modal` with no focus trap/scroll lock/restore, `CommandGroup` `id="group-{label}"`; TreeView two tab stops, no `.focus()`, arrows visual only (`TreeView.svelte:216-221,317-320`); `FormControl`/`FormMessage` ids = field name (duplicate across forms); DataTableHeader asc/desc icons identical, no `aria-sort`/`scope`; Calendar no keyboard grid nav, no `aria-selected`.
- F11 [L-VERIFIED, LOW] `FormControl` wires `onchange` while SKILL says wrong; `FieldPath<{avatar: File}>` admits `'avatar.name'`; `setAtPath('__proto__')` sets result prototype; `dirty` never reverts; `setFieldValue` keeps stale error; `z.record` dotted keys collide; sort compares numeric strings lexically, stringifies null; rows without id collapse selection; refresh race older wins; Command ArrowUp from -1 → -2, `item.onSelect` ignored when `onCommandExecute` set, no diacritic folding; tree `addChild` silent no-op, cyclic/5000-deep → RangeError, lazy node without dep stuck loading, disabled expandable via Space; Calendar `minDate = new Date()` makes today unselectable, Sunday-first hardcoded; FileUpload `createObjectURL` never revoked, `<input>` lacks `accept`; toast exit spring 280ms vs `exitDurationMs` 200; `afterDelay` timers survive destroy; no component destroys its internal store on unmount; SKILL examples use nonexistent `field.oninput`.
- Clean (agent): per-field A→B async race gated by cancellable id; Zod 4 paths (numeric, symbol, superRefine first-wins, discriminatedUnion, arrays); FieldPath cap agrees with runtime; `withField` `__proto__` own prop; Command filter regex-safe; toast dismiss idempotent; Lightbox keyboard/trap/scroll lock; Pagination clamps; file-upload matching; `submitCount`.

## STRUCTURAL FINDING (lead-measured, independent of all agents)

**Large parts of core's public surface have no caller anywhere in the repo, and three production modules are tested only through their mocks.** This is why the gate is green while these areas hold critical defects.

Import audit (`grep -h '^import' tests/<dir>/*.test.ts | sort -u`):
- `tests/api/*.test.ts` imports `types`, `errors`, `effect-api`, `cache` (clearCache only), `testing/mock-client`, `testing/spy-client`. It NEVER imports `client.js` (`createAPIClient`), `retry.js`, or `deduplication.js`. → the real HTTP path, retry, dedup and cache-keying have zero tests.
- `tests/websocket/*.test.ts` imports `channel-router`, `heartbeat`, `message-queue`, `testing/mock-client`, `testing/spy-client`, `types`. It NEVER imports `live-client.js`. → `createLiveWebSocket` (reconnection, close handling, timeouts) has zero tests.
- `tests/dependencies/*.test.ts` imports `createMockCookieStorage`, `createMockStorage`, `createSystemClock`, `createMockClock`. It NEVER imports `createCookieStorage`, `createLocalStorage`, `createSessionStorage`. → the real storage implementations have zero tests.

Caller census (`git grep -l <api> packages | grep -v '^packages/core/' | grep /src/` and same for `examples`), excluding definitions/JSDoc/README prose:
| API | satellite src | examples src | core tests |
|---|---|---|---|
| createDestination | 0 | 0 | 3 |
| DestinationRouter | 0 | 0 (one comment) | 5 |
| createAPIClient | 0 | 0 | 0 |
| Effect.api( | 0 | 0 | 2 |
| createLiveWebSocket | 0 | 0 | 0 |
| Effect.websocket | 0 | 0 | 2 |
| createCookieStorage | 0 | 0 | 0 |
| createHeartbeat / createQueuedWebSocket / createChannelRouter | 0 | 0 | 2/1/1 |
| forEachElement / scopeToElement | 0 | 0 | 1/1 |
| syncBrowserHistory / createURLSyncEffect | 0 | 4 | 2 |
| renderToHTML / generateStaticSite | 0 | 1 | 1 |

`@composable-svelte/auth` does NOT use core's API client (it ships its own HTTP adapter); the only `createAPIClient` hits in `packages/auth` are a JSDoc comment. So no shipped package depends on the untested API/WebSocket clients — the exposure is to external consumers following the docs.

Consequence for severity: the critical DSL defect (N1/N2) and the API/WebSocket/storage defects are "documented public APIs that have never been exercised end-to-end by any consumer", not regressions of working code. `examples/product-gallery` hand-wires `ifLetPresentation` with its own destination reducer and therefore avoids the broken path.

## Severity nuance (lead-measured)

- A1 mitigation: a PER-REQUEST `deduplicate: false` DOES work (`deduplication.ts:134`) — measured: 2 fetches. The CLIENT-LEVEL `deduplicate: false` does not (`client.ts:158` destructured, never passed) — measured: 1 fetch. So the cross-user dedup leak has a per-call escape hatch, but not the documented client-level one.
- Repo tree verified clean after all 12 reviewers (`git status --porcelain` empty); `_client_tests/` is pre-existing and gitignored, not an agent artifact.

## Skills / guides / CLAUDE.md — agent report, key items lead-verified

- G1 [L-VERIFIED, MEDIUM] `CLAUDE.md:161,395` document `Effect.merge` and a `Merge` variant. Runtime `Object.keys(Effect)` = afterDelay batch cancel cancellable debounced fireAndForget map none run subscription throttled (11, no merge); union has 9 tags, no Merge, no Cancel. Core skill + umbrella skill say "all 12 effect types" (measured 9/11).
- G2 [L-VERIFIED, MEDIUM] `CLAUDE.md:202,334-336` document `Destination.on()` and a subsection on why `subscribeToActions` is needed for it. `createDestination()` returns `_types extract initial is match matchCase reducer` — no `on`.
- G3 [L-VERIFIED, MEDIUM] `CLAUDE.md:140` points at `.claude/skills/composable-svelte-frontend.md` marked "⭐ CRITICAL patterns (ALWAYS use!)" — file does not exist. Tree lists 3 skills; 16 exist.
- G4 [L-VERIFIED, MEDIUM] `CLAUDE.md:41-43` "ships no scoped CSS — every style is a Tailwind utility class" — 11 components ship `<style>` blocks: Calendar, Carousel, FileUpload, Command×5, ImageGallery, ImageLightbox, AlertPrimitive. Several carry raw palette values.
- G5 [agent VERIFIED, CRITICAL] SSR skill `:1130` `app.register(fastifySecurityHeaders)` installs nothing (matches SS3); `:1135-1136` `strictTransportSecurity`/`xFrameOptions` are not config keys (TS2353) → no HSTS, no X-Frame-Options. The deployment skill gets the direct-call form right.
- G6 [agent VERIFIED, HIGH] 24 further skill fences fail to compile against dist types (media `tracks`/`albumArt`/`onAudioData`/action names, code `nodes`/`edges` array-vs-Record, maps `"osm"`/`LngLat` tuple, chat `generateUserColor`, auth signal signature, deployment `hsts.preload`). All inside the repo guard's own extraction scope.
- G7 [agent VERIFIED, MEDIUM] `doc-typecheck` reports zero because `SURFACE_CODES` admits only ten codes; TS2322/2353/2561/2774 are excluded — ~30 genuine API failures sit in that gap, in fences the guard already compiles.
- G8 [agent VERIFIED, MEDIUM] No repo guard reads `CLAUDE.md` at all — the document every AI session loads first is the one with no compiler or link checker behind it.
- G9 [agent VERIFIED, MEDIUM] `skill-examples.test.ts` PINNED contains one skill (auth); the other 15 skills' svelte fences have no markup verification.
- G10 [agent VERIFIED, MEDIUM] CLAUDE.md counts wrong: Phase 8 "420" → 448; API 162 → 172; WS 140 → 146; deps 118 → 130; i18n 35 → 97; SSR 45 → 124; auth-server "93" → 92. Correct: 77 components, 6 Playwright, 8 packages, 20 workspaces, browser/jsdom split, svelte peer.
- G11 [L-VERIFIED earlier, MEDIUM] `motion: ^11.0.0` peer claim vs actual `^12.23.24` dependency.
- G12 [agent, MEDIUM/LOW] Repository Structure tree omits the `lib/` segment in every path; API client labelled Phase 6 then Phase 8; `MockWebSocket`/`MockAPIClient`/`MockAPI`/`MockCookieStorage` are not exported names; 4 examples listed, 12 exist; Phase 5 listed "upcoming" while phases 9-17 are done; ANIMATION-GUIDELINES table says "All 31" and lists 30 (`animateCarouselTrack` missing), 11 springPresets vs 12; CLAUDE.md recommends `$derived` while core skill says "always use `$store`"; `createTestStore` vs `new TestStore` inconsistent.
- G13 [agent VERIFIED] Coverage: 36 package specifiers, 0 broken subpaths; 194 API names diffed against a 1,289-name dist inventory → 1 real miss (`generateUserColor`) plus the 4 prose-only names above; 192 fences compiled, ~30 genuine API failures.
- Clean (agent): Tailwind v3 preset and v4 import instructions both verified working against dist; PresentationState field names match; scope/scopeTo/ifLet disambiguation consistent; ANIMATION-GUIDELINES accurate apart from the table count and honest about the reduced-motion gap (measured 3 of 31); VERIFICATION-PROTOCOL rules 1,2,4-8 not violated in that surface.

## MUTATION RESULTS (lead-run, tree restored clean after each)

Positive controls — prove the harness detects a real guard:
| control | mutation | result |
|---|---|---|
| CTRL-xss | `render.ts` escapeJSONInScript: `<` → `<` | **KILLED** (3 tests fail: "neutralises `</script>...`") |
| CTRL-iflet | `if-let.ts` null-child guard removed | **KILLED** ("returns unchanged state when child state is null") |

Targeted mutations — 7 of 7 SURVIVED:
| # | mutation | suite run | result |
|---|---|---|---|
| M1 | `test-store.ts` exhaustivity check → `if (false && …)` | test-store.test.ts | SURVIVED (12 passed, 3 skipped) |
| M2 | `store.svelte.ts` `destroy()` abort loop deleted | store + test-store | SURVIVED (26 passed) |
| M4 | `matchers.ts` `'presented'` check deleted | navigation/operators | SURVIVED (41 passed) |
| M5 | `composition/scope.ts` `Effect.map(childEffect, …)` → `childEffect` | composition | SURVIVED (8 passed) |
| M6 | `heartbeat.ts` no-pong branch deleted | websocket/heartbeat | SURVIVED (21 passed) |
| M7 | `icu.ts` format-error fallback → `'MUTATED'` | i18n/icu | SURVIVED (31 passed) |
| M9 | `query-params.ts` decode fallback → `''` | routing/query-params | SURVIVED (50 passed) |

Interpretation: the TestStore's exhaustivity guarantee, `destroy()`'s effect cancellation, the presentation-action discriminator, `scope()`'s child-effect lifting, the heartbeat's liveness branch, the ICU fallback and the query decode fallback can each be removed or neutered with the relevant suite still green.

## CONFLICT RESOLVED (lead-run) — sync vs async effect executors

`docs/core-concepts/effects.md:851` claims "Effects never crash the app". Measured against dist:
- NON-async executor throwing: `Effect.run` ESCAPED, `Effect.cancellable` ESCAPED, `Effect.fireAndForget` ESCAPED. `Effect.subscription` CONTAINED (it has try/catch).
- `async` executor throwing: run/cancellable/fireAndForget all CONTAINED.
- `Effect.batch(syncThrow, second)`: ESCAPED and the second effect never ran.
So N3 stands, scoped to non-async executors — which is the form the library's own JSDoc uses (`Effect.fireAndForget(() => { analytics.track(...) })`). The docs agent's "all contained" reading tested only async executors.

## Package documentation vs code (`packages/core/README.md`, root `README.md`, `CHANGELOG.md`, `packages/core/docs/**`, shipped JSDoc) — reviewer's own evidence; prefix `DA-`

Method: 158 import specifiers compiled against `dist` (1 failure); 19 `Effect.*` members named in docs checked against the runtime namespace; 224 prose identifiers diffed against `dist`; **1,052 fences found, 833 (79%) outside `doc-typecheck`'s scope** because the guard keys on the string `@composable-svelte` inside the fence; those 833 compiled against `dist` with imports injected → ~30 genuine defects; 276 shipped JSDoc `@example` blocks compiled → 3 genuine.

- DA-C1 [agent VERIFIED, CRITICAL] `parseQueryParamsWithSchema` taught with a bare map of schemas, which throws `schema.parse is not a function` (`docs/routing/url-sync.md:776-783`, `:2020-2023` marked "✅ CORRECT", shipped JSDoc `query-params.ts:174-186`). The same document states the correct `object({…})` form at `:674-676`.
- DA-C2 [agent VERIFIED, CRITICAL] `RenderOptions.includeState` documented (`docs/ssr/server-rendering.md:670-676`) does not exist; state is always embedded. A consumer setting it `false` to keep server-side store contents out of the HTML gets them serialized anyway.
- DA-C3 [agent VERIFIED, CRITICAL] Cache-key rule documented as the design (`docs/backend/api-client.md:575` "normalized URL + params") and it omits `baseURL` and headers on a process-global cache. Same defect as `A2`, presented as correct.
- DA-C4 [agent VERIFIED, CRITICAL] `Effect.api`/`apiAll`/`apiFireAndForget` taught 17× in `api-client.md` without ever importing the bindings; absent in a bundled consumer. Same defect as `P1`.
- DA-C5 [agent VERIFIED, CRITICAL] `fastify.register(fastifySecurityHeaders | fastifyRateLimit, …)` taught at `docs/README.md:307-308`, `docs/ssr/server-rendering.md:505,519`, shipped JSDoc `middleware/index.ts:24-25`. Same defect as `SS3`.
- DA-H1 [agent VERIFIED, HIGH] `Effect.animated()` and `Effect.transition()` removed (`CHANGELOG.md:775`) but documented at `docs/api/reference.md:602,632,652,659,672,707`; `docs/core-concepts/effects.md:653-730`; `docs/navigation/components.md:158,1253,1278,1566,1574`; `docs/navigation/dismiss.md:1025`.
- DA-H2 [agent VERIFIED, HIGH] `Effect.merge()` does not exist: `packages/core/README.md:15`, `docs/README.md:217`, `docs/quick-reference.md:57-60,777`.
- DA-H3 [agent VERIFIED, HIGH] `Effect.browser()` does not exist: `docs/troubleshooting.md:790`.
- DA-H4 [agent VERIFIED, HIGH] `PresentationAction`/`StackAction` exported as types only (TS1362 when used as values); the value helpers are `PresentationActionHelpers`/`StackActionHelpers`. Taught as values at `docs/api/reference.md:981-982,1025-1029,1110`; `docs/navigation/tree-based.md:372-380`.
- DA-H5 [agent VERIFIED, HIGH] `APIResponse` has no `ok`; the client throws on non-2xx. Seven sites teach `if (result.ok)` whose success branch never runs: root `README.md:349`; `docs/core-concepts/store-and-reducers.md:215,218,445,715,722`; `docs/quick-reference.md:306`; `docs/core-concepts/testing.md:342`.
- DA-H6 [agent VERIFIED, HIGH] `handleStackAction` documented with 4 arguments; takes 6 (`dist/navigation/stack.d.ts:133`). Wrong at `docs/api/reference.md:1049` and shipped JSDoc `navigation/types.ts:119`.
- DA-H7 [agent VERIFIED, HIGH] `scopeTo(…).into(…).build()` — no `build()` on `ScopeBuilder`; `docs/troubleshooting.md:486,489,492,495`, two marked "✅ GOOD".
- DA-H8 [agent VERIFIED, HIGH] `const { reducer, Destination } = createDestination(…)` — no `Destination` property; `docs/README.md:241`.
- DA-H9 [agent VERIFIED, HIGH] `createLiveAPI` does not exist (export is `createAPIClient`): `docs/README.md:259`.
- DA-H10 [agent VERIFIED, HIGH] `GlobTranslationLoader` does not exist (export is `createGlobLoader`): `docs/i18n/internationalization.md:603-606`, `docs/README.md:291`.
- DA-H11 [agent VERIFIED, HIGH] `createBrowserLocaleDetector(supportedLocales: string[])` — real signature is a config object with required `defaultLocale`: `docs/i18n/internationalization.md:613` (the same file's tutorial at `:61` is correct).
- DA-H12 [agent VERIFIED, HIGH] `ReconnectConfig` requires all six fields; every documented partial fails to compile: `docs/backend/websocket.md:148,421-425,433,955,1112,1280`; `docs/backend/dependencies.md:659`; root `README.md:361-366` (also invents `delayMs`, `heartbeat.intervalMs`); shipped JSDoc `websocket/index.ts:16`.
- DA-H13 [agent VERIFIED, HIGH] `clock.setTimeout`, `createMockClock(new Date(…))`, `clock.runAll()` do not exist: `docs/api/reference.md:1696,1714,1720`.
- DA-H14 [agent VERIFIED, HIGH] `TestStore.setDependencies()` does not exist: `docs/backend/dependencies.md:576`.
- DA-H15 [agent VERIFIED, HIGH] `WebSocketClient.on()` does not exist and `connect()` requires a URL: `docs/README.md:265-266`.
- DA-H16 [agent VERIFIED, HIGH] `ValidationError.getFieldErrors()` (`api-client.md:661,706,1213`) and `APIError.url` (`api-client.md:378`) do not exist.
- DA-H17 [agent VERIFIED, HIGH] `generateStaticPage(App, path, outDir, storeConfig)` — real signature `(Component, path, options)`: `docs/README.md:302`.
- DA-M1 [agent REASONED, MEDIUM] Reconnection ladder documented in full (`websocket.md:28,380,396-412,421-437`) while the client makes one attempt (`W1`).
- DA-M2 [agent REASONED, MEDIUM] Jitter "±30%" (`api-client.md:526`, `websocket.md:415`); code applies 50–100%.
- DA-M3 [agent REASONED, MEDIUM] Retry safety documented backwards (`api-client.md:444-453,495-498`); `retry: true` retries POST/PATCH (`A5`).
- DA-M4 [agent REASONED, MEDIUM] `deduplicate` documented as a client option (`api-client.md:95-96,284-285`); never read (`A1`).
- DA-M5 [agent VERIFIED, MEDIUM] CHANGELOG files four new exports under `### Fixed` (`:64,80,96,110`) while `### Added` exists.
- DA-M6 [agent VERIFIED, MEDIUM] CHANGELOG `:100-101` calls `ConnectionStats.messagesQueued` breaking yet files it under `### Fixed`; the field is required.
- DA-M7 [agent VERIFIED, MEDIUM] `packages/core/README.md:38-39` under-declares dependencies (omits `zod`, `motion`, `intl-messageformat`, `path-to-regexp`, the optional peers) and states the wrong Svelte floor.
- DA-M8 [agent VERIFIED, MEDIUM] `docs/migration.md:872` "Currently at v1.0.0"; package is 0.11.2.
- DA-L1 [agent, LOW] Three different test totals across `packages/core/README.md:28` (500+), root `README.md:478` (4,271), `CLAUDE.md` (4,641).
- DA-L2 [agent, LOW] `packages/core/README.md:20` "Production-ready SSR … security hardening" not established (DA-C5, DA-C2).
- DA-L3 [agent VERIFIED, LOW] `docs/core-concepts/effects.md:851` "Effects never crash the app" holds for `async` executors only; see *CONFLICT RESOLVED* — false for the sync form the library's own JSDoc uses.
- DA-L4 [agent VERIFIED, LOW] `CHANGELOG.md:1148` (0.4.0) imports `generateStaticSite` from `/ssr`; it lives at `/ssr/ssg`. Historical section.
- DA-L5 [agent VERIFIED, LOW] Commit `70a656c`'s `BREAKING CHANGE` footer over-claims a heading-level change the code did not make; the CHANGELOG is right.
- DA-L6 [agent VERIFIED, LOW] Shipped `@example` at `test-store.ts:26` / `docs/api/reference.md:2019` asserts `state.isAnimating` on a `{ count: 0 }` state.
- DA-X1 [L-VERIFIED, HIGH] Found by R0.2.b on 4 September 2026, when `doc-typecheck` admitted TS2322/2353/2561/2774: 17 further register lines in fences the guard already compiled, beyond the audit's own list (which the `G6` and `DA-H12` lines cover). Files: `packages/code/README.md`, `packages/code/src/lib/node-canvas/README.md`, `packages/core/docs/animation/animated-navigation.md`, `packages/core/docs/backend/dependencies.md`, `packages/core/docs/core-concepts/composition.md`, `packages/core/docs/core-concepts/testing.md`, `packages/core/docs/navigation/components.md`, `packages/core/docs/navigation/dismiss.md`, `packages/core/docs/quick-reference.md`, `packages/maps/README.md`, `packages/media/README.md`. The exact keys are the `DA-X1` block of `REGISTER` in `packages/core/tests/repo/doc-typecheck.test.ts`; each is a documented value of the wrong shape (a reducer that can return `undefined`, a `receive()` partial with a field the action type lacks, a `FormData`/`SpringConfig`/map-config option that does not exist, a satellite README's action name or state shape, and `testing.md`'s untyped standalone reducer, which strict TypeScript widens to `any[]` for anyone who copies it). R4 clears them. Corrected by the R0 review on 4 September: the first form counted 19. One, the maps README's `import.meta.env.VITE_MAPBOX_TOKEN` TS2322, was the guard's own Vite shim typing env keys narrower than Vite does — the shim now matches Vite and the entry is gone. Two are what an elided or partially typed excerpt produces rather than a claim about the library (`dependencies.md` reducer body `// ...` returning void; the core skill's `const _never: never = action` in a block that never types `action`); they stay registered under an `EXCERPT` header so the count arm stays exact, and R4 decides whether to complete them.
- Clean (agent): `docs/getting-started.md`; `docs/dsl/scope-helpers.md`, `docs/dsl/matchers.md` (names and signatures); `packages/core/README.md` Quick Start compiles clean including `Effect<CounterAction>` as a type, Tailwind v3/v4 setup and troubleshooting match `exports`; root `README.md` Storage & Clock section; the npm-version disclaimer; `CHANGELOG.md` `[0.11.2]` and `[0.11.1]` entries hold against the code.

## Skill fences pinned by fixtures (R0.2.g, 4 September 2026) — prefix `DA-`, continued

- DA-X2 [L-VERIFIED, HIGH] Pinning every skill's `svelte` fences with a typechecked fixture (fifteen skills, sixteen fixtures, 148 markup-bearing fences, all fixtures clean under `svelte-check --fail-on-warnings`) found **18 fences a clean component cannot hold**, registered in `NOT_COMPILED` in `packages/core/tests/repo/skill-examples.test.ts` with a staleness arm: eight do not parse at all (runes, functions and `import` statements outside any `<script>`: charts `SKILL.md:549`, graphics `:49,946,955,975,988,1006`, maps `:902`) and ten parse but cannot typecheck against the real components (literal `...` placeholder attributes, "Future API" props no component declares, JS `//` comments as markup: charts `:534,830,880,954`, graphics `:916,924,1020,1055,1098,1118`). R4.5 fixes the skills and the entries fall out. (Corrected by the R0 review on 4 September: the first form counted the ssr `<svelte:head>` fence at `:882`, which is valid Svelte that one component cannot hold twice — now pinned live by a second fixture — and called all nineteen "not valid Svelte at all".) A further class is pinned as live markup yet is still a defect in the skill: an `import … from` line outside any `<script>`, which a fixture can carry only as literal text — components `:157,261,329,359,543,568,580,648,663,684`, code `:231`, media `:259`. The fixtures also surfaced markup that compiles only against a declared stand-in, i.e. documented props, components or state fields that do not exist: code (`CodeHighlight` props `code/language/theme/showLineNumbers/highlightLines`; `NodeCanvas` without the required `liftAction`, with `onNodeClick/onEdgeClick` that exist nowhere; `:232` import outside `<script>`), media (`FullAudioPlayer` `playerStore/showVisualizer/showPlaylist`; `VoiceInput` without required `onTranscript`, `showWaveform/showTimer`, state fields `transcript/error/permissionDenied`; `:260` import outside `<script>`), components (`Modal` snippet `store` is `| null` so `scoped.dismiss()` does not compile; `Toaster` takes only `store`, not `toasts/position`; `Checkbox` `onchange` implicit-any because restProps is `[key: string]: any`; `lucide-svelte` unresolvable from core; a scoped `.custom-card` rule that cannot reach a child), navigation (`Alert`/`Modal` snippet `store | null`; `NavigationStack` `currentScreen` is `unknown`; `NavigationStack`/`AnimatedNavigationStack` `store` requires `dismiss()`; `bind:this` into a plain `let` is `non_reactive_update`; **`scopeToDestination` never returns null — it returns a store with `state: null` — so every documented `{#if scopedStore}` guard is always true**), forms (the "CORRECT" half of anti-pattern 1 uses `field.oninput/onblur`, which do not exist; the CORRECT halves of anti-patterns 2 and 3 are compiled against the `WrongSelect`/`WrongSwitch` stand-ins, not the real components, so a CORRECT half omitting `Select`'s required `options` would pass — R4.5 compiles them against the real ones; `Switch`'s `[key: string]: any` means the WRONG example is not rejected by the types), core (`:220` `<li onclick>` trips two a11y warnings; `:696` `<svelte:self>` is deprecated, in a fence labelled runes mode), umbrella (`:31-37` a `$derived` line outside `<script>` is markup), deployment (`:447-458` placeholder component and undeclared `showChart/chartData`), chat (`:609-611` `user/x/y` never declared), i18n (`post/price/yesterday/user/product` never declared).
- P12 [agent VERIFIED, MEDIUM] `packages/core/src/lib/components/toast/index.ts` `export *` re-exports the `Toast` component over the `Toast` interface, so the `Toast` type is unreachable through the toast entry point (the components fixture imports it from `toast.types.js`). Found while pinning the components skill.
