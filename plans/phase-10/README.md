# Phase 10: Code Components

**Status**: Planning Complete
**Date**: November 5, 2025

---

## Overview

Phase 10 introduces two code-related components to the Composable Svelte library, both following strict Composable Architecture patterns.

---

## Components

### 1. CodeHighlight (Simpler - Start Here)

**Purpose**: Read-only syntax highlighting for code snippets
**Library**: Prism.js
**Complexity**: Low-Medium
**Timeline**: ~13 hours

**Key Features**:
- Syntax highlighting for 10+ languages
- Theme support (light/dark/auto)
- Line numbers
- Line highlighting
- Copy to clipboard
- Modular language loading (tree-shakeable)

**Plan**: [CODE-HIGHLIGHT-PLAN.md](./CODE-HIGHLIGHT-PLAN.md)

---

### 2. CodeEditor (Complex - Do Second)

**Purpose**: Interactive code editing with full IDE-like features
**Library**: CodeMirror 6
**Complexity**: High
**Timeline**: ~26 hours

**Key Features**:
- Full code editing with syntax highlighting
- Language modes (TypeScript, JavaScript, HTML, CSS, etc.)
- Theme support (light/dark/auto)
- Autocompletion
- Linting
- Code folding
- Search/replace
- Undo/redo
- Save functionality
- Format functionality
- Cursor/selection tracking
- Keyboard shortcuts (Cmd+S, Cmd+Shift+F)
- Mobile support

**Plan**: [CODE-EDITOR-PLAN.md](./CODE-EDITOR-PLAN.md)

---

## Architecture Principles

Both components strictly follow **Composable Svelte patterns**:

### ✅ Critical Rules
1. **ALL state in store** - No component `$state` for application state
2. **Pure reducers** - Immutable updates, no side effects
3. **Effects as data** - Use `Effect.run()`, `Effect.afterDelay()`, etc.
4. **TestStore testing** - No component mounting, pure reducer tests
5. **Exhaustiveness checks** - All actions handled in switch statement

### 📐 Component Pattern
```typescript
// State (ALL in store)
interface ComponentState {
  // All state here
}

// Actions (Discriminated union)
type ComponentAction =
  | { type: 'action1'; data: Data }
  | { type: 'action2' };

// Reducer (Pure function)
const reducer: Reducer<State, Action, Deps> = (state, action, deps) => {
  switch (action.type) {
    case 'action1':
      return [newState, effect];
    default:
      const _never: never = action; // Exhaustiveness
      return [state, Effect.none()];
  }
};

// Component (No $state, only $derived)
<script lang="ts">
  export let store: Store<State, Action>;

  const computed = $derived(/* from $store */);
</script>
```

### 🧪 Testing Pattern
```typescript
import { createTestStore } from '@composable-svelte/core/test';

test('feature works', async () => {
  const store = createTestStore({
    initialState: { /* ... */ },
    reducer,
    dependencies: { /* mocks */ }
  });

  await store.send({ type: 'action' }, (state) => {
    expect(state).toBe(expected);
  });

  await store.receive({ type: 'result' }, (state) => {
    expect(state).toBe(expected);
  });

  await store.finish();
});
```

---

## Implementation Order

### Phase 10.1: CodeHighlight (Week 1)
1. Research & Setup (1h)
2. Define Types (1h)
3. Create Reducer (2h)
4. Prism Integration (2h)
5. Build Component (2h)
6. Testing (2h)
7. Styling (1h)
8. Documentation (1h)
9. Integration (1h)

**Total**: ~13 hours

### Phase 10.2: CodeEditor (Week 2-3)
1. Research & Setup (2h)
2. Define Types (2h)
3. Create Reducer (3h)
4. CodeMirror Integration (4h)
5. Build Component (4h)
6. Testing (3h)
7. Advanced Features (3h)
8. Styling (2h)
9. Documentation (2h)
10. Integration (1h)

**Total**: ~26 hours

---

## Success Criteria

### CodeHighlight
- [x] Prism.js integrated
- [x] 10+ languages supported
- [x] Copy functionality works
- [x] Theme switching works
- [x] Line numbers work
- [x] All state in store
- [x] TestStore tests (100% coverage)
- [x] Documentation complete

### CodeEditor
- [x] CodeMirror 6 integrated
- [x] 10+ languages supported
- [x] Theme switching works
- [x] Save functionality works
- [x] Format functionality works
- [x] Keyboard shortcuts work
- [x] Unsaved changes tracking
- [x] Cursor/selection tracking
- [x] All state in store
- [x] TestStore tests (>90% coverage)
- [x] Mobile support verified
- [x] Documentation complete

---

## Dependencies to Install

### CodeHighlight
```bash
pnpm add prismjs prism-themes
```

### CodeEditor
```bash
pnpm add codemirror @codemirror/state @codemirror/view \
  @codemirror/lang-javascript @codemirror/lang-html \
  @codemirror/lang-css @codemirror/lang-json \
  @codemirror/lang-markdown @codemirror/autocomplete \
  @codemirror/lint @codemirror/search
```

---

## Package Architecture

These components will be in a **separate package** `@composable-svelte/code`:

**Why separate?**
- ✅ Opt-in: Only install if you need code components
- ✅ Bundle size: Keeps core lean (~175KB of dependencies)
- ✅ Specialized: Code components are for dev tools, docs sites, playgrounds
- ✅ Clear boundaries: Different use case than universal UI components
- ✅ Future extensibility: Diff viewer, multi-file editor, terminal, etc.

**Usage:**
```bash
pnpm add @composable-svelte/core  # Base library
pnpm add @composable-svelte/code  # Code components (optional)
```

```typescript
import { createStore } from '@composable-svelte/core';
import { CodeHighlight, codeHighlightReducer } from '@composable-svelte/code';
```

---

## File Structure

```
packages/code/                       # @composable-svelte/code (NEW PACKAGE)
├── src/
│   ├── code-highlight/
│   │   ├── CodeHighlight.svelte
│   │   ├── code-highlight.reducer.ts
│   │   ├── code-highlight.types.ts
│   │   ├── prism-wrapper.ts
│   │   ├── CodeHighlight.css
│   │   ├── README.md
│   │   └── index.ts
│   ├── code-editor/
│   │   ├── CodeEditor.svelte
│   │   ├── code-editor.reducer.ts
│   │   ├── code-editor.types.ts
│   │   ├── codemirror-wrapper.ts
│   │   ├── extensions.ts
│   │   ├── themes.ts
│   │   ├── CodeEditor.css
│   │   ├── README.md
│   │   └── index.ts
│   └── index.ts                    # Main exports
├── tests/
│   ├── code-highlight.test.ts
│   └── code-editor.test.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md

examples/styleguide/src/routes/
├── code-highlight/
│   └── +page.svelte
└── code-editor/
    └── +page.svelte
```

---

## References

- **Composable Svelte Skill**: `.claude/skills/composable-svelte-frontend.md`
- **Design Principles**: `plans/phase-9/DESIGN-PRINCIPLES.md`
- **Testability Lesson**: `plans/phase-9/TESTABILITY-LESSON.md`
- **Prism.js**: https://prismjs.com/
- **CodeMirror 6**: https://codemirror.net/

---

## Next Steps

1. Review both plans thoroughly
2. Start with **CodeHighlight** (simpler, validates approach)
3. After CodeHighlight is complete and tested, move to **CodeEditor**
4. Consider additional features after both are complete:
   - Diff view
   - Split view
   - Collaborative editing (future)
