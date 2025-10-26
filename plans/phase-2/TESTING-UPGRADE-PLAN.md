# Testing Infrastructure Upgrade Plan - Phase 2

**Date**: October 26, 2025
**Status**: ✅ COMPLETED
**Completion Date**: October 26, 2025
**Goal**: Implement cutting-edge professional browser-based component testing for Svelte 5

---

## ✅ Completion Summary

Successfully upgraded testing infrastructure to cutting-edge 2025 standards:

- **All 173 tests passing** (including 7 new Modal component tests)
- **Tests running in real Chromium browser** via Playwright
- **Vitest 4.0 Browser Mode** (stable, production-ready)
- **Modern tooling**: Vite 6, Svelte plugin 6, Node types 20
- **Test duration**: 1.11s for all 173 tests

### Actual Results

| Component | Before | After |
|-----------|--------|-------|
| Vite | 5.4.2 | **6.4.1** ✅ |
| Vitest | 2.0.5 | **4.0.3** ✅ |
| Svelte Plugin | 4.0.0 | **6.2.1** ✅ |
| @types/node | 12.20.55 | **20.19.23** ✅ |
| Test Environment | jsdom (broken) | **Real Chromium** ✅ |

### New Dependencies Added

- `@vitest/browser@4.0.3`
- `@vitest/browser-playwright@4.0.3`
- `vitest-browser-svelte@2.0.0`
- `playwright@1.56.1`

### Dependencies Removed

- `@testing-library/jest-dom`
- `@testing-library/svelte`
- `jsdom`

---

## Executive Summary

This plan outlines upgrading our testing infrastructure from jsdom (incompatible with Svelte 5 components) to **Vitest 4 Browser Mode with Playwright** - a modern, stable, production-ready solution that tests components in real Chromium browsers.

**Key Benefit**: Svelte 5 runes work natively in browser environments, eliminating lifecycle errors we encountered with jsdom.

---

## Current State Analysis

### Existing Dependencies
```json
{
  "vite": "^5.4.2",
  "vitest": "^2.0.5",
  "@sveltejs/vite-plugin-svelte": "^4.0.0",
  "@vitest/coverage-v8": "^2.0.5",
  "@vitest/ui": "^2.0.5",
  "@testing-library/jest-dom": "^6.9.1",
  "@testing-library/svelte": "^5.2.8",
  "jsdom": "^25.0.0",
  "@types/node": "12.20.55"
}
```

### Current Problems
1. **jsdom incompatibility**: Svelte 5 components fail with "lifecycle_function_unavailable" error
2. **No real browser testing**: jsdom simulates DOM but doesn't run actual browser code
3. **Runes require browser context**: Svelte 5's reactive primitives need real browser environment
4. **Outdated Node types**: Version 12.x is too old for modern tooling

### Test Configuration (Current)
```typescript
// vite.config.ts
export default defineConfig({
  test: {
    environment: 'jsdom',  // ❌ Doesn't work with Svelte 5
    globals: true,
    setupFiles: []
  }
});
```

---

## Target State (Cutting-Edge 2025 Stack)

### New Dependencies
```json
{
  "vite": "^6.0.0",                            // Latest stable
  "vitest": "^4.0.0",                          // Browser Mode now STABLE!
  "@sveltejs/vite-plugin-svelte": "^6.0.0",   // Full Vite 6 + Svelte 5 support
  "@vitest/coverage-v8": "^4.0.0",            // Matching Vitest version
  "@vitest/ui": "^4.0.0",                     // Matching Vitest version
  "@vitest/browser": "^4.0.0",                // Browser mode package (NEW)
  "vitest-browser-svelte": "^2.0.0",          // Svelte component rendering (NEW)
  "playwright": "^1.56.1",                    // Browser automation
  "@types/node": "^20.0.0"                    // Modern Node types
}
```

### Dependencies to Remove
```json
{
  "@testing-library/jest-dom": "removed",     // Not needed with Vitest Browser
  "@testing-library/svelte": "removed",       // Replaced by vitest-browser-svelte
  "jsdom": "removed"                          // Replaced by real Chromium
}
```

---

## Why This Stack?

### 1. Vitest 4 Browser Mode is STABLE
- Graduated from experimental to production-ready in Vitest 4.0 (January 2025)
- Battle-tested by major projects
- Official support from Vitest team

### 2. Real Browser Testing
- Components run in actual Chromium via Playwright
- Catch real browser-specific issues
- Test actual user experience

### 3. Svelte 5 Native Support
- Runes work perfectly in browser environment
- No lifecycle errors
- True reactivity testing

### 4. Industry-Standard Tooling
- **Playwright**: Used by Microsoft, Google, Meta
- **Vitest**: Modern, fast, Vite-native
- **Vite 6**: Latest performance improvements

### 5. Professional Developer Experience
- Playwright Inspector for debugging
- Visual traces and screenshots
- Parallel test execution
- Fast feedback loops

---

## Breaking Changes Analysis

### Vitest 4.0 Breaking Changes

#### 1. Browser Provider Configuration
**Before (Vitest 2.x)**:
```typescript
test: {
  environment: 'jsdom'
}
```

**After (Vitest 4.x)**:
```typescript
test: {
  browser: {
    enabled: true,
    name: 'chromium',
    provider: 'playwright',  // Object instead of string
    headless: true
  }
}
```

#### 2. Mock Implementation Changes
- Mocks called with `new` now construct instances (not mock.apply)
- Mock implementations must use `function` or `class` keyword
- Arrow functions will cause "is not a constructor" error
- **Impact**: We don't use mocks in component tests - no impact

#### 3. Coverage Reporting Improvements
- V8 coverage uses more accurate AST-based remapping
- Coverage reports may show different percentages (more accurate)
- **Impact**: Positive - better accuracy

#### 4. Removed Deprecated APIs
- `poolMatchGlobs` - removed
- `environmentMatchGlobs` - removed
- `deps.external`, `deps.inline`, `deps.fallbackCBS` - removed
- **Impact**: We don't use these - no impact

### Vite 6.0 Breaking Changes

#### Minimal Impact for Libraries
- No major breaking changes for library projects
- Better tree-shaking and performance
- Improved CSS handling
- **Impact**: Positive, no code changes needed

### @sveltejs/vite-plugin-svelte 6.0 Changes

#### Script Preprocessing Disabled by Default
- Svelte 5 supports `lang="ts"` natively
- No preprocessor needed for TypeScript
- **Impact**: None - we use native TypeScript support

#### HMR Integration Updated
- Uses Svelte 5 compiler HMR (not svelte-hmr)
- Better hot module replacement
- **Impact**: Positive - better DX

---

## Implementation Steps

### Phase 1: Dependency Cleanup

#### Step 1.1: Remove Old Testing Dependencies
```bash
cd packages/core
pnpm remove @testing-library/jest-dom @testing-library/svelte jsdom
```

**Why**: These are incompatible with Svelte 5 and no longer needed with browser testing.

**Expected Output**: Clean removal, dependencies disappear from package.json

**Validation**:
```bash
grep -E "(jest-dom|@testing-library/svelte|jsdom)" package.json
# Should return nothing
```

---

### Phase 2: Upgrade Core Build Tools

#### Step 2.1: Upgrade Vite and Svelte Plugin
```bash
pnpm add -D vite@^6.0.0 @sveltejs/vite-plugin-svelte@^6.0.0
```

**Why**: Latest stable versions with full Svelte 5 support

**Expected Changes**:
- `vite`: 5.4.2 → 6.x.x
- `@sveltejs/vite-plugin-svelte`: 4.0.0 → 6.x.x

**Validation**:
```bash
pnpm run build
# Should complete successfully
```

**Potential Issues**:
- If esbuild version conflicts occur, clear node_modules and reinstall
- Solution: `rm -rf node_modules pnpm-lock.yaml && pnpm install`

---

### Phase 3: Upgrade Vitest Ecosystem

#### Step 3.1: Upgrade Vitest Core Packages
```bash
pnpm add -D vitest@^4.0.0 @vitest/coverage-v8@^4.0.0 @vitest/ui@^4.0.0
```

**Why**: Unified version across Vitest packages prevents peer dependency conflicts

**Expected Changes**:
- `vitest`: 2.0.5 → 4.x.x
- `@vitest/coverage-v8`: 2.0.5 → 4.x.x
- `@vitest/ui`: 2.0.5 → 4.x.x

**Validation**:
```bash
pnpm vitest --version
# Should show 4.x.x
```

---

### Phase 4: Add Browser Testing Dependencies

#### Step 4.1: Install Browser Testing Packages
```bash
pnpm add -D @vitest/browser@^4.0.0 vitest-browser-svelte@^2.0.0 playwright@latest
```

**Why**:
- `@vitest/browser`: Enables browser mode in Vitest 4
- `vitest-browser-svelte`: Provides `render()` function for Svelte components
- `playwright`: Browser automation engine

**Expected Changes**:
- New dependencies added to package.json
- Playwright binaries NOT yet installed (next step)

**Validation**:
```bash
pnpm list @vitest/browser vitest-browser-svelte playwright
# Should show all three packages
```

#### Step 4.2: Install Chromium Browser Binaries
```bash
pnpm exec playwright install chromium
```

**Why**: Downloads actual Chromium browser for tests (~300MB)

**Expected Output**:
```
Downloading Chromium 130.0.6723.58 (playwright build v1140)
123.4 MB [====================] 100%
Chromium 130.0.6723.58 (playwright build v1140) downloaded to ...
```

**Validation**:
```bash
pnpm exec playwright --version
# Should show Playwright version
```

**Storage Note**: Chromium binaries stored in `~/.cache/ms-playwright/` (shared across projects)

---

### Phase 5: Upgrade Node Types

#### Step 5.1: Update @types/node
```bash
pnpm add -D @types/node@^20.0.0
```

**Why**: Node 12 types are outdated; modern tools require Node 18+

**Expected Changes**:
- `@types/node`: 12.20.55 → 20.x.x

**Impact**: Fixes peer dependency warnings from Vite and Vitest

**Validation**: Check no peer dependency warnings:
```bash
pnpm install
# Should complete without "@types/node" warnings
```

---

### Phase 6: Update Configuration Files

#### Step 6.1: Update vite.config.ts

**Replace entire test section**:

```typescript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte()],

  // ============================================================================
  // NEW: Browser Mode Configuration (Vitest 4)
  // ============================================================================
  test: {
    browser: {
      enabled: true,
      name: 'chromium',
      provider: 'playwright',
      headless: true,  // Run without visible browser window
      // Optional: Show browser for debugging
      // headless: false,
    },

    // Test file patterns
    include: ['tests/**/*.{test,spec}.{js,ts}'],

    // Optional: Enable UI for debugging
    // ui: true,

    // Optional: Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.spec.ts',
        '**/*.test.ts',
      ]
    }
  },

  // ============================================================================
  // Build Configuration (unchanged)
  // ============================================================================
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: 'index'
    },
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: true,
    rollupOptions: {
      external: ['svelte', 'svelte/internal'],
      output: {
        preserveModules: false
      }
    }
  },

  resolve: {
    alias: {
      '$lib': resolve(__dirname, 'src')
    }
  }
});
```

**Key Changes**:
1. ❌ Removed `environment: 'jsdom'`
2. ✅ Added `browser` configuration object
3. ✅ Added `include` pattern for test files
4. ✅ Added optional coverage and UI settings

**Validation**:
```bash
pnpm run typecheck
# Should pass without errors
```

#### Step 6.2: Update package.json Scripts (Optional)

**Add new test scripts**:

```json
{
  "scripts": {
    "build": "vite build && tsc --project tsconfig.json --declaration --emitDeclarationOnly --outDir dist",
    "typecheck": "tsc --noEmit --project tsconfig.test.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

**New Scripts**:
- `test:ui` - Opens Vitest UI in browser for debugging
- `test:coverage` - Generates coverage reports

---

### Phase 7: Rewrite Test Files

#### Step 7.1: Update Modal.test.ts

**OLD Pattern (Testing Library + jsdom)**:
```typescript
import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Modal from '../../src/navigation-components/Modal.svelte';

describe('Modal Component', () => {
  it('shows when store is non-null', () => {
    const { getByRole } = render(Modal, { props: { store: scopedStore } });
    expect(getByRole('dialog')).toBeInTheDocument();
  });
});
```

**NEW Pattern (Vitest Browser Mode)**:
```typescript
import { render } from 'vitest-browser-svelte';
import { page } from '@vitest/browser/context';
import { describe, it, expect } from 'vitest';
import Modal from '../../src/navigation-components/Modal.svelte';
import { createStore } from '../../src/store.svelte.js';
import { scopeToDestination } from '../../src/navigation/scope-to-destination.js';
import { Effect } from '../../src/effect.js';

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestState {
  value: string;
}

type TestAction = { type: 'update'; value: string };

interface ParentState {
  destination: { type: 'test'; state: TestState } | null;
}

type ParentAction =
  | { type: 'show' }
  | { type: 'destination'; action: any };

// ============================================================================
// Modal Component Tests
// ============================================================================

describe('Modal Component', () => {
  it('shows when store is non-null', async () => {
    // Setup store
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    // Render component
    render(Modal, {
      props: { store: scopedStore }
    });

    // Use Playwright locators (auto-retry!)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('hides when store is null', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: { destination: null },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: { store: scopedStore }
    });

    const dialog = page.queryByRole('dialog');
    await expect.element(dialog).not.toBeInTheDocument();
  });

  it('calls store.dismiss() when Escape pressed', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: { store: scopedStore }
    });

    // Modal should be visible
    let dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();

    // Press Escape using Playwright keyboard
    await page.keyboard.press('Escape');

    // Modal should be hidden (destination set to null)
    dialog = page.queryByRole('dialog');
    await expect.element(dialog).not.toBeInTheDocument();
  });

  it('respects disableEscapeKey prop', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state, action) => {
        if (
          action.type === 'destination' &&
          action.action.type === 'dismiss'
        ) {
          return [{ ...state, destination: null }, Effect.none()];
        }
        return [state, Effect.none()];
      }
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: { store: scopedStore, disableEscapeKey: true }
    });

    // Press Escape
    await page.keyboard.press('Escape');

    // Modal should still be visible (Escape disabled)
    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toBeInTheDocument();
  });

  it('applies custom classes', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: {
        store: scopedStore,
        class: 'custom-modal-content',
        backdropClass: 'custom-backdrop'
      }
    });

    const dialog = page.getByRole('dialog');
    await expect.element(dialog).toHaveClass(/custom-modal-content/);
  });

  it('respects unstyled prop', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: { store: scopedStore, unstyled: true }
    });

    const dialog = page.getByRole('dialog');
    const className = await dialog.getAttribute('class');
    expect(className).toBe('');
  });

  it('prevents body scroll when visible', async () => {
    const parentStore = createStore<ParentState, ParentAction>({
      initialState: {
        destination: { type: 'test', state: { value: 'test' } }
      },
      reducer: (state) => [state, Effect.none()]
    });

    const scopedStore = scopeToDestination(
      parentStore,
      ['destination'],
      'test',
      'destination'
    );

    render(Modal, {
      props: { store: scopedStore }
    });

    // Check body overflow style
    const bodyStyle = await page.evaluate(() => document.body.style.overflow);
    expect(bodyStyle).toBe('hidden');
  });
});
```

**Key Changes**:
1. ✅ Import `render` from `vitest-browser-svelte` (not `@testing-library/svelte`)
2. ✅ Import `page` from `@vitest/browser/context` (Playwright locators)
3. ✅ Use `page.getByRole()` instead of `getByRole()` from render
4. ✅ Use `await` for all assertions (browser async)
5. ✅ Use `expect.element()` instead of `expect()` for DOM assertions
6. ✅ Use `page.keyboard.press()` for keyboard events
7. ✅ Use `page.evaluate()` for direct DOM access

---

### Phase 8: Validation & Testing

#### Step 8.1: Run Tests
```bash
pnpm test
```

**Expected Output**:
```
✓ tests/navigation-components/Modal.test.ts (7 tests)
  ✓ Modal Component
    ✓ shows when store is non-null
    ✓ hides when store is null
    ✓ calls store.dismiss() when Escape pressed
    ✓ respects disableEscapeKey prop
    ✓ applies custom classes
    ✓ respects unstyled prop
    ✓ prevents body scroll when visible

Test Files  1 passed (1)
     Tests  7 passed (7)
  Start at  XX:XX:XX
  Duration  XXXms (transform XXms, setup XXms, collect XXms, tests XXms, environment XXms, prepare XXms)
```

**Validation Checklist**:
- [ ] All 7 Modal tests pass
- [ ] No lifecycle errors
- [ ] No jsdom errors
- [ ] Tests complete in reasonable time (<5 seconds)

#### Step 8.2: Verify Build Still Works
```bash
pnpm run build
```

**Expected Output**:
```
vite v6.x.x building for production...
✓ XX modules transformed.
dist/index.js  XX.XX kB │ gzip: X.XX kB
✓ built in XXXms
```

**Validation**:
- [ ] Build completes successfully
- [ ] No type errors
- [ ] dist/ directory contains output

#### Step 8.3: Run Type Checking
```bash
pnpm run typecheck
```

**Expected Output**:
```
✓ No errors found
```

**Validation**:
- [ ] No TypeScript errors
- [ ] All imports resolve correctly

---

## Testing Patterns & Best Practices

### 1. Always Use Playwright Locators

**✅ GOOD - Use page.getBy* methods**:
```typescript
const dialog = page.getByRole('dialog');
const button = page.getByRole('button', { name: 'Close' });
const input = page.getByLabel('Email');
```

**❌ BAD - Don't use containers**:
```typescript
const { container } = render(Component);
const dialog = container.querySelector('[role="dialog"]');  // No auto-retry!
```

**Why**: Playwright locators have built-in retry logic and waiting.

---

### 2. Locator Priority Order

Use locators in this priority (best accessibility):

1. **`getByRole()`** - Best for accessibility
   ```typescript
   page.getByRole('button', { name: 'Submit' })
   page.getByRole('dialog')
   page.getByRole('textbox', { name: 'Email' })
   ```

2. **`getByLabel()`** - Great for forms
   ```typescript
   page.getByLabel('Email address')
   page.getByLabel('Password')
   ```

3. **`getByText()`** - For unique text
   ```typescript
   page.getByText('Welcome back!')
   page.getByText(/Sign in to continue/)
   ```

4. **`getByTestId()`** - Last resort
   ```typescript
   page.getByTestId('custom-modal')  // Only if no semantic selector
   ```

---

### 3. Handle Multiple Elements

```typescript
// Get first match
const firstButton = page.getByRole('button').first();

// Get nth match (0-indexed)
const secondButton = page.getByRole('button').nth(1);

// Get last match
const lastButton = page.getByRole('button').last();

// Count elements
const buttonCount = await page.getByRole('button').count();
expect(buttonCount).toBe(3);
```

---

### 4. Async/Await Everything

**✅ GOOD - Always await assertions**:
```typescript
await expect.element(dialog).toBeInTheDocument();
await expect.element(button).toHaveClass('active');
```

**❌ BAD - Missing await**:
```typescript
expect.element(dialog).toBeInTheDocument();  // Won't work!
```

**Why**: Browser tests are asynchronous by nature.

---

### 5. Test User Interactions

```typescript
// Click
await page.getByRole('button', { name: 'Submit' }).click();

// Type text
await page.getByLabel('Email').fill('test@example.com');

// Press keys
await page.keyboard.press('Enter');
await page.keyboard.press('Escape');

// Focus
await page.getByLabel('Email').focus();

// Hover
await page.getByRole('button').hover();
```

---

### 6. Test Svelte 5 Runes (Universal State)

When testing external state from `*.svelte.ts` files:

```typescript
import { flushSync } from 'svelte';
import { counterState } from '$lib/stores/counter.svelte.js';

it('increments counter when button is clicked', async () => {
  render(Counter);

  const incrementBtn = page.getByRole('button', { name: 'Increment' });
  await incrementBtn.click();

  flushSync();  // ⚠️ Required for external universal state!

  expect(counterState.count).toBe(1);
});
```

**Why**: External state needs explicit flushing to trigger DOM updates in browser tests.

---

### 7. Direct DOM Access (When Needed)

```typescript
// Evaluate JavaScript in browser context
const overflow = await page.evaluate(() => {
  return document.body.style.overflow;
});
expect(overflow).toBe('hidden');

// Get element attribute
const className = await page.getByRole('dialog').getAttribute('class');
expect(className).toContain('custom-modal');
```

---

### 8. Debugging Tests

**Option 1: Run with visible browser**:
```typescript
// vite.config.ts
test: {
  browser: {
    enabled: true,
    name: 'chromium',
    provider: 'playwright',
    headless: false,  // Show browser window
  }
}
```

**Option 2: Use Vitest UI**:
```bash
pnpm test:ui
# Opens http://localhost:51204/__vitest__/
```

**Option 3: Add debug pauses**:
```typescript
it('debugs modal', async () => {
  render(Modal, { props: { store: scopedStore } });

  await page.pause();  // Pauses execution, opens inspector

  const dialog = page.getByRole('dialog');
  await expect.element(dialog).toBeInTheDocument();
});
```

---

## Troubleshooting Guide

### Issue 1: "Cannot find module '@vitest/browser'"

**Symptom**:
```
Error: Cannot find module '@vitest/browser/context'
```

**Solution**:
```bash
# Ensure @vitest/browser is installed
pnpm add -D @vitest/browser@^4.0.0

# Clear cache and reinstall
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

---

### Issue 2: "Browser provider not found"

**Symptom**:
```
Error: Browser provider 'playwright' not found
```

**Solution**:
```bash
# Install Playwright
pnpm add -D playwright

# Install browser binaries
pnpm exec playwright install chromium
```

---

### Issue 3: "Vitest version mismatch"

**Symptom**:
```
WARN  Issues with peer dependencies found
└─┬ @vitest/browser 4.0.3
  └── ✕ unmet peer vitest@4.0.3: found 2.1.9
```

**Solution**:
```bash
# Ensure all Vitest packages match version 4.x
pnpm add -D vitest@^4.0.0 @vitest/browser@^4.0.0 @vitest/coverage-v8@^4.0.0 @vitest/ui@^4.0.0
```

---

### Issue 4: Tests timeout

**Symptom**:
```
Error: Test timed out after 5000ms
```

**Solution**:
```typescript
// Increase timeout in vite.config.ts
test: {
  browser: {
    enabled: true,
    name: 'chromium',
    provider: 'playwright'
  },
  testTimeout: 10000  // Increase to 10 seconds
}
```

---

### Issue 5: Playwright not installed

**Symptom**:
```
Error: Executable doesn't exist at /Users/.../chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium
```

**Solution**:
```bash
# Install Chromium binaries
pnpm exec playwright install chromium

# Verify installation
pnpm exec playwright --version
```

---

### Issue 6: esbuild version conflict

**Symptom**:
```
Error: Expected "0.25.11" but got "0.21.5"
```

**Solution**:
```bash
# Clear entire dependency tree
rm -rf node_modules pnpm-lock.yaml

# Reinstall from scratch
pnpm install

# If still failing, check for global cache issues
pnpm store prune
pnpm install
```

---

## Success Criteria

### Must Have
- [ ] All dependencies upgraded to target versions
- [ ] All Modal tests pass (7 tests)
- [ ] Build completes successfully
- [ ] Type checking passes
- [ ] No peer dependency warnings

### Should Have
- [ ] Tests run in under 5 seconds
- [ ] Coverage reporting works
- [ ] Vitest UI accessible

### Nice to Have
- [ ] Playwright traces for debugging
- [ ] Visual regression testing setup (Vitest 4 feature)

---

## Post-Upgrade Tasks

### 1. Update CI/CD Pipeline
```yaml
# .github/workflows/test.yml
- name: Install Playwright browsers
  run: pnpm exec playwright install --with-deps chromium

- name: Run tests
  run: pnpm test
```

### 2. Document Testing Patterns
- Update CONTRIBUTING.md with new test patterns
- Add examples to component guide

### 3. Write Tests for Remaining Components
- Sheet component (Task 2.6.2)
- Drawer component (Task 2.6.3)
- Alert component (Task 2.6.4)
- NavigationStack component (Task 2.6.5)
- Sidebar component (Task 2.6.6)
- Tabs component (Task 2.6.7)
- Popover component (Task 2.6.8)

---

## Rollback Plan (If Needed)

If upgrade fails catastrophically:

```bash
# Revert to previous versions
pnpm add -D vite@^5.4.2 vitest@^2.0.5 @sveltejs/vite-plugin-svelte@^4.0.0
pnpm add -D @vitest/coverage-v8@^2.0.5 @vitest/ui@^2.0.5
pnpm add -D @testing-library/svelte@^5.2.8 jsdom@^25.0.0

# Restore old vite.config.ts
git checkout HEAD -- vite.config.ts

# Restore old test files
git checkout HEAD -- tests/
```

---

## Timeline Estimate

- **Phase 1-2** (Cleanup & Upgrade Core): 15 minutes
- **Phase 3-4** (Vitest & Browser): 20 minutes
- **Phase 5-6** (Node Types & Config): 10 minutes
- **Phase 7** (Rewrite Tests): 30 minutes
- **Phase 8** (Validation): 15 minutes

**Total**: ~90 minutes (1.5 hours)

---

## References

- [Vitest 4.0 Release](https://vitest.dev/blog/vitest-4)
- [Vitest Browser Mode Guide](https://vitest.dev/guide/browser)
- [Playwright Documentation](https://playwright.dev/docs/test-components)
- [Scott Spence's Guide](https://scottspence.com/posts/testing-with-vitest-browser-svelte-guide)
- [vitest-browser-svelte](https://github.com/vitest-dev/vitest-browser-svelte)

---

## Conclusion

This upgrade moves our testing infrastructure from outdated jsdom simulation to **cutting-edge browser-based testing** with:

- ✅ Real Chromium browser
- ✅ Svelte 5 native support
- ✅ Playwright's robust automation
- ✅ Production-ready Vitest 4 Browser Mode
- ✅ Professional debugging tools

**Result**: Confidence in component behavior in actual browsers, catching real-world issues before production.
