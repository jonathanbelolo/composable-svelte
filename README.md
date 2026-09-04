# Composable Svelte

A **Composable Architecture** library for Svelte 5, inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture) from Swift/iOS.

**Status**: `@composable-svelte/core` is production-ready, and every package is
covered by tests — the current count is in Project Status below, measured rather
than carried forward. **The satellite packages vary, and two of them substantially** —
see the table below before you depend on one.

## Packages, and how finished each is

| package | state | what is not there |
|---|---|---|
| **core** | production-ready | no store middleware, no devtools integration, no persistence or time-travel (there *is* an action `history` and `subscribeToActions`, so you can build a logger yourself) |
| **chat** | usable | "collaborative" means presence, typing and cursors — **there is no CRDT layer**, so concurrent document editing is not supported |
| **media** | usable | audio player, `VideoEmbed` (YouTube/Vimeo/Twitch), voice input — no video *player*, no streaming formats |
| **code** | usable, thin | three wrappers: CodeMirror, Prism, SvelteFlow |
| **charts** | feature-complete for 5 chart types | scatter, line, bar, area, histogram. Heatmap, network graph and hierarchy layouts are deferred |
| **graphics** | usable | WebGL overlay and a Babylon adapter. `engine: 'webgpu'` is accepted and **runs WebGL** — real WebGPU is not implemented |
| **maps** | **in development** | 3D buildings, marker clustering, geocoding/search, drawing tools and routing are all unbuilt |
| **auth** | usable, broad | sign-in flows, sessions, guards and the full account-settings surface — MFA management, connected OAuth providers, changing an email address, deleting an account, and session-lifetime management over a server-owned cookie. It speaks to one backend shape |

Accessibility: `svelte-check --fail-on-warnings` is clean across all 19
workspaces, and `charts` has a keyboard cursor, a data-table fallback and an AA
review. No independent WCAG 2.1 AA audit has been done on the other packages.

## Features

- ✅ **Pure Reducers**: Predictable state management with `(state, action, deps) => [newState, effect]`
- ✅ **Declarative Effects**: Side effects as data structures (run, fireAndForget, batch, merge, cancel)
- ✅ **Composability**: Nest and scope reducers like Lego blocks
- ✅ **Type-Safe Navigation**: State-driven navigation with Modal, Sheet, Drawer, Alert, NavigationStack
- ✅ **Svelte 5 Runes**: Full integration with Svelte's reactivity system (`$state`, `$derived`)
- ✅ **TestStore**: Exhaustive action testing with send/receive pattern
- ✅ **Complete Backend**: API client, WebSocket, Storage, Clock dependencies
- ✅ **Component library**: shadcn-svelte integration with reducer-driven patterns — browse the full set in [the styleguide](examples/styleguide)
- ✅ **URL Routing**: Browser history sync with pattern matching
- ✅ **Auth**: Sessions plus password sign-in, signup, email verification, password recovery, MFA, OAuth, magic links and account settings — headless flows and styled components, over injected dependencies. See [`@composable-svelte/auth`](./packages/auth/README.md)

## Quick Start

### Installation

```bash
npm install @composable-svelte/core
# or
pnpm add @composable-svelte/core
```

> **Note on versions.** `@composable-svelte/core` **is** on npm, but the latest
> published version is **0.5.2** while this repository is at **0.11.2** — so
> `npm install` gets you an API six minor versions older than the one documented
> here, and the sibling packages pin `@composable-svelte/core ^0.11.0`, which the
> registry cannot satisfy. Until a release is cut, clone the repo.
>
> (This note previously said the package was "not yet published to npm", while
> `packages/core/README.md` carried an npm version badge and an install command
> one screen apart. Both cannot be true.)

### Versioning

**This project is on a 0.x line, and staying there is a deliberate choice.**

Measured across the history: **57 commits carry a breaking marker** — graphics
21, chat 11, auth 7, core 6, charts 6, maps 5, media 4, code 3. That is a lot of
breakage to have shipped under `0.x` minors, and it is the sort of thing that
deserves defending rather than assuming.

The reason is that the API is still moving where it matters. Several of those 57
were the *result* of review finding a shape wrong — a component that could not
be wrapped, an export that reached nothing, a peer range that widened its
ceiling and left its floor behind. A 1.0 is a promise not to do that again, and
the honest position today is that more of it is likely.

So, concretely, on this line:

- **A breaking change bumps the minor** — `0.11.x` → `0.12.0`. Under semver,
  `^0.11.0` does not match `0.12.0`, so a consumer is not moved onto a breaking
  change by a caret range.
- **A fix or an addition bumps the patch.**
- **Satellites track core exactly.** Each pins `@composable-svelte/core` to
  `^<major>.<minor>.0` of the core it is built against, enforced by
  `packages/core/tests/repo/peer-ranges.test.ts`. Ranges are never widened by
  appending, which moves a ceiling and leaves the floor behind.

**What would move this to 1.0:** a release cycle that goes by without review
turning up a shape that has to change, and a WCAG audit the project has not had.
Until both, `0.x` is the accurate signal.

### Styling (component library)

The components need Tailwind CSS. On **Tailwind v4** one import does everything:

```css
@import 'tailwindcss';
@import '@composable-svelte/core/styles/tailwind.css';
```

On **Tailwind v3**, extend the published preset in `tailwind.config.js`
(`presets: [composableSvelte]`) and import `@composable-svelte/core/styles/globals.css`.

Skipping this is what makes popovers and dropdowns render see-through — Tailwind
resolves the theme tokens to nothing. Full setup, theming and troubleshooting:
[packages/core README](packages/core/README.md#styling--theming).

### Basic Example

```typescript
import { createStore, Effect } from '@composable-svelte/core';

// 1. Define your state
interface CounterState {
  count: number;
  isLoading: boolean;
}

// 2. Define your actions
type CounterAction =
  | { type: 'increment' }
  | { type: 'decrement' }
  | { type: 'incrementAsync' }
  | { type: 'incrementCompleted' };

// 3. Create a reducer
const counterReducer = (
  state: CounterState,
  action: CounterAction,
  deps: {}
): [CounterState, Effect<CounterAction>] => {
  switch (action.type) {
    case 'increment':
      return [{ ...state, count: state.count + 1 }, Effect.none()];

    case 'decrement':
      return [{ ...state, count: state.count - 1 }, Effect.none()];

    case 'incrementAsync':
      return [
        { ...state, isLoading: true },
        Effect.run(async (dispatch) => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          dispatch({ type: 'incrementCompleted' });
        })
      ];

    case 'incrementCompleted':
      return [
        { ...state, count: state.count + 1, isLoading: false },
        Effect.none()
      ];
  }
};

// 4. Create the store
const store = createStore({
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer,
  dependencies: {}
});
```

### In Svelte Component

```svelte
<script lang="ts">
  import { store } from './counter-store';
</script>

<div>
  <h1>Count: {store.state.count}</h1>
  <button onclick={() => store.dispatch({ type: 'increment' })}>
    +
  </button>
  <button onclick={() => store.dispatch({ type: 'decrement' })}>
    -
  </button>
  <button
    onclick={() => store.dispatch({ type: 'incrementAsync' })}
    disabled={store.state.isLoading}
  >
    Async +
  </button>
</div>
```

## Core Concepts

### 1. Store

The store holds your app state and provides:
- `state`: Reactive Svelte 5 rune
- `dispatch(action)`: Send actions to the reducer
- `subscribe(listener)`: Listen to state changes

```typescript
const store = createStore({
  initialState,
  reducer,
  dependencies
});

// Access state (reactive)
console.log(store.state.count);

// Dispatch actions
store.dispatch({ type: 'increment' });
```

### 2. Reducers

Pure functions that take state + action and return new state + effects:

```typescript
const reducer = (state, action, deps) => {
  // Return [newState, effect]
  return [newState, Effect.none()];
};
```

### 3. Effects

Declarative side effects as data structures:

```typescript
// Run async work
Effect.run(async (dispatch) => {
  const data = await fetch('/api/data');
  dispatch({ type: 'dataLoaded', data });
});

// Fire and forget
Effect.fireAndForget(async () => {
  await analytics.track('button_clicked');
});

// Batch multiple effects
Effect.batch(
  Effect.run(/* ... */),
  Effect.fireAndForget(/* ... */)
);

// No effect
Effect.none();
```

### 4. Composition

Nest reducers to build complex features:

```typescript
import { scope, combineReducers } from '@composable-svelte/core';

// Compose child reducer into parent
const appReducer = scope(
  // Lens: extract child state
  (state) => state.counter,
  // Update: set child state
  (state, counter) => ({ ...state, counter }),
  // Extract child action
  (action) => action.type === 'counter' ? action.action : null,
  // Embed child action
  (childAction) => ({ type: 'counter', action: childAction }),
  // Child reducer
  counterReducer
);
```

### 5. Navigation

State-driven navigation with tree-based destinations:

```typescript
import { ifLet, PresentationAction } from '@composable-svelte/core';
import { Modal } from '@composable-svelte/core/navigation-components';

interface AppState {
  destination: AddItemState | null;
}

// In reducer
case 'addButtonTapped':
  return [
    { ...state, destination: { title: '', description: '' } },
    Effect.none()
  ];

// In component
{#if scopedStore}
  <Modal store={scopedStore}>
    <AddItemForm />
  </Modal>
{/if}
```

## Testing

Use `TestStore` for exhaustive action testing:

```typescript
import { createTestStore } from '@composable-svelte/core/test';

const store = createTestStore({
  // The initial state has to carry every field the assertions below read —
  // `isLoading` included, or the example does not compile for a reader either.
  initialState: { count: 0, isLoading: false },
  reducer: counterReducer
});

// Test action
await store.send({ type: 'increment' }, (state) => {
  expect(state.count).toBe(1);
});

// Test async effects
await store.send({ type: 'incrementAsync' }, (state) => {
  expect(state.isLoading).toBe(true);
});

await store.receive({ type: 'incrementCompleted' }, (state) => {
  expect(state.count).toBe(1);
  expect(state.isLoading).toBe(false);
});
```

## Backend Integration

### API Client

```typescript
import { createAPIClient } from '@composable-svelte/core/api';

const api = createAPIClient({
  baseURL: 'https://api.example.com',
  // `interceptors` is a list, and a request interceptor is an object with
  // `onRequest(url, config)` — it receives the URL as well as the config.
  interceptors: [
    {
      onRequest: async (url, config) => ({
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${token}` }
      })
    }
  ]
});

// In reducer
Effect.run(async (dispatch) => {
  const result = await deps.api.get('/users');
  if (result.ok) {
    dispatch({ type: 'usersLoaded', users: result.data });
  }
});
```

### WebSocket

```typescript
import { createLiveWebSocket } from '@composable-svelte/core/websocket';

const ws = createLiveWebSocket({
  url: 'wss://api.example.com/ws',
  reconnect: {
    enabled: true,
    maxAttempts: 5,
    delayMs: 1000
  },
  heartbeat: {
    enabled: true,
    intervalMs: 30000
  }
});

// In reducer
Effect.run(async (dispatch) => {
  // `subscribe` takes a message listener and returns an unsubscribe function;
  // lifecycle events come from `subscribeToEvents`.
  ws.subscribe((data) => {
    dispatch({ type: 'messageReceived', data });
  });
  await ws.connect('wss://api.example.com');
});
```

### Storage & Clock

```typescript
import {
  createSystemClock,
  createLocalStorage
} from '@composable-svelte/core/dependencies';

const dependencies = {
  clock: createSystemClock(),
  storage: createLocalStorage<User>({
    prefix: 'app:',
    validator: isUser
  })
};

// In reducer
deps.storage.setItem('user', currentUser);
const timestamp = deps.clock.now();
```

## Examples

Explore working examples in the `examples/` directory:

- **[Styleguide](./examples/styleguide)**: Component showcase — browse the full set there, including a working demo of every auth flow
- **[Product Gallery](./examples/product-gallery)**: Full-featured product browsing app
- **[URL Routing](./examples/url-routing)**: Browser history integration examples
- **[Auth Server](./examples/auth-server)**: A reference backend for `@composable-svelte/auth`, and a client driving every flow against it — the only example that talks to a real server rather than a mock

```bash
# Run styleguide
cd examples/styleguide
pnpm install
pnpm dev
```

## Documentation

- **[API Documentation](./packages/core/src/lib/dependencies/README.md)**: Dependencies module
- **[Security Guide](./packages/core/src/lib/dependencies/SECURITY.md)**: Storage security best practices
- **[Auth](./packages/auth/README.md)**: Sessions, the sign-in flows, and the backend contract
- **[Architecture & tutorial guide](./guides/README.md)**: Every package, and a feature built from scratch
- **[CLAUDE.md](./CLAUDE.md)**: Full project documentation for contributors

## Architecture

Inspired by [The Composable Architecture (TCA)](https://github.com/pointfreeco/swift-composable-architecture):

| TCA (Swift) | Composable Svelte |
|-------------|-------------------|
| `@Reducer` macro | Manual reducer functions |
| `@Presents` macro | `destination: T \| null` field |
| `Scope` | `scope()` / `ifLet()` operators |
| `@Dependency(\.dismiss)` | `deps.dismiss()` |
| `TestStore` | `TestStore` (similar API) |
| SwiftUI views | Svelte components |

## Development

```bash
# Install dependencies
pnpm install

# Build first. `dist/` is gitignored, and every satellite package and example
# resolves @composable-svelte/core through its exports map, which points at
# dist — so typecheck, test and check all fail with TS2307 without this.
pnpm build

# Run tests
pnpm test

# Type check (`tsc` never reads .svelte)
pnpm typecheck

# Check components — types, props and a11y inside .svelte files
pnpm check

# Run examples
cd examples/styleguide
pnpm dev
```

## Project Status

**Completed Phases:**
- ✅ Phase 1: Core (Store, Reducer, Effects)
- ✅ Phase 2: Navigation (Modal, Sheet, Drawer)
- ✅ Phase 3: DSL & Matchers
- ✅ Phase 4: Animation
- ✅ Phase 6: Component Library (shadcn-svelte integration)
- ✅ Phase 7: URL Routing
- ✅ Phase 8: Backend Integration (API, WebSocket, Dependencies)

**Test Coverage**: 4,271 tests, all passing — measured by running `pnpm test`
on 2026-09-01, not carried over from a previous edit. Two figures used to live
in this file and they disagreed with each other; a count is the one claim here
that changes on every commit, so it is stated once and dated.
Run with `pnpm test`; it serialises the workspaces, because most of them drive a
real browser and running four at once produces failures about scheduling rather
than about code.

## Contributing

This project follows a specification-first approach. See [CLAUDE.md](./CLAUDE.md) for contributor guidelines.

## License

MIT

## Acknowledgments

Heavily inspired by [The Composable Architecture](https://github.com/pointfreeco/swift-composable-architecture) by Point-Free. Adapted for Svelte 5 and TypeScript with love.
