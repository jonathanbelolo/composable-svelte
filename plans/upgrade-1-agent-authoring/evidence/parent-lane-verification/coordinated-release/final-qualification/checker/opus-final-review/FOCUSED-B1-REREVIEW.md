# Focused re-review: B1 (template-binding-computed-key)

Verdict: CLEAR. No blockers reproduced.

Scope: the guard added at packages/architecture/src/semantic-context.mjs (lines 64-68),
plus the README/CHANGELOG lines in CORRECTIONS-B1-vs-cd12784e.diff and the last test in
src/template-binding-default.test.mjs. B2 is out of scope and was not examined.
Scratch probes are in opus-final-review/rereview-b1/ (c1..c5 *.mjs, npm-test.log, mutants.log).

## Coverage (c1-coverage.mjs, c5-let-hosts.mjs, existing r2/r5/p9 probes)
Every probed computed-key form in a binding unit gives complete:false with
`template-binding-computed-key`:
- Nested obj-in-obj, array-in-obj, obj-in-array, and a computed key next to `...rest`.
- A computed key inside an array rest pattern (`[...[{[k]: f}]]`) and a computed key renamed to a sub-pattern.
- `{#each}` with index, with index plus key, and with key only.
- `{:then}`/`{:catch}` in long and short forms (`{#await q then/catch ...}`).
- `{@const}` object and array patterns.
- Snippet params: typed, second param, nested in an array param, and JS (non-TS) mode.
- `let:` directives on a component, `<svelte:fragment slot>`, `<div slot>` and `<svelte:component>`.
- Multiple keys in one pattern: one error per key.
- Literal computed keys (`[0]`, `['a']`), which are refused by design.
A computed key inside a default (C20) is already refused as `template-binding-default`.
An optional snippet param (C23 `{...}?: any`) fails closed as a parse-error.
The baseline (PKG=base) is still complete with no findings for K1/K1d/K3, so the fix is load-bearing.

Other places an executable expression could hide in `let <pattern>;`: none found.
- Binding patterns only admit identifiers, nested patterns, rest, defaults (refused) and property keys.
  Computed keys are always BindingElement.propertyName.
- Member-expression targets (e.g. `let:item={{a: o.b}}`) become TS parse-errors (D4), so they fail closed.
- Type annotations are erased by Svelte. Compiling N1 (`x: {[(window.location.href='/x')]: number}`)
  and a typed each context (N9) emits no `location.href`, so treating types as non-runtime is correct.
Svelte compile (c4-compile.mjs) confirms that the refused forms (C2, C11, C15, D1) do emit the key expression at runtime.

## No false refusals (c2-let-types.mjs, p9)
These all stay complete with no errors:
- Type literals with computed names, including an arbitrary-expression name.
- Mapped types, index signatures and method signatures with computed names.
- A plain pattern typed with a computed-name type.
- Literal numeric and string keys (`{0: v}`, `{'a-b': v}`).
- Nested plain patterns with index and key, and a typed each context.
- A plain then pattern and a script-level computed destructure.

## Span/path (c3-span.mjs)
For each, nested, @const, second snippet param and then-short, path is `App.svelte` and the
span slices exactly to `[(window.location.href = '/x')]` in the original .svelte text.
The error lands in context.errors. semantics.mjs sets complete:false whenever
context.errors is non-empty, and there is no construct-based filter or waiver. Inline suppression
directives are rejected by graph.mjs. So the refusal cannot be turned into a pass.

## Test and mutants
- `npm test`: 555 pass, 0 fail.
- mutants/run.sh: each of M1–M6 fails exactly 1 test. M6 fails
  'computed keys in template binding patterns are refused; literal keys and computed names in types are not'.

## Docs
README and CHANGELOG are accurate. Non-blocking nit: the README text and the error message name snippet
params, {#each}, {@const} and {#await}, but not `let:` directives. The guard also refuses computed keys
in `let:` directives. That is broader than the docs say, and in the fail-closed direction.
