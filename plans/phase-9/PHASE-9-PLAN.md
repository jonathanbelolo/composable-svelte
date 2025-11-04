# Phase 9: Critical Fixes - Build System & User API

**Status**: 🔴 CRITICAL - Current library is broken for external consumers

**Created**: 2025-11-04

## Overview

Two critical issues discovered during real-world testing with `_client_tests/user-demo`:

1. **Component Library Build Broken** - Svelte components cannot be imported from the compiled library
2. **Terrible Subscription API** - Current pattern is verbose, error-prone, and unintuitive

These issues went undetected because all examples use workspace source imports, not the compiled package.

---

## Problem 1: Component Library Build System

### Current State
```
vite.config.ts:
  build.lib.entry = 'src/index.ts'
  rollupOptions.output.preserveModules = false  ❌ WRONG
```

**Result:**
- All code bundled into single `dist/index.js`
- `.svelte` files compiled to JS and included in bundle
- TypeScript definitions reference non-existent `.svelte` files: `export { default as Button } from './components/ui/button/Button.svelte'`
- **External consumers get 500 errors** when importing components

### Root Cause
Using raw Vite library mode instead of Svelte-specific packager. Vite doesn't understand how to properly package `.svelte` files for consumption.

### Solutions Analysis

#### Option A: Use `@sveltejs/package` ⭐ RECOMMENDED
**Pros:**
- Official Svelte library packager
- Used by shadcn-svelte, skeleton, melt-ui, etc.
- Handles `.svelte` files correctly
- Generates proper package structure
- Well-documented and battle-tested

**Cons:**
- Need to restructure package.json scripts
- Different build workflow than current Vite setup
- May need to adjust imports/exports

**Implementation:**
```bash
pnpm add -D @sveltejs/package
```

```json
// package.json
{
  "scripts": {
    "package": "svelte-package",
    "prepublishOnly": "pnpm package"
  },
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "svelte": "./dist/index.js"
    },
    "./components/*": {
      "types": "./dist/components/*.d.ts",
      "svelte": "./dist/components/*.js"
    }
  }
}
```

**Build Output:**
```
dist/
  index.js           # Main entry (store, effects, etc.)
  index.d.ts
  components/
    ui/
      button/
        Button.svelte  # Preserved source
        index.js       # Compiled
        index.d.ts
```

#### Option B: Vite with `preserveModules: true`
**Pros:**
- Keep current Vite setup
- More control over build process

**Cons:**
- More complex configuration
- Need to handle `.svelte` file copying/transformation manually
- Non-standard approach
- Reinventing the wheel

#### Option C: Split Packages
**Pros:**
- Clear separation: `@composable-svelte/core` (no components) + `@composable-svelte/ui`
- Core package simpler (current Vite setup works fine)
- UI package uses `@sveltejs/package`

**Cons:**
- More packages to maintain
- Users need to install both
- More complex publishing workflow

### Recommended Solution: Option A ✅ SELECTED

Use `@sveltejs/package` for the entire library. It's the standard, it works, and it's what users expect.

**Decision Made**: 2025-11-04 - We will use `@sveltejs/package` as this is what shadcn-svelte and other major Svelte component libraries use. This is the battle-tested, official solution.

---

## Problem 2: Terrible Subscription API

### Current API (BEFORE)
```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';

  let { store }: { store: Store<State, Action> } = $props();

  // 😱 HORRIBLE: Manual subscription boilerplate
  let count = $state(store.state.count);
  let isLoading = $state(store.state.isLoading);
  let error = $state(store.state.error);

  $effect(() => {
    const unsubscribe = store.subscribe((newState) => {
      count = newState.count;
      isLoading = newState.isLoading;
      error = newState.error;
    });
    return () => unsubscribe();
  });
</script>

<div>
  {#if isLoading}Loading...{/if}
  {#if error}{error}{/if}
  Count: {count}
</div>
```

**Problems:**
- 8+ lines of boilerplate per component
- Need to manually track which state fields are used
- Easy to forget to update subscription when adding new derived values
- Error-prone (typos in field names)
- Not discoverable - users won't know this is the pattern

### Solutions Analysis

#### Option A: Svelte Store Contract Adapter ⭐ RECOMMENDED
Make Store compatible with Svelte's built-in store contract (`subscribe` + optional `set`/`update`).

**Implementation:**
```typescript
// In store.svelte.ts - add to Store interface
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> & SvelteStore<State> {
  // ... existing code ...

  return {
    // Existing Store API
    get state() { return state; },
    dispatch,
    select,
    subscribe,  // Already compatible! Returns () => void
    subscribeToActions,
    history,
    destroy,

    // NOT adding set/update - stores are read-only from outside
    // Only dispatch() modifies state
  };
}
```

**User API (AFTER):**
```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';

  let { store }: { store: Store<State, Action> } = $props();

  // ✨ BEAUTIFUL: Auto-subscription with $store syntax
  // Svelte 5 auto-subscribes to any object with subscribe()
</script>

<div>
  {#if $store.isLoading}Loading...{/if}
  {#if $store.error}{$store.error}{/if}
  Count: {$store.count}
</div>

<!-- Can also use $derived for computed values -->
<script>
  let doubled = $derived($store.count * 2);
</script>
```

**Pros:**
- Zero boilerplate
- Uses Svelte's native `$` auto-subscription
- Familiar to all Svelte developers
- Type-safe (TypeScript knows `$store` is `State`)
- Works with `$derived` for computed values

**Cons:**
- Need to verify Svelte 5 auto-subscription works with our subscribe signature
- Might need minor adjustments to subscribe() implementation

#### Option B: `useStore()` Helper
```typescript
export function useStore<State, Action>(
  store: Store<State, Action>
): State {
  let state = $state(store.state);
  $effect(() => {
    return store.subscribe((newState) => {
      state = newState;
    });
  });
  return state;
}
```

**User API:**
```svelte
<script>
  import { useStore } from '@composable-svelte/core';

  const state = useStore(store);
</script>

<div>
  {#if state.isLoading}Loading...{/if}
  Count: {state.count}
</div>
```

**Pros:**
- Explicit and clear
- Encapsulates subscription logic

**Cons:**
- Still need to import helper
- Not as clean as native `$` syntax
- `useStore` is React-ish naming (might confuse)

#### Option C: Wrapper Component
```svelte
<StoreProvider {store} let:state>
  <div>Count: {state.count}</div>
</StoreProvider>
```

**Pros:**
- No subscription code needed

**Cons:**
- Extra wrapper div
- Less flexible
- Weird pattern for Svelte

### Recommended Solution: Option A ✅ SELECTED & VERIFIED

**Implement Svelte Store Contract** - Our `Store` already has `subscribe()` that returns a cleanup function. We just need to verify it works with Svelte 5's auto-subscription (`$store` syntax).

**Testing Complete**: 2025-11-04 - The `$store` syntax works perfectly! Zero code changes needed to the Store implementation. Users can now use `{$store.count}` directly in templates with full reactivity.

---

## Implementation Plan

### Step 1: Fix Subscription API (Low Risk) ✅ COMPLETED
1. ✅ Test if `$store` syntax works with current Store implementation
2. ✅ If yes: Document in API docs
3. ✅ Update user-demo to verify (Counter.svelte and counters page)
4. ⏳ Update all examples to use `$store` syntax (deferred to Step 3)

**Status:** COMPLETE - `$store` syntax works perfectly with zero code changes!
**Actual Time:** ~30 minutes

### Step 2: Fix Component Build (High Risk) 🔄 IN PROGRESS
1. ✅ Install `@sveltejs/package`
2. ⏳ Create `svelte.config.js` for the package
3. ⏳ Update `package.json`:
   - Change build script to use `svelte-package`
   - Update `exports` field for proper subpath exports
4. ⏳ Test build output structure
5. ⏳ Update user-demo to test component imports
6. ⏳ Update all examples if needed
7. ⏳ Verify TypeScript types work correctly

**Status:** Package installed, ready to configure
**Time Estimate:** 4-8 hours

### Step 3: Documentation & Testing
1. Document new subscription API pattern
2. Update CLAUDE.md with correct build approach
3. Add real-world consumer testing to CI (test installed package, not source)
4. Create migration guide if needed

**Time Estimate:** 2-4 hours

---

## Success Criteria

- [ ] External consumers can import and use Svelte components from the library
- [ ] No `Cannot read properties of undefined` errors
- [ ] No 500 errors when importing components
- [ ] Subscription API is one line: `$store.field`
- [ ] All 72+ components importable and functional
- [ ] TypeScript types work correctly
- [ ] `_client_tests/user-demo` works without errors
- [ ] Examples still work
- [ ] Build size reasonable (< 500KB for full library)

---

## Risks & Mitigations

**Risk 1: `@sveltejs/package` breaks existing setup**
- Mitigation: Create branch, test thoroughly before merging
- Mitigation: Keep examples working as reference

**Risk 2: `$store` auto-subscription doesn't work in Svelte 5**
- Mitigation: Fall back to Option B (`useStore()` helper)
- Mitigation: Still better than current manual subscription

**Risk 3: Build output too large**
- Mitigation: Analyze bundle, consider splitting core vs components
- Mitigation: Tree-shaking should help with individual component imports

---

## Questions to Answer

1. ✅ Does our current `subscribe()` match Svelte store contract?
   - **Answer:** Yes! Returns `() => void`, immediately calls listener with current state

2. ✅ Does Svelte 5 `$` syntax work with custom stores?
   - **Answer:** YES! Tested in user-demo, works perfectly with zero changes

3. ⏳ Will `@sveltejs/package` preserve our current exports?
   - **Status:** Need to test build output structure

4. ✅ Do we need separate packages for core vs components?
   - **Decision:** Single package using `@sveltejs/package` for everything

---

## Next Steps

1. ✅ **COMPLETED:** Test `$store` syntax with current Store - IT WORKS!
2. ✅ **COMPLETED:** Update user-demo (Counter.svelte and counters page)
3. 🔄 **IN PROGRESS:** Implement `@sveltejs/package` migration
   - Install package ✅
   - Create svelte.config.js ⏳
   - Update package.json ⏳
   - Test build ⏳
4. **NEXT:** Update all examples to use `$store` syntax
5. **FINALLY:** Comprehensive testing with user-demo and publish v0.3.0

---

## Notes

- This is CRITICAL for v0.3.0 release
- Current v0.2.1 is broken for external consumers
- Do NOT publish until this is fixed
- Consider unpublishing v0.2.1 if possible (or deprecate with warning)

