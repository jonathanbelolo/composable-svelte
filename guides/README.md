# Composable Svelte — Architecture & Tutorial Guide

This guide bootstraps the full context of the Composable Svelte library: what it is, how it works, and how to build with it. It is written for both humans and AI assistants.

---

## What Is Composable Svelte?

Composable Svelte is a **state management and UI architecture library** for Svelte 5, inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS.

It provides a predictable, testable, composable way to build Svelte applications using three core primitives:

1. **Store** — Holds reactive state and dispatches actions
2. **Reducer** — A pure function that transforms state and returns effects
3. **Effect** — A declarative description of a side effect (API call, timer, etc.)

```
User Action → Store.dispatch(action)
                    ↓
              Reducer(state, action, deps) → [newState, effect]
                    ↓                              ↓
              State updates                  Effect executes
              UI re-renders                  May dispatch more actions
```

### Why This Architecture?

- **Predictable**: Same input always produces same output (pure reducers)
- **Testable**: Every feature testable in isolation via `TestStore`
- **Composable**: Features compose like Lego blocks via `scope()`, `combineReducers()`, `ifLet()`
- **Type-safe**: Full TypeScript inference, discriminated unions, exhaustive checking
- **Declarative**: Effects are data, not imperative code

---

## Packages

All packages follow the Composable Architecture pattern (reducer + effects + store), depend on `@composable-svelte/core`, and are built for Svelte 5. Source lives in `packages/<name>/src/lib/`.

### `@composable-svelte/core` (v0.4.3)

The foundation library. Everything else builds on this.

| Module | What it provides |
|--------|-----------------|
| Root (`core`) | `createStore`, `Effect`, `Reducer`, `TestStore`, `scope`, `combineReducers`, `forEach` |
| `core/navigation` | `ifLetPresentation`, `scopeToDestination`, `createDestinationReducer`, `push`, `pop`, dismiss dependency |
| `core/navigation-components` | Modal, Sheet, Drawer, Alert, Popover, Sidebar, Tabs, NavigationStack |
| `core/components/ui` | 70+ shadcn-svelte components (Button, Input, Card, Select, Accordion, etc.) |
| `core/components/form` | Form system with Zod validation, `createFormReducer`, `FormField` |
| `core/routing` | URL routing with `path-to-regexp`, browser history sync, query params |
| `core/api` | HTTP client with interceptors, retries, caching, deduplication |
| `core/websocket` | WebSocket client with reconnection, heartbeat, channel routing |
| `core/i18n` | ICU MessageFormat, locale detection, translation loaders, date/number formatters |
| `core/ssr` | Server-side rendering (`renderToHTML`), hydration, security middleware |
| `core/ssr/ssg` | Static site generation (Node.js only — separated to avoid `fs` in browser builds) |
| `core/dependencies` | Injectable Clock (with MockClock for tests), Storage (localStorage/cookies) |
| `core/animation` | Motion One helpers for lifecycle animations (modal/sheet/accordion/toast transitions) |
| `core/test` | TestStore with send/receive pattern for exhaustive testing |

```typescript
import { createStore, Effect } from '@composable-svelte/core';
import { Modal, Sheet } from '@composable-svelte/core/navigation-components';
import { hydrateStore } from '@composable-svelte/core/ssr';
import { syncBrowserHistory } from '@composable-svelte/core/routing';
```

### `@composable-svelte/chat` (v0.2.1)

Transport-agnostic streaming chat for LLM interactions and real-time collaboration.

- **Components**: `MinimalStreamingChat`, `StandardStreamingChat`, `FullStreamingChat` — three tiers of chat UI complexity
- **Message rendering**: `SimpleChatMessage`, `ChatMessage` with markdown, code highlighting, and media support
- **Collaboration**: `PresenceBadge`, `PresenceAvatarStack`, `TypingIndicator`, `CursorOverlay` for multi-user presence
- **State**: `streamingChatReducer`, `collaborativeReducer` — full chat state management with attachments, reactions, editing
- **Utilities**: `WebSocketManager`, `CleanupTracker`, presence/typing/cursor tracking hooks
- **Built on**: marked (markdown), optional Prism.js, optional PDF.js

```typescript
import { FullStreamingChat, streamingChatReducer } from '@composable-svelte/chat';
```

### `@composable-svelte/charts` (v0.1.0)

Interactive data visualization built on Observable Plot and D3.

- **Components**: `Chart`, `ChartPrimitive`, `ChartTooltip`
- **State**: `chartReducer` with zoom, brush, selection, and responsive support
- **Utilities**: `plotBuilder` for declarative chart config, `data-transforms` for preprocessing
- **Built on**: @observablehq/plot, D3 (d3-array, d3-brush, d3-scale, d3-selection, d3-zoom)

```typescript
import { Chart, chartReducer, createInitialChartState } from '@composable-svelte/charts';
```

### `@composable-svelte/code` (v0.1.0)

Code editing, syntax highlighting, and visual node programming.

- **CodeHighlight**: Read-only syntax highlighting with Prism.js (8+ languages)
- **CodeEditor**: Full editor with CodeMirror (autocomplete, search, lint, theming)
- **NodeCanvas**: Visual node graph editor powered by Svelteflow, with connection validation
- **State**: Separate reducer for each component — `codeHighlightReducer`, `codeEditorReducer`, `nodeCanvasReducer`
- **Built on**: CodeMirror 6, Prism.js, @xyflow/svelte

```typescript
import { CodeEditor, CodeHighlight, NodeCanvas } from '@composable-svelte/code';
```

### `@composable-svelte/graphics` (v0.1.0)

State-driven 3D graphics with Babylon.js.

- **Components**: `Scene`, `Camera`, `Mesh`, `Light`, `WebGLOverlay`
- **State**: `graphicsReducer` — manages meshes, cameras, lights, renderer settings through actions
- **Adapter**: `BabylonAdapter` for advanced Babylon.js integration
- **Built on**: @babylonjs/core, @babylonjs/loaders

```typescript
import { Scene, Camera, Mesh, Light } from '@composable-svelte/graphics';
```

### `@composable-svelte/maps` (v0.1.0)

Interactive geospatial maps with Maplibre GL / Mapbox GL.

- **Components**: `Map`, `MapPrimitive`, `GeoJSONLayer`, `HeatmapLayer`, `MapPopup`, `TileProviderControl`
- **State**: `mapReducer` — pan, zoom, feature selection, layer management
- **Adapters**: `MaplibreAdapter` with support for multiple tile providers (OpenStreetMap, Stadia, Carto, etc.)
- **Built on**: maplibre-gl, optional mapbox-gl

```typescript
import { Map, GeoJSONLayer, mapReducer } from '@composable-svelte/maps';
```

### `@composable-svelte/media` (v0.1.0)

Audio playback, video embedding, and voice input using native Web APIs.

- **Audio**: `MinimalAudioPlayer`, `FullAudioPlayer`, `PlaylistView` — full playback with shuffle/loop, playlist support
- **Video**: `VideoEmbed` — auto-detects YouTube, Vimeo, Twitch with responsive aspect ratios
- **Voice**: `VoiceInput` — push-to-talk and conversation modes via MediaRecorder API
- **State**: `audioPlayerReducer`, `voiceInputReducer`
- **Built on**: Web Audio API, MediaRecorder API (no external dependencies)

```typescript
import { FullAudioPlayer, VideoEmbed, VoiceInput } from '@composable-svelte/media';
```

---

## Tutorial: Building a Feature from Scratch

### Step 1: Define State and Actions

State is a plain TypeScript interface. Actions are a discriminated union with a `type` field.

```typescript
// counter.types.ts
export interface CounterState {
  count: number;
  isLoading: boolean;
}

export type CounterAction =
  | { type: 'incrementTapped' }
  | { type: 'decrementTapped' }
  | { type: 'resetTapped' }
  | { type: 'loadCompleted'; value: number };
```

### Step 2: Write a Reducer

A reducer is a pure function: `(state, action, deps) => [newState, effect]`. It never mutates state — it returns a new object. Effects describe what should happen next.

```typescript
// counter.reducer.ts
import type { Reducer } from '@composable-svelte/core';
import { Effect } from '@composable-svelte/core';
import type { CounterState, CounterAction } from './counter.types';

export interface CounterDependencies {
  loadInitialValue: () => Promise<number>;
}

export const counterReducer: Reducer<CounterState, CounterAction, CounterDependencies> = (
  state, action, deps
) => {
  switch (action.type) {
    case 'incrementTapped':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrementTapped':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

    case 'resetTapped':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          const value = await deps.loadInitialValue();
          dispatch({ type: 'loadCompleted', value });
        })
      ];

    case 'loadCompleted':
      return [{ ...state, count: action.value, isLoading: false }, Effect.none()];

    default:
      return [state, Effect.none()];
  }
};
```

### Step 3: Create a Store

The store is the runtime. It holds state, processes actions through the reducer, and executes effects.

```typescript
import { createStore } from '@composable-svelte/core';

const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {
    loadInitialValue: async () => {
      const res = await fetch('/api/counter');
      return res.json();
    }
  }
});
```

### Step 4: Build the Component

Access state reactively via `$derived(store.state)` or `$store` (subscription-based). Dispatch actions with `store.dispatch()`.

```svelte
<!-- Counter.svelte -->
<script lang="ts">
  import type { Store } from '@composable-svelte/core';
  import type { CounterState, CounterAction } from './counter.types';

  let { store }: { store: Store<CounterState, CounterAction> } = $props();

  // Both patterns work:
  // Pattern A: Rune-based (recommended for Svelte 5)
  const count = $derived(store.state.count);
  const isLoading = $derived(store.state.isLoading);

  // Pattern B: Subscription-based (also works)
  // {$store.count}
</script>

<div>
  <p>Count: {count}</p>
  <button onclick={() => store.dispatch({ type: 'decrementTapped' })} disabled={isLoading}>-</button>
  <button onclick={() => store.dispatch({ type: 'incrementTapped' })} disabled={isLoading}>+</button>
  <button onclick={() => store.dispatch({ type: 'resetTapped' })} disabled={isLoading}>
    {isLoading ? 'Loading...' : 'Reset'}
  </button>
</div>
```

### Step 5: Test with TestStore

`TestStore` provides exhaustive action testing. Every effect-dispatched action must be explicitly received.

```typescript
// counter.test.ts
import { describe, it, expect } from 'vitest';
import { createTestStore } from '@composable-svelte/core';
import { counterReducer } from './counter.reducer';

describe('Counter', () => {
  it('increments count', async () => {
    const store = createTestStore({
      initialState: { count: 0, isLoading: false },
      reducer: counterReducer,
      dependencies: { loadInitialValue: async () => 42 }
    });

    await store.send({ type: 'incrementTapped' }, (state) => {
      expect(state.count).toBe(1);
    });
  });

  it('resets via async effect', async () => {
    const store = createTestStore({
      initialState: { count: 5, isLoading: false },
      reducer: counterReducer,
      dependencies: { loadInitialValue: async () => 0 }
    });

    await store.send({ type: 'resetTapped' }, (state) => {
      expect(state.isLoading).toBe(true);
    });

    await store.receive({ type: 'loadCompleted' }, (state) => {
      expect(state.count).toBe(0);
      expect(state.isLoading).toBe(false);
    });
  });
});
```

---

## Effect System

Effects are **data structures**, not imperative code. The store executes them after state updates.

| Effect | Purpose |
|--------|---------|
| `Effect.none()` | No side effect |
| `Effect.run(async (dispatch) => { ... })` | Async operation that can dispatch actions |
| `Effect.fireAndForget(async () => { ... })` | Fire-and-forget (no dispatch) |
| `Effect.batch(e1, e2, ...)` | Run multiple effects |
| `Effect.afterDelay(ms, (dispatch) => { ... })` | Delayed execution |
| `Effect.cancellable(id, async (dispatch) => { ... })` | Cancellable by ID |
| `Effect.debounced(id, ms, async (dispatch) => { ... })` | Debounced by ID |
| `Effect.throttled(id, ms, async (dispatch) => { ... })` | Throttled by ID |
| `Effect.subscription(id, (dispatch) => cleanup)` | Long-lived subscription |

---

## Reducer Composition

Features compose into larger features. The parent controls how child state/actions map.

### `scope()` — Embed a child reducer permanently

```typescript
import { scope } from '@composable-svelte/core';

const appReducer = scope(
  (s) => s.counter,                           // extract child state
  (s, child) => ({ ...s, counter: child }),   // put child state back
  (a) => a.type === 'counter' ? a.action : null,  // extract child action
  (ca) => ({ type: 'counter', action: ca }),  // wrap child action
  counterReducer
);
```

### `combineReducers()` — Multiple children at the same level

```typescript
import { combineReducers } from '@composable-svelte/core';

const rootReducer = combineReducers(
  scopedCounterReducer,
  scopedTodoReducer,
  scopedSettingsReducer
);
```

### `ifLet()` — Optional child (navigation)

```typescript
import { ifLetPresentation } from '@composable-svelte/core/navigation';

// Only runs child reducer when destination is non-null
const [newState, effect] = ifLetPresentation(
  (s) => s.destination,
  (s, d) => ({ ...s, destination: d }),
  'destination',
  childReducer
)(state, action, deps);
```

---

## Navigation

Navigation is state-driven. A `destination` field in state determines what's shown.

```typescript
// null = nothing shown, non-null = Modal/Sheet/Drawer is open
interface AppState {
  destination: { type: 'addItem'; state: AddItemState } | null;
}
```

Components react to this state:

```svelte
{#if $derived(store.state.destination?.type === 'addItem')}
  <Modal open={true} onOpenChange={(open) => !open && dismiss()}>
    <AddItemForm />
  </Modal>
{/if}
```

Available navigation components: `Modal`, `Sheet`, `Drawer`, `Alert`, `Popover`, `Sidebar`, `Tabs`, `NavigationStack`.

See [NAVIGATION-GUIDE.md](./NAVIGATION-GUIDE.md) for full details.

---

## Store Reactivity

The store's `state` property is reactive via Svelte 5's `$state.raw()` rune. This means both access patterns work:

```svelte
<!-- Rune-based (recommended) -->
<script>
  const count = $derived(store.state.count);
</script>
<p>{count}</p>

<!-- Subscription-based (also works) -->
<p>{$store.count}</p>
```

The store also implements the Svelte store contract (`.subscribe()` method), so `$store` auto-subscription works in any component.

---

## Project Layout

```
packages/core/src/lib/
├── store.svelte.ts       # Store implementation ($state.raw for reactivity)
├── effect.ts             # Effect constructors and types
├── types.ts              # Core type definitions
├── index.ts              # Barrel export
├── composition/          # scope(), combineReducers(), forEach()
├── navigation/           # ifLet, destinations, stack, matchers, dismiss
├── navigation-components/# Modal, Sheet, Drawer, Alert, etc.
├── routing/              # URL routing with path-to-regexp
├── api/                  # HTTP client with interceptors, retries, caching
├── websocket/            # WebSocket client with reconnection, heartbeat
├── i18n/                 # ICU MessageFormat, locale detection, formatters
├── ssr/                  # Server-side rendering, static site generation
├── dependencies/         # Clock, Storage, Cookies (injectable)
├── animation/            # Motion One helpers for lifecycle animations
├── components/ui/        # 70+ shadcn-svelte components
├── components/form/      # Form system with Zod validation
├── test/                 # TestStore for exhaustive testing
└── styles/               # Tailwind base styles
```

---

## Key Patterns to Know

### 1. Reducers are pure — no mutations, no side effects

```typescript
// Always return a new state object
return [{ ...state, count: state.count + 1 }, Effect.none()];
```

### 2. Effects are data — dispatched after state updates

```typescript
// Effect.run returns data describing what to do, not doing it
return [newState, Effect.run(async (dispatch) => {
  const data = await fetch('/api');
  dispatch({ type: 'dataLoaded', data });
})];
```

### 3. State drives everything — including navigation and animation

```typescript
// Show a modal = set destination to non-null
return [{ ...state, destination: { type: 'edit', state: editState } }, Effect.none()];

// Dismiss a modal = set destination to null
return [{ ...state, destination: null }, Effect.none()];
```

### 4. TestStore enforces exhaustiveness

```typescript
await store.send(action, assertState);    // User action
await store.receive(partialAction, assertState);  // Effect-dispatched action
store.assertNoPendingActions();           // Nothing left unhandled
```

### 5. Animation is state-driven via PresentationState

```typescript
// idle → presenting → presented → dismissing → idle
type PresentationStatus = 'idle' | 'presenting' | 'presented' | 'dismissing';
```

---

## Example Applications

| Example | What it demonstrates |
|---------|---------------------|
| `examples/counter` | Basic store + reducer + effects |
| `examples/contact-form` | Forms with Zod validation, integrated mode |
| `examples/multi-step-form` | Multi-step wizard, reducer composition |
| `examples/data-table` | Sorting, filtering, pagination |
| `examples/product-gallery` | Full navigation: Modal, Sheet, Drawer, nested 3 levels |
| `examples/url-routing` | Browser history, pattern matching, query params |
| `examples/ssr-server` | SSR + SSG with multi-locale i18n |
| `examples/file-browser` | Tree view, keyboard navigation |
| `examples/shader-gallery` | WebGL + graphics package integration |
| `examples/styleguide` | All 70+ UI components showcased |
| `examples/registration-form` | Form validation patterns |

---

## Running the Project

```bash
# Install dependencies
pnpm install

# Run tests (root — jsdom, 1670+ tests)
pnpm test

# Run tests (core package — Playwright browser, 1670+ tests)
cd packages/core && pnpm test

# Build core package
cd packages/core && pnpm build

# Build an example
cd examples/counter && pnpm build

# Dev server for an example
cd examples/counter && pnpm dev
```

---

## Further Reading

| Guide | Topic |
|-------|-------|
| [ANIMATION-GUIDELINES.md](./ANIMATION-GUIDELINES.md) | When/how to use Motion One vs CSS for animations |
| [NAVIGATION-GUIDE.md](./NAVIGATION-GUIDE.md) | Tree/stack navigation, all 8 components, store scoping |
| [forms-guide.md](./forms-guide.md) | Form system, Zod validation, standalone vs integrated mode |
| [navigation-best-practices.md](./navigation-best-practices.md) | Patterns, pitfalls, dismiss vs observation, testing |

Specs (original design documents): `specs/frontend/`
Phase plans and completion summaries: `plans/`
