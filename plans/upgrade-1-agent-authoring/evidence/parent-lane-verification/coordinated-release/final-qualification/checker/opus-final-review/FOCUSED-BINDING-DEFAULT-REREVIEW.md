# Focused re-review: template-binding-default correction

Scope: the guard in `packages/architecture/src/semantic-context.mjs`, `src/template-binding-default.test.mjs`, and the README/CHANGELOG diff.
Probes are in `opus-final-review/rereview-binding-default/` (`r1`..`r9`, `compile.mjs`). `PKG=base` runs the 0.13.0 baseline.

## Verdict

- **The correction itself is CLEAR.** The guard catches every default form I could write in a binding unit. It causes no false refusals, its spans are correct, the tests are meaningful, and the suite is green.
- **The release goal is NOT CLEAR.** Two other channels, present since 0.13.0, have the same impact the parent judged release-blocking: complete, no findings, and the authority write is missed. Neither is a default, so this correction was never meant to cover them. They are listed as B1 and B2 so the parent can decide on scope.

## Correction: verified

- **Coverage (r1).** Every one of these is refused (`complete:false`, `template-binding-default`), and every one passes on base:
  - snippet params: plain JS, 2nd param, typed, complex union/function types, object/array destructuring, nested, renamed (`{g: f = x}`), rest-nested (`[...[f = x]]`)
  - each context: object, array, nested, renamed, with index and key
  - `{:then}` / `{:catch}`, including the short `{#await q then ...}` and `{#await q catch ...}` forms
  - `{@const {f = x} = obj}` and `{@const [f = x] = obj}` (see Docs)
  - `let:item={[f = x]}` (p7 D8)

  These forms are parse errors, so no default channel exists there: `{#each x as f = y}`, an each object index with a default, `{:then f = y}`, and the object form of `let:{...}`.
- **`{@const}`.** The init expression is its own evaluated template unit. The destructuring pattern is a binding unit, so a default inside it was a skipped default on base (C1/C2 complete, no findings). It is now refused. Plain `{@const f = window.location}` has no default and is not flagged.
- **No false refusals (r3).** All of these are `complete:true` with no errors:
  - keyed each; index + key; ternary key
  - array rest; object rest and rename
  - snippet params typed with function types, optional members, generic-default type aliases, conditional/`infer` types, and nested `Record`/`Array`
  - a destructured param inside a function type
  - `{@const t: Array<string> = ...}` and `{@const {id, ...o} = r}`
  - plain then/catch

  One refusal is expected: `{#each rows, i}` fails as `EachBlock.index` on base too. This is not a regression.
  The only non-default refusal I could build is a default inside a function *type* in a param annotation (r6 T1). TypeScript itself rejects that (TS2371), so this is harmless.
- **Span/path (r4).** Spans cover exactly `f: any = window.location` and `a: [g = window.location] = []`, plus the inner `g = window.location`. Paths are correct.
  - Context errors make `analyzeSemantics` return early with `complete:false`. Routing and motion errors and findings are kept.
  - Semantic findings in the same file are dropped, but this is the existing behaviour for any context error; it cannot turn a refusal into a pass.
  - Only `template-seeds.mjs:533` filters constructs, and it does not touch this one.
- **Tests.** `npm test`: 554 pass, 0 fail. `mutants/run.sh`: M5 fails "defaults in template binding patterns are refused". M1–M4 each fail 1, as before.
- **Docs (minor, not blocking).**
  - README, CHANGELOG and the diagnostic message list snippet, `{#each}` and `{:then}`/`{:catch}`. They omit `{@const}` destructuring defaults, which are also refused under this construct.
  - The code comment mentions "{#each} ... indexes", but an index cannot carry a default.

## B1 — computed keys in each / @const / await patterns are not evaluated (fail-open, since 0.13.0)

Same root cause as the defaults: a binding unit is `runtime:false`. A computed property key inside the pattern is an expression Svelte evaluates at runtime. I confirmed with `svelte/compiler` 5.57.0 that the output emits the `location.href`, `pushState` and `subscribe` calls.

```svelte
{#each [{}] as {[(window.location.href = '/x')]: f}}<p>{f}</p>{/each}
{#each [{}] as {[String(history.pushState(null, '', '/x'))]: f}}<p>{f}</p>{/each}
{#await q then {[String(store.subscribe(() => {}))]: f}}<p>{f}</p>{/await}
{#if true}{@const {[(window.location.href = '/x')]: f} = obj}<p>{f}</p>{/if}
```

Output (r2/r5; base is identical):

```
K1 each computed location write    {"complete":true,"errors":[],"findings":[]}
K3 @const computed location write  {"complete":true,"errors":[],"findings":[]}
K4 then computed location write    {"complete":true,"errors":[],"findings":[]}
K5 catch computed                  {"complete":true,"errors":[],"findings":[]}
H1 each computed history           {"complete":true,"errors":[],"findings":[]}
V1 each computed subscribe         {"complete":true,"errors":[],"findings":[]}
V2 then computed subscribe         {"complete":true,"errors":[],"findings":[]}
controls: H0 {history.pushState(..)} -> history-write ; V0 {store.subscribe(..)} -> view-subscribe
```

A snippet param with a computed key that is rendered is detected (K2 → `location-write`), so this channel only affects each, `@const` and then/catch.

- **Scope:** `ComputedPropertyName` inside a `binding` unit.
- **Narrow fix, same style as this guard:** refuse it, e.g. as a `template-binding-computed-key` construct. No new machinery is needed.

## B2 — each-item and @const values are not propagated (fail-open, since 0.13.0; NOT a default)

The `each-block` and `const-tag` markers have no consumers. `seedDeclaration` skips binding units (`semantic-flow.mjs:1081`). So the values bound by `{#each}` items and by `{@const}` are unmodelled, and authority that reaches a handler through them is silently accepted.

This weakens the effect of the correction. D2 (`{#each [{}] as {f = window.location}}`) is now refused, but X2 below has the same payload with no default and is still complete with no findings.

Output (r8/r9; base is identical):

```
X0 script for-of control      {"complete":true,"errors":[],"findings":["location-write@3"]}
X1 {#each [window.location] as f} f.href=..        {"complete":true,"errors":[],"findings":[]}
X2 {#each [{f: window.location}] as {f}} f.href=.. {"complete":true,"errors":[],"findings":[]}
X4 {@const f = window.location} f.href=..          {"complete":true,"errors":[],"findings":[]}
Y1 {#each [store] as st}{st.subscribe(..)}         {"complete":true,"errors":[],"findings":[]}
Y2 {@const st = store}{st.subscribe(..)}           {"complete":true,"errors":[],"findings":[]}
Y3 {#each [history] as h} h.pushState(..)          {"complete":true,"errors":[],"findings":[]}
X3 {#await Promise.resolve(window.location) then f} -> authority-escape (conservative, fine)
X5 snippet arg control -> location-write (fine)
```

The script equivalent (`for (const {f} of rows) f.href = ...`) is detected (X0b). Closing B2 means either modelling each items and `@const` values, or refusing those bindings, and refusing them would break "ordinary each blocks must remain supported". That is a scope decision for the parent. I am not proposing machinery here.

## Addendum: doc/test follow-up (2026-09-26)

Rechecked against the updated `CORRECTIONS-binding-default.diff`. Nothing in packages/ was modified.

- **Guard logic unchanged.** Only the comment and the diagnostic message changed. They now read "snippet parameters, {#each} items, {@const} and {:then}/{:catch} patterns" and "... in {#each}, {@const} and {#await} destructuring ...". Re-running r1 gives the same 17 refusals as before.
- **Text accuracy.**
  - README, CHANGELOG, the code comment and the message now list `{@const}` destructuring defaults.
  - The misleading "indexes" wording is gone.
  - All the listed forms are refused, and the claim that no-default patterns are unaffected matches r3.
  - README/CHANGELOG say "destructuring" for `{#each}`/`{@const}`/`{:then}`. That is exact: a bare-identifier default in those positions is a Svelte parse error.
- **Tests.** `npm test`: 554 pass, 0 fail. The new negative sits in the existing refusal test, so the count is unchanged. `mutants/run.sh`: M1–M5 each still fail 1, and M5 still kills "defaults in template binding patterns are refused".
- **New negative.** `{@const {f = window.location} = obj}` on its own is `complete:true`, no errors, under M5 (`rereview-binding-default/m5-const.mjs`), so this case would catch the guard being removed.

**Final verdict for the correction: CLEAR.** B1 and B2 above stay open as the release-scope report. They are pre-existing, they are not defaults, and the coordinator will pass them to the parent without implementing them.
