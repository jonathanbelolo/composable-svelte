# Critical Lesson: All State Must Be in the Store

**Date**: November 4, 2025
**Context**: Caught local `$state` in components during file system demo

---

## The Mistake

Initial implementation had local component state:

```svelte
<!-- ❌ WRONG - Not testable -->
<script lang="ts">
  let isRenaming = $state(false);
  let newName = $state('');

  function startRename() {
    newName = folder.name;
    isRenaming = true;
  }
</script>
```

**Problem**: This state cannot be tested with TestStore. You have to mount components and simulate user interactions.

---

## The Fix

Move ALL state to the store:

### State Types
```typescript
// ✅ CORRECT - State in store
export interface FolderNode {
  type: 'folder';
  id: string;
  name: string;
  isExpanded: boolean;
  isRenaming: boolean;      // ← UI state in store
  renameDraft: string;      // ← Draft text in store
  children: FileSystemNode[];
}
```

### Actions
```typescript
// ✅ CORRECT - Actions for all state changes
export type FileSystemAction =
  | { type: 'startRename'; id: string }
  | { type: 'updateRenameDraft'; id: string; draft: string }
  | { type: 'commitRename'; id: string }
  | { type: 'cancelRename'; id: string };
```

### Reducer
```typescript
// ✅ CORRECT - Reducer handles all state transitions
case 'startRename': {
  return updateNode(state.root, action.id, (node) => ({
    ...node,
    isRenaming: true,
    renameDraft: node.name
  }));
}

case 'updateRenameDraft': {
  return updateNode(state.root, action.id, (node) => ({
    ...node,
    renameDraft: action.draft
  }));
}

case 'commitRename': {
  return updateNode(state.root, action.id, (node) => ({
    ...node,
    name: node.renameDraft.trim() || node.name,
    isRenaming: false,
    renameDraft: ''
  }));
}
```

### Component
```svelte
<!-- ✅ CORRECT - Component reads from store, dispatches actions -->
<script lang="ts">
  let folder = $derived(findNode($store.root, folderId));
</script>

{#if folder.isRenaming}
  <input
    value={folder.renameDraft}
    oninput={(e) => store.dispatch({
      type: 'updateRenameDraft',
      id: folderId,
      draft: e.currentTarget.value
    })}
    onblur={() => store.dispatch({ type: 'commitRename', id: folderId })}
  />
{:else}
  <span ondblclick={() => store.dispatch({ type: 'startRename', id: folderId })}>
    {folder.name}
  </span>
{/if}
```

---

## Why This Matters: Testability

### Without Store State (Component State)

```typescript
// ❌ Cannot test with TestStore - need to mount component
import { render, fireEvent } from '@testing-library/svelte';

test('rename folder', async () => {
  const { getByText, getByRole } = render(Folder, { props: { ... } });

  // Simulate user interactions
  const folderName = getByText('Projects');
  await fireEvent.dblClick(folderName);

  const input = getByRole('textbox');
  await fireEvent.input(input, { target: { value: 'My Projects' } });
  await fireEvent.blur(input);

  expect(getByText('My Projects')).toBeInTheDocument();
});
```

**Problems**:
- ❌ Slow - mounting components
- ❌ Brittle - depends on DOM structure
- ❌ Integration test - not unit test
- ❌ Hard to test edge cases
- ❌ Can't test reducer logic in isolation

### With Store State (Correct Approach)

```typescript
// ✅ Test with TestStore - fast, pure, exhaustive
import { TestStore } from '@composable-svelte/core';

test('rename folder', async () => {
  const store = new TestStore({
    initialState: {
      root: [{
        type: 'folder',
        id: 'projects',
        name: 'Projects',
        isRenaming: false,
        renameDraft: '',
        children: []
      }],
      nextId: 1
    },
    reducer: fileSystemReducer
  });

  // Test state transitions directly
  await store.send({ type: 'startRename', id: 'projects' }, (state) => {
    const folder = findNode(state.root, 'projects');
    expect(folder.isRenaming).toBe(true);
    expect(folder.renameDraft).toBe('Projects');
  });

  await store.send({ type: 'updateRenameDraft', id: 'projects', draft: 'My Projects' }, (state) => {
    const folder = findNode(state.root, 'projects');
    expect(folder.renameDraft).toBe('My Projects');
    expect(folder.name).toBe('Projects'); // Name not changed yet
  });

  await store.send({ type: 'commitRename', id: 'projects' }, (state) => {
    const folder = findNode(state.root, 'projects');
    expect(folder.name).toBe('My Projects'); // Name updated
    expect(folder.isRenaming).toBe(false);
    expect(folder.renameDraft).toBe('');
  });
});

test('cancel rename', async () => {
  // Easy to test edge cases
  const store = new TestStore({ /* ... */ });

  await store.send({ type: 'startRename', id: 'projects' });
  await store.send({ type: 'updateRenameDraft', id: 'projects', draft: 'Different' });
  await store.send({ type: 'cancelRename', id: 'projects' }, (state) => {
    const folder = findNode(state.root, 'projects');
    expect(folder.name).toBe('Projects'); // Original name preserved
    expect(folder.isRenaming).toBe(false);
  });
});

test('commit empty draft keeps original name', async () => {
  const store = new TestStore({ /* ... */ });

  await store.send({ type: 'startRename', id: 'projects' });
  await store.send({ type: 'updateRenameDraft', id: 'projects', draft: '   ' });
  await store.send({ type: 'commitRename', id: 'projects' }, (state) => {
    const folder = findNode(state.root, 'projects');
    expect(folder.name).toBe('Projects'); // Empty draft → keep original
  });
});
```

**Benefits**:
- ✅ Fast - pure functions, no DOM
- ✅ Clear - tests state transitions directly
- ✅ Unit tests - reducer logic in isolation
- ✅ Easy edge cases - just send actions
- ✅ Exhaustive - TestStore ensures no extra effects

---

## The Core Principle

> **ALL application state must live in the store, including UI state like "is this field editing?" or "what's the draft text?"**

### What Counts as State?

**❌ Do NOT use `$state` for**:
- Form field values
- Whether something is editing
- Draft text before commit
- Whether a modal is open
- Loading states
- Error messages
- Selected items
- Expanded/collapsed state
- Any state that affects UI behavior

**✅ You CAN use `$derived` for**:
- Computing values from store state
- Filtering/mapping store data
- Formatting for display

**✅ You CAN use local variables for**:
- Event handlers that immediately dispatch
- References to DOM elements (`bind:this`)
- Constants that never change

---

## Why This is Non-Negotiable

### 1. Testability is THE Core Value

Composable architecture's entire value proposition is:
- **Predictable state** - pure reducers
- **Testable in isolation** - TestStore
- **Exhaustive testing** - send/receive pattern

With component state, you lose all of this.

### 2. Time Travel Debugging

If all state is in the store, you can:
- Record action history
- Replay actions
- Inspect state at any point
- Undo/redo for free

With component state, debugging is:
- Scattered across components
- Can't inspect or replay
- Hard to reproduce bugs

### 3. State Persistence

If all state is in the store:
- Serialize entire app state to JSON
- Save to localStorage/URL
- Restore exact state

With component state:
- State scattered, can't serialize
- Lose state on refresh
- Can't share state via URL

### 4. Predictability

If all state is in the store:
- One source of truth
- Clear data flow
- Action → Reducer → New State

With component state:
- Multiple sources of truth
- Unclear data flow
- Bugs from state inconsistency

---

## Common Objections

### "But it's just temporary UI state!"

**Response**: UI state IS application state. If it affects what the user sees, it belongs in the store.

Example: "isRenaming" affects whether you show an input or span. That's behavioral state, not just display.

### "But that's a lot of boilerplate!"

**Response**: The "boilerplate" is what makes it testable. Compare:

**Component state**: 2 lines, 50 lines of brittle component tests
**Store state**: 10 lines, 5 lines of fast unit tests

The investment is worth it.

### "But Counter has $derived!"

**Response**: `$derived` is fine - it **computes** from store state, doesn't create new state:

```typescript
// ✅ OK - derives from store state
let isLoading = $derived($store.status === 'loading');

// ❌ NOT OK - creates new state
let draftText = $state('');
```

---

## The Rule

**Before adding `$state` to a component, ask:**
1. **"Does this affect application behavior?"** → Store
2. **"Do I want to test this?"** → Store
3. **"Could this be saved/restored?"** → Store
4. **"Does it control what the user sees?"** → Store

**If any answer is "yes", it goes in the store.**

---

## Example: Form with Validation

### ❌ Wrong

```svelte
<script lang="ts">
  let email = $state('');           // ❌ Component state
  let emailError = $state('');      // ❌ Component state
  let isSubmitting = $state(false); // ❌ Component state
</script>
```

### ✅ Correct

```typescript
// Store state
interface FormState {
  email: string;
  emailError: string | null;
  isSubmitting: boolean;
}

type FormAction =
  | { type: 'updateEmail'; value: string }
  | { type: 'submit' }
  | { type: 'submitSuccess' }
  | { type: 'submitError'; error: string };

// Reducer
const formReducer: Reducer<FormState, FormAction> = (state, action) => {
  switch (action.type) {
    case 'updateEmail':
      return [{
        ...state,
        email: action.value,
        emailError: validateEmail(action.value)
      }, Effect.none()];

    case 'submit':
      if (state.emailError) return [state, Effect.none()];
      return [
        { ...state, isSubmitting: true },
        Effect.run(async (dispatch) => {
          try {
            await api.submitForm(state.email);
            dispatch({ type: 'submitSuccess' });
          } catch (e) {
            dispatch({ type: 'submitError', error: e.message });
          }
        })
      ];
    // ... other cases
  }
};
```

```svelte
<!-- Component -->
<script lang="ts">
  export let store: Store<FormState, FormAction>;
</script>

<input
  type="email"
  value={$store.email}
  oninput={(e) => store.dispatch({ type: 'updateEmail', value: e.currentTarget.value })}
  disabled={$store.isSubmitting}
/>

{#if $store.emailError}
  <span class="error">{$store.emailError}</span>
{/if}

<button
  onclick={() => store.dispatch({ type: 'submit' })}
  disabled={$store.isSubmitting || $store.emailError}
>
  Submit
</button>
```

**Now testable**:
```typescript
test('validates email', async () => {
  const store = new TestStore({ /* ... */ });

  await store.send({ type: 'updateEmail', value: 'invalid' }, (state) => {
    expect(state.emailError).toBe('Invalid email');
  });

  await store.send({ type: 'updateEmail', value: 'valid@example.com' }, (state) => {
    expect(state.emailError).toBeNull();
  });
});
```

---

## Conclusion

**This is not negotiable. All state in the store.**

- If you find yourself using `$state` in components, stop and refactor
- If a PR has component state, request changes
- If the docs show component state, update them

**Testability is the entire point of this architecture.**

Without it, we're just writing Redux with extra steps.

---

## Checklist

Before committing component code, verify:

- [ ] No `$state` declarations (except for DOM refs)
- [ ] All state lives in store types
- [ ] All state changes via actions
- [ ] Component only has `$derived` (computing from store)
- [ ] Tests use TestStore, not component mounting

**If any item fails, refactor before committing.**
