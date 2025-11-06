# Composable Svelte Front-End Coding Skill

This skill provides comprehensive guidance for writing production-quality Composable Svelte applications, covering core patterns, components, testing, and common pitfalls.

---

## I. CRITICAL RULES (Non-Negotiable)

### Rule 1: ALL State Must Be in the Store

**Principle**: Every piece of application state, including UI state, MUST live in the store. This is non-negotiable for testability.

#### ❌ WRONG - Component State
```svelte
<script lang="ts">
  let isEditing = $state(false);      // ❌ Not testable
  let draftText = $state('');         // ❌ Not testable
  let showModal = $state(false);      // ❌ Not testable
</script>
```

#### ✅ CORRECT - Store State
```typescript
// State in store
interface TodoState {
  text: string;
  isEditing: boolean;     // ✅ Testable with TestStore
  draftText: string;      // ✅ Testable with TestStore
}

type TodoAction =
  | { type: 'startEdit' }
  | { type: 'updateDraft'; draft: string }
  | { type: 'commitEdit' };
```

**WHY**: Component state cannot be tested with TestStore. You'd need to mount components and simulate clicks. Store state can be tested with pure functions and send/receive pattern.

**What Counts as State?**
- ❌ NO `$state` for: Form values, editing flags, draft text, modal open/close, loading states, selected items, expanded/collapsed state
- ✅ YES `$derived` for: Computing values from store, filtering/mapping, formatting for display
- ✅ YES local vars for: DOM refs (`bind:this`), constants

---

### Rule 2: Pragmatic Abstraction

**Principle**: Different data structures need different patterns. Apply abstraction where value is high, use simple helpers elsewhere.

#### Decision Matrix

| Structure | Pattern | Why |
|-----------|---------|-----|
| Flat collections (todos, counters) | `forEach` + `scopeToElement` | Items independent, isolation valuable (92% boilerplate reduction) |
| Recursive trees (folders, org charts) | Helper functions + `store + ID` | Relationships matter, structure explicit |
| Optional children (modals, sheets) | `ifLet` + `PresentationAction` | State-driven navigation |
| Permanent children (sections) | `scope()` + `combineReducers` | Clear boundaries |

**WHY**: Composable Architecture's value comes from predictability and testability, not uniformity. Use the right tool for each structure.

---

### Rule 3: State-Driven Animations Only

**Principle**: Component lifecycle animations MUST use Motion One + PresentationState. NO CSS transitions for UI interactions.

#### Animation Decision Tree
```
Does component have animation?
├─ NO → No animation system needed
└─ YES → What kind?
    ├─ Infinite loop (spinner, shimmer) → CSS @keyframes ONLY
    ├─ Hover/focus/click → NO TRANSITION (instant visual feedback)
    └─ Lifecycle (appear/disappear/expand/collapse) → Motion One + PresentationState
```

#### ❌ WRONG - CSS Transitions
```css
.button {
  transition: background-color 0.2s; /* ❌ REMOVED */
}

.modal {
  transition: opacity 0.3s; /* ❌ Not state-driven, not testable */
}
```

#### ✅ CORRECT - State-Driven with Motion One
```typescript
interface ModalState {
  content: Content | null;
  presentation: PresentationState<Content>;
}

// Reducer manages lifecycle
case 'show':
  return [
    {
      ...state,
      content,
      presentation: { status: 'presenting', content, duration: 0.3 }
    },
    Effect.afterDelay(300, (d) => d({
      type: 'presentation',
      event: { type: 'presentationCompleted' }
    }))
  ];

// Component executes animation
$effect(() => {
  if (store.state.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
});
```

**WHY**: State-driven animations are predictable, testable with TestStore, and composable with the navigation system.

---

## II. CORE ARCHITECTURE

### Store Auto-Subscription Pattern

**IMPORTANT**: Stores implement Svelte's store contract via the `subscribe()` method. This means you can use Svelte's `$store` syntax for automatic subscription - **ZERO boilerplate!**

#### ✅ CORRECT - Auto-Subscription (Recommended)

```svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';

  const store = createStore({
    initialState: { count: 0, isLoading: false },
    reducer: counterReducer,
    dependencies: { api }
  });

  // Use $store directly - automatic subscription!
  const displayText = $derived(`Count: ${$store.count}`);
</script>

{#if $store.isLoading}
  <p>Loading...</p>
{:else}
  <p>{displayText}</p>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    Increment
  </button>
{/if}
```

#### ❌ WRONG - Manual Subscription (Unnecessary)

```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const store = createStore({...});

  // ❌ Unnecessary manual subscription
  let state = $state(store.state);
  let unsubscribe: (() => void) | null = null;

  onMount(() => {
    unsubscribe = store.subscribe((newState) => {
      state = newState;
    });
  });

  onDestroy(() => {
    unsubscribe?.();
  });

  // Using local state variable
  const displayText = $derived(`Count: ${state.count}`);
</script>

{#if state.isLoading}
  <p>Loading...</p>
{/if}
```

**Why `$store` Works**: The store implements Svelte's store contract with a `subscribe()` method that takes a callback and returns an unsubscribe function. Svelte's compiler automatically handles subscription/unsubscription when you use the `$` prefix.

**When to Use Manual Subscription**: Only when you need to transform or wrap the store for specific integration patterns (e.g., form reactive wrappers). For normal component usage, always use `$store`.

---

### Pattern 1: Store-Reducer-Effect Trinity

The fundamental pattern for every feature.

#### Complete Template

```typescript
// 1. Define State (ALL application state)
interface FeatureState {
  items: Item[];
  isLoading: boolean;
  error: string | null;
  selectedId: string | null;
}

// 2. Define Actions (Discriminated Union)
type FeatureAction =
  | { type: 'loadItems' }
  | { type: 'itemsLoaded'; items: Item[] }
  | { type: 'loadFailed'; error: string }
  | { type: 'selectItem'; id: string }
  | { type: 'clearSelection' };

// 3. Define Dependencies
interface FeatureDependencies {
  api: APIClient;
  clock: Clock;
}

// 4. Reducer (Pure Function)
const featureReducer: Reducer<FeatureState, FeatureAction, FeatureDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'loadItems':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          const result = await deps.api.get<Item[]>('/items');
          if (result.ok) {
            dispatch({ type: 'itemsLoaded', items: result.data });
          } else {
            dispatch({ type: 'loadFailed', error: result.error });
          }
        })
      ];

    case 'itemsLoaded':
      return [
        { ...state, items: action.items, isLoading: false },
        Effect.none()
      ];

    case 'loadFailed':
      return [
        { ...state, error: action.error, isLoading: false },
        Effect.none()
      ];

    case 'selectItem':
      return [
        { ...state, selectedId: action.id },
        Effect.none()
      ];

    case 'clearSelection':
      return [
        { ...state, selectedId: null },
        Effect.none()
      ];

    default:
      // Exhaustiveness check
      const _never: never = action;
      return [state, Effect.none()];
  }
};

// 5. Component
// Feature.svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { featureReducer } from './reducer';

  const store = createStore({
    initialState: {
      items: [],
      isLoading: false,
      error: null,
      selectedId: null
    },
    reducer: featureReducer,
    dependencies: {
      api: createAPIClient(),
      clock: new SystemClock()
    }
  });

  // Load on mount
  $effect(() => {
    store.dispatch({ type: 'loadItems' });
  });
</script>

{#if $store.isLoading}
  <p>Loading...</p>
{:else if $store.error}
  <p class="error">{$store.error}</p>
{:else}
  <ul>
    {#each $store.items as item (item.id)}
      <li
        class:selected={$store.selectedId === item.id}
        onclick={() => store.dispatch({ type: 'selectItem', id: item.id })}
      >
        {item.name}
      </li>
    {/each}
  </ul>
{/if}
```

#### Checklist
- [ ] State interface defines ALL application state
- [ ] Actions are discriminated union with `type` field
- [ ] Reducer is pure function (no side effects)
- [ ] Immutable updates (`{ ...state, field: newValue }`)
- [ ] Effects return data structures, not executed in reducer
- [ ] Exhaustiveness check in default case
- [ ] Component has NO `$state` for application state
- [ ] Component reads from `$store`, dispatches actions

---

### Pattern 2: Effect System (12 Types)

#### Effect Decision Tree

```
What kind of side effect do you need?
│
├─ Pure state update → Effect.none()
├─ Async operation that dispatches → Effect.run()
├─ Fire-and-forget (analytics, logging) → Effect.fireAndForget()
├─ Multiple parallel effects → Effect.batch()
├─ Cancel previous effect → Effect.cancel() + Effect.cancellable()
├─ Delay user input (search-as-you-type) → Effect.debounced()
├─ Limit frequency (scroll events) → Effect.throttled()
├─ Wait before dispatching → Effect.afterDelay()
├─ Long-running (WebSocket, SSE) → Effect.subscription()
├─ Animation timing → Effect.animated()
└─ PresentationState lifecycle → Effect.transition()
```

#### Effect.none() - Pure State Update
```typescript
case 'selectItem':
  return [
    { ...state, selectedId: action.id },
    Effect.none() // No side effects
  ];
```

#### Effect.run() - Async with Dispatch
```typescript
case 'loadData':
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      const result = await api.getData();
      if (result.ok) {
        dispatch({ type: 'dataLoaded', data: result.data });
      } else {
        dispatch({ type: 'loadFailed', error: result.error });
      }
    })
  ];
```

#### Effect.fireAndForget() - No Dispatch Needed
```typescript
case 'buttonClicked':
  return [
    { ...state, clickCount: state.clickCount + 1 },
    Effect.fireAndForget(async () => {
      await analytics.track('button_clicked');
    })
  ];
```

#### Effect.batch() - Multiple Parallel Effects
```typescript
case 'pageLoaded':
  return [
    { ...state, isLoading: true },
    Effect.batch(
      Effect.run(async (d) => {
        const user = await api.getUser();
        d({ type: 'userLoaded', user });
      }),
      Effect.run(async (d) => {
        const settings = await api.getSettings();
        d({ type: 'settingsLoaded', settings });
      })
    )
  ];
```

#### Effect.debounced() - Search as You Type
```typescript
case 'searchTextChanged':
  return [
    { ...state, searchText: action.text },
    Effect.debounced('search', 300, async (dispatch) => {
      const results = await api.search(action.text);
      dispatch({ type: 'searchResults', results });
    })
  ];
```

#### Effect.cancellable() - Cancel Previous Request
```typescript
case 'search':
  return [
    { ...state, query: action.query, isSearching: true },
    Effect.cancellable('search-request', async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'searchCompleted', results });
    })
  ];

case 'clearSearch':
  return [
    { ...state, query: '', results: [], isSearching: false },
    Effect.cancel('search-request')
  ];
```

#### Effect.throttled() - Limit Frequency
```typescript
case 'scrolled':
  return [
    { ...state, scrollY: action.y },
    Effect.throttled('scroll-handler', 100, async (dispatch) => {
      // Heavy computation
      const visibleItems = computeVisibleItems(action.y);
      dispatch({ type: 'visibleItemsChanged', items: visibleItems });
    })
  ];
```

#### Effect.afterDelay() - Timed Dispatch
```typescript
case 'showToast':
  return [
    { ...state, toast: action.message },
    Effect.afterDelay(3000, (dispatch) => {
      dispatch({ type: 'hideToast' });
    })
  ];
```

#### Effect.subscription() - Long-Running
```typescript
case 'connectWebSocket':
  return [
    { ...state, connectionStatus: 'connecting' },
    Effect.subscription('ws', (dispatch) => {
      const ws = new WebSocket('wss://api.example.com');

      ws.onopen = () => {
        dispatch({ type: 'connected' });
      };

      ws.onmessage = (event) => {
        dispatch({ type: 'messageReceived', data: JSON.parse(event.data) });
      };

      // Cleanup function
      return () => {
        ws.close();
      };
    })
  ];

case 'disconnect':
  return [
    { ...state, connectionStatus: 'disconnected' },
    Effect.cancel('ws')
  ];
```

#### Effect.transition() - PresentationState Lifecycle

**Best for**: PresentationState-based animations (modals, sheets, drawers)

**What it does**: Returns `{ present, dismiss }` effects configured with durations. Simplifies PresentationState lifecycle management.

```typescript
// Define transition once
const transition = Effect.transition({
  presentDuration: 300,
  dismissDuration: 200,
  createPresentationEvent: (event) => ({
    type: 'presentation',
    event
  })
});

// Use in reducer
case 'showModal':
  return [
    {
      ...state,
      content,
      presentation: { status: 'presenting', content, duration: 0.3 }
    },
    transition.present  // Dispatches presentationCompleted after 300ms
  ];

case 'hideModal':
  return [
    {
      ...state,
      presentation: { status: 'dismissing', content: state.presentation.content, duration: 0.2 }
    },
    transition.dismiss  // Dispatches dismissalCompleted after 200ms
  ];

case 'presentation':
  if (action.event.type === 'presentationCompleted') {
    return [
      { ...state, presentation: { status: 'presented', content: state.presentation.content } },
      Effect.none()
    ];
  }
  if (action.event.type === 'dismissalCompleted') {
    return [
      { ...state, content: null, presentation: { status: 'idle' } },
      Effect.none()
    ];
  }
  return [state, Effect.none()];
```

**Why use transition()**: Cleaner than manual `Effect.afterDelay()` for PresentationState. Encapsulates the timing logic.

---

### Pattern 3: Composition Strategies

#### Strategy 1: scope() - Permanent Child

**When**: Child is always present (counter in app, settings panel, permanent UI section)

```typescript
// Parent state
interface AppState {
  counter: CounterState;
  theme: 'light' | 'dark';
}

// Parent actions
type AppAction =
  | { type: 'counter'; action: CounterAction }
  | { type: 'toggleTheme' };

// Compose with scope()
import { scope } from '@composable-svelte/core';

const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  switch (action.type) {
    case 'counter':
      // Delegate to child via scope()
      return scope(
        (s) => s.counter,                    // Get child state
        (s, c) => ({ ...s, counter: c }),    // Set child state
        (a) => a.type === 'counter' ? a.action : null, // Extract child action
        (ca) => ({ type: 'counter', action: ca }),     // Lift child action
        counterReducer
      )(state, action, deps);

    case 'toggleTheme':
      return [
        { ...state, theme: state.theme === 'light' ? 'dark' : 'light' },
        Effect.none()
      ];

    default:
      const _never: never = action;
      return [state, Effect.none()];
  }
};
```

#### Strategy 2: ifLet() - Optional Child (Navigation)

**When**: Child may or may not be present (modal, sheet, drawer, detail view)

```typescript
// Parent state
interface AppState {
  items: Item[];
  destination: AddItemState | null; // Optional child
}

// Parent actions
type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

// Reducer
import { ifLetPresentation } from '@composable-svelte/core';

case 'addButtonTapped':
  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];

case 'destination': {
  // Handle dismiss
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Compose child
  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    (ca): AppAction => ({ type: 'destination', action: { type: 'presented', action: ca } }),
    addItemReducer
  )(state, action, deps);

  // Parent observes child completion
  if ('action' in action &&
      action.action.type === 'presented' &&
      action.action.action.type === 'saveButtonTapped') {
    const item = newState.destination!;
    return [
      {
        ...newState,
        destination: null, // Dismiss
        items: [...newState.items, { id: crypto.randomUUID(), ...item }]
      },
      effect
    ];
  }

  return [newState, effect];
}
```

#### Strategy 3: forEach() - Flat Collection

**When**: Independent items that don't know about each other (todo list, product grid)

```typescript
// State
interface TodosState {
  todos: TodoState[];
}

interface TodoState {
  id: string;
  text: string;
  completed: boolean;
}

type TodoAction =
  | { type: 'toggle' }
  | { type: 'delete' };

// Single todo reducer
const todoReducer: Reducer<TodoState, TodoAction> = (state, action) => {
  switch (action.type) {
    case 'toggle':
      return [{ ...state, completed: !state.completed }, Effect.none()];
    case 'delete':
      // Parent will handle removal
      return [state, Effect.none()];
    default:
      return [state, Effect.none()];
  }
};

// Collection reducer with forEach()
import { integrate } from '@composable-svelte/core';

const todosReducer = integrate<TodosState, any, Deps>()
  .forEach('todo', s => s.todos, (s, todos) => ({ ...s, todos }), todoReducer)
  .build();

// Component
import { scopeToElement } from '@composable-svelte/core';

{#each $store.todos as todo (todo.id)}
  {@const todoStore = scopeToElement(store, 'todo', todo.id)}
  <Todo store={todoStore} />
{/each}
```

#### Strategy 4: combineReducers() - Multiple Slices

**When**: Multiple independent sections sharing the same action type (Redux-style slices)

```typescript
import { combineReducers } from '@composable-svelte/core';

interface AppState {
  user: UserState;
  posts: PostsState;
  comments: CommentsState;
}

const appReducer = combineReducers<AppState, AppAction>({
  user: userReducer,
  posts: postsReducer,
  comments: commentsReducer
});
```

#### Strategy 5: Tree Utilities - Recursive Structures

**When**: Hierarchical data with parent-child relationships (file systems, org charts, nested menus)

**Why NOT forEach**: Trees have relationships between nodes, structure needs to be explicit. Per DESIGN-PRINCIPLES.md, use simple helpers over complex abstractions for trees.

```typescript
// 1. Define tree node types
type FileNode = { type: 'file'; id: string; name: string };
type FolderNode = { type: 'folder'; id: string; name: string; children: Node[]; isExpanded: boolean };
type Node = FileNode | FolderNode;

// 2. Create tree helpers
import { createTreeHelpers } from '@composable-svelte/core/utils/tree';

const treeHelpers = createTreeHelpers<Node>({
  getId: (node) => node.id,
  getChildren: (node) => node.type === 'folder' ? node.children : undefined,
  setChildren: (node, children) =>
    node.type === 'folder' ? { ...node, children } : node
});

// 3. Use in reducer with node ID
interface FileSystemState {
  root: Node[];
  selectedId: string | null;
}

type FileSystemAction =
  | { type: 'toggleExpand'; folderId: string }
  | { type: 'renameNode'; nodeId: string; newName: string }
  | { type: 'deleteNode'; nodeId: string };

const fileSystemReducer: Reducer<FileSystemState, FileSystemAction> = (state, action) => {
  switch (action.type) {
    case 'toggleExpand': {
      const updated = treeHelpers.updateNode(state.root, action.folderId, (node) =>
        node.type === 'folder' ? { ...node, isExpanded: !node.isExpanded } : node
      );
      return [{ ...state, root: updated || state.root }, Effect.none()];
    }

    case 'renameNode': {
      const updated = treeHelpers.updateNode(state.root, action.nodeId, (node) => ({
        ...node,
        name: action.newName
      }));
      return [{ ...state, root: updated || state.root }, Effect.none()];
    }

    case 'deleteNode': {
      const updated = treeHelpers.deleteNode(state.root, action.nodeId);
      return [{ ...state, root: updated || state.root }, Effect.none()];
    }

    default:
      return [state, Effect.none()];
  }
};

// 4. Component passes ID, not scoped store
// Folder.svelte
<script lang="ts">
  export let store: Store<FileSystemState, FileSystemAction>;
  export let folderId: string;  // Component knows its ID

  const folder = $derived(treeHelpers.findNode($store.root, folderId) as FolderNode);
</script>

<div>
  <button onclick={() => store.dispatch({ type: 'toggleExpand', folderId })}>
    {folder.isExpanded ? '▼' : '▶'}
  </button>
  <span>{folder.name}</span>

  {#if folder.isExpanded}
    <div class="children">
      {#each folder.children as child (child.id)}
        {#if child.type === 'folder'}
          <svelte:self store={store} folderId={child.id} />
        {:else}
          <File store={store} fileId={child.id} />
        {/if}
      {/each}
    </div>
  {/if}
</div>
```

**Key Helpers**:
- `findNode(nodes, id)` - Find node by ID (depth-first search)
- `updateNode(nodes, id, updater)` - Immutably update node
- `deleteNode(nodes, id)` - Immutably delete node
- `addChild(nodes, parentId, child)` - Add child to parent

**Decision**: Use tree helpers when:
- Nodes have parent-child relationships
- Structure needs to be traversable (find parent of node)
- Knowing the ID is natural (recursive components)

**Avoid**: scopeToTreeNode or other complex abstractions - simple helpers provide 80% of value with 20% of complexity.

---

## III. NAVIGATION SYSTEM

### Tree-Based Navigation Pattern

**Core Principle**: Non-null state = presented, null = dismissed

#### State Structure

```typescript
// Parent state
interface AppState {
  items: Item[];
  destination: DestinationState | null; // What to show
}

// Destination is enum of possible screens
type DestinationState =
  | { type: 'addItem'; state: AddItemState }
  | { type: 'editItem'; state: EditItemState; itemId: string }
  | { type: 'confirmDelete'; state: ConfirmDeleteState; itemId: string };

// Child states
interface AddItemState {
  name: string;
  quantity: number;
}

interface EditItemState {
  name: string;
  quantity: number;
}

interface ConfirmDeleteState {
  itemName: string;
}
```

#### Actions

```typescript
type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'editButtonTapped'; itemId: string }
  | { type: 'deleteButtonTapped'; itemId: string }
  | { type: 'destination'; action: PresentationAction<DestinationAction> };

type DestinationAction =
  | { type: 'addItem'; action: AddItemAction }
  | { type: 'editItem'; action: EditItemAction }
  | { type: 'confirmDelete'; action: ConfirmDeleteAction };

// PresentationAction wraps child actions
type PresentationAction<A> =
  | { type: 'presented'; action: A }
  | { type: 'dismiss' };
```

#### Parent Observation Pattern

```typescript
case 'destination': {
  // Handle dismiss
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  // Route to child reducer based on destination type
  let newState = state;
  let effect: Effect<AppAction> = Effect.none();

  if (state.destination?.type === 'addItem' && 'action' in action && action.action.type === 'presented') {
    const [childState, childEffect] = addItemReducer(
      state.destination.state,
      action.action.action,
      deps
    );

    newState = {
      ...state,
      destination: { type: 'addItem', state: childState }
    };

    effect = Effect.map(childEffect, (childAction): AppAction => ({
      type: 'destination',
      action: { type: 'presented', action: { type: 'addItem', action: childAction } }
    }));

    // Observe child completion
    if (action.action.action.type === 'saveButtonTapped') {
      return [
        {
          ...newState,
          destination: null,
          items: [...newState.items, {
            id: crypto.randomUUID(),
            name: childState.name,
            quantity: childState.quantity
          }]
        },
        effect
      ];
    }
  }

  // Similar for editItem and confirmDelete...

  return [newState, effect];
}
```

### Scoping Stores for Navigation

```typescript
import { scopeToDestination } from '@composable-svelte/core';

// In component
const addItemStore = $derived(
  scopeToDestination(store, 'destination', 'addItem')
);

{#if addItemStore}
  <Modal open={true} onOpenChange={(open) => !open && addItemStore.dismiss()}>
    <AddItemForm store={addItemStore} />
  </Modal>
{/if}
```

### Navigation Components

- **Modal** - Full-screen overlay with backdrop
- **Sheet** - Bottom drawer (mobile-first), slides up
- **Drawer** - Side panel, slides from left/right
- **Alert** - Confirmation dialog, centered
- **Popover** - Contextual menu, positioned near trigger

### Complete Modal Example

```typescript
// State
interface AppState {
  user: User | null;
  editProfile: EditProfileState | null;
}

interface EditProfileState {
  name: string;
  email: string;
  bio: string;
}

// Actions
type AppAction =
  | { type: 'editProfileTapped' }
  | { type: 'destination'; action: PresentationAction<EditProfileAction> };

type EditProfileAction =
  | { type: 'nameChanged'; name: string }
  | { type: 'emailChanged'; email: string }
  | { type: 'bioChanged'; bio: string }
  | { type: 'saveButtonTapped' }
  | { type: 'cancelButtonTapped' };

// Reducer
case 'editProfileTapped':
  return [
    {
      ...state,
      editProfile: {
        name: state.user?.name || '',
        email: state.user?.email || '',
        bio: state.user?.bio || ''
      }
    },
    Effect.none()
  ];

case 'destination': {
  if (action.action.type === 'dismiss') {
    return [{ ...state, editProfile: null }, Effect.none()];
  }

  const [childState, childEffect] = editProfileReducer(
    state.editProfile!,
    action.action.action,
    deps
  );

  const newState = { ...state, editProfile: childState };
  const effect = Effect.map(childEffect, (ca): AppAction => ({
    type: 'destination',
    action: { type: 'presented', action: ca }
  }));

  // Observe save
  if (action.action.action.type === 'saveButtonTapped') {
    return [
      {
        ...newState,
        editProfile: null,
        user: {
          ...state.user!,
          name: childState.name,
          email: childState.email,
          bio: childState.bio
        }
      },
      Effect.batch(
        effect,
        Effect.run(async (d) => {
          await api.updateProfile(childState);
          d({ type: 'profileUpdated' });
        })
      )
    ];
  }

  // Observe cancel
  if (action.action.action.type === 'cancelButtonTapped') {
    return [{ ...newState, editProfile: null }, effect];
  }

  return [newState, effect];
}

// Component
<script lang="ts">
  import { Modal, Button } from '@composable-svelte/core/components';
  import { scopeToDestination } from '@composable-svelte/core';

  const editProfileStore = $derived(
    scopeToDestination(store, 'editProfile')
  );
</script>

<Button onclick={() => store.dispatch({ type: 'editProfileTapped' })}>
  Edit Profile
</Button>

{#if editProfileStore}
  <Modal
    open={true}
    onOpenChange={(open) => !open && editProfileStore.dismiss()}
  >
    <EditProfileForm store={editProfileStore} />
  </Modal>
{/if}
```

---

## IV. ANIMATION SYSTEM

### PresentationState Lifecycle

```
idle → presenting → presented → dismissing → idle
  ↑        ↓           ↓           ↓         ↑
  └────────┴───────────┴───────────┴─────────┘
```

#### PresentationState Type

```typescript
type PresentationState<Content> =
  | { status: 'idle' }
  | { status: 'presenting'; content: Content; duration: number }
  | { status: 'presented'; content: Content }
  | { status: 'dismissing'; content: Content; duration: number };

type PresentationEvent =
  | { type: 'presentationCompleted' }
  | { type: 'dismissalCompleted' };
```

### Complete Animated Modal Example

```typescript
// State
interface ModalState {
  content: ModalContent | null;
  presentation: PresentationState<ModalContent>;
}

interface ModalContent {
  title: string;
  message: string;
}

// Actions
type ModalAction =
  | { type: 'show'; content: ModalContent }
  | { type: 'hide' }
  | { type: 'presentation'; event: PresentationEvent };

// Reducer
const modalReducer: Reducer<ModalState, ModalAction> = (state, action) => {
  switch (action.type) {
    case 'show':
      // Guard: Don't show if already presenting/presented
      if (state.presentation.status !== 'idle') {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          content: action.content,
          presentation: {
            status: 'presenting',
            content: action.content,
            duration: 0.3
          }
        },
        Effect.afterDelay(300, (d) => d({
          type: 'presentation',
          event: { type: 'presentationCompleted' }
        }))
      ];

    case 'presentation':
      if (action.event.type === 'presentationCompleted' &&
          state.presentation.status === 'presenting') {
        return [
          {
            ...state,
            presentation: {
              status: 'presented',
              content: state.presentation.content
            }
          },
          Effect.none()
        ];
      }

      if (action.event.type === 'dismissalCompleted' &&
          state.presentation.status === 'dismissing') {
        return [
          {
            ...state,
            content: null,
            presentation: { status: 'idle' }
          },
          Effect.none()
        ];
      }

      return [state, Effect.none()];

    case 'hide':
      // Guard: Can only hide from 'presented'
      if (state.presentation.status !== 'presented') {
        return [state, Effect.none()];
      }

      return [
        {
          ...state,
          presentation: {
            status: 'dismissing',
            content: state.presentation.content,
            duration: 0.2
          }
        },
        Effect.afterDelay(200, (d) => d({
          type: 'presentation',
          event: { type: 'dismissalCompleted' }
        }))
      ];

    default:
      const _never: never = action;
      return [state, Effect.none()];
  }
};

// Component
<script lang="ts">
  import { animate } from 'motion';

  let dialogElement: HTMLElement;

  $effect(() => {
    if (store.state.presentation.status === 'presenting' && dialogElement) {
      animate(
        dialogElement,
        { opacity: [0, 1], scale: [0.95, 1] },
        { duration: 0.3, easing: 'ease-out' }
      ).finished.then(() => {
        store.dispatch({
          type: 'presentation',
          event: { type: 'presentationCompleted' }
        });
      });
    }

    if (store.state.presentation.status === 'dismissing' && dialogElement) {
      animate(
        dialogElement,
        { opacity: [1, 0], scale: [1, 0.95] },
        { duration: 0.2, easing: 'ease-in' }
      ).finished.then(() => {
        store.dispatch({
          type: 'presentation',
          event: { type: 'dismissalCompleted' }
        });
      });
    }
  });
</script>

{#if store.state.content}
  <div class="modal-backdrop">
    <dialog bind:this={dialogElement}>
      <h2>{store.state.content.title}</h2>
      <p>{store.state.content.message}</p>
      <button onclick={() => store.dispatch({ type: 'hide' })}>
        Close
      </button>
    </dialog>
  </div>
{/if}
```

### Animation Helpers

```typescript
import {
  animateModalIn,
  animateModalOut,
  animateSheetIn,
  animateSheetOut,
  animateAccordionExpand,
  animateAccordionCollapse
} from '@composable-svelte/core/animation';

// Usage
$effect(() => {
  if (store.state.presentation.status === 'presenting') {
    animateModalIn(element).then(() => {
      store.dispatch({
        type: 'presentation',
        event: { type: 'presentationCompleted' }
      });
    });
  }
});
```

### CSS @keyframes (Exceptions Only)

```css
/* ✅ ALLOWED - Infinite loop */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.spinner {
  animation: spin 1s linear infinite;
}

/* ✅ ALLOWED - Shimmer effect */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.skeleton {
  animation: shimmer 1.5s infinite;
}
```

---

## V. COMPONENT LIBRARY REFERENCE

### Navigation Components

**Purpose**: Overlay-based UI elements for state-driven navigation.

**Integration Pattern**: State-driven open/close via store, dismiss via PresentationAction

#### Modal
Full-screen overlay with backdrop, centered content.

```typescript
import { Modal } from '@composable-svelte/core/components';

const modalStore = $derived(scopeToDestination(store, 'destination', 'addItem'));

{#if modalStore}
  <Modal
    open={true}
    onOpenChange={(open) => !open && modalStore.dismiss()}
  >
    <ModalContent store={modalStore} />
  </Modal>
{/if}
```

#### Sheet
Bottom drawer that slides up (mobile-first).

```typescript
import { Sheet } from '@composable-svelte/core/components';

{#if sheetStore}
  <Sheet
    open={true}
    onOpenChange={(open) => !open && sheetStore.dismiss()}
  >
    <SheetContent store={sheetStore} />
  </Sheet>
{/if}
```

#### Drawer
Side panel that slides from left or right.

```typescript
import { Drawer } from '@composable-svelte/core/components';

{#if drawerStore}
  <Drawer
    side="left"
    open={true}
    onOpenChange={(open) => !open && drawerStore.dismiss()}
  >
    <DrawerContent store={drawerStore} />
  </Drawer>
{/if}
```

#### Alert
Confirmation dialog, centered, smaller than Modal.

```typescript
import { Alert } from '@composable-svelte/core/components';

{#if confirmStore}
  <Alert
    open={true}
    onOpenChange={(open) => !open && confirmStore.dismiss()}
  >
    <AlertTitle>Delete Item?</AlertTitle>
    <AlertDescription>This action cannot be undone.</AlertDescription>
    <AlertActions>
      <Button onclick={() => confirmStore.dismiss()}>Cancel</Button>
      <Button variant="destructive" onclick={() => confirmStore.dispatch({ type: 'confirm' })}>
        Delete
      </Button>
    </AlertActions>
  </Alert>
{/if}
```

#### Popover
Contextual menu positioned near trigger element.

```typescript
import { Popover, PopoverTrigger, PopoverContent } from '@composable-svelte/core/components';

<Popover open={$store.showMenu} onOpenChange={(open) => store.dispatch({ type: 'toggleMenu', open })}>
  <PopoverTrigger>
    <Button>Options</Button>
  </PopoverTrigger>
  <PopoverContent>
    <button onclick={() => store.dispatch({ type: 'edit' })}>Edit</button>
    <button onclick={() => store.dispatch({ type: 'delete' })}>Delete</button>
  </PopoverContent>
</Popover>
```

---

### Form Components

**Purpose**: User input elements that integrate with Composable Architecture.

**Integration Pattern**: Value from store.state, dispatch on change, validation state from store.

#### Input (Text)
```typescript
import { Input } from '@composable-svelte/core/components';

<Input
  type="text"
  value={$store.name}
  oninput={(e) => store.dispatch({ type: 'nameChanged', name: e.currentTarget.value })}
  placeholder="Enter name"
  disabled={$store.isSubmitting}
/>

{#if $store.nameError}
  <span class="error">{$store.nameError}</span>
{/if}
```

#### Select (Dropdown)
```typescript
import { Select, SelectTrigger, SelectContent, SelectItem } from '@composable-svelte/core/components';

<Select
  value={$store.category}
  onValueChange={(value) => store.dispatch({ type: 'categoryChanged', category: value })}
>
  <SelectTrigger>
    <SelectValue placeholder="Select category" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="electronics">Electronics</SelectItem>
    <SelectItem value="clothing">Clothing</SelectItem>
    <SelectItem value="food">Food</SelectItem>
  </SelectContent>
</Select>
```

#### Checkbox
```typescript
import { Checkbox } from '@composable-svelte/core/components';

<Checkbox
  checked={$store.agreeToTerms}
  onCheckedChange={(checked) => store.dispatch({ type: 'toggleTerms', checked })}
>
  I agree to the terms and conditions
</Checkbox>
```

#### RadioGroup
```typescript
import { RadioGroup, RadioGroupItem } from '@composable-svelte/core/components';

<RadioGroup
  value={$store.plan}
  onValueChange={(value) => store.dispatch({ type: 'planChanged', plan: value })}
>
  <RadioGroupItem value="free">Free</RadioGroupItem>
  <RadioGroupItem value="pro">Pro ($9/mo)</RadioGroupItem>
  <RadioGroupItem value="enterprise">Enterprise ($99/mo)</RadioGroupItem>
</RadioGroup>
```

#### Switch (Toggle)
```typescript
import { Switch } from '@composable-svelte/core/components';

<Switch
  checked={$store.notifications}
  onCheckedChange={(checked) => store.dispatch({ type: 'toggleNotifications', checked })}
>
  Enable notifications
</Switch>
```

#### Textarea
```typescript
import { Textarea } from '@composable-svelte/core/components';

<Textarea
  value={$store.bio}
  oninput={(e) => store.dispatch({ type: 'bioChanged', bio: e.currentTarget.value })}
  placeholder="Tell us about yourself"
  rows={4}
/>
```

#### Combobox (Autocomplete)
```typescript
import { Combobox } from '@composable-svelte/core/components';

<Combobox
  value={$store.selectedCity}
  options={$store.cityOptions}
  onValueChange={(value) => store.dispatch({ type: 'citySelected', city: value })}
  onSearchChange={(query) => store.dispatch({ type: 'citySearchChanged', query })}
  placeholder="Search cities..."
/>
```

#### Complete Form Example

```typescript
// State
interface ContactFormState {
  name: string;
  email: string;
  message: string;
  agreeToTerms: boolean;
  isSubmitting: boolean;
  errors: {
    name: string | null;
    email: string | null;
    message: string | null;
  };
}

// Actions
type ContactFormAction =
  | { type: 'nameChanged'; name: string }
  | { type: 'emailChanged'; email: string }
  | { type: 'messageChanged'; message: string }
  | { type: 'toggleTerms' }
  | { type: 'submit' }
  | { type: 'submitSuccess' }
  | { type: 'submitFailed'; error: string };

// Reducer
case 'nameChanged':
  return [
    {
      ...state,
      name: action.name,
      errors: { ...state.errors, name: action.name ? null : 'Name is required' }
    },
    Effect.none()
  ];

case 'submit':
  if (!state.agreeToTerms || state.errors.name || state.errors.email) {
    return [state, Effect.none()];
  }

  return [
    { ...state, isSubmitting: true },
    Effect.run(async (dispatch) => {
      try {
        await api.submitContact({
          name: state.name,
          email: state.email,
          message: state.message
        });
        dispatch({ type: 'submitSuccess' });
      } catch (e) {
        dispatch({ type: 'submitFailed', error: e.message });
      }
    })
  ];

// Component
<form onsubmit={(e) => { e.preventDefault(); store.dispatch({ type: 'submit' }); }}>
  <Input
    type="text"
    value={$store.name}
    oninput={(e) => store.dispatch({ type: 'nameChanged', name: e.currentTarget.value })}
    placeholder="Name"
  />
  {#if $store.errors.name}
    <span class="error">{$store.errors.name}</span>
  {/if}

  <Input
    type="email"
    value={$store.email}
    oninput={(e) => store.dispatch({ type: 'emailChanged', email: e.currentTarget.value })}
    placeholder="Email"
  />

  <Textarea
    value={$store.message}
    oninput={(e) => store.dispatch({ type: 'messageChanged', message: e.currentTarget.value })}
    placeholder="Message"
  />

  <Checkbox
    checked={$store.agreeToTerms}
    onCheckedChange={() => store.dispatch({ type: 'toggleTerms' })}
  >
    I agree to the terms
  </Checkbox>

  <Button type="submit" disabled={$store.isSubmitting}>
    {$store.isSubmitting ? 'Submitting...' : 'Submit'}
  </Button>
</form>
```

---

### Data Display Components

**Purpose**: Display data from store.state, often derived/computed.

**Integration Pattern**: Map from store.state arrays, use $derived for filtering/sorting.

#### Table
```typescript
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@composable-svelte/core/components';

<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {#each $store.users as user (user.id)}
      <TableRow>
        <TableCell>{user.name}</TableCell>
        <TableCell>{user.email}</TableCell>
        <TableCell>{user.status}</TableCell>
      </TableRow>
    {/each}
  </TableBody>
</Table>
```

#### Card
```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@composable-svelte/core/components';

{#each $store.products as product (product.id)}
  <Card>
    <CardHeader>
      <CardTitle>{product.name}</CardTitle>
      <CardDescription>{product.category}</CardDescription>
    </CardHeader>
    <CardContent>
      <p>${product.price}</p>
      <Button onclick={() => store.dispatch({ type: 'addToCart', productId: product.id })}>
        Add to Cart
      </Button>
    </CardContent>
  </Card>
{/each}
```

#### Badge
```typescript
import { Badge } from '@composable-svelte/core/components';

<Badge variant={$store.status === 'active' ? 'success' : 'secondary'}>
  {$store.status}
</Badge>
```

#### Avatar
```typescript
import { Avatar, AvatarImage, AvatarFallback } from '@composable-svelte/core/components';

<Avatar>
  <AvatarImage src={$store.user?.avatarUrl} alt={$store.user?.name} />
  <AvatarFallback>{$store.user?.initials}</AvatarFallback>
</Avatar>
```

---

### Feedback Components

**Purpose**: Communicate loading states, errors, and notifications.

**Integration Pattern**: Render based on loading/error/success state from store.

#### Toast (Notification)
```typescript
import { toast } from '@composable-svelte/core/components';

// In reducer
case 'itemAdded':
  return [
    { ...state, items: [...state.items, action.item] },
    Effect.fireAndForget(async () => {
      toast.success('Item added successfully');
    })
  ];

case 'itemDeleteFailed':
  return [
    { ...state, error: action.error },
    Effect.fireAndForget(async () => {
      toast.error('Failed to delete item');
    })
  ];
```

#### Progress
```typescript
import { Progress } from '@composable-svelte/core/components';

{#if $store.uploadProgress !== null}
  <Progress value={$store.uploadProgress} max={100} />
  <p>{$store.uploadProgress}% uploaded</p>
{/if}
```

#### Skeleton (Loading Placeholder)
```typescript
import { Skeleton } from '@composable-svelte/core/components';

{#if $store.isLoading}
  <Skeleton class="h-4 w-full mb-2" />
  <Skeleton class="h-4 w-3/4 mb-2" />
  <Skeleton class="h-4 w-1/2" />
{:else}
  <p>{$store.content}</p>
{/if}
```

#### Spinner
```typescript
import { Spinner } from '@composable-svelte/core/components';

{#if $store.isLoading}
  <Spinner size="large" />
{/if}
```

---

### Layout Components

**Purpose**: Organize UI with expand/collapse, tabs, resizable panels.

**Integration Pattern**: Expanded/active state lives in store, dispatch on user interaction.

#### Accordion
```typescript
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@composable-svelte/core/components';

// State
interface FAQState {
  expandedItems: string[]; // Array of expanded item IDs
}

// Actions
type FAQAction =
  | { type: 'toggleItem'; itemId: string };

// Reducer
case 'toggleItem':
  return [
    {
      ...state,
      expandedItems: state.expandedItems.includes(action.itemId)
        ? state.expandedItems.filter(id => id !== action.itemId)
        : [...state.expandedItems, action.itemId]
    },
    Effect.none()
  ];

// Component
<Accordion>
  {#each $store.faqItems as item (item.id)}
    <AccordionItem value={item.id}>
      <AccordionTrigger
        onclick={() => store.dispatch({ type: 'toggleItem', itemId: item.id })}
        expanded={$store.expandedItems.includes(item.id)}
      >
        {item.question}
      </AccordionTrigger>
      <AccordionContent>
        {item.answer}
      </AccordionContent>
    </AccordionItem>
  {/each}
</Accordion>
```

#### Tabs
```typescript
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@composable-svelte/core/components';

// State
interface DashboardState {
  activeTab: 'overview' | 'analytics' | 'reports';
}

// Component
<Tabs value={$store.activeTab} onValueChange={(tab) => store.dispatch({ type: 'tabChanged', tab })}>
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
    <TabsTrigger value="reports">Reports</TabsTrigger>
  </TabsList>
  <TabsContent value="overview">
    <OverviewPanel store={store} />
  </TabsContent>
  <TabsContent value="analytics">
    <AnalyticsPanel store={store} />
  </TabsContent>
  <TabsContent value="reports">
    <ReportsPanel store={store} />
  </TabsContent>
</Tabs>
```

#### Collapsible
```typescript
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@composable-svelte/core/components';

<Collapsible
  open={$store.sidebarExpanded}
  onOpenChange={(open) => store.dispatch({ type: 'toggleSidebar', open })}
>
  <CollapsibleTrigger>
    <Button>Toggle Sidebar</Button>
  </CollapsibleTrigger>
  <CollapsibleContent>
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/settings">Settings</a>
    </nav>
  </CollapsibleContent>
</Collapsible>
```

---

## VI. FORMS SYSTEM

### Integrated Mode (Recommended)

**When**: Complex apps where parent needs to observe form submission, validation, and integrate with other state.

#### Complete Example

```typescript
// 1. Define Zod Schema
import { z } from 'zod';

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  message: z.string().min(10, 'Message must be at least 10 characters')
});

type ContactData = z.infer<typeof contactSchema>;

// 2. Create Form Config
import type { FormConfig } from '@composable-svelte/core/components/form';

export const contactFormConfig: FormConfig<ContactData> = {
  schema: contactSchema,
  initialData: { name: '', email: '', message: '' },
  mode: 'all', // Validate on blur, change, and submit
  debounceMs: 500,
  onSubmit: async (data) => {
    const result = await api.submitContact(data);
    return result;
  }
};

// 3. Parent State
interface AppState {
  contactForm: FormState<ContactData>;
  submissions: Submission[];
  successMessage: string | null;
}

// 4. Parent Actions
type AppAction =
  | { type: 'contactForm'; action: FormAction<ContactData> }
  | { type: 'clearSuccessMessage' };

// 5. Parent Reducer
import { createFormReducer, scope } from '@composable-svelte/core';

const formReducer = createFormReducer(contactFormConfig);

const appReducer: Reducer<AppState, AppAction> = (state, action, deps) => {
  switch (action.type) {
    case 'contactForm': {
      const [formState, formEffect] = formReducer(
        state.contactForm,
        action.action,
        deps
      );

      const newState = { ...state, contactForm: formState };
      const effect = Effect.map(formEffect, (fa): AppAction => ({
        type: 'contactForm',
        action: fa
      }));

      // Observe submission success
      if (action.action.type === 'submissionSucceeded') {
        return [
          {
            ...newState,
            submissions: [...state.submissions, {
              id: crypto.randomUUID(),
              data: formState.data,
              timestamp: Date.now()
            }],
            successMessage: 'Thanks for contacting us!'
          },
          Effect.batch(
            effect,
            Effect.afterDelay(3000, (d) => d({ type: 'clearSuccessMessage' }))
          )
        ];
      }

      return [newState, effect];
    }

    case 'clearSuccessMessage':
      return [{ ...state, successMessage: null }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};

// 6. Component - Reactive Wrapper
<script lang="ts">
  import { FormField, Button } from '@composable-svelte/core/components';

  export let store: Store<AppState, AppAction>;

  // Reactive wrapper for form store
  let formStoreState = $state(store.state.contactForm);

  $effect(() => {
    formStoreState = store.state.contactForm;
  });

  const formStore = {
    get state() { return formStoreState; },
    dispatch(action: FormAction<ContactData>) {
      store.dispatch({ type: 'contactForm', action });
    }
  };
</script>

{#if $store.successMessage}
  <div class="success">{$store.successMessage}</div>
{/if}

<form onsubmit={(e) => { e.preventDefault(); formStore.dispatch({ type: 'submit' }); }}>
  <FormField
    field="name"
    send={(action) => formStore.dispatch(action)}
    state={formStore.state}
  >
    <label>Name</label>
    <input type="text" />
  </FormField>

  <FormField
    field="email"
    send={(action) => formStore.dispatch(action)}
    state={formStore.state}
  >
    <label>Email</label>
    <input type="email" />
  </FormField>

  <FormField
    field="message"
    send={(action) => formStore.dispatch(action)}
    state={formStore.state}
  >
    <label>Message</label>
    <textarea rows={4} />
  </FormField>

  <Button
    type="submit"
    disabled={formStore.state.isSubmitting || Object.keys(formStore.state.errors).length > 0}
  >
    {formStore.state.isSubmitting ? 'Submitting...' : 'Submit'}
  </Button>
</form>
```

### Key Points

**Critical**: Use `formStore.state.isSubmitting`, NOT `formStore.state.submission.status === 'submitting'`

**Parent Observation**: Parent can observe:
- `submissionSucceeded` - Form submitted successfully
- `submissionFailed` - Form submission failed
- `validationFailed` - Validation errors

**Field-Level Errors**: Each field has its own error state in `formStore.state.errors[field]`

**Async Validation**: Define async validators in schema

```typescript
const schema = z.object({
  username: z.string().refine(
    async (username) => {
      const available = await api.checkUsername(username);
      return available;
    },
    { message: 'Username is already taken' }
  )
});
```

---

## VII. TESTING PATTERNS

### TestStore API

**Core Pattern**: send/receive for exhaustive action testing

```typescript
import { createTestStore } from '@composable-svelte/core/test';

describe('Feature', () => {
  it('loads items successfully', async () => {
    const store = createTestStore({
      initialState: { items: [], isLoading: false, error: null },
      reducer: featureReducer,
      dependencies: {
        api: {
          getItems: async () => ({ ok: true, data: [mockItem1, mockItem2] })
        }
      }
    });

    // User initiates action
    await store.send({ type: 'loadItems' }, (state) => {
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeNull();
    });

    // Effect dispatches action
    await store.receive({ type: 'itemsLoaded' }, (state) => {
      expect(state.items).toHaveLength(2);
      expect(state.isLoading).toBe(false);
    });

    // Assert no more pending actions
    await store.finish();
  });
});
```

### Testing Patterns

#### 1. Loading Data with Error Handling

```typescript
it('handles load failure', async () => {
  const store = createTestStore({
    initialState: { items: [], isLoading: false, error: null },
    reducer: featureReducer,
    dependencies: {
      api: {
        getItems: async () => ({ ok: false, error: 'Network error' })
      }
    }
  });

  await store.send({ type: 'loadItems' }, (state) => {
    expect(state.isLoading).toBe(true);
  });

  await store.receive({ type: 'loadFailed' }, (state) => {
    expect(state.error).toBe('Network error');
    expect(state.isLoading).toBe(false);
  });

  await store.finish();
});
```

#### 2. Debounced Search

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('debounces search input', async () => {
  const store = createTestStore({
    initialState: { query: '', results: [] },
    reducer: searchReducer,
    dependencies: {
      api: {
        search: vi.fn(async (q) => ({ ok: true, data: [`result for ${q}`] }))
      }
    }
  });

  await store.send({ type: 'queryChanged', query: 'a' }, (state) => {
    expect(state.query).toBe('a');
  });

  // Advance 100ms - should not trigger search
  await store.advanceTime(100);

  await store.send({ type: 'queryChanged', query: 'ab' }, (state) => {
    expect(state.query).toBe('ab');
  });

  // Advance 300ms - should trigger search
  await store.advanceTime(300);

  await store.receive({ type: 'searchResults' }, (state) => {
    expect(state.results).toEqual(['result for ab']);
  });

  await store.finish();
});
```

#### 3. Form Submission

```typescript
it('validates and submits form', async () => {
  const store = createTestStore({
    initialState: {
      data: { email: '' },
      errors: {},
      isSubmitting: false
    },
    reducer: formReducer,
    dependencies: {
      api: {
        submitForm: vi.fn(async (data) => ({ ok: true }))
      }
    }
  });

  // Invalid email
  await store.send({ type: 'fieldChanged', field: 'email', value: 'invalid' }, (state) => {
    expect(state.data.email).toBe('invalid');
    expect(state.errors.email).toBe('Invalid email address');
  });

  // Valid email
  await store.send({ type: 'fieldChanged', field: 'email', value: 'test@example.com' }, (state) => {
    expect(state.data.email).toBe('test@example.com');
    expect(state.errors.email).toBeUndefined();
  });

  // Submit
  await store.send({ type: 'submit' }, (state) => {
    expect(state.isSubmitting).toBe(true);
  });

  await store.receive({ type: 'submissionSucceeded' }, (state) => {
    expect(state.isSubmitting).toBe(false);
  });

  await store.finish();
});
```

### Mock Dependencies

```typescript
import { MockClock, MockAPIClient, MockWebSocket } from '@composable-svelte/core/test';

// MockClock for time-based effects
const mockClock = new MockClock();
await mockClock.advance(1000); // Advance 1 second

// MockAPIClient for HTTP requests
const mockAPI = new MockAPIClient();
mockAPI.mock('GET', '/users', { ok: true, data: [user1, user2] });

// MockWebSocket for real-time
const mockWS = new MockWebSocket();
mockWS.simulateMessage({ type: 'update', data: newData });
```

---

## VIII. COMMON PITFALLS & ANTI-PATTERNS

### 1. Component $state for Application State

#### ❌ WRONG
```svelte
<script lang="ts">
  let isEditing = $state(false);
  let draftText = $state('');

  function save() {
    // Can't test this with TestStore
  }
</script>
```

#### ✅ CORRECT
```typescript
interface State {
  isEditing: boolean;
  draftText: string;
}

type Action =
  | { type: 'startEdit' }
  | { type: 'updateDraft'; text: string }
  | { type: 'save' };

// Now testable with TestStore
await store.send({ type: 'startEdit' }, (state) => {
  expect(state.isEditing).toBe(true);
});
```

**WHY**: Component state is not testable with TestStore. All application state must be in store for exhaustive testing.

---

### 2. Mutation Instead of Immutable Updates

#### ❌ WRONG
```typescript
case 'addItem':
  state.items.push(action.item); // Mutation!
  return [state, Effect.none()];
```

#### ✅ CORRECT
```typescript
case 'addItem':
  return [
    { ...state, items: [...state.items, action.item] },
    Effect.none()
  ];
```

**WHY**: Svelte 5 runes depend on new object references to detect changes. Mutation breaks reactivity.

---

### 3. Async Reducer (Side Effects in Reducer)

#### ❌ WRONG
```typescript
const reducer = async (state, action) => {
  const data = await fetch('/api/data');
  return [{ ...state, data }, Effect.none()];
};
```

#### ✅ CORRECT
```typescript
const reducer = (state, action) => {
  return [
    { ...state, isLoading: true },
    Effect.run(async (dispatch) => {
      const data = await fetch('/api/data');
      dispatch({ type: 'dataLoaded', data });
    })
  ];
};
```

**WHY**: Reducers must be pure functions. Side effects belong in Effect system.

---

### 4. Not Handling API Errors

#### ❌ WRONG
```typescript
Effect.run(async (dispatch) => {
  const result = await api.getData();
  dispatch({ type: 'dataLoaded', data: result.data }); // What if result.ok is false?
});
```

#### ✅ CORRECT
```typescript
Effect.run(async (dispatch) => {
  const result = await api.getData();
  if (result.ok) {
    dispatch({ type: 'dataLoaded', data: result.data });
  } else {
    dispatch({ type: 'loadFailed', error: result.error });
  }
});
```

**WHY**: Always handle both success and error cases for robust applications.

---

### 5. CSS Transitions for Hover/Focus

#### ❌ WRONG
```css
.button {
  transition: background-color 0.2s;
}

.button:hover {
  background: blue;
}
```

#### ✅ CORRECT
```css
.button {
  /* No transition */
}

.button:hover {
  background: blue; /* Instant feedback */
}
```

**WHY**: UI interactions should have instant feedback. CSS transitions removed per animation guidelines.

---

### 6. Missing Exhaustiveness Check

#### ❌ WRONG
```typescript
const reducer = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];
    // Missing default case - TypeScript won't catch new actions
  }
};
```

#### ✅ CORRECT
```typescript
const reducer = (state, action) => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    default:
      const _never: never = action; // TypeScript error if action not handled
      return [state, Effect.none()];
  }
};
```

**WHY**: Exhaustiveness check ensures all actions are handled, caught at compile time.

---

### 7. Not Testing with TestStore

#### ❌ WRONG
```typescript
import { render, fireEvent } from '@testing-library/svelte';

test('increments counter', async () => {
  const { getByText } = render(Counter);
  const button = getByText('Increment');
  await fireEvent.click(button);
  expect(getByText('1')).toBeInTheDocument();
});
```

#### ✅ CORRECT
```typescript
test('increments counter', async () => {
  const store = createTestStore({
    initialState: { count: 0 },
    reducer: counterReducer
  });

  await store.send({ type: 'increment' }, (state) => {
    expect(state.count).toBe(1);
  });

  await store.finish();
});
```

**WHY**: TestStore tests are faster, more focused, and test reducer logic in isolation.

---

### 8. Wrong Form State Access

#### ❌ WRONG
```typescript
{#if formStore.state.submission.status === 'submitting'}
  Loading...
{/if}
```

#### ✅ CORRECT
```typescript
{#if formStore.state.isSubmitting}
  Loading...
{/if}
```

**WHY**: Use `isSubmitting` boolean, not `submission.status`. Simpler API, less nesting.

---

### 9. Forgetting to Handle Dismiss

#### ❌ WRONG
```typescript
case 'destination': {
  // Only handles child actions, not dismiss
  const [newState, effect] = ifLetPresentation(...)(state, action, deps);
  return [newState, effect];
}
```

#### ✅ CORRECT
```typescript
case 'destination': {
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  const [newState, effect] = ifLetPresentation(...)(state, action, deps);
  return [newState, effect];
}
```

**WHY**: PresentationAction includes dismiss. Parent must handle it to close modal/sheet.

---

### 10. Not Using PresentationState for Animations

#### ❌ WRONG
```typescript
interface State {
  showModal: boolean; // Just a boolean, no animation lifecycle
}
```

#### ✅ CORRECT
```typescript
interface State {
  content: Content | null;
  presentation: PresentationState<Content>; // Full lifecycle
}
```

**WHY**: PresentationState tracks animation lifecycle (presenting → presented → dismissing), enabling state-driven animations.

---

## IX. DECISION TOOLS & CHECKLISTS

### Abstraction Value Matrix (from DESIGN-PRINCIPLES.md)

**Core Principle**: Apply abstraction where value is high, use simple helpers elsewhere.

| Value | Complexity | Decision |
|-------|------------|----------|
| High | Low | ✅ **ADD** - Clear win, add to library |
| High | High | ⚠️ **CONSIDER** - Explore simpler alternatives first |
| Low | Low | ⚠️ **MAYBE** - Only if it rounds out the API |
| Low | High | ❌ **DON'T ADD** - Use simple helpers instead |

**Examples**:

| Pattern | Value | Complexity | Decision |
|---------|-------|------------|----------|
| `forEach` for flat collections | High (92% boilerplate reduction) | Medium (~160 LOC) | ✅ Added |
| `scopeToElement` simplification | High (80% less boilerplate) | Low (small API change) | ✅ Added |
| `scopeToTreeNode` for trees | Low (marginal benefit) | High (~500 LOC, 3 concepts) | ❌ Not added |
| Tree helper functions | Medium-High (eliminates recursive boilerplate) | Low (~100 LOC pure functions) | ✅ Added |

**Decision Process**:
1. **Value Question**: Does this eliminate significant boilerplate? Prevent common bugs? Make code clearer?
2. **Complexity Question**: How many lines? How many new concepts? How hard to debug?
3. **Trade-off Question**: What do we gain? What do we lose? Is it worth it?
4. **Alternative Question**: Could simple helpers achieve 80% of the value?

**Key Insight**: Better to have 5 powerful abstractions that users love + simple helpers for other cases, than 20 abstractions that cover every case but are hard to learn.

---

### Effect Type Decision Tree

```
What kind of side effect?
│
├─ Pure state change (no async, no external calls)
│  └─ Effect.none()
│
├─ Async operation that needs to dispatch back
│  ├─ Single async call → Effect.run()
│  ├─ Fire-and-forget (analytics, logging) → Effect.fireAndForget()
│  └─ Multiple parallel operations → Effect.batch()
│
├─ User input that changes frequently
│  ├─ Search-as-you-type (wait for pause) → Effect.debounced()
│  ├─ Cancel previous request → Effect.cancellable()
│  └─ Limit frequency (scroll, resize) → Effect.throttled()
│
├─ Time-based
│  ├─ Wait then dispatch → Effect.afterDelay()
│  └─ Animation timing → Effect.animated()
│
└─ Long-running connection
   └─ WebSocket, SSE, interval → Effect.subscription()
```

### Composition Strategy Matrix

| Question | Answer | Strategy |
|----------|--------|----------|
| Is child always present? | Yes | `scope()` |
| Is child optional (navigation)? | Yes | `ifLet()` + `PresentationAction` |
| Is it a list of independent items? | Yes | `forEach()` + `scopeToElement()` |
| Multiple slices, same action type? | Yes | `combineReducers()` |
| Is it a tree structure? | Yes | Helper functions + `store + ID` |

### Animation Approach Decision Tree

```
Does component animate?
│
├─ NO → No animation system
│
└─ YES → What kind of animation?
    │
    ├─ Infinite loop (spinner, shimmer, pulse)
    │  └─ CSS @keyframes
    │
    ├─ User interaction (hover, focus, active)
    │  └─ NO TRANSITION (instant feedback)
    │
    └─ Lifecycle (appear, disappear, expand, collapse)
       └─ Motion One + PresentationState
```

### Starting New Feature Checklist

- [ ] 1. Define State interface with ALL application state
- [ ] 2. Define Actions as discriminated union
- [ ] 3. Define Dependencies interface
- [ ] 4. Write Reducer as pure function
- [ ] 5. Use immutable updates (`{ ...state }`)
- [ ] 6. Return Effects as data structures
- [ ] 7. Add exhaustiveness check in default case
- [ ] 8. Create TestStore tests (NOT component tests)
- [ ] 9. Test all actions with send/receive
- [ ] 10. Component has NO `$state` for app state

### Navigation Feature Checklist

- [ ] 1. Add optional destination field to state (`DestinationState | null`)
- [ ] 2. Use discriminated union if multiple destination types
- [ ] 3. Define PresentationAction wrapper
- [ ] 4. Handle dismiss action (set destination to null)
- [ ] 5. Use ifLetPresentation for child composition
- [ ] 6. Parent observes child completion actions
- [ ] 7. Use scopeToDestination in component
- [ ] 8. Add PresentationState if animations needed

### Form Feature Checklist

- [ ] 1. Define Zod schema
- [ ] 2. Create FormConfig with schema and onSubmit
- [ ] 3. Add FormState to parent state
- [ ] 4. Use createFormReducer + scope in parent reducer
- [ ] 5. Parent observes submissionSucceeded/submissionFailed
- [ ] 6. Create reactive wrapper in component ($state + $effect)
- [ ] 7. Use formStore.state.isSubmitting (NOT submission.status)

### Pre-Commit Checklist

- [ ] 1. NO `$state` in components (except DOM refs)
- [ ] 2. All application state in store
- [ ] 3. All state changes via actions
- [ ] 4. Immutable updates (no mutations)
- [ ] 5. Effects as data structures
- [ ] 6. Exhaustiveness checks in reducers
- [ ] 7. TestStore tests (not component tests)
- [ ] 8. All actions tested with send/receive

---

## X. QUICK REFERENCE & TEMPLATES

### Top 15 Essential Patterns

1. **Store-Reducer-Effect Trinity** - Core architecture pattern
2. **All State in Store** - No component $state for app state
3. **TestStore send/receive** - Exhaustive action testing
4. **ifLetPresentation** - Optional child composition
5. **Parent Observation** - Parent watches child actions
6. **PresentationState Lifecycle** - State-driven animations (idle → presenting → presented → dismissing)
7. **forEach + scopeToElement** - Flat collections with 92% less boilerplate
8. **Effect Decision Tree** - Choose right effect type
9. **Loading State Pattern** - idle | loading | success | error
10. **Immutable Updates** - `{ ...state, field: newValue }`
11. **Debounced/Cancellable** - Search-as-you-type patterns
12. **Form Reactive Wrapper** - $state + $effect for integration
13. **Motion One + PresentationState** - Only animation approach
14. **Mock Dependencies** - MockClock, MockAPI for testing
15. **Pragmatic Abstraction** - Right tool for each structure

---

### Code Templates

#### Basic Feature Template

```typescript
// types.ts
export interface FeatureState {
  items: Item[];
  isLoading: boolean;
  error: string | null;
}

export type FeatureAction =
  | { type: 'loadItems' }
  | { type: 'itemsLoaded'; items: Item[] }
  | { type: 'loadFailed'; error: string };

export interface FeatureDependencies {
  api: APIClient;
}

// reducer.ts
import { Reducer, Effect } from '@composable-svelte/core';

export const featureReducer: Reducer<FeatureState, FeatureAction, FeatureDependencies> = (
  state,
  action,
  deps
) => {
  switch (action.type) {
    case 'loadItems':
      return [
        { ...state, isLoading: true, error: null },
        Effect.run(async (dispatch) => {
          const result = await deps.api.getItems();
          if (result.ok) {
            dispatch({ type: 'itemsLoaded', items: result.data });
          } else {
            dispatch({ type: 'loadFailed', error: result.error });
          }
        })
      ];

    case 'itemsLoaded':
      return [{ ...state, items: action.items, isLoading: false }, Effect.none()];

    case 'loadFailed':
      return [{ ...state, error: action.error, isLoading: false }, Effect.none()];

    default:
      const _never: never = action;
      return [state, Effect.none()];
  }
};

// Feature.svelte
<script lang="ts">
  import { createStore } from '@composable-svelte/core';
  import { featureReducer } from './reducer';

  const store = createStore({
    initialState: { items: [], isLoading: false, error: null },
    reducer: featureReducer,
    dependencies: { api: createAPIClient() }
  });

  $effect(() => {
    store.dispatch({ type: 'loadItems' });
  });
</script>

{#if $store.isLoading}
  <p>Loading...</p>
{:else if $store.error}
  <p class="error">{$store.error}</p>
{:else}
  <ul>
    {#each $store.items as item (item.id)}
      <li>{item.name}</li>
    {/each}
  </ul>
{/if}
```

#### Navigation with Modal Template

```typescript
// types.ts
interface AppState {
  items: Item[];
  destination: AddItemState | null;
}

interface AddItemState {
  name: string;
  quantity: number;
}

type AppAction =
  | { type: 'addButtonTapped' }
  | { type: 'destination'; action: PresentationAction<AddItemAction> };

type AddItemAction =
  | { type: 'nameChanged'; name: string }
  | { type: 'quantityChanged'; quantity: number }
  | { type: 'saveButtonTapped' };

// reducer.ts
case 'addButtonTapped':
  return [
    { ...state, destination: { name: '', quantity: 0 } },
    Effect.none()
  ];

case 'destination': {
  if (action.action.type === 'dismiss') {
    return [{ ...state, destination: null }, Effect.none()];
  }

  const [newState, effect] = ifLetPresentation(
    (s) => s.destination,
    (s, d) => ({ ...s, destination: d }),
    'destination',
    (ca): AppAction => ({ type: 'destination', action: { type: 'presented', action: ca } }),
    addItemReducer
  )(state, action, deps);

  if ('action' in action &&
      action.action.type === 'presented' &&
      action.action.action.type === 'saveButtonTapped') {
    return [
      {
        ...newState,
        destination: null,
        items: [...newState.items, {
          id: crypto.randomUUID(),
          ...newState.destination!
        }]
      },
      effect
    ];
  }

  return [newState, effect];
}

// App.svelte
<script lang="ts">
  import { Modal } from '@composable-svelte/core/components';
  import { scopeToDestination } from '@composable-svelte/core';

  const addItemStore = $derived(scopeToDestination(store, 'destination'));
</script>

<Button onclick={() => store.dispatch({ type: 'addButtonTapped' })}>
  Add Item
</Button>

{#if addItemStore}
  <Modal open={true} onOpenChange={(open) => !open && addItemStore.dismiss()}>
    <AddItemForm store={addItemStore} />
  </Modal>
{/if}
```

#### Form Integration Template

```typescript
// config.ts
import { z } from 'zod';
import type { FormConfig } from '@composable-svelte/core/components/form';

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email')
});

type FormData = z.infer<typeof schema>;

export const formConfig: FormConfig<FormData> = {
  schema,
  initialData: { name: '', email: '' },
  mode: 'all',
  debounceMs: 500,
  onSubmit: async (data) => {
    const result = await api.submit(data);
    return result;
  }
};

// Parent state and reducer
interface AppState {
  contactForm: FormState<ContactData>;
  submissions: Submission[];
}

const formReducer = createFormReducer(formConfig);

case 'contactForm': {
  const [formState, formEffect] = formReducer(state.contactForm, action.action, deps);
  const newState = { ...state, contactForm: formState };

  if (action.action.type === 'submissionSucceeded') {
    return [
      {
        ...newState,
        submissions: [...state.submissions, { data: formState.data, timestamp: Date.now() }]
      },
      Effect.map(formEffect, (fa): AppAction => ({ type: 'contactForm', action: fa }))
    ];
  }

  return [newState, Effect.map(formEffect, (fa): AppAction => ({ type: 'contactForm', action: fa }))];
}

// Component.svelte
<script lang="ts">
  import { FormField, Button } from '@composable-svelte/core/components';

  let formStoreState = $state(store.state.contactForm);

  $effect(() => {
    formStoreState = store.state.contactForm;
  });

  const formStore = {
    get state() { return formStoreState; },
    dispatch(action) {
      store.dispatch({ type: 'contactForm', action });
    }
  };
</script>

<form onsubmit={(e) => { e.preventDefault(); formStore.dispatch({ type: 'submit' }); }}>
  <FormField field="name" send={(a) => formStore.dispatch(a)} state={formStore.state}>
    <label>Name</label>
    <input type="text" />
  </FormField>

  <FormField field="email" send={(a) => formStore.dispatch(a)} state={formStore.state}>
    <label>Email</label>
    <input type="email" />
  </FormField>

  <Button type="submit" disabled={formStore.state.isSubmitting}>
    Submit
  </Button>
</form>
```

---

### Common Scenarios

#### Todo with Inline Editing

```typescript
// State
interface TodoState {
  id: string;
  text: string;
  completed: boolean;
  isEditing: boolean;      // In store, not component $state
  editDraft: string;       // In store, not component $state
}

// Actions
type TodoAction =
  | { type: 'toggle' }
  | { type: 'startEdit' }
  | { type: 'updateDraft'; draft: string }
  | { type: 'commitEdit' }
  | { type: 'cancelEdit' };

// Reducer
case 'startEdit':
  return [
    { ...state, isEditing: true, editDraft: state.text },
    Effect.none()
  ];

case 'updateDraft':
  return [
    { ...state, editDraft: action.draft },
    Effect.none()
  ];

case 'commitEdit':
  return [
    { ...state, text: state.editDraft.trim() || state.text, isEditing: false, editDraft: '' },
    Effect.none()
  ];

case 'cancelEdit':
  return [
    { ...state, isEditing: false, editDraft: '' },
    Effect.none()
  ];
```

#### Search with Debounce

```typescript
// State
interface SearchState {
  query: string;
  results: SearchResult[];
  isSearching: boolean;
}

// Actions
type SearchAction =
  | { type: 'queryChanged'; query: string }
  | { type: 'searchCompleted'; results: SearchResult[] };

// Reducer
case 'queryChanged':
  return [
    { ...state, query: action.query, isSearching: true },
    Effect.debounced('search', 300, async (dispatch) => {
      const results = await api.search(action.query);
      dispatch({ type: 'searchCompleted', results });
    })
  ];

case 'searchCompleted':
  return [
    { ...state, results: action.results, isSearching: false },
    Effect.none()
  ];
```

#### Table with Sorting/Filtering

```typescript
// State
interface TableState {
  items: Item[];
  sortBy: 'name' | 'date' | 'status';
  sortDirection: 'asc' | 'desc';
  filterStatus: 'all' | 'active' | 'inactive';
}

// Derived data (use $derived in component)
const filteredAndSorted = $derived(() => {
  let filtered = $store.items;

  if ($store.filterStatus !== 'all') {
    filtered = filtered.filter(i => i.status === $store.filterStatus);
  }

  return filtered.sort((a, b) => {
    const aVal = a[$store.sortBy];
    const bVal = b[$store.sortBy];
    const dir = $store.sortDirection === 'asc' ? 1 : -1;
    return aVal > bVal ? dir : -dir;
  });
});

// Actions
type TableAction =
  | { type: 'sortByChanged'; sortBy: 'name' | 'date' | 'status' }
  | { type: 'filterStatusChanged'; filterStatus: 'all' | 'active' | 'inactive' };
```

---

### Custom Component Guidelines

**Principles for Building Custom Components:**

1. **No `$state` for Application State**: All state that affects behavior or can be tested must be in the store
2. **Dispatch Actions**: User interactions dispatch actions to the store
3. **Read from Store**: Render based on `$store.state`
4. **Use `$derived`**: For computed values derived from store state
5. **Props for Configuration**: Static configuration (labels, styles) can be props

**Example Custom Component:**

```svelte
<script lang="ts">
  import type { Store } from '@composable-svelte/core';

  export let store: Store<State, Action>;
  export let label: string; // Static config
  export let variant: 'primary' | 'secondary' = 'primary'; // Static config

  // Derived from store
  const isDisabled = $derived($store.isLoading || $store.hasErrors);
  const displayText = $derived($store.count > 0 ? `${label} (${$store.count})` : label);
</script>

<button
  class={variant}
  disabled={isDisabled}
  onclick={() => store.dispatch({ type: 'buttonClicked' })}
>
  {displayText}
</button>
```

---

## Summary

This skill provides comprehensive guidance for writing production-quality Composable Svelte applications:

1. **Critical Rules**: All state in store, pragmatic abstraction, state-driven animations
2. **Core Architecture**: Store-Reducer-Effect trinity, 12 effect types, 4 composition strategies
3. **Navigation**: Tree-based pattern with parent observation
4. **Animation**: PresentationState lifecycle with Motion One
5. **Components**: 73+ shadcn-svelte components with integration patterns
6. **Forms**: Integrated mode with Zod validation and reactive wrapper
7. **Testing**: TestStore exhaustive testing with send/receive
8. **Anti-Patterns**: 10 common mistakes with corrections
9. **Decision Tools**: Checklists, decision trees, matrices
10. **Templates**: Complete code templates for common scenarios

**Remember**: Testability is the core value. All state in store, test with TestStore, use the right abstraction for each structure.

For full API documentation, see `packages/core/docs/`.
