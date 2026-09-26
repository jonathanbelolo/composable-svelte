# Exported snippet integration

## Current boundary

- `semantic-parse.mjs` creates `snippet-declaration` markers with `name`, `declarationScope`, child `scope`, and ESTree parameters. It creates a synthetic binding unit for the snippet name and binding units for parameters. `render-tag` records only the ESTree marker; `addTemplateExpr()` creates a separate TypeScript unit but returns no correlation to the marker.
- `symbols.mjs` correctly hoists the synthetic snippet binding into `declarationScope` and parameter bindings into the snippet child scope. These are ordinary bindings; there is no snippet execution record or stable snippet identity.
- `semantic-origins.mjs` now resolves a valid module-script export to the unique top-level snippet binding. Imports therefore preserve binding identity.
- `semantic-context.mjs` records TypeScript functions/classes and node ownership only. It has no `snippets` map and cannot associate snippet-body template units with a snippet owner.
- `semantic-flow.mjs` can import the binding, but nothing seeds that binding with a value. `originValue(binding)` therefore remains empty. `invokeLocal()` accepts only `function` atoms and TypeScript parameter nodes. Render tags have no dedicated invocation step.
- `semantic-zones.mjs` seeds every non-binding Svelte unit as `view`. Snippet body units are consequently active even when the snippet is never rendered. `callFunctions()` and `functions()` recognize functions/classes/heaps, not snippets.

This explains the sole checkpoint failure: parsing and origin resolution succeed, but `{@render row(app.store)}` does not bind `item` or establish rendered view execution, so `item.subscribe(...)` is invisible. Evidence: `semantic-flow-extra-controls.test.mjs` and `pinned-integrated-checkpoint-v3.log` (237/238).

## Minimal safe changes

1. **Correlate template syntax without reparsing spans.** Make `addTemplateExpr()` and `addBindingUnit()` return their created unit. Store the render expression unit on each `render-tag` marker and parameter binding units on each `snippet-declaration` marker. Reject missing or multiply matched correlations.
2. **Create context snippet records.** Add `context.snippets: Map<id, record>`. Each record should contain the snippet binding, ordered parameter bindings, declaration/body scopes, body units, module, and stable id. A body unit belongs to the nearest enclosing snippet scope. Validate one declaration binding and one binding per parameter; ambiguity is an unsupported construct.
3. **Seed identity, then transfer arguments only at render sites.** Seed each snippet declaration binding with `domain.atom('snippet', id)`. Extend local invocation with a snippet branch that binds normalized render arguments directly to the recorded parameter bindings. Keep TypeScript `invokeLocal()` unchanged for functions. Process only the correlated call expression of a `render-tag`; an ordinary script call must not silently become a render.
4. **Record normalized snippet invocations.** Use the same `{callee,args,resolvedCallee}` shape as ordinary calls, or expose a small `flow.snippetInvocations` collection consumed by zones and rules. Imported and locally declared snippets then share one identity path through origins. Spread/default arguments must use the existing argument-shaping logic or fail explicitly if unsupported.
5. **Give snippets execution owners.** Add snippet ids as zone nodes. Map snippet-body units to their snippet owner instead of creating unconditional view roots. Add an edge from the render site's owner to each resolved snippet target. An unused snippet then has no zone; a snippet rendered from a view inherits `view`; nested snippet renders propagate transitively.
6. **Preserve callback behavior.** Once snippet parameters are seeded, existing calls through a callback parameter can use normal flow invocation and zone edges. Do not seed callback zones merely because a function is passed to an inert snippet declaration.

## Required controls

- Local forward-declared and imported exported snippets transfer store authority through `{@render}` and detect the subscription in the snippet body.
- An unused snippet containing the same subscription has no view finding.
- A snippet rendered only by another unused snippet remains inactive; rendering the outer snippet activates both.
- A function callback passed through a rendered snippet receives view attribution; the same callback passed to an unused snippet does not.
- Wrong arity, spread arguments, ambiguous snippet origins, and a render target containing non-snippet values fail closed rather than dropping provenance.
- Existing exported-snippet compiler controls remain: the valid top-level export compiles, while an export capturing instance state is rejected by Svelte.

The change should remain internal to parse/context/flow/zones plus causal tests. It does not require activating new policy rules or treating snippets as general JavaScript callables.
