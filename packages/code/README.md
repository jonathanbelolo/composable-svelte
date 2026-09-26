# @composable-svelte/code

Code editor, syntax highlighting, and node-based visual programming components for Composable Svelte. Built with Prism.js, CodeMirror, and SvelteFlow.

## Features

- **Syntax highlighting** - Read-only code display with Prism.js and 8+ languages
- **Code editing** - Full-featured editor with CodeMirror 6 (autocomplete, search, lint, themes)
- **Node canvas** - Visual node graph editor powered by SvelteFlow
- **State-driven** - Full Composable Architecture integration with testable reducers
- **Multi-language** - JavaScript, TypeScript, Python, Rust, SQL, HTML, CSS, JSON, Markdown
- **Themeable** - One Dark theme built-in, customizable via CodeMirror themes
- **Connection validation** - Permissive, strict, and composable validation strategies for node graphs
- **Type-safe** - Full TypeScript support with type inference

## Installation

```bash
pnpm add @composable-svelte/code
```

**Peer dependencies:**

```bash
pnpm add @composable-svelte/core svelte
```

Requires `@composable-svelte/core` `^0.13.1` and Svelte `^5.30.0`. Svelte
5.20–5.29 is not supported: SvelteFlow, which powers `NodeCanvas`, failed during
server rendering on Svelte 5.20 and 5.25. An application that combines this package
with other Composable Svelte packages needs Svelte 5.30 or newer.

## Components

### CodeHighlight

Read-only syntax highlighting for displaying code snippets. Powered by Prism.js.

<!-- consumer-file: Highlight.svelte -->
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    CodeHighlight,
    codeHighlightReducer,
    createInitialCodeHighlightState
  } from '@composable-svelte/code';
  import { highlightCode } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialCodeHighlightState({
      code: 'const x = 42;',
      language: 'typescript',
      theme: 'dark',
      showLineNumbers: true
    }),
    reducer: codeHighlightReducer,
    dependencies: { highlightCode }
  });
</script>

<CodeHighlight {store} />
```

**State:**

```typescript
interface CodeHighlightState {
  code: string;
  language: string;
  theme: 'light' | 'dark';
  showLineNumbers: boolean;
  highlightedCode: string | null;
  highlightLines: number[];
  copyStatus: 'idle' | 'copied' | 'error';
  isHighlighting: boolean;
  error: string | null;
}
```

**Actions:** `init`, `codeChanged`, `languageChanged`, `themeChanged`, `toggleLineNumbers`, `highlightLinesChanged`, `copyCode`

**Supported languages:** TypeScript, JavaScript, Python, Rust, SQL, HTML, CSS, JSON, Markdown, and more via `loadLanguage()`.

### CodeEditor

Interactive code editor with full editing capabilities. Powered by CodeMirror 6.

<!-- consumer-file: Editor.svelte -->
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    CodeEditor,
    codeEditorReducer,
    createInitialCodeEditorState
  } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialCodeEditorState({
      value: 'function hello() {\n  console.log("Hello!");\n}',
      language: 'javascript'
    }),
    reducer: codeEditorReducer,
    dependencies: {}
  });
</script>

<CodeEditor {store} />
```

**Features:**
- Syntax highlighting for 8+ languages
- Autocomplete and bracket matching
- Search and replace
- Lint integration
- One Dark theme (customizable)
- Line numbers, folding, and indentation guides

**State** — shown by building one, so this block fails to compile if the shape
drifts. Restating the declaration is what let the previous version document
`code`, `lineNumbers`, `wordWrap` and `extensions`, none of which exist:

```typescript
import type { CodeEditorState } from '@composable-svelte/code';

const state: CodeEditorState = {
  // Content
  value: 'const x = 42;',
  language: 'typescript',

  // Cursor & selection
  cursorPosition: { line: 1, column: 1 },
  selection: null,

  // UI
  theme: 'dark',
  showLineNumbers: true,
  readOnly: false,

  // Features
  enableAutocomplete: true,
  enableFolding: true,
  tabSize: 2,

  // Save status
  hasUnsavedChanges: false,
  lastSavedValue: null,

  // Focus and history
  isFocused: false,
  canUndo: false,
  canRedo: false,

  // Errors
  error: null,
  saveError: null,
  formatError: null
};
```

### NodeCanvas

Visual node-based programming canvas for building flow graphs, pipelines, or visual scripts. Powered by SvelteFlow (@xyflow/svelte).

<!-- consumer-file: Canvas.svelte -->
```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    NodeCanvas,
    type NodeCanvasState, type NodeCanvasAction, type NodeCanvasDependencies,
    nodeCanvasReducer,
    createInitialNodeCanvasState
  } from '@composable-svelte/code';

  const store = createStore<NodeCanvasState, NodeCanvasAction, NodeCanvasDependencies>({
    initialState: createInitialNodeCanvasState({
      nodes: {
        '1': { id: '1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        '2': { id: '2', type: 'default', position: { x: 200, y: 100 }, data: { label: 'Process' } }
      },
      edges: {
        'e1-2': { id: 'e1-2', source: '1', target: '2' }
      }
    }),
    reducer: nodeCanvasReducer,
    dependencies: {}
  });
</script>

<NodeCanvas {store} liftAction={(action) => action} />
```

**Features:**
- Drag-and-drop node placement
- Visual edge connections between ports
- Connection validation (permissive, strict, or custom)
- Viewport persistence (pan/zoom state saved)
- Node type definitions with typed ports

**Connection Validators:**

```typescript
import { permissiveValidator, strictValidator, composeValidators } from '@composable-svelte/code';

// Allow all connections
const validator = permissiveValidator;

// Type-checked connections only
const validator = strictValidator;

// Combine multiple validators
const validator = composeValidators(strictValidator, customValidator);
```

## Managed features

Each component's `store` prop takes either a standalone `Store` (as in the
examples above) or a **managed view**: the `store` a feature view receives from
`FeatureViews` / `FeatureOutlet`, a presentation view, or the result of
`scopeTo` / `composition.bind`. Pass the view as it is: no adapter, and no
inverse action mapping.

```typescript
import { Effect, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, defineViews, keyedSlot } from '@composable-svelte/core/application';
import {
  CodeEditor,
  codeEditorReducer,
  type CodeEditorAction,
  type CodeEditorDependencies,
  type CodeEditorState
} from '@composable-svelte/code';

interface Root {
  editors: Array<{ id: string; state: CodeEditorState }>;
}
type RootAction = { type: 'editors'; id: string; action: CodeEditorAction };

const editors = keyedSlot<Root, RootAction>()('editors');
const root: Reducer<Root, RootAction, CodeEditorDependencies> = (state) => [state, Effect.none()];

export const composition = new ManagedIntegrationBuilder(root)
  .forEach(editors, codeEditorReducer)
  .build();

// Each row renders the real CodeEditor with its own managed view.
export const views = defineViews(composition, { editors: { render: CodeEditor } });
```

`NodeCanvas` works the same way. On a managed view, `liftAction` defaults to
the identity and `unliftAction` is ignored, however the parent wraps canvas
actions, and whatever `liftAction` you pass. `unliftAction` exists for a
standalone parent store that wraps them.

**Commands** (`insertText`, `undo`, `redo`, `selectAll`, `deleteSelection`,
`focus` and `blur` on the editor; `setViewport`, `zoomIn`, `zoomOut`, `fitView`
and `centerView` on the canvas) are actions the view performs on the live
engine:

- **Order.** They run in dispatch order, one per action, including several in
  one tick.
- **State first.** Anything the store reduced before a command — a loaded
  value, `setReadOnly(false)`, a theme — is in the engine when the command
  runs.
- **Scope.** A managed view receives only its own owner's commands.
- **No buffering or replay.** A command dispatched before the engine exists is
  dropped. That includes one dispatched in the same turn that creates the
  feature's owner. Durable setup belongs in state (`value`, `readOnly`,
  `viewport`) or props (`autofocus`), not in startup commands.

The editor's value reports name the document and the `valueRevision` they
edited. A report that arrives after a newer write is ignored, even a write that
restored the same text. So is a format result for text that has changed since
the request, or a highlight for code that has since changed.

**A parent reducer may decline or rewrite `valueChanged`**, standalone or
managed: to enforce a limit, to ignore edits while saving, or to normalise.
The editor is a controlled input:

- **Declined** (state keeps its value): the editor puts its document back to
  `state.value`, so the user sees the edit did not take, and Save saves what is
  shown. The revert stays out of undo history, and so does the declined edit;
  earlier undo steps survive. Edits the user made on top of the declined text
  before state answered are reverted with it.
- **Rewritten** (state takes another value): the editor shows state's value,
  as an undoable replacement, and later edits build on it.

A write that bypasses `codeEditorReducer` (a parent assigning `value` itself)
does not move `valueRevision`. Such a write that restores exactly the text of
an edit still in flight cannot be told from that edit's echo; any other value
is recognised.

Components bind their `store` once, at mount. `FeatureViews` and
`FeatureOutlet` remount per owner. If you bind a view by hand and it can be
replaced, wrap the component in `{#key view}`.

If a store is neither a managed view nor has `subscribeToActions`, the
component warns once and keeps rendering; only the commands are lost. The
usual causes are:

- a wrapper around a view;
- an `ApplicationStore` (render through `FeatureViews` / `FeatureOutlet`);
- two copies of `@composable-svelte/core` in the bundle.

A custom standalone store without `subscribeToActions` must reduce `dispatch`
synchronously. The editor checks the resulting state when `dispatch` returns
to decide whether an edit was accepted or declined.

## Testing

The npm archive includes a [runnable managed recipe](./recipes/managed/README.md)
with a real CodeEditor, CodeHighlight, and NodeCanvas integration test.

All components have dedicated reducers testable via `TestStore`:

<!-- consumer-file: code.test.ts -->
```typescript
import { it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core/test';
import { codeHighlightReducer, createInitialCodeHighlightState } from '@composable-svelte/code';

it('highlights through the injected dependency', async () => {
  const store = createTestStore({
    initialState: createInitialCodeHighlightState({ code: 'const x = 5;' }),
    reducer: codeHighlightReducer,
    dependencies: { highlightCode: async (code) => `<span>${code}</span>` }
  });
  await store.send({ type: 'init' });
  await store.receive({ type: 'highlighted' }, state => {
    expect(state.highlightedCode).toContain('<span>');
    expect(state.isHighlighting).toBe(false);
  });
  await store.finish();
});
```

## API Reference

### Components

| Component | Description |
|-----------|-------------|
| `CodeHighlight` | Read-only syntax highlighted code display |
| `CodeEditor` | Interactive code editor with full editing |
| `NodeCanvas` | Visual node graph editor |

### Functions

| Function | Description |
|----------|-------------|
| `codeHighlightReducer` | Reducer for CodeHighlight |
| `codeEditorReducer` | Reducer for CodeEditor |
| `nodeCanvasReducer` | Reducer for NodeCanvas |
| `createInitialCodeHighlightState()` | Create initial highlight state |
| `createInitialCodeEditorState()` | Create initial editor state |
| `createInitialNodeCanvasState()` | Create initial canvas state |
| `highlightCode(code, lang)` | Highlight code with Prism.js |
| `loadLanguage(lang)` | Dynamically load a Prism.js language |
| `createEditorView(config)` | Create a CodeMirror EditorView |
| `permissiveValidator` | Allow all node connections |
| `strictValidator` | Type-checked node connections |
| `composeValidators(...validators)` | Combine multiple validators |

## Dependencies

- **Runtime**: CodeMirror 6 (editor), Prism.js (highlighting), @xyflow/svelte (node canvas)
- **Peer**: `@composable-svelte/core`, `svelte`
