# CodeEditor Component Implementation Plan

**Phase**: 10
**Component**: CodeEditor (Interactive Code Editor)
**Library**: CodeMirror 6
**Date**: November 5, 2025

---

## Overview

Build an **interactive code editor component** using CodeMirror 6 that follows Composable Svelte architecture patterns. The component will support syntax highlighting, code editing, themes, line numbers, autocompletion, and more.

**Key Principles** (from composable-svelte-frontend skill):
- ✅ ALL state in store (no component `$state`)
- ✅ Pure reducers with exhaustive testing
- ✅ TestStore for all tests
- ✅ Effects as data structures
- ✅ Component reads from store, dispatches actions

**Why CodeMirror 6**:
- Modern, modular architecture (easy to wrap in reducers)
- Best balance: features/size/mobile support
- 70% better mobile retention (per Replit case study)
- 124KB minified+gzipped

---

## Architecture Clarification

### CodeMirror as Infrastructure

CodeMirror is **infrastructure**, not application state. It's similar to how we handle the DOM:

- **CodeMirror State**: Internal editor state (document, selections, view state) managed by CodeMirror
- **Application State**: Feature state (unsaved changes, save status, errors) managed by our store
- **Bridge**: Component listens to CodeMirror changes and dispatches actions to our store

### Data Flow

1. **User types** → CodeMirror updates internally → dispatches `valueChanged` → our reducer updates store
2. **Save button clicked** → `save` action → reducer runs effect → dispatches `saved` → store updated
3. **External value change** (e.g., file reload) → store updated → component syncs to CodeMirror

### Why This Works

- ✅ **All feature state in store**: `hasUnsavedChanges`, `lastSavedValue`, `saveError`, etc.
- ✅ **CodeMirror is just the view**: Like `<input>` or `<textarea>`, but more powerful
- ✅ **Pure reducer**: All business logic (save, format, validation) in reducer
- ✅ **Testable**: Mock CodeMirror in tests, test reducer logic in isolation

### What About `codemirrorValue`?

The `codemirrorValue` variable in the component is **not component state** - it's a simple variable tracking CodeMirror's internal value to prevent circular updates. It's equivalent to:

```typescript
// This is OK - tracking infrastructure state to coordinate with it
let domInputValue = input.value;

// This is NOT OK - application state in component
let hasUnsavedChanges = $state(false); // ❌ Should be in store
```

---

## Task Breakdown

### 1. Research & Setup

**Tasks:**
- [ ] 1.1. Research CodeMirror 6 architecture and API
- [ ] 1.2. Understand CodeMirror 6 state management system
- [ ] 1.3. Identify required packages (@codemirror/view, @codemirror/state, @codemirror/lang-*)
- [ ] 1.4. Research CodeMirror 6 extension system
- [ ] 1.5. Research CodeMirror 6 themes (light/dark)
- [ ] 1.6. Install dependencies
- [ ] 1.7. Create integration strategy (bridge CodeMirror state → our store)

**Output:**
- Dependencies added to `package.json`
- Documentation of CodeMirror 6 API and integration approach

---

### 2. Define State & Types

**Tasks:**
- [ ] 2.1. Define `CodeEditorState` interface
- [ ] 2.2. Define `CodeEditorAction` discriminated union
- [ ] 2.3. Define `CodeEditorConfig` for initial setup
- [ ] 2.4. Define cursor position, selection types
- [ ] 2.5. Define supported languages enum/type
- [ ] 2.6. Define editor features (autocomplete, lint, etc.)

**State Structure:**
```typescript
interface CodeEditorState {
  // Content
  value: string;                          // Current editor content
  language: SupportedLanguage;            // Language mode

  // Cursor & Selection
  cursorPosition: { line: number; column: number } | null;
  selection: EditorSelection | null;

  // UI State
  theme: 'light' | 'dark' | 'auto';
  showLineNumbers: boolean;
  showGutter: boolean;
  readOnly: boolean;

  // Features
  enableAutocomplete: boolean;
  enableLinting: boolean;
  enableFolding: boolean;
  tabSize: number;

  // Editor Status
  hasUnsavedChanges: boolean;
  lastSavedValue: string | null;

  // Focus State
  isFocused: boolean;

  // History (undo/redo)
  canUndo: boolean;
  canRedo: boolean;

  // Error Handling
  error: string | null;           // General error
  saveError: string | null;       // Save operation error
  formatError: string | null;     // Format operation error
}

interface EditorSelection {
  from: { line: number; column: number };
  to: { line: number; column: number };
  text: string;
}

type SupportedLanguage =
  | 'typescript' | 'javascript' | 'svelte'
  | 'html' | 'css' | 'json' | 'markdown'
  | 'bash' | 'sql' | 'python' | 'rust';

type CodeEditorAction =
  // Content changes
  | { type: 'valueChanged'; value: string; cursorPosition?: { line: number; column: number } }
  | { type: 'languageChanged'; language: SupportedLanguage }

  // Cursor & Selection
  | { type: 'cursorMoved'; position: { line: number; column: number } }
  | { type: 'selectionChanged'; selection: EditorSelection | null }

  // Editing actions
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'insertText'; text: string; position?: { line: number; column: number } }
  | { type: 'deleteSelection' }
  | { type: 'selectAll' }

  // Configuration
  | { type: 'themeChanged'; theme: 'light' | 'dark' | 'auto' }
  | { type: 'toggleLineNumbers' }
  | { type: 'toggleAutocomplete' }
  | { type: 'setReadOnly'; readOnly: boolean }
  | { type: 'tabSizeChanged'; size: number }

  // Focus
  | { type: 'focused' }
  | { type: 'blurred' }

  // Save
  | { type: 'save' }
  | { type: 'saved'; value: string }
  | { type: 'saveFailed'; error: string }

  // Format
  | { type: 'format' }
  | { type: 'formatted'; value: string }
  | { type: 'formatFailed'; error: string };
```

**Output:**
- `packages/code/src/code-editor/code-editor.types.ts`

---

### 3. Create Reducer

**Tasks:**
- [ ] 3.1. Implement pure reducer function
- [ ] 3.2. Handle `valueChanged` - update value, mark unsaved
- [ ] 3.3. Handle cursor/selection changes
- [ ] 3.4. Handle undo/redo (update canUndo/canRedo flags)
- [ ] 3.5. Handle configuration changes
- [ ] 3.6. Handle save action with Effect
- [ ] 3.7. Handle format action with Effect
- [ ] 3.8. Add exhaustiveness check
- [ ] 3.9. Ensure immutable updates

**Reducer Pattern:**
```typescript
const codeEditorReducer: Reducer<CodeEditorState, CodeEditorAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'valueChanged':
      return [
        {
          ...state,
          value: action.value,
          cursorPosition: action.cursorPosition || state.cursorPosition,
          hasUnsavedChanges: action.value !== state.lastSavedValue
        },
        Effect.none()
      ];

    case 'languageChanged':
      return [
        { ...state, language: action.language },
        Effect.none()
      ];

    case 'cursorMoved':
      return [
        { ...state, cursorPosition: action.position },
        Effect.none()
      ];

    case 'selectionChanged':
      return [
        { ...state, selection: action.selection },
        Effect.none()
      ];

    case 'save':
      return [
        { ...state, saveError: null },
        Effect.run(async (dispatch) => {
          try {
            await deps.onSave?.(state.value);
            dispatch({ type: 'saved', value: state.value });
          } catch (e) {
            dispatch({ type: 'saveFailed', error: e.message });
          }
        })
      ];

    case 'saved':
      return [
        {
          ...state,
          lastSavedValue: action.value,
          hasUnsavedChanges: false,
          saveError: null
        },
        Effect.none()
      ];

    case 'saveFailed':
      return [
        { ...state, saveError: action.error },
        Effect.none()
      ];

    case 'format':
      return [
        { ...state, formatError: null },
        Effect.run(async (dispatch) => {
          try {
            const formatted = await deps.formatter?.(state.value, state.language) || state.value;
            dispatch({ type: 'formatted', value: formatted });
          } catch (e) {
            dispatch({ type: 'formatFailed', error: e.message });
          }
        })
      ];

    case 'formatted':
      return [
        {
          ...state,
          value: action.value,
          hasUnsavedChanges: action.value !== state.lastSavedValue,
          formatError: null
        },
        Effect.none()
      ];

    case 'formatFailed':
      return [
        { ...state, formatError: action.error },
        Effect.none()
      ];

    case 'toggleLineNumbers':
      return [
        { ...state, showLineNumbers: !state.showLineNumbers },
        Effect.none()
      ];

    case 'undo':
      // Note: Undo/redo are dispatched FROM CodeMirror's history extension
      // when user presses Cmd+Z/Cmd+Shift+Z. Our reducer just tracks the state.
      // CodeMirror handles the actual content changes via 'valueChanged' action.
      return [
        { ...state, canRedo: true },
        Effect.none()
      ];

    case 'redo':
      // Similar to undo - CodeMirror handles the logic, we track state
      return [
        { ...state, canUndo: true },
        Effect.none()
      ];

    default:
      const _never: never = action;
      return [state, Effect.none()];
  }
};
```

**Output:**
- `packages/code/src/code-editor/code-editor.reducer.ts`

---

### 4. CodeMirror 6 Integration

**Tasks:**
- [ ] 4.1. Create CodeMirror wrapper utility
- [ ] 4.2. Implement editor instance creation
- [ ] 4.3. Bridge CodeMirror state changes → our store (dispatch actions)
- [ ] 4.4. Implement language mode switching
- [ ] 4.5. Implement theme switching
- [ ] 4.6. Set up extensions (line numbers, autocompletion, etc.)
- [ ] 4.7. Handle programmatic value updates (from store → CodeMirror)
- [ ] 4.8. Implement cleanup on component destroy

**Integration Strategy:**
```typescript
// codemirror-wrapper.ts
import { EditorView, basicSetup } from 'codemirror';
import { EditorState } from '@codemirror/state';
import type { Store } from '@composable-svelte/core';

export function createEditorView(
  parent: HTMLElement,
  store: Store<CodeEditorState, CodeEditorAction>,
  initialValue: string
): EditorView {
  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const newValue = update.state.doc.toString();
      const cursor = update.state.selection.main.head;
      const { line, column } = update.state.doc.lineAt(cursor);

      store.dispatch({
        type: 'valueChanged',
        value: newValue,
        cursorPosition: { line, column }
      });
    }

    if (update.selectionSet) {
      const { from, to } = update.state.selection.main;
      if (from !== to) {
        const text = update.state.sliceDoc(from, to);
        store.dispatch({
          type: 'selectionChanged',
          selection: { from: getPos(from), to: getPos(to), text }
        });
      } else {
        store.dispatch({ type: 'selectionChanged', selection: null });
      }
    }
  });

  const view = new EditorView({
    doc: initialValue,
    extensions: [
      basicSetup,
      updateListener,
      // Add more extensions based on store state
    ],
    parent
  });

  return view;
}

export function updateEditorValue(view: EditorView, newValue: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: newValue }
  });
}

export async function loadLanguage(lang: SupportedLanguage) {
  switch (lang) {
    case 'typescript':
      return (await import('@codemirror/lang-javascript')).javascript({ typescript: true });
    case 'javascript':
      return (await import('@codemirror/lang-javascript')).javascript();
    case 'html':
      return (await import('@codemirror/lang-html')).html();
    // ... other languages
  }
}
```

**Output:**
- `packages/code/src/code-editor/codemirror-wrapper.ts`

---

### 5. Build Component

**Tasks:**
- [ ] 5.1. Create `CodeEditor.svelte` component
- [ ] 5.2. Accept store as prop (NO local `$state`)
- [ ] 5.3. Initialize CodeMirror view in `$effect`
- [ ] 5.4. Sync store state → CodeMirror (theme, language, value)
- [ ] 5.5. Handle keyboard shortcuts (Cmd+S for save, Cmd+Shift+F for format)
- [ ] 5.6. Add toolbar (optional, based on store config)
- [ ] 5.7. Show unsaved changes indicator
- [ ] 5.8. Handle focus/blur
- [ ] 5.9. Cleanup on destroy
- [ ] 5.10. Add accessibility (ARIA labels, keyboard navigation)

**Component Pattern:**
```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { CodeEditorState, CodeEditorAction } from './code-editor.types';
  import { createEditorView, updateEditorValue, loadLanguage } from './codemirror-wrapper';

  export let store: Store<CodeEditorState, CodeEditorAction>;
  export let showToolbar = true;

  let editorElement: HTMLElement;
  let view: EditorView | null = null;

  // Initialize CodeMirror
  $effect(() => {
    if (editorElement && !view) {
      view = createEditorView(editorElement, store, $store.value);

      return () => {
        view?.destroy();
        view = null;
      };
    }
  });

  // Sync language changes
  $effect(() => {
    if (view && $store.language) {
      loadLanguage($store.language).then((lang) => {
        view.dispatch({
          effects: StateEffect.reconfigure.of([lang])
        });
      });
    }
  });

  // Sync theme changes
  $effect(() => {
    if (view && $store.theme) {
      // Apply theme
    }
  });

  // Programmatic value updates (from external source)
  // NOTE: This is NOT component state - it's just tracking CodeMirror's internal value
  // to avoid circular updates when CodeMirror dispatches valueChanged
  let codemirrorValue = $store.value;
  $effect(() => {
    if (view && $store.value !== codemirrorValue) {
      updateEditorValue(view, $store.value);
      codemirrorValue = $store.value;
    }
  });

  // Keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 's') {
        e.preventDefault();
        store.dispatch({ type: 'save' });
      } else if (e.key === 'f' && e.shiftKey) {
        e.preventDefault();
        store.dispatch({ type: 'format' });
      }
    }
  }
</script>

<div class="code-editor" data-theme={$store.theme}>
  {#if showToolbar}
    <div class="toolbar">
      <select
        value={$store.language}
        onchange={(e) => store.dispatch({ type: 'languageChanged', language: e.currentTarget.value })}
      >
        <option value="typescript">TypeScript</option>
        <option value="javascript">JavaScript</option>
        <!-- more languages -->
      </select>

      <button
        onclick={() => store.dispatch({ type: 'toggleLineNumbers' })}
        aria-label="Toggle line numbers"
      >
        Line Numbers: {$store.showLineNumbers ? 'On' : 'Off'}
      </button>

      <button
        onclick={() => store.dispatch({ type: 'format' })}
        disabled={$store.readOnly}
      >
        Format
      </button>

      <button
        onclick={() => store.dispatch({ type: 'save' })}
        disabled={!$store.hasUnsavedChanges}
      >
        Save {$store.hasUnsavedChanges ? '*' : ''}
      </button>
    </div>
  {/if}

  <div
    bind:this={editorElement}
    class="editor-container"
    onkeydown={handleKeyDown}
    role="textbox"
    aria-label="Code editor"
    aria-multiline="true"
  />
</div>
```

**Output:**
- `packages/code/src/code-editor/CodeEditor.svelte`

---

### 6. Testing with TestStore

**Tasks:**
- [ ] 6.1. Create test suite using TestStore
- [ ] 6.2. Test value changes
- [ ] 6.3. Test language switching
- [ ] 6.4. Test save functionality
- [ ] 6.5. Test format functionality
- [ ] 6.6. Test configuration changes
- [ ] 6.7. Test unsaved changes tracking
- [ ] 6.8. Test cursor position tracking
- [ ] 6.9. Test selection tracking
- [ ] 6.10. Mock CodeMirror (test reducer in isolation)

**Test Pattern:**
```typescript
import { createTestStore } from '@composable-svelte/core/test';
import { codeEditorReducer } from './code-editor.reducer';

describe('CodeEditor', () => {
  it('tracks unsaved changes', async () => {
    const store = createTestStore({
      initialState: {
        value: 'const x = 1;',
        lastSavedValue: 'const x = 1;',
        hasUnsavedChanges: false,
        language: 'javascript',
        // ... other fields
      },
      reducer: codeEditorReducer
    });

    await store.send({ type: 'valueChanged', value: 'const x = 2;' }, (state) => {
      expect(state.value).toBe('const x = 2;');
      expect(state.hasUnsavedChanges).toBe(true);
    });

    await store.send({ type: 'save' });

    await store.receive({ type: 'saved' }, (state) => {
      expect(state.hasUnsavedChanges).toBe(false);
      expect(state.lastSavedValue).toBe('const x = 2;');
    });

    await store.finish();
  });

  it('formats code', async () => {
    const store = createTestStore({
      initialState: {
        value: 'const x=1',
        language: 'javascript',
        // ...
      },
      reducer: codeEditorReducer,
      dependencies: {
        formatter: async (code, lang) => 'const x = 1;'
      }
    });

    await store.send({ type: 'format' });

    await store.receive({ type: 'formatted' }, (state) => {
      expect(state.value).toBe('const x = 1;');
    });

    await store.finish();
  });

  it('handles language change', async () => {
    const store = createTestStore({
      initialState: { language: 'javascript', /* ... */ },
      reducer: codeEditorReducer
    });

    await store.send({ type: 'languageChanged', language: 'typescript' }, (state) => {
      expect(state.language).toBe('typescript');
    });

    await store.finish();
  });
});
```

**Output:**
- `packages/code/tests/code-editor.test.ts`

---

### 7. Advanced Features

**Tasks:**
- [ ] 7.1. Implement autocompletion integration
- [ ] 7.2. Implement linting (optional)
- [ ] 7.3. Implement code folding
- [ ] 7.4. Implement search/replace
- [ ] 7.5. Implement multi-cursor support (if needed)
- [ ] 7.6. Implement bracket matching
- [ ] 7.7. Implement indentation guides
- [ ] 7.8. Add vim/emacs keybindings (optional)

**Output:**
- Enhanced `codemirror-wrapper.ts` with feature extensions

---

### 8. Styling & Themes

**Tasks:**
- [ ] 8.1. Create base editor styles
- [ ] 8.2. Integrate CodeMirror themes
- [ ] 8.3. Create custom light theme
- [ ] 8.4. Create custom dark theme
- [ ] 8.5. Style toolbar
- [ ] 8.6. Style unsaved indicator
- [ ] 8.7. Ensure responsive layout
- [ ] 8.8. Add smooth theme transitions

**Output:**
- `packages/code/src/code-editor/CodeEditor.css`

---

### 9. Documentation & Example

**Tasks:**
- [ ] 9.1. Write comprehensive documentation
- [ ] 9.2. Document all actions and state
- [ ] 9.3. Create usage examples
- [ ] 9.4. Document keyboard shortcuts
- [ ] 9.5. Add to component library index
- [ ] 9.6. Create demo page in styleguide
- [ ] 9.7. Document CodeMirror integration approach
- [ ] 9.8. Document extension customization

**Example Usage:**
```typescript
import { createStore } from '@composable-svelte/core';
import { codeEditorReducer } from '@composable-svelte/code';

const store = createStore({
  initialState: {
    value: 'const hello = "world";',
    language: 'typescript',
    theme: 'dark',
    showLineNumbers: true,
    readOnly: false,
    enableAutocomplete: true,
    enableLinting: true,
    tabSize: 2,
    hasUnsavedChanges: false,
    lastSavedValue: null,
    cursorPosition: null,
    selection: null,
    isFocused: false,
    canUndo: false,
    canRedo: false
  },
  reducer: codeEditorReducer,
  dependencies: {
    onSave: async (value) => {
      await api.saveCode(value);
    },
    formatter: async (code, lang) => {
      return await prettier.format(code, { parser: lang });
    }
  }
});
```

**Output:**
- `packages/code/src/code-editor/README.md`
- `examples/styleguide/src/routes/code-editor/+page.svelte`

---

### 10. Integration & Export

**Tasks:**
- [ ] 10.1. Add exports to component index
- [ ] 10.2. Update main package exports (`packages/code/src/index.ts`)
- [ ] 10.3. Ensure tree-shaking works (modular CodeMirror imports)
- [ ] 10.4. Run build and verify no errors
- [ ] 10.5. Test in styleguide app
- [ ] 10.6. Performance testing (large files)

**Output:**
- Updated `packages/code/src/index.ts`
- Package exports configured in `packages/code/package.json`

---

## Success Criteria

- [x] ALL state in store (no component `$state` except for view reference)
- [x] Pure reducer with exhaustiveness check
- [x] Comprehensive TestStore tests (>90% coverage)
- [x] CodeMirror properly integrated and bridged to store
- [x] Language switching works
- [x] Theme switching works (light/dark)
- [x] Save functionality works
- [x] Format functionality works
- [x] Unsaved changes tracking works
- [x] Keyboard shortcuts work (Cmd+S, Cmd+Shift+F)
- [x] Line numbers toggle works
- [x] Cursor position tracked
- [x] Selection tracked
- [x] Accessible (keyboard navigation, ARIA)
- [x] Mobile support verified
- [x] Documentation complete
- [x] Demo in styleguide works

---

## Dependencies

```json
{
  "codemirror": "^6.0.1",
  "@codemirror/state": "^6.4.0",
  "@codemirror/view": "^6.23.0",
  "@codemirror/lang-javascript": "^6.2.1",
  "@codemirror/lang-html": "^6.4.7",
  "@codemirror/lang-css": "^6.2.1",
  "@codemirror/lang-json": "^6.0.1",
  "@codemirror/lang-markdown": "^6.2.4",
  "@codemirror/lang-python": "^6.1.4",
  "@codemirror/lang-rust": "^6.0.1",
  "@codemirror/lang-sql": "^6.6.1",
  "@codemirror/autocomplete": "^6.12.0",
  "@codemirror/lint": "^6.5.0",
  "@codemirror/search": "^6.5.5"
}
```

---

## File Structure

```
packages/code/                    # @composable-svelte/code package
├── src/
│   ├── code-editor/
│   │   ├── CodeEditor.svelte             # Main component
│   │   ├── code-editor.reducer.ts        # Pure reducer
│   │   ├── code-editor.types.ts          # State & action types
│   │   ├── codemirror-wrapper.ts         # CodeMirror integration
│   │   ├── extensions.ts                 # CodeMirror extensions config
│   │   ├── themes.ts                     # Theme definitions
│   │   ├── CodeEditor.css                # Styles
│   │   ├── README.md                     # Documentation
│   │   └── index.ts                      # Exports
│   └── index.ts                          # Main package exports
├── tests/
│   └── code-editor.test.ts               # TestStore tests
├── package.json
├── vite.config.ts
└── tsconfig.json

examples/styleguide/src/routes/code-editor/
└── +page.svelte                          # Demo page with examples
```

---

## Timeline Estimate

- Research & Setup: 2 hours
- Define Types: 2 hours
- Create Reducer: 3 hours
- CodeMirror Integration: 4 hours
- Build Component: 4 hours
- Testing: 3 hours
- Advanced Features: 3 hours
- Styling: 2 hours
- Documentation: 2 hours
- Integration: 1 hour

**Total: ~26 hours**

---

## Challenges & Solutions

### Challenge 1: Bridging CodeMirror State to Our Store
**Solution**: Use CodeMirror's update listener to dispatch actions when content/cursor/selection changes. Keep CodeMirror as the "source of truth" for editor state, sync to our store.

### Challenge 2: Avoiding Infinite Update Loops
**Solution**: Track when updates come from store vs CodeMirror. Only update CodeMirror view when value changes externally (not from user typing).

### Challenge 3: Handling Large Files
**Solution**: Use CodeMirror's built-in virtualization. Consider debouncing value change actions for performance.

### Challenge 4: Undo/Redo Integration
**Solution**: Let CodeMirror handle undo/redo internally. Our reducer just tracks `canUndo`/`canRedo` flags for UI state.

---

## Next Steps

After completing CodeEditor:
1. Review and test thoroughly
2. Performance testing with large files
3. Get user feedback
4. Consider additional features (diff view, split view)

---

**References:**
- Composable Svelte Skill: `.claude/skills/composable-svelte-frontend.md`
- Design Principles: `plans/phase-9/DESIGN-PRINCIPLES.md`
- Testability Lesson: `plans/phase-9/TESTABILITY-LESSON.md`
- CodeMirror 6 Docs: https://codemirror.net/docs/
