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

## Components

### CodeHighlight

Read-only syntax highlighting for displaying code snippets. Powered by Prism.js.

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

**Actions:** `init`, `codeChanged`, `languageChanged`, `themeChanged`, `toggleLineNumbers`, `highlightLinesChanged`, `copyTriggered`

**Supported languages:** TypeScript, JavaScript, Python, Rust, SQL, HTML, CSS, JSON, Markdown, and more via `loadLanguage()`.

### CodeEditor

Interactive code editor with full editing capabilities. Powered by CodeMirror 6.

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
      code: 'function hello() {\n  console.log("Hello!");\n}',
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

**State:**

```typescript
interface CodeEditorState {
  code: string;
  language: string;
  theme: string;
  readOnly: boolean;
  lineNumbers: boolean;
  wordWrap: boolean;
  tabSize: number;
  extensions: any[];
}
```

### NodeCanvas

Visual node-based programming canvas for building flow graphs, pipelines, or visual scripts. Powered by SvelteFlow (@xyflow/svelte).

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import {
    NodeCanvas,
    nodeCanvasReducer,
    createInitialNodeCanvasState
  } from '@composable-svelte/code';

  const store = createStore({
    initialState: createInitialNodeCanvasState({
      nodes: [
        { id: '1', type: 'input', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: '2', type: 'default', position: { x: 200, y: 100 }, data: { label: 'Process' } }
      ],
      edges: [
        { id: 'e1-2', source: '1', target: '2' }
      ]
    }),
    reducer: nodeCanvasReducer,
    dependencies: {}
  });
</script>

<NodeCanvas {store} />
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

## Testing

All components have dedicated reducers testable via `TestStore`:

```typescript
import { createTestStore } from '@composable-svelte/core';
import { codeHighlightReducer, createInitialCodeHighlightState } from '@composable-svelte/code';

const store = createTestStore({
  initialState: createInitialCodeHighlightState({ code: 'const x = 5;' }),
  reducer: codeHighlightReducer,
  dependencies: { highlightCode: async (code) => `<span>${code}</span>` }
});

await store.send({ type: 'init' });

await store.receive({ type: 'highlightCompleted' }, (state) => {
  expect(state.highlightedCode).toContain('<span>');
  expect(state.isHighlighting).toBe(false);
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
