# Focused re-review of the three 0.13.1 corrections

Scratch probes: `opus-final-review/rereview/` (r1..r7 `*.mjs`; `fixed/` is a scratch copy with the candidate fix below;
`pre/` is the pre-correction source, used through `harness2.mjs` with `PKG=pre`).

## Verdict: NOT CLEAR. The three corrections are correct, but one blocker of the same kind as correction 1 remains

The three corrections are correct and minimal, and none of them introduces a crash or a fail-open.
`npm test`: 551/551 pass. `mutants/run.sh`: M1, M2 and M3 each fail exactly one test (the new tests), so the tests are meaningful.

One remaining fail-open has the same root cause as correction 1 (`ts.isTypeNode` is true for an instantiation expression), in
`src/symbols.mjs:167`. It is present in the pre-correction source and in the current source, and 0.13.0 refused it.

### BLOCKER B1: `arguments` inside an instantiation expression escapes the `arguments-object` refusal

`symbols.mjs:165-169` walks up the parents of `arguments` and sets `inType = true` on the first `ts.isTypeNode(parent)`.
An instantiation expression (`ExpressionWithTypeArguments`) matches, so `arguments<any>` counts as a type-position use. The
`arguments-object` refusal is skipped, and the flow then models `arguments` as an unbound identifier, which evaluates to empty.

Probe `rereview/r5-arguments.mjs`:

```
G1c plain arguments (control)      {"complete":false,"errors":["arguments-object@1"],"findings":[]}
G1 arguments<any>                  {"complete":true,"errors":[],"findings":["authority-escape@1"]}
G2c plain arguments identity       {"complete":false,"errors":["arguments-object@1"],"findings":[]}
G2 arguments<any> identity         {"complete":true,"errors":[],"findings":[]}          <-- fail-open
G2p plain param identity (expected) {"complete":true,"errors":[],"findings":["location-write@2"]}
G3 arguments[0]<any> call          {"complete":true,"errors":[],"findings":["authority-escape@1"]}
```

G2 source: `function id(this: any): any { return (arguments<any> as any)[0]; }\nexport function go() { id(window.location).href = '/x'; }`.
The result is complete with no findings. The parameter form reports `location-write`, and 0.13.0 (`PKG=base`) refuses it
(`ExpressionWithTypeArguments`). G1 and G3 are the Promise variants: settle functions are dispatched through `arguments`
while the analysis still reports complete. The pre-correction source gives identical output.

Candidate fix, verified in `rereview/fixed/` (full `npm test` 551/551; G1, G2 and G3 become `arguments-object` refusals):

```js
// symbols.mjs
import {isInstantiationExpression} from './expression-values.mjs';
...
if ((ts.isTypeNode(parent) && !isInstantiationExpression(parent)) || ts.isInterfaceDeclaration(parent) || ts.isTypeAliasDeclaration(parent)) {inType = true; break;}
```

A regression test should pair `arguments<any>` with the plain `arguments` refusal. No other `isTypeNode` or type-context parent walks
exist in `src` (grep: only `semantic-context.mjs:55` and `symbols.mjs:167`).

## Per-correction verification

### 1. `semantic-context.mjs` runtime marking: correct
- The type arguments are still TypeNodes, so they stay `runtime: false`. A1 `(<T,>(x:T)=>x)<typeof location>` gives no finding and no error.
  Heritage `ExpressionWithTypeArguments` is still excluded by the predicate. Class `extends` expressions are refused as
  `class-inheritance` (H1, H2, H3), so there is no new fail-open there.
- There is no double evaluation. `ts.isExpression(ExpressionWithTypeArguments)` is true, so the inner expression is not a solve root,
  and `evaluate` unwraps it once. Parameters of instantiated arrows are now seeded by semantic-types (line 818), exactly like
  plain arrows (A2: no false error).
- Parity with the plain forms in TS and Svelte templates (r1): nested instantiation (A6), class expressions (A7), generic
  function declarations (A8), a template call `{(<T,>() => fetch('/x'))<number>()}` (A3), and a template handler body (A5)
  all match their plain controls.

### 2. `settle()` keying per kind: correct
The following all refuse correctly (r2): K1 direct `(c ? res : rej)(state)`, K5 local wrapper, K7 thenable, K8 spread,
K9 authority, and K10 nested same-start calls. `.call`, `.apply` and `.bind` on a settle function are refused as `promise-operation` (K2–K4).

The new string key can collide for nested calls that start at the same offset. Colliding entries only `join` values and OR `spread`,
which is monotone and can never hide a value. `constructChecks` has a single kind, so it has no sibling issue.

### 3. `checkPromises()` template loop: correct
- Every template unit is created by `addTemplateExpr` as `(${slice})` and registered in `context.units`, so `statements[0]` is always an
  `ExpressionStatement` wrapping a `ParenthesizedExpression`. Parse errors abort before flow runs. Template units are always
  runtime, and `context.span(root)` exists.
- `value(root)` re-evaluates an expression that the solve loop already evaluates as a root on every pass. After convergence this
  is idempotent, the same as the existing object and array literal check. The errors are deferred and recomputed on each `solve()`.
- The following channels are all refused (r3): `{@render s(fire)}` into a snippet handler, `use:fire`, `use:act={fire}`,
  `{@attach fire}`, `{@attach (n) => fire(n)}`, shorthand `{fire}`, `{@const}`, `<svelte:window>`, `on:click`, `{#each [fire]}`,
  spread attributes, conditionals, `bind:` getter/setter pairs (through returns), `{@debug}`, `class:`, `{#key}`, and instantiation
  expressions in templates. The data-closure handler stays supported.
- Benign conservative refusals: `{fire}`, `{#if fire}`, `{@debug fire}`, and `{@render s(fire)}` are refused even when harmless (fail-closed).
- Note, not a blocker: `transition:fire`, `in:fire` and `animate:fire` are not refused, because directive names are not
  template units. This matches the existing model for any local transition function (r4 P3c: no `location-write` for
  `transition:t` either). The required motion rule always reports `transition-directive` and cannot be disabled, so the
  result is never a clean pass.

## Out of scope, reproduced and pre-existing in 0.13.0 (outside these corrections, reported for triage)

Defaults inside template binding units are never evaluated, because binding units are `runtime: false`. This affects snippet
parameter defaults and `{#each}` destructuring defaults (r7):

```
C1 snippet default authority write {"complete":true,"errors":[],"findings":[]}   # {#snippet s(f: any = window.location)}...f.href='/x'...{@render s()}
C1p snippet arg authority write    {"complete":true,"errors":[],"findings":["location-write@4"]}
C2 each default authority write    {"complete":true,"errors":[],"findings":[]}   # {#each [{}] as {f = window.location}}
C4 snippet default fire to handler {"complete":true,"errors":[],"findings":[]}   # settle fn escapes via default
```

0.13.0 behaves the same for C1 and C2. This is not caused by the Promise or instantiation work, but through C3 and C4 it also bypasses
settle confinement.

---

## Addendum: confirmation of the applied `symbols.mjs` fix (CORRECTIONS-symbols.diff)

**Final verdict: CLEAR.** B1 is fixed and I found no new issue.

- The applied change matches the candidate fix I verified in `rereview/fixed/src/symbols.mjs`. The only difference is an added comment.
- Probe `rereview/r5-arguments.mjs` against the current `packages/` source: G1, G2 and G3 (`arguments<any>` identity,
  Promise dispatch, and `arguments[0]<any>`) all refuse as `arguments-object@1` with complete=false. The controls are unchanged:
  plain `arguments` is refused, and the parameter form reports `location-write`.
- Type-position uses are still accepted (`rereview/r8-args-types.mjs`): `g<typeof arguments>` and `let x: typeof arguments`
  return complete with no errors, because the walk reaches the `TypeQuery` before any instantiation expression.
- `npm test`: 552/552 pass.
- `mutants/run.sh`: M1, M2, M3 and M4 each give "pass 20, fail 1". M4 (the `symbols.mjs` revert) is killed by the new test,
  'the implicit arguments object stays refused inside an instantiation expression'.
- Imports: `expression-values.mjs` imports only `typescript`, so there is no cycle. Importing `symbols.mjs` first, on its own, loads
  without error.
- The out-of-scope pre-existing note about defaults in binding units (C1, C2, C4) still stands. It is unrelated to this change.
