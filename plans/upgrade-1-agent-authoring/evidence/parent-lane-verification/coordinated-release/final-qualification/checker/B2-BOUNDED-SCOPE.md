# B2 bounded feasibility and scope: `{#each}` item and `{@const}` value propagation

Date 2026-09-26. Opus final checker reviewer, same context. **This is a scope report only.** The package source is
unchanged by B2, and the prototype lives in a scratch copy (`opus-final-review/b2-prototype/`). The parent decides
whether to implement.

## Answer

**Yes: ordinary `{#each}` and `{@const}` can reuse the existing script binding machinery.** The new code only wires
values into bindings. It adds:

- no new zones or rules;
- no evaluator or domain changes;
- no detector expansion;
- no refusal of ordinary data bindings.

Until the parent decides, B2 stays **open**. Values bound through `{#each}` and `{@const}` are **not** covered by a clean
result, and nothing here claims otherwise.

## Mechanism reused

Script `for (const <pattern> of <expr>)` is already handled in `semantic-flow.mjs` `solve()` by the same three pieces:

- **`bindPattern`:** destructuring, rest, nested patterns and defaults.
- **`readMember(value(expr), '*')`:** the element value; the same projection the script `for…of` uses.
- **`seedBinding`:** monotone joins that bump the revision, so the fixpoint and convergence behave as they already do.

The template side already provides everything needed; nothing new is parsed:

- **Markers:** `each-block` markers carry `expression` and `context` (Svelte AST nodes). `const-tag` markers carry
  `declaration.declarations[{id, init}]`.
- **Units:** each node already has its own unit. Expressions are template units, evaluated as the view zone. Patterns are
  binding units (`let <pattern>;`) whose identifiers are the bindings that template references resolve to.
- **Correlation:** units are matched to markers by exact source `start`/`end`, the same correlation `template-seeds`
  already uses.

The prototype adds this, once per solve pass, before the script `for…of` loop:

```js
for each module marker:
  each-block: bindPattern(decl(bindingUnit(context)), readMember(value(root(templateUnit(expression))), '*'), decl)
  const-tag:  bindPattern(decl(bindingUnit(id)),      value(root(templateUnit(init))),                     decl)
```

The diff is 23 lines: `opus-final-review/b2-prototype/B2-PROTOTYPE.diff`.

## Prototype evidence (scratch only)

**Target channels:**

- **Closed.** Each was complete with no findings on current source, and each now reports the same finding as the script
  equivalent (`probe-current.txt` versus `probe-proto.txt`):

  | Probe | Construct | Finding |
  |---|---|---|
  | X1 | each item | `location-write` |
  | X2 | each destructured | `location-write` |
  | X4 | `@const` | `location-write` |
  | Y1 | each store | `view-subscribe` |
  | Y2 | `@const` store | `view-subscribe` |
  | Y3 | each history | `history-write` |
  | E1 | nested each (outer item) | `location-write` |
  | E4 | `@const` chain | `location-write` |

- **Unchanged:**
  - the script controls (X0, X0b);
  - the snippet argument control;
  - the resolver-through-each case (Y4), which is still refused.

**Clean controls stay clean:**

- each with key and index;
- each over `$state` data;
- each without `as`;
- `Object.entries` each (the base finding is unchanged).

**Real inputs** (the prototype checker with the exact policies on the retained installed trees): all 10 positives still
pass with 0 violations and 0 errors. That covers:

- chat, code, media and chat-code-media default-root consumers;
- maps, graphics and charts production consumers;
- **App-A**, whose `{#each}` blocks are at `Workspace.svelte:90,178,277`;
- **App-B**, whose `{@const state = app.store.state}` bindings are at `App.svelte:47–51`;
- the Auth-only derivative.

**Suite on the prototype copy:** 553/554. The single failure is the inspect-archive symlink test, which fails
identically with the B2 change reverted in the same scratch layout. It is an artifact of the scratch copy, not of B2.

## Proposed implementation delta (if authorized)

| File | Change | Approx. size |
|---|---|---|
| `src/semantic-flow.mjs` | Seeding loop, as prototyped, plus a **fail-closed branch**: an each/const marker whose expression or binding unit cannot be correlated is reported as unsupported, not skipped. | ~25–30 lines |
| `src/template-binding-values.test.mjs` (new) | Parity negatives (X1–X4, Y1–Y3, E1, E4 against their script equivalents), clean positives (keyed/index each, `$state`, `@const` data), the resolver-through-each refusal, and the fail-closed correlation case. | ~100 lines |
| `README.md`, `CHANGELOG.md` | State that `{#each}` items and `{@const}` values are analyzed like script bindings. | a few lines |

**Not touched:** `semantic-parse.mjs`, `semantic-context.mjs` (beyond B1), zones, rules, `template-seeds.mjs`, policies
and parser dependencies.

## Proof obligations

1. **Parity.** Every probe above gives the same findings as its script `for…of` / `const` equivalent. Mutation proof: a
   mutant that disables each-seeding, and one that disables const-seeding, each fail the tests.
2. **Fail closed.** No marker is silently skipped. Uncorrelatable units are reported as unsupported, with a test.
3. **No regression on real inputs.** Rerun every profile, starter, derivative and app gate on the new bytes. The
   prototype predicts no change.
4. **Convergence.** Seeding runs inside the fixpoint using the existing monotone joins. A regression test must show that
   nested each and chained `@const` converge.
5. **Interaction with other corrections.**
   - Defaults in these patterns are already refused (`template-binding-default`), so `bindPattern` never evaluates a
     template default.
   - **B1 must land first, or together.** Once bindings are seeded, `bindPattern`'s computed-key path would evaluate B1 key
     expressions at non-runtime nodes. The B1 refusal keeps that channel closed.
6. **Review.** A focused independent re-review of only this delta.

## Adjacent form, reported and not included

**`{:then}` / `{:catch}` values** are the same class of unmodeled binding. E7,
`{#await load() then f}…f.href = '/x'`, where `load` is async and returns authority, is complete with no findings on both
current source and the prototype.

- **`{:then}`:** the same bounded approach would close it: `bindPattern(thenDecl, awaitValue(value(expr)))`, about 5 more
  lines.
- **`{:catch}`:** the error value is the documented catch-binding limitation (throw→catch parity) and should stay as it
  is.

**Needs a parent decision:** whether `{:then}` joins B2.

## B1 status (parent-authorized; in source, not packed)

- **Guard:** `template-binding-computed-key` in `src/semantic-context.mjs`. A computed key used as a binding-element
  property name in any template binding unit is refused. Type-level computed names are unaffected.
- **Tests:** a regression test appended to `src/template-binding-default.test.mjs` covers:
  - negatives: location, history, store-subscribe and resolver keys, in `{#each}`, `{@const}`, `{:then}`, `{:catch}`
    and snippets;
  - positives: literal keys, and computed names in types.
- **Mutation:** mutant M6 is killed. M1–M6 each fail exactly one test (`opus-final-review/mutants/RESULTS-v3.txt`).
- **Suite:** `npm test` 555/555.
- **Real inputs:** all 10 positives still pass on the working source.
- **Review:** the fresh focused re-review is **CLEAR** (`opus-final-review/FOCUSED-B1-REREVIEW.md`). Its non-blocking
  nit: `let:` directives are also refused but not named in the docs, which is broader in the fail-closed direction.
- **Exact delta relative to the integrated `cd12784e…`:** 4 files, working hashes in
  `opus-final-review/SOURCE-B1-WORKING.sha256`, diff in `opus-final-review/CORRECTIONS-B1-vs-cd12784e.diff`.

  | File | Working hash |
  |---|---|
  | `src/semantic-context.mjs` | `f231bc69…` |
  | `src/template-binding-default.test.mjs` | `c3515bb7…` |
  | `README.md` | `f94233a9…` |
  | `CHANGELOG.md` | `8de48c9c…` |

- **Not done yet:** no archive has been packed and no gates have been rerun, per the parent's instruction to await the
  B2 decision. `cd12784e…` and its evidence remain the current packed candidate. They will be relabeled superseded only
  when a replacement archive is ready.
- **Constraints respected:**
  - `REVIEWED-SOURCE-HANDOFF` was not touched;
  - there is a single source writer (this reviewer);
  - no main/git/publication changes, runtime archive edits or app source edits.

## Status of the parallel B1 work (superseded by the section above)

- The B1 refusal of computed keys in binding patterns proceeds in source with targeted tests and a focused re-review.
- **No archive is packed** until the B2 decision, per the parent.
- The integrated baseline for new deltas is `cd12784e…`, which stays the current and unsuperseded candidate until a
  replacement is ready.

## Outcome (after parent authorization)

- **Implemented** as scoped, together with B1: `seedTemplateBinding` in `src/semantic-flow.mjs` for `{#each}`,
  `{@const}` and `{:then}`, with a fail-closed `template-binding-correlation` refusal on missing or inexact correlation.
- **Not changed:** no rules, zones, evaluator, parser or catch machinery. `{:catch}` stays unmodeled.
- **Tests:** `src/template-binding-values.test.mjs`. Mutants M7–M11 are killed.
- **Review:** the focused re-review (`opus-final-review/FOCUSED-B2-REREVIEW.md`) is CLEAR.
- **Packed and gated:** `6095ae2fa24d7fe895db616d9cdc82b6380950cd2945ab9dc22f5fb85b3ff304` (see
  `OPUS-FINAL-PROFILE-REVIEW.md`).
- **Incremental delta relative to `REVIEWED-SOURCE-HANDOFF`:**
  `opus-final-review/INCREMENTAL-B1-B2-vs-REVIEWED-SOURCE-HANDOFF.diff`.
