# Semantic Parse Substrate

The semantic parser transforms approved local graph modules into structured TypeScript and Svelte units, lexical scopes, and syntactic markers without performing taint analysis, zone isolation, or evaluation.

## Frontend Interface

`parseSemanticModules({projectRoot, graph})` returns `{modules, errors}`.

- **`projectRoot`**: Absolute path string to the root directory of the application.
- **`graph`**: Complete, validated dependency graph produced by `buildGraph`. If the graph is missing, incomplete (`graph.complete !== true`), or contains unresolved errors, parsing fails immediately with an `incomplete-graph` error.

### Return Type

```typescript
interface SemanticParseResult {
  modules: SemanticModule[];
  errors: SemanticError[];
}

interface SemanticModule {
  path: string;
  text: string;
  kind: 'ts' | 'js' | 'svelte';
  units: Unit[];
  scopes: Scope[];
  markers: Marker[];
  span: (start: number, end: number) => Span;
}

interface Span {
  start: {offset: number; line: number; column: number};
  end: {offset: number; line: number; column: number};
}

interface Scope {
  id: number;
  parent: Scope | null;
  bindings: Map<string, unknown>;
}

interface Unit {
  kind: 'module' | 'view' | 'template' | 'binding';
  sourceFile: ts.SourceFile;
  base: number;
  scope: Scope;
  start: number;
  end: number;
  nodeSpan(node: ts.Node): Span;
}
```

## Unit Classification

1. **`module`**: Module-level script execution (`.ts`, `.js`, or `<script module>` in Svelte). Evaluates in the root module scope.
2. **`view`**: Svelte instance script execution (`<script>` without `module`). Evaluates in the instance scope (child of module scope).
3. **`template`**: Isolated template JavaScript expressions (e.g. `{x + 1}`, `{#if cond}`, spread attributes). Parenthesized to preserve expression parsing. Evaluates in its containing fragment or element scope.
4. **`binding`**: Synthetic declaration (`let <pattern>;`) created exclusively to introduce bindings for `{#snippet}`, `{#each}`, `{#await}`, `{@const}`, or `let:` directives into their respective lexical scopes. Initializers are not semantic execution.

Synthetic prefixes and parentheses are clamped by `unit.nodeSpan(node)` so reported spans match the original source offsets exactly.

## Scope Hierarchy

- Module scope (`id: 0`, `parent: null`) is created for every file.
- Svelte instance scope (`id: 1`, `parent: moduleScope`) hosts view scripts and top-level markup.
- Sibling fragments in conditional branches (`{#if}` vs `{:else}`) and loops receive distinct child scopes to ensure branch-local bindings cannot leak across siblings.
- Snippet parameters are bound in the snippet body's scope, while the snippet name is bound in its containing fragment scope.

## Marker Shapes and Provenance

Markers capture parsed Svelte AST nodes, source spans, and relevant scopes for subsequent compiler and provenance analysis:

1. **`component`**: Identifies component instantiation.
   - `kind`: `'component'`
   - `name`: string (tag name)
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

2. **`attribute`**: Identifies static or dynamic attributes on elements and components.
   - `kind`: `'attribute'`
   - `name`: string
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

3. **`snippet-declaration`**: Captures Svelte 5 snippet declarations for Root children app provenance.
   - `kind`: `'snippet-declaration'`
   - `name`: string (snippet identifier)
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: Scope of snippet body (hosts parameter bindings)
   - `declarationScope`: Scope where snippet identifier is bound
   - `parameters`: array of parameter AST nodes

4. **`svelte-options`**: Captures compiler option declarations.
   - `kind`: `'svelte-options'`
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: module Scope (compiler options are outside the instance template fragment)

5. **`bind-directive`**: Captures two-way bindings and component/element handles (`bind:this`).
   - `kind`: `'bind-directive'`
   - `name`: string (bound property name)
   - `isThis`: boolean (`true` if `bind:this`)
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

6. **`use-directive`**: Captures action attachments (`use:action`).
   - `kind`: `'use-directive'`
   - `name`: string (action name)
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

7. **`attach-tag`**: Captures modern Svelte 5 attachments (`{@attach ...}`).
   - `kind`: `'attach-tag'`
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

8. **`event-directive`**: Captures event bindings (`on:click`).
   - `kind`: `'event-directive'`
   - `name`: string (event name)
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

9. **`render-tag`**: Captures snippet invocations (`{@render snippet()}`).
   - `kind`: `'render-tag'`
   - `node`: Svelte AST node
   - `span`: Span
   - `scope`: containing Scope

10. **`const-tag`**: Captures local constants (`{@const x = expr}`).
    - `kind`: `'const-tag'`
    - `node`: Svelte AST node
    - `span`: Span
    - `scope`: containing Scope

11. **`let-directive`**: Captures slot let directives (`let:item`).
    - `kind`: `'let-directive'`
    - `name`: string
    - `node`: Svelte AST node
    - `span`: Span
    - `scope`: containing Scope

12. **`directive`**: Captures transitions, animations, classes, and styles.
    - `kind`: `'directive'`
    - `directiveKind`: string (`'ClassDirective' | 'StyleDirective' | 'TransitionDirective' | 'AnimateDirective'`)
    - `name`: string
    - `node`: Svelte AST node
    - `span`: Span
   - `scope`: containing Scope

13. **`each-block`**: Links collection, binding and keyed traversal provenance.
    - `expression`, `context`, `key`: parsed AST nodes (or `null`); `index` preserves the parser's node/string form
    - `indexSpan`: exact source span for an index binding, or `null`
    - `scope`: scope evaluating the collection expression
    - `bodyScope`: child scope containing context/index bindings and evaluating the key/body
    - `fallbackScope`: sibling fallback scope, or `null`

14. **`await-block`**: Links promise provenance to resolved/rejected bindings.
    - `expression`, `value`, `error`: parsed AST nodes (or `null`)
    - `scope`: scope evaluating the promise expression
    - `pendingScope`, `thenScope`, `catchScope`: branch scopes, or `null` when absent

## Error Reporting

Errors use `{code, construct?, path, span, message}` and are sorted deterministically by path, span start offset, error code, and message.
- `incomplete-graph`: Missing, unreadable, or incomplete dependency graph.
- `parse-error`: Syntax error from TypeScript parser or Svelte compiler.
- `unsupported-construct`: Unrecognized or unsupported AST node form (fails closed).
