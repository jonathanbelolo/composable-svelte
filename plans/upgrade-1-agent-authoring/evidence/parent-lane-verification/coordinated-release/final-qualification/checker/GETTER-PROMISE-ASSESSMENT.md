# Getter and Promise-executor compatibility: feasibility assessment

**Date:** 2026-09-26
**Type:** Read-only feasibility assessment. This is not an implementation, a qualification or a review verdict.
**Mutations:** None to the checker source, the author apps, the runtime or any evidence. All probing ran in `/private/tmp/getter-promise-scratch` on APFS clones.

---

## 1. Verdict

**Bounded support is feasible for both constructs. It needs no new zone, rule or framework-seed machinery.** The smallest sound change touches two files: `expression-values.mjs` and `semantic-flow.mjs`. A scratch prototype (+105/−1 lines) makes both exact app inputs complete with `qualification=passed`. It keeps every negative control refused and every positive authority-flow control detected.

| Construct | Bounded support (recommended now) | General support |
|---|---|---|
| Object-literal getter | **Feasible.** Admit only *alias getters*: `get k() { return <local non-rune binding>; }`. Under the checker's flow-insensitive binding values, this denotes exactly the already-supported data property `k: binding`. The body is still analyzed; its return set is the slot value. | **Broader scope: stop and report.** An arbitrary getter body executes implicitly at every read, spread or destructure, including reads made by framework or external code. Zones are driven only by call edges, so this needs new implicit-invocation edges plus escape tracking into framework-owned data. See §3.1. |
| `new Promise(executor)` | **Feasible.** Invoke a local synchronous executor with fresh `promise-settle` atoms. `resolve(v)` joins into the existing `promiseValues`/`awaitValue` machinery. Settle functions stay closure-confined. Rejections must be plain data, and thenable resolution is refused. All checks run after convergence. | Not needed for the apps. The exception channel (`reject`/`throw` → `catch`) is not modeled in the **base** checker; see §6. |

The recommendation is to implement the bounded tier only. Anything beyond it should go back to the coordinator.

---

## 2. Inputs and baseline

| Item | Value |
|---|---|
| App A getters | `app-a/src/dependencies.ts:85`, `:88`, sha256 `47e19d9a…2fe34b` (matches the P2 receipt). The bodies are `return activeStreams;` and `return abortedStreamsCount;`: a local `const` array and a local `let` counter in a `.ts` module. The object is returned from `createFakeWorkspaceDependencies()`. It becomes the `$props` default `dependencies` in `App.svelte:8` and then the `ApplicationRoot options.dependencies` wiring site. |
| App B executors | `app-b/src/lib/controlled-backend.ts:168`, `:193`, `:210`, sha256 `76b99e0c…784875` (matches). Each executor is an inline arrow `(resolve, reject) => { pendingX = resolve; [pendingY = reject;] signal?.addEventListener('abort', () => { reject(new DOMException(...)); }); }`. The stored resolvers are called later by local backend methods (`controlled-backend.ts:97-126`) with local data. |
| Live checker files inspected | `expression-values.mjs c5135591…`, `semantic-flow.mjs 7f012f30…`, `semantic-zones.mjs d30827a0…`, `framework-seeds.mjs a5b8260a…`, `rules/semantic-rules.mjs 1f716fc5…`. After probing, these were re-hashed and are **identical** to the snapshot the prototype was diffed against. |
| Baseline reproduction (unpatched scratch clone, qualification mode, same P1 policies, `--today 2026-09-26`) | A: exit 21, `GetAccessor` at lines 85 and 88. B: exit 21, `promise-operation` at lines 168, 193 and 210. This matches the P2 receipt exactly. |

The scratch apps are copies. Their `file:` dependency specs were rewritten to the installed registry versions, the same rewrite `author-app-compatibility.mjs` performs. No source file changed.

---

## 3. Checker facts that determine soundness

### 3.1 Getters

- **Refusal site:** `expression-values.mjs:361-362`. This is the only place object-literal getters are refused. Setters are refused at `:363-364`, class accessors at `semantic-flow.mjs:1016`, and template prop shapes with accessors at `template-seeds.mjs:164` (`objectAlternatives` returns `null`). None of those change.
- **Bodies are already analyzed.** `symbols.mjs:86-91` registers every function-like node with a body, including `GetAccessor`, as a function. The solve loop computes its `functionReturns` (`semantic-flow.mjs:1055-1061`) and evaluates every runtime expression in its body. Admitting a getter therefore skips nothing.
- **Zones come only from call edges.** `semantic-zones.mjs:80-92` adds edges for call facts, framework seeds and callback sites. A getter is never the target of a call fact, so its body gets **no zone**. For an arbitrary getter body, that is an escape: `const o = { get now() { return Date.now(); } }` read inside a reducer would execute `Date.now()` in the decision zone unseen. General support would need four things:
  1. Read facts from `readMember`, spreads and destructuring that feed zone edges.
  2. Getter slots visible to `functions()` (`semantic-zones.mjs:33`) and `leaves()` (`framework-seeds.mjs:15`), so wiring and opaque callees treat them like methods.
  3. An escape check for getter-bearing heaps reaching framework-owned data (dispatch payloads, reducer returns). There, the execution site is not a local read. A method at least leaves a syntactic call that raises `opaque-decision-call`; a getter leaves nothing.
  4. Refusal of `Object.create`/`setPrototypeOf` onto getter-bearing prototypes.

  That is new analysis machinery across the flow, zone and seed layers, so it is out of scope under the parent's "stop before broadening" rule.
- **Why the alias restriction is sound without zone changes:** the body `return x` only reads a binding, and reading a binding has no effect. The checker's `bindingValue` is the flow-insensitive join of every value the binding ever holds. The getter slot therefore holds the same atom set as the already-supported `{k: x}`, including the getter's "live" re-reads of a reassigned `let`. Every rule inspects values at the **read site** (`semantic-rules.mjs` checks `PropertyAccess`/reference nodes and assignment and call facts), so authority returned by the getter is seen wherever it is read. What stays excluded:
  - `this` (the body contains no `this`; `ambiguous-this` would still refuse it)
  - free globals (the identifier must resolve to a local binding)
  - member chains, which could invoke host accessors
  - extra statements
  - computed names
  - Svelte rune-backed bindings (`$state`/`$derived`/`$props`), whose reads have reactive-tracking side effects. They are deliberately deferred even though the value argument would also cover them.

### 3.2 Promise executors

- **Refusal site:** `semantic-flow.mjs:788-790` (`case 'promise-constructor'` in `dispatch`). Related refusals stay in place: `Promise.<other>` at `:165-168` and member access on async results (`.then`/`.catch`) at `:170-173`.
- **Existing machinery the design reuses:**
  - `promiseValues` plus `async-result` atoms (`:30`, `:780-786`)
  - `awaitValue`'s recursive adoption (`:501-511`), which already resolves an async function returning a promise
  - `invokeLocal` for binding parameters (`:464`)
  - the post-convergence deferred-error pattern (`:1080-1094`)
- **The executor zone is already correct.** `new Promise(f)` has a non-local callee, so `semantic-zones.mjs:87-91` already adds `caller → executor`. The executor runs synchronously in the caller's zone. The new `invokeLocal` does not touch `calls`/`resolvedCallee`, so that edge is unchanged. `hasOpaqueEntry` (`:527`) treats executor parameters as opaquely supplied, so defaults stay conservative.
- **Rule interaction is unchanged.** A `resolve(...)` call has a callee kind outside the `known` list (`semantic-rules.mjs:137`). Resolving with routing authority therefore emits `authority-escape`, and store authority gives `store-authority-to-opaque-callee`, exactly as `Promise.resolve(x)` does today (probe P0 against P1). Inside a decision zone, the call adds the existing `opaque-decision-call` limitation.

---

## 4. Smallest safe implementation sites

Prototype diff: `/private/tmp/getter-promise-scratch/proto.diff` (sha256 `8e7adf65…80da8f`). Resulting files: `expression-values.mjs 3c86c7a6…`, `semantic-flow.mjs e98320e9…`.

1. **`expression-values.mjs:361`:** add a branch `ts.isGetAccessor(prop) && services.getter`:
   - A static identifier, string or numeric name calls `services.getter(prop)` and writes the returned set into the heap slot.
   - A dynamic computed name → `ComputedPropertyName` refusal.
   - With no service, keep the existing refusal. That keeps the evaluator unit test at `expression-values.test.mjs:209` valid.
2. **`semantic-flow.mjs`, new `getter(node)` next to `invoke`, passed as a service at `:873-877`:** the body must be exactly one `return` of a type-erased (paren/`as`/`satisfies`/`!`/`<T>`) identifier. That identifier must resolve through `context.symbols.bindingOf` to a binding with a non-type declaration and no rune initializer. The service returns `functionReturns.get(getterFnId)`. Otherwise it reports `GetAccessor` with an actionable message.
3. **`semantic-flow.mjs:788`:** replace the refusal with `constructPromise`:
   - The executor must be a non-spread first argument that is `new`-constructed, and every atom must be a local `function` with a body that is neither `async` nor a generator.
   - It is invoked with `promise-settle` atoms `[id,'resolve']` and `[id,'reject']` and returns `async-result(id)`. Everything else keeps `promise-operation`.
   - **Implementation requirement:** record the construction and validate the executor *after convergence*. The prototype validates eagerly, which spuriously refuses executors that arrive through a call result (probe P36). That is fail-closed, but ordering-dependent.
4. **`semantic-flow.mjs` `dispatch`:** add `case 'promise-settle'`. `resolve` joins `args[0]` into `promiseValues[id]`, and every settle call is recorded in `settleChecks`.
5. **`semantic-flow.mjs:165-173` (`readMember` projector):** refuse any member access on `promise-settle` atoms (`.bind`/`.call`/`.apply`).
6. **`semantic-flow.mjs:1080-1094` (post-convergence, deferred errors):** add `checkPromiseSettlement()`:
   - A spread settle argument → `promise-settle`.
   - `reject(v)` where deep(`v`) holds anything except `heap`/`literal` → `promise-rejection`.
   - `resolve(v)` where a heap in `v` has a `then` slot with a non-data atom → `promise-thenable`.
   - Settle atoms reaching an argument of any non-local callee, a member-assignment leaf, an object or array literal value, or a function return → `promise-settle-escape`. Settle atoms may live only in bindings and parameters and be invoked directly.

No changes are needed in `semantic-zones.mjs`, `framework-seeds.mjs`, `rules/*`, `template-seeds.mjs`, the detector catalog or policies. The five-rule semantics and the 15 limitations are untouched.

---

## 5. Evidence from the scratch prototype

### 5.1 Exact app inputs (qualification mode, exact P1 policy bytes, pinned)

| App | Base scratch clone | Prototype |
|---|---|---|
| A (`bundled/chat-code-media.json`) | exit 21, `GetAccessor` at 85 and 88 | exit 0, `analysis-complete`, `passed`, 0 errors, 0 violations |
| B (`external-appb/app-b-auth-charts.json`) | exit 21, `promise-operation` at 168, 193 and 210 | exit 0, `analysis-complete`, `passed`, 0 errors, 0 violations |

This was a compatibility probe on a scratch checker. It is **not** release, receipt or qualification evidence.

### 5.2 Existing tests (targeted files only, prototype)

These files all pass (73/73): `expression-values`, `semantic-flow`, `semantic-flow-bypass` (including "getters cannot erase a routing authority", which still refuses class getters), `semantic-flow-extra-controls`, `cleanup-execution-controls` (including the Promise.resolve and thenable controls), `rules/semantic-rules`, `semantic-integration` and `symbols`. The broad suite was **not** run, per instruction.

### 5.3 Authority-flow probes

Harness: `probes/probe.mjs`, `cases.mjs`, `cases-extra.mjs`. Raw output: `probes/base.txt`, `proto.txt`, `proto2.txt`. "Refused" means `complete=false` with the named error.

**Getters, positive (authority must survive the getter; each matches its data-property parity case):**

| Case | Base | Prototype |
|---|---|---|
| G0 parity `{l: loc}`; reducer `o.l.href=` | location-write | location-write |
| G1 alias getter, same read | refused | **location-write** |
| G2 destructured `const {l}=o` | refused | **location-write** |
| G3 spread copy `{...o}` | refused | **location-write** |
| G4 getter object → external `sink(o)` | refused | **authority-escape** |
| G5 getter returns store, read in reducer | refused | **store-authority-in-reducer** |
| G6 getter returns `Date`, `o.c.now()` in reducer (parity G6: same) | refused | **impure-primitive** + opaque-decision-call |
| G18 `let` reassigned to `window.location` after getter creation | refused | **location-write** |
| G19 `Object.create(getterObj)` | refused | **location-write** + authority-escape |
| G20 getter object exported across modules | refused | **location-write** |
| G7 app shape (alias getters in wired `dependencies`) | refused | complete, 0 findings |

**Getters, negative (must stay refused):**

| Case | Result |
|---|---|
| G8 effectful body `return Date.now()` | `GetAccessor` |
| G9 `return window.location` (member chain) | `GetAccessor` |
| G10 `return location` (free global) | `GetAccessor` |
| G11 `return this.x` | `GetAccessor` + `ambiguous-this` |
| G12 extra statement (`n++`) | `GetAccessor` |
| G13 setter | `SetAccessor` |
| G14 computed name | `ComputedPropertyName` |
| G15 class getter | `class-accessor` |
| G16 `$state` binding getter in `.svelte` | `GetAccessor` |

**Promises, positive (resolution value must reach `await`; executor zone must be attributed):**

| Case | Base | Prototype |
|---|---|---|
| P0 parity `await Promise.resolve(location)` | authority-escape + location-write | same |
| P1 `await new Promise(r => r(location))` | refused | **authority-escape + location-write** |
| P2 resolver stored in `let`, invoked later via alias with `history` | refused | **history-write** (+ authority-escape) |
| P3 resolver passed to a local helper that calls it | refused | **history-write** |
| P6 async function returns executor promise; caller awaits | refused | **location-write** |
| P28 rest-param settle functions `rs[0](location)` | refused | **location-write** |
| P4 executor inside reducer calls `fetch` | refused | **impure-primitive** (decision zone) |
| P5 executor in component script calls `fetch` | refused | **view-io** |
| P7 app shape (closure resolvers, abort → reject `DOMException`) | refused | complete, 0 findings |
| P31 resolve with pushed data array; P33 `{then:'x'}` (non-callable) | refused | complete |
| P34 / P35 executor via const / via helper parameter | refused | complete |

**Promises, negative (must stay refused):**

| Case | Result |
|---|---|
| P8 `rej(window.location)` then `catch (e) { e.href= }` | `promise-rejection` (+ authority-escape) |
| P26 reject with a local function | `promise-rejection` |
| P9 resolve with local thenable `{ then(){ fetch() } }`; P32 array holding a function | `promise-thenable` |
| P10 `setTimeout(r)`; P11 `sink(r)`; P29 `sink(restArray)`; P25 resolver passed to a resolver | `promise-settle-escape` |
| P12 `holder.r = r`; P13 `{r}`; P16 `list.push(r)`; P14 resolver returned | `promise-settle-escape` |
| P15 `r.bind(...)` | `promise-operation` |
| P24 `r(...xs)` | `promise-settle` |
| P17 external executor; P18 async executor; P19 `Promise()` without `new`; P20 spread executor; P21 `.then` on the constructed promise; P22 `Promise.withResolvers` | `promise-operation` |
| P23 `function` executor using `this` | `ambiguous-this` (+ settle escape) |
| P36 executor returned from a factory call | `promise-operation`. **Spurious**, from ordering; fix by deferring (§4 item 3). |

---

## 6. Limitations and residual risks (must appear in the implementation review)

1. **Getter scope is alias-only.** Effectful, computed, member-returning, `this`-using, global-returning and rune-backed getters stay refused. Idiomatic Svelte `get x() { return stateVar; }` remains unsupported until reactive-read semantics are reviewed. General getters need the machinery in §3.1.
2. **Parity gaps in the base model, which the alias getter neither closes nor widens:**
   - Action-payload data is not linked to the reducer `action` parameter. G21 (getter) and G21-parity (data property) both miss `action.p.href=`.
   - External callback parameters are unmodeled. P27 (a resolver wrapped in a closure that forwards an external argument) is complete, as is P27-parity (`sink(x => x.href=…)`).
3. **Exception channel (pre-existing base gap, escalate).** `try { throw window.location } catch (e) { e.href = '/x' }` is `complete=true` with **no finding** on the base checker (P8-parity), because catch bindings get no value (`semantic-flow.mjs:919`). With executors admitted, an executor that *throws* authority (P30) is complete, at parity with a synchronous `throw`. Explicit `reject(v)` is stricter than `throw`: plain data only. Closing the throw channel is a separate, general change. It is not required for this compatibility work but should be tracked.
4. **`Object.defineProperty` accessor (pre-existing base escape, escalate).** `Object.defineProperty(o, 'now', {get(){ return Date.now(); }})` read in a reducer is `complete=true` with **no finding** on the base checker (G17). The descriptor's `get` receives only a caller-zone edge from the opaque-call rule, so the object-literal getter refusal is bypassed today. Recommend a separate fail-closed refusal of accessor descriptors in `defineProperty`/`defineProperties`/`Reflect.defineProperty`. This is independent of this work, and the prototype does not change it.
5. **Not modeled; stays refused:** `Promise.withResolvers`/`all`/`race`/etc., `.then`/`.catch`/`.finally` on constructed promises, async or generator executors, `Promise` without `new`, `window.Promise`, Promise subclassing, settle-function members, and spread settlement.
6. **Precision notes (all fail-closed):** the eager executor check (P36) must move to post-convergence. The thenable check treats any non-data atom in a `then`/`*` slot as callable, which is conservative for wildcard arrays that hold functions.
7. **Stickiness:** `addError` is non-retractable within a solve, so every check that depends on converged values must use the deferred path, as the settle checks already do.

---

## 7. Regression plan to port into the repo (implementation step, not done here)

Port the probe matrix in §5.3 as `node:test` fixtures. Suggested file: `src/getter-promise-compat-controls.test.mjs`, reusing the `analyzeSemantics` fixture pattern from `data-field-and-error-controls.test.mjs`. Assert `complete` and the exact error constructs or detectors per case. The tests must include:

- **Getter positives G1–G7 and G18–G20, each paired with its data-property parity twin,** asserting identical findings. That pairing is the proof that authority cannot escape through a getter.
- **Getter negatives G8–G16,** asserting the exact construct.
- **Promise resolution positives P1–P3, P6 and P28,** asserting the location or history write at the `await` consumer. That proves resolution cannot erase authority.
- **Promise zone positives P4 and P5,** asserting `impure-primitive` and `view-io`. That proves the executor body is attributed.
- **Promise negatives P8–P26 and P29,** asserting the exact construct. That proves settle functions, rejections and thenables cannot carry authority out.
- **P36 as a positive once the check is deferred.** It must become complete.
- **Kept as documentation controls, asserted as-is so any later change is noticed:** G17, G21/G21-parity, P27/P27-parity, P8-parity and P30.
- **Update `expression-values.test.mjs:209`:** keep it (the harness has no `getter` service), and add a service-backed evaluator case.
- **Exact inputs:** re-run the author-app compatibility exercise on the rebuilt candidate tarball. Expected: A and B exit 0 with the negative-policy rows unchanged. Then get a fresh independent review, as the parent requires.

---

## 8. Scratch artifacts (not evidence of record)

`/private/tmp/getter-promise-scratch/`:
- `architecture-base/`: unpatched clone.
- `architecture-proto/`: prototype.
- `proto.diff`
- `base-hashes.txt`
- `run.sh`: qualification runner.
- `out-*.json`: app runs.
- `probes/`: harness, cases and outputs.
- `app-a/`, `app-b/`: source copies plus local `node_modules`, with registry-shaped `package.json`.

These can be deleted freely. Nothing under `/private/tmp/composable-final-checker/packages`, `/private/tmp/composable-final-authoring` or any runtime was modified. No native or browser evidence was run.
