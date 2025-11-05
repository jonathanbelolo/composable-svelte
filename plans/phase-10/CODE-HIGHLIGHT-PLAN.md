# CodeHighlight Component Implementation Plan

**Phase**: 10
**Component**: CodeHighlight (Read-Only Syntax Highlighter)
**Library**: Prism.js
**Date**: November 5, 2025

---

## Overview

Build a **read-only syntax highlighting component** using Prism.js that follows Composable Svelte architecture patterns. The component will highlight code snippets with theme support, line numbers, and copy functionality.

**Key Principles** (from composable-svelte-frontend skill):
- ✅ ALL state in store (no component `$state`)
- ✅ Pure reducers with exhaustive testing
- ✅ TestStore for all tests
- ✅ Effects as data structures
- ✅ Component reads from store, dispatches actions

---

## Task Breakdown

### 1. Research & Setup

**Tasks:**
- [ ] 1.1. Research Prism.js latest version and features
- [ ] 1.2. Identify required Prism.js plugins (line numbers, copy button, language support)
- [ ] 1.3. Install dependencies: `prismjs` and required plugins
- [ ] 1.4. Research Prism.js theme system and available themes
- [ ] 1.5. Determine modular loading strategy (only load needed languages)

**Output:**
- Dependencies added to `package.json`
- Documentation of Prism.js API and plugin system

---

### 2. Define State & Types

**Tasks:**
- [ ] 2.1. Define `CodeHighlightState` interface
- [ ] 2.2. Define `CodeHighlightAction` discriminated union
- [ ] 2.3. Define `CodeHighlightConfig` for initial setup
- [ ] 2.4. Define supported languages enum/type
- [ ] 2.5. Define theme types

**State Structure:**
```typescript
interface CodeHighlightState {
  code: string;                    // Source code to highlight
  language: SupportedLanguage;     // Language for syntax highlighting
  theme: 'light' | 'dark' | 'auto'; // Theme mode
  showLineNumbers: boolean;        // Display line numbers
  highlightedCode: string | null;  // HTML output from Prism
  copyStatus: 'idle' | 'copying' | 'copied' | 'failed'; // Copy button state
  startLine: number;               // Line number offset
  highlightLines: number[];        // Lines to highlight
  isHighlighting: boolean;         // Highlighting in progress
  error: string | null;            // Highlighting error
}

type SupportedLanguage =
  | 'typescript' | 'javascript' | 'svelte'
  | 'html' | 'css' | 'json' | 'markdown'
  | 'bash' | 'sql' | 'python' | 'rust';

type CodeHighlightAction =
  | { type: 'init' }
  | { type: 'codeChanged'; code: string }
  | { type: 'languageChanged'; language: SupportedLanguage }
  | { type: 'themeChanged'; theme: 'light' | 'dark' | 'auto' }
  | { type: 'copyCode' }
  | { type: 'copyCompleted' }
  | { type: 'copyFailed'; error: string }
  | { type: 'resetCopyStatus' }
  | { type: 'toggleLineNumbers' }
  | { type: 'highlightLinesChanged'; lines: number[] }
  | { type: 'highlighted'; html: string }
  | { type: 'highlightFailed'; error: string };
```

**Output:**
- `packages/core/src/lib/components/code-highlight/code-highlight.types.ts`

---

### 3. Create Reducer

**Tasks:**
- [ ] 3.1. Implement pure reducer function
- [ ] 3.2. Handle `codeChanged` - trigger re-highlighting
- [ ] 3.3. Handle `languageChanged` - trigger re-highlighting
- [ ] 3.4. Handle `copyCode` - use `Effect.run()` with clipboard API
- [ ] 3.5. Handle theme changes
- [ ] 3.6. Add exhaustiveness check
- [ ] 3.7. Ensure immutable updates

**Reducer Pattern:**
```typescript
interface Dependencies {
  highlightCode: (code: string, language: SupportedLanguage) => Promise<string>;
}

const codeHighlightReducer: Reducer<CodeHighlightState, CodeHighlightAction, Dependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'init':
      // Trigger initial highlighting on mount
      if (state.code && !state.highlightedCode && !state.isHighlighting) {
        return [
          { ...state, isHighlighting: true, error: null },
          Effect.run(async (dispatch) => {
            try {
              const html = await deps.highlightCode(state.code, state.language);
              dispatch({ type: 'highlighted', html });
            } catch (e) {
              dispatch({ type: 'highlightFailed', error: e.message });
            }
          })
        ];
      }
      return [state, Effect.none()];

    case 'codeChanged':
      return [
        { ...state, code: action.code, highlightedCode: null, isHighlighting: true, error: null },
        Effect.run(async (dispatch) => {
          try {
            const html = await deps.highlightCode(action.code, state.language);
            dispatch({ type: 'highlighted', html });
          } catch (e) {
            dispatch({ type: 'highlightFailed', error: e.message });
          }
        })
      ];

    case 'highlighted':
      return [
        { ...state, highlightedCode: action.html, isHighlighting: false },
        Effect.none()
      ];

    case 'highlightFailed':
      return [
        { ...state, error: action.error, isHighlighting: false },
        Effect.none()
      ];

    case 'copyCode':
      return [
        { ...state, copyStatus: 'copying' },
        Effect.run(async (dispatch) => {
          try {
            await navigator.clipboard.writeText(state.code);
            dispatch({ type: 'copyCompleted' });
          } catch (e) {
            dispatch({ type: 'copyFailed', error: e.message });
          }
        })
      ];

    case 'copyCompleted':
      return [
        { ...state, copyStatus: 'copied' },
        Effect.afterDelay(2000, (d) => d({ type: 'resetCopyStatus' }))
      ];

    case 'resetCopyStatus':
      return [
        { ...state, copyStatus: 'idle' },
        Effect.none()
      ];

    default:
      const _never: never = action;
      return [state, Effect.none()];
  }
};
```

**Output:**
- `packages/core/src/lib/components/code-highlight/code-highlight.reducer.ts`

---

### 4. Prism.js Integration

**Tasks:**
- [ ] 4.1. Create Prism.js wrapper utility
- [ ] 4.2. Implement async language loading (modular)
- [ ] 4.3. Implement highlighting function
- [ ] 4.4. Add line number plugin integration
- [ ] 4.5. Add line highlighting plugin integration
- [ ] 4.6. Implement theme loading (CSS)
- [ ] 4.7. Handle edge cases (empty code, invalid language)

**Utility Structure:**
```typescript
// prism-wrapper.ts
export async function highlightCode(
  code: string,
  language: SupportedLanguage
): Promise<string> {
  // Dynamically import language grammar if needed
  await loadLanguage(language);

  // Highlight using Prism
  return Prism.highlight(code, Prism.languages[language], language);
}

export async function loadLanguage(lang: SupportedLanguage): Promise<void> {
  // Dynamic import for tree-shaking
  if (!Prism.languages[lang]) {
    await import(`prismjs/components/prism-${lang}`);
  }
}
```

**Output:**
- `packages/core/src/lib/components/code-highlight/prism-wrapper.ts`

---

### 5. Build Component

**Tasks:**
- [ ] 5.1. Create `CodeHighlight.svelte` component
- [ ] 5.2. Accept store as prop (NO local `$state`)
- [ ] 5.3. Use `$derived` for computed values
- [ ] 5.4. Render highlighted HTML safely
- [ ] 5.5. Add copy button with store-driven state
- [ ] 5.6. Add line numbers display
- [ ] 5.7. Apply theme CSS classes
- [ ] 5.8. Handle empty/loading states
- [ ] 5.9. Add accessibility (ARIA labels, keyboard support)

**Component Pattern:**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Store } from '@composable-svelte/core';
  import type { CodeHighlightState, CodeHighlightAction } from './code-highlight.types';

  export let store: Store<CodeHighlightState, CodeHighlightAction>;

  // Derived values only (NO $state)
  const showCopyButton = $derived($store.code.length > 0);
  const copyButtonText = $derived(
    $store.copyStatus === 'copied' ? 'Copied!' :
    $store.copyStatus === 'copying' ? 'Copying...' :
    'Copy'
  );

  // Trigger initial highlighting on mount
  onMount(() => {
    store.dispatch({ type: 'init' });
  });
</script>

<div class="code-highlight" data-theme={$store.theme}>
  {#if showCopyButton}
    <button
      class="copy-button"
      onclick={() => store.dispatch({ type: 'copyCode' })}
      disabled={$store.copyStatus === 'copying'}
      aria-label="Copy code to clipboard"
    >
      {copyButtonText}
    </button>
  {/if}

  {#if $store.isHighlighting}
    <div class="loading">Highlighting...</div>
  {:else if $store.error}
    <div class="error">{$store.error}</div>
  {/if}

  <pre class="language-{$store.language}" class:line-numbers={$store.showLineNumbers}>
    <code>{@html $store.highlightedCode || $store.code}</code>
  </pre>
</div>
```

**Output:**
- `packages/core/src/lib/components/code-highlight/CodeHighlight.svelte`

---

### 6. Testing with TestStore

**Tasks:**
- [ ] 6.1. Create test suite using TestStore
- [ ] 6.2. Test code highlighting (send/receive pattern)
- [ ] 6.3. Test language switching
- [ ] 6.4. Test copy functionality
- [ ] 6.5. Test theme changes
- [ ] 6.6. Test line number toggling
- [ ] 6.7. Test edge cases (empty code, invalid language)
- [ ] 6.8. Mock clipboard API
- [ ] 6.9. Mock Prism.js highlighting

**Test Pattern:**
```typescript
import { createTestStore } from '@composable-svelte/core/test';
import { codeHighlightReducer } from './code-highlight.reducer';

describe('CodeHighlight', () => {
  it('highlights code when changed', async () => {
    const store = createTestStore({
      initialState: {
        code: '',
        language: 'typescript',
        highlightedCode: null,
        // ...
      },
      reducer: codeHighlightReducer,
      dependencies: {
        highlightCode: async (code, lang) => `<span>${code}</span>`
      }
    });

    await store.send({ type: 'codeChanged', code: 'const x = 5;' }, (state) => {
      expect(state.code).toBe('const x = 5;');
    });

    await store.receive({ type: 'highlighted' }, (state) => {
      expect(state.highlightedCode).toContain('<span>');
    });

    await store.finish();
  });

  it('copies code to clipboard', async () => {
    const mockClipboard = { writeText: vi.fn() };
    global.navigator.clipboard = mockClipboard;

    const store = createTestStore({
      initialState: { code: 'test code', copyStatus: 'idle', /* ... */ },
      reducer: codeHighlightReducer
    });

    await store.send({ type: 'copyCode' }, (state) => {
      expect(state.copyStatus).toBe('copying');
    });

    await store.receive({ type: 'copyCompleted' }, (state) => {
      expect(state.copyStatus).toBe('copied');
    });

    expect(mockClipboard.writeText).toHaveBeenCalledWith('test code');

    await store.finish();
  });
});
```

**Output:**
- `packages/core/tests/components/code-highlight.test.ts`

---

### 7. Styling & Themes

**Tasks:**
- [ ] 7.1. Import Prism.js base CSS
- [ ] 7.2. Create custom theme CSS (light/dark)
- [ ] 7.3. Style line numbers
- [ ] 7.4. Style copy button
- [ ] 7.5. Style highlighted lines
- [ ] 7.6. Ensure proper contrast ratios (WCAG AA)
- [ ] 7.7. Add smooth transitions for theme switching

**Output:**
- `packages/core/src/lib/components/code-highlight/CodeHighlight.css`

---

### 8. Documentation & Example

**Tasks:**
- [ ] 8.1. Write component documentation
- [ ] 8.2. Document all props and store shape
- [ ] 8.3. Create usage examples
- [ ] 8.4. Add to component library index
- [ ] 8.5. Create demo page in styleguide example
- [ ] 8.6. Document supported languages
- [ ] 8.7. Document theme customization

**Example Usage:**
```typescript
import { createStore } from '@composable-svelte/core';
import { codeHighlightReducer, highlightCode } from '@composable-svelte/core/components/code-highlight';

const store = createStore({
  initialState: {
    code: 'const hello = "world";',
    language: 'typescript',
    theme: 'dark',
    showLineNumbers: true,
    highlightedCode: null,
    copyStatus: 'idle',
    startLine: 1,
    highlightLines: [2, 3],
    isHighlighting: false,
    error: null
  },
  reducer: codeHighlightReducer,
  dependencies: {
    highlightCode  // From prism-wrapper.ts
  }
});
```

**Output:**
- `packages/core/src/lib/components/code-highlight/README.md`
- `examples/styleguide/src/routes/code-highlight/+page.svelte`

---

### 9. Integration & Export

**Tasks:**
- [ ] 9.1. Add exports to component index
- [ ] 9.2. Update main library exports
- [ ] 9.3. Ensure tree-shaking works (modular Prism imports)
- [ ] 9.4. Run build and verify no errors
- [ ] 9.5. Test in styleguide app

**Output:**
- Updated `packages/core/src/lib/components/index.ts`

---

## Success Criteria

- [x] ALL state in store (no component `$state`)
- [x] Pure reducer with exhaustiveness check
- [x] Comprehensive TestStore tests (100% coverage)
- [x] Copy functionality works
- [x] Theme switching works (light/dark/auto)
- [x] Line numbers display correctly
- [x] Line highlighting works
- [x] Accessible (keyboard + screen reader)
- [x] Modular language loading (tree-shakeable)
- [x] Documentation complete
- [x] Demo in styleguide works

---

## Dependencies

```json
{
  "prismjs": "^1.29.0",
  "prism-themes": "^1.9.0"
}
```

---

## File Structure

```
packages/core/src/lib/components/code-highlight/
├── CodeHighlight.svelte          # Main component
├── code-highlight.reducer.ts     # Pure reducer
├── code-highlight.types.ts       # State & action types
├── prism-wrapper.ts              # Prism.js integration
├── CodeHighlight.css             # Styles
├── README.md                     # Documentation
└── index.ts                      # Exports

packages/core/tests/components/
└── code-highlight.test.ts        # TestStore tests

examples/styleguide/src/routes/code-highlight/
└── +page.svelte                  # Demo page
```

---

## Timeline Estimate

- Research & Setup: 1 hour
- Define Types: 1 hour
- Create Reducer: 2 hours
- Prism Integration: 2 hours
- Build Component: 2 hours
- Testing: 2 hours
- Styling: 1 hour
- Documentation: 1 hour
- Integration: 1 hour

**Total: ~13 hours**

---

## Next Steps

After completing CodeHighlight:
1. Review and test thoroughly
2. Get user feedback
3. Move to CodeEditor component (more complex, interactive)

---

**References:**
- Composable Svelte Skill: `.claude/skills/composable-svelte-frontend.md`
- Design Principles: `plans/phase-9/DESIGN-PRINCIPLES.md`
- Testability Lesson: `plans/phase-9/TESTABILITY-LESSON.md`
