# Focused independent re-review: B2 (template binding values) + B1 confirmation

Date 2026-09-26. Fresh reviewer; read-only on `packages/` and `REVIEWED-SOURCE-HANDOFF/`. Scratch:
`opus-final-review/rereview-b2/`.

## Verdict: CLEAR

No reproduced blocker. Two non-blocking observations are listed at the end.

## Delta integrity

- I ran a fresh `diff -r` of `REVIEWED-SOURCE-HANDOFF/packages/architecture` against the live `packages/architecture`
  (excluding `node_modules`). It shows the same 6 files as
  `INCREMENTAL-B1-B2-vs-REVIEWED-SOURCE-HANDOFF.diff`, and the changed lines are identical
  (`rereview-b2/fresh-u.diff`). The only other entry is `package-lock.json`, which exists only in the live tree and is
  not in the snapshot. It is not part of this delta.
- B1 is unchanged. The live `src/semantic-context.mjs` (`f231bc69…`) and `src/template-binding-default.test.mjs`
  (`c3515bb7…`) match `SOURCE-B1-WORKING.sha256` exactly. All B1 added lines are still present. The semantic-context
  change is still only the 5-line computed-key guard.
- The B2 code is limited to `seedTemplateBinding` and `templateBindingError`, plus one call in `solve()`. It reuses
  `bindPattern`, `readMember(…,'*')`, `awaitValue` and `value`. It adds no rules, zones, evaluator, parser or catch
  handling.

## 1. Parity (probes `rereview-b2/q1-parity.mjs`, `q6-await.mjs`; live vs `PKG=base`)

Each template form gives the same detector as its script equivalent. Before B2 (on `base`), each was complete with no
findings.

| Shape | Script | Template (live) | Base |
|---|---|---|---|
| each object rest `{a, ...r}` | location-write | location-write | clean |
| each array rest `[k, ...o]` | location-write | location-write | clean |
| each destructured + index + key | – | location-write | clean |
| each over `$state` / Map / Set / `Object.values` | authority-escape | authority-escape (identical) | same |
| then nested destructuring + rest | history-write | history-write | clean |
| then array pattern, non-promise value, `{:then}` pending form | – | history-write | clean |
| then `Promise.resolve(history)` | escape + history-write | escape + history-write | escape only |
| then local `new Promise` | promise-resolution + history-write | identical | – |
| nested each using outer item / inner over outer | – | location-write | clean |
| const chain with destructuring, `@const` rest, const inside each/then, each over then value | – | location-write | clean |
| store via `{:then}` / each destructuring | – | view-subscribe | clean |
| each item passed to an external function | authority-escape | authority-escape | clean |
| snippet parameter iterated by each | – | location-write | clean |
| `{@const h = await load()}`, `{#each await load() as h}` | – | history-write | clean |

## 2. Convergence (`q3-converge.mjs`, `q4-backward.mjs`)

These all complete, converge and report the finding:

- nested each 60 deep;
- `@const` chain of 60;
- `@const` chain of 60 through distinct functions, which matches its script twin;
- a 19-level then → each → const → then alternation.

Backward-flow chains (a handler assigns to a script `let` that an earlier each iterates) converge at 10 and 40 hops. At
120 hops both the template form and its exact script twin report `non-convergence` identically, which is fail-closed
parity. B2 adds no non-convergence of its own.

## 3. Fail-closed correlation (`ast.mjs`, `q2-forms.mjs`)

These forms have no pattern and correctly bind nothing, with no refusal. Each result is identical to base:

- `{#each xs}` without `as`;
- `{#await p}` without then;
- the `{#await p then}` short form;
- `{#await p}{:then}` without a value;
- catch-only forms.

Patterns always correlate, including:

- typed each context (`as x: any`);
- parenthesised each expression;
- each with `{:else}`;
- empty `{:then v}` and `then v` bodies;
- typed or `as`-cast `@const`.

In Svelte 5.57 the each index is always a string, so the object-form index branch cannot occur. Multiple `@const`
declarators are rejected by Svelte itself (`const_tag_invalid_expression`). Every marker that has a pattern goes through
`bind`, which either binds or emits `template-binding-correlation`. M10 shows that the refusal branch is tested.

`{#each xs, i}` (no `as`) is refused as `EachBlock.index`. This is **pre-existing** and identical on base, so B2 did not
cause it.

## 4. Ordinary data bindings

`q2-forms.mjs` runs 43 ordinary forms: the ones above, plus:

- `Array(n)`, `new Array`, `Array.from`, `{length}`;
- strings;
- `Object.keys`/`Object.entries`, map/filter, split;
- `$props`, `$derived`, `?? []`;
- local range function;
- Map (direct and entries), sort copy;
- then plus each;
- nested const;
- each inside a snippet;
- Date, `JSON.parse`, Math, Intl;
- `$state` class items, `bind:` on items.

The live result is byte-identical to base, with zero new errors or findings. Store state through each and `@const`
(`q5-opaque.mjs` O6–O8) stays clean.

Real-input spot check (live `bin`, `--today 2026-09-26`, retained trees in `opus-app-gate-VwUA8I`):

| Input | Policy | Result |
|---|---|---|
| App-A | `policies/chat-code-media.json` | qualification passed, 0 violations, 0 errors |
| App-B | `external-app-b-auth-charts.json` | qualification passed, 0 violations, 0 errors |
| App-B | `auth.json` | refused, charts not approved (the expected negative, unrelated to B2) |

## 5. Docs

The README and CHANGELOG lines say that each, const and then are modeled like the named script bindings and that
`{:catch}` is not modeled. The existing text that follows still states that independent review is required and that
`manualReviewRequired: true` is always set. No other semantics are claimed.

## 6. Tests and mutation

- `npm test`: 560/560 pass (`rereview-b2/npm-test.log`).
- `mutants/run.sh` rerun (`rereview-b2/mutants.txt`): every mutant is applied and killed.
  - M1–M6, M9 and M10 each fail 1 test.
  - M7 fails 3 and M8 fails 2.
- Extra mutants:
  - X1 (each projection dropped to `items`) is killed, failing 2 tests.
  - X2 (awaitValue dropped) is killed, failing 3 tests.
  - X3 (exact start/end loosened to containment) **survives**; see observation (b).

## Non-blocking observations

**(a) New refusal, by design.** Iterating a value exported by an opaque package is now refused:

- Probe: `import {items} from 'ext'; … {#each items as it}` gives `computed-authority-access` and
  `unknown-authority-member`. It was clean on base.
- The script twin `for (const it of items)` produces the identical refusal (`q5-opaque.mjs` O1 vs O1s). So this is the
  authorized "exactly like script" behavior. It fails closed and was not seen on App-A or App-B.
- Optionally, the CHANGELOG could add: "these bindings can now report the same unsupported constructs as their script
  equivalents". This is not required.

**(b) Test strength.** Exactness of the correlation is not pinned by a test: mutant X3, which accepts a containing unit
in place of an exact start/end match, passes all tests. The code itself is correct. If desired, a one-line assertion in
the correlation test could pin exactness, for example that no error is raised and the binding is seeded only with the
exact unit. This is optional.

## Addendum: follow-up confirmation (optional suggestions applied)

I confirmed this follow-up independently, read-only on `packages/`.

- **Production source is unchanged since the review.**
  - `src/semantic-flow.mjs` is `64118c57…`.
  - `src/semantic-context.mjs` is `f231bc69…`.
  - `src/template-binding-default.test.mjs` is `c3515bb7…`.
  - `README.md` is `5903232d…`.
- **Only two files changed:**
  - `CHANGELOG.md` is now `a59ef814…`. The B2 entry adds one sentence: "These bindings can now report the same
    unsupported constructs as their script equivalents, for example iterating a value exported by an opaque package."
    This is accurate; see observation (a).
  - `src/template-binding-values.test.mjs` is now `e6908b51…`. The correlation test adds a second case. It widens the
    exact each binding unit by one (`binding.start -= 1`) and asserts that `complete` is false and that a
    `template-binding-correlation` error is reported. This pins exact start/end correlation, closing observation (b).
- **The updated diff matches the live tree.** `INCREMENTAL-B1-B2-vs-REVIEWED-SOURCE-HANDOFF.diff` (252 lines) matches my
  fresh diff line for line (`rereview-b2/fresh-u-v2.diff`). The new test file in the diff equals the live file byte for
  byte.
- **Rerun results:**
  - `npm test` passes 560/560 (`rereview-b2/npm-test-v2.log`).
  - `mutants/run.sh` applies and kills every mutant, M1–M11, each failing at least one test
    (`rereview-b2/mutants-v2.txt`). This matches `mutants/RESULTS-v5.txt`. M11, which is my X3 (containment instead of
    exact start/end), is now killed.

**Final verdict: CLEAR.** No blockers and no open observations.
