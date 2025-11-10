# Server-Side Rendering (SSR) for Composable Svelte - Deep Analysis

**Phase**: 14
**Status**: Planning / Architecture Design
**Last Updated**: 2025-01-10

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [SSR Fundamentals & Requirements](#ssr-fundamentals--requirements)
4. [Core Challenges](#core-challenges)
5. [Architectural Approaches](#architectural-approaches)
6. [Detailed Design Proposals](#detailed-design-proposals)
7. [Effect Handling Strategies](#effect-handling-strategies)
8. [Dependency Management in SSR](#dependency-management-in-ssr)
9. [State Serialization & Hydration](#state-serialization--hydration)
10. [Component-Level Considerations](#component-level-considerations)
11. [SvelteKit Integration Patterns](#sveltekit-integration-patterns)
12. [Testing Strategy](#testing-strategy)
13. [Migration Path](#migration-path)
14. [Performance Considerations](#performance-considerations)
15. [Open Questions & Trade-offs](#open-questions--trade-offs)
16. [Recommended Approach](#recommended-approach)

---

## Executive Summary

Adding SSR support to Composable Svelte requires careful architectural decisions that balance:
- **Isomorphic Execution**: Reducers must work on both server and client
- **Effect Isolation**: Effects requiring browser APIs must be deferred to client
- **State Hydration**: Server-rendered state must transfer cleanly to client
- **Zero Breaking Changes**: Existing client-only code must continue working
- **Developer Experience**: SSR should be opt-in and ergonomic

**Key Insight**: The current architecture is already well-suited for SSR because:
1. Store uses plain JavaScript objects (no $state runes) - already isomorphic
2. Reducers are pure functions - can run anywhere
3. Effects are data structures - can be inspected/filtered
4. Dependencies are injectable - can have server/client variants

**Recommended Strategy**: **Dual-Mode Store** with automatic environment detection and effect deferral.

---

## Current Architecture Analysis

### Store Implementation (store.ts:29-349)

```typescript
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  let state = config.initialState;  // Plain JavaScript - already isomorphic!

  // Subscription system - client-only
  const subscribers = new Set<(state: State) => void>();

  // Effect execution - client-only
  function executeEffect(effect: Effect<Action>): void { ... }
}
```

**Key Observations**:
- ✅ State is plain JavaScript - no Svelte 5 runes used
- ✅ Reducers are pure functions - already isomorphic
- ❌ Subscriptions won't work on server (no DOM)
- ❌ Effect execution assumes browser environment
- ❌ No mechanism to defer effects to client

### Effect System (effect.ts:15-548)

**Current Effect Types**:
```typescript
type Effect<Action> =
  | { _tag: 'None' }
  | { _tag: 'Run'; execute: EffectExecutor<Action> }
  | { _tag: 'FireAndForget'; execute: () => void | Promise<void> }
  | { _tag: 'Batch'; effects: readonly Effect<Action>[] }
  | { _tag: 'Cancellable'; id: string; execute: EffectExecutor<Action> }
  | { _tag: 'Debounced'; id: string; ms: number; execute: EffectExecutor<Action> }
  | { _tag: 'Throttled'; id: string; ms: number; execute: EffectExecutor<Action> }
  | { _tag: 'AfterDelay'; ms: number; execute: EffectExecutor<Action> }
  | { _tag: 'Subscription'; id: string; setup: SubscriptionSetup<Action> };
```

**SSR Compatibility**:
- ✅ `None` - Safe everywhere
- ⚠️ `Run` - Depends on what it executes
- ❌ `FireAndForget` - Usually browser-only (analytics, logging)
- ⚠️ `Batch` - Depends on child effects
- ❌ `Cancellable` - Uses AbortController (browser API)
- ❌ `Debounced/Throttled` - Uses setTimeout (Node has it, but timing differs)
- ❌ `AfterDelay` - Uses setTimeout
- ❌ `Subscription` - Usually WebSocket/EventSource (browser-specific)

**Challenge**: No way to mark effects as "server-safe" vs "client-only"

### Dependencies (packages/core/src/lib/dependencies/)

Current dependencies:
- **Clock**: ✅ Works on server (Date.now())
- **LocalStorage**: ❌ Browser-only API
- **CookieStorage**: ⚠️ Can work on server with request headers
- **WebSocket**: ❌ Browser WebSocket API
- **API Client**: ✅ Can work with Node fetch
- **Dismiss**: ✅ Context-based, could work

**Pattern**: Dependencies are injectable - perfect for server/client variants!

---

## SSR Fundamentals & Requirements

### What is SSR in Svelte 5?

**Server-Side Rendering Flow**:
```
1. Request → Server
2. Server runs Svelte component → HTML string
3. Server sends HTML + serialized data to client
4. Client downloads JavaScript
5. Hydration: JavaScript "attaches" to HTML, making it interactive
```

**Svelte 5 Runes in SSR**:
- `$state`: Runs on server but doesn't create reactivity (just a value)
- `$derived`: Computes once on server
- `$effect`: **Does NOT run on server** (client-only side effects)
- `$props`: Works on server (prop passing)

**Key Insight**: Svelte 5 components already support SSR - the question is how our **Store** fits in.

### Requirements for Composable Svelte SSR

1. **Isomorphic Reducers**: Must execute identically on server and client
2. **Effect Deferral**: Client-only effects must not execute on server
3. **State Hydration**: Server state must transfer to client without loss
4. **Zero Client Impact**: Existing client-only code must not break
5. **Opt-In SSR**: Developers choose when to use SSR (not forced)
6. **Deep Linking**: URLs should restore full application state
7. **SEO Friendly**: Content must be in initial HTML
8. **Performance**: No double data fetching (server + client)

---

## Core Challenges

### Challenge 1: Effect Execution Environment

**Problem**: Many effects assume browser environment.

```typescript
// This effect will crash on server
Effect.run(async (dispatch) => {
  const data = await fetch('/api/data');  // Node fetch exists
  localStorage.setItem('cache', data);    // ❌ CRASH: localStorage undefined
  dispatch({ type: 'dataLoaded', data });
});
```

**Solutions**:
- **A. Effect Filtering**: Mark effects as client-only, skip on server
- **B. Effect Deferral**: Collect effects on server, execute on client
- **C. Effect Wrapping**: Wrap effects in environment checks
- **D. Server-Safe Effects**: Only allow safe effects on server

### Challenge 2: State Serialization

**Problem**: Not all state can be serialized to JSON.

```typescript
interface AppState {
  user: User;                // ✅ Serializable
  connection: WebSocket;     // ❌ Cannot serialize
  date: Date;                // ⚠️ Becomes string
  map: Map<string, number>;  // ❌ Becomes {}
  function: () => void;      // ❌ Cannot serialize
}
```

**Solutions**:
- **A. Serializable State Only**: Enforce JSON-serializable state
- **B. State Transformers**: Custom serialization/deserialization
- **C. Client-Only Fields**: Mark fields as non-serializable
- **D. State Snapshots**: Serialize subset of state

### Challenge 3: Subscription System

**Problem**: Server renders once - no subscriptions needed.

```typescript
// On server, this makes no sense
store.subscribe((state) => {
  updateUI(state);  // There is no UI on server!
});
```

**Solutions**:
- **A. No-Op Subscriptions**: Subscribe returns empty function on server
- **B. Lazy Subscriptions**: Only activate on client
- **C. Separate Server Store**: Different implementation for server

### Challenge 4: Dependency Injection

**Problem**: Different APIs available on server vs client.

```typescript
const dependencies = {
  storage: localStorage,        // ❌ Server has no localStorage
  fetch: window.fetch,          // ❌ Server uses different fetch
  websocket: new WebSocket(...) // ❌ Server can't create WebSocket
};
```

**Solutions**:
- **A. Environment Detection**: Auto-select server/client variants
- **B. Explicit Variants**: Developer passes server/client deps
- **C. Dependency Factories**: Function creates appropriate variant
- **D. Polyfills**: Server implementations of browser APIs

### Challenge 5: Animation & PresentationState

**Problem**: Can't animate on server - but state includes animation lifecycle.

```typescript
interface FeatureState {
  destination: DestinationState | null;
  presentation: {
    status: 'idle' | 'presenting' | 'presented' | 'dismissing';
    content: DestinationState | null;
  };
}
```

**Questions**:
- Should server render in 'presenting' state and client animates in?
- Or should server skip to 'presented' state?
- How do we avoid flash of incorrect state?

**Solutions**:
- **A. Immediate Presented**: Server renders 'presented', client never animates on mount
- **B. Client Animation**: Server renders 'presented', client re-animates if desired
- **C. Animation Skip Flag**: State indicates "skip animation on hydration"

---

## Architectural Approaches

### Approach 1: Dual Store Implementation

**Concept**: Separate `createServerStore()` and `createClientStore()` implementations.

```typescript
// Server implementation
export function createServerStore<State, Action>(
  config: StoreConfig<State, Action>
): ServerStore<State, Action> {
  let state = config.initialState;

  function dispatch(action: Action): void {
    const [newState, effect] = config.reducer(state, action, config.dependencies);
    state = newState;
    // ❌ Skip effects on server
  }

  return {
    get state() { return state; },
    dispatch,
    select: (s) => s(state),
    subscribe: () => () => {}, // No-op
    destroy: () => {}
  };
}

// Client implementation (current store.ts)
export function createClientStore<State, Action>(
  config: StoreConfig<State, Action>
): Store<State, Action> {
  // Current implementation
}

// Auto-detect environment
export function createStore<State, Action>(
  config: StoreConfig<State, Action>
): Store<State, Action> {
  if (typeof window === 'undefined') {
    return createServerStore(config) as Store<State, Action>;
  }
  return createClientStore(config);
}
```

**Pros**:
- ✅ Clean separation of concerns
- ✅ Server implementation can be heavily optimized
- ✅ Zero overhead on client

**Cons**:
- ❌ Code duplication
- ❌ Two implementations to maintain
- ❌ Type casting needed for unified interface

### Approach 2: Effect Deferral System

**Concept**: Server collects effects but doesn't execute them. Client receives deferred effects and executes on hydration.

```typescript
type DeferredEffect<A> = {
  _tag: 'Deferred';
  effect: Effect<A>;
};

// Add to Effect union
type Effect<Action> =
  | { _tag: 'None' }
  | { _tag: 'Run'; execute: EffectExecutor<Action> }
  | { _tag: 'Deferred'; effect: Effect<Action> }  // NEW
  | ... existing types;

// Effect constructor
Effect.defer = <A>(effect: Effect<A>): Effect<A> => ({
  _tag: 'Deferred',
  effect
});

// Server: Mark all unsafe effects as deferred
case 'loadData': {
  return [
    { ...state, isLoading: true },
    isServer
      ? Effect.defer(Effect.run(async (d) => { /* fetch data */ }))
      : Effect.run(async (d) => { /* fetch data */ })
  ];
}
```

**Serialization**:
```typescript
interface HydrationData<State> {
  state: State;
  deferredEffects: SerializedEffect[];  // Effects to run on client
}

// Server sends this in HTML
<script id="hydration-data" type="application/json">
  {
    "state": { "count": 0 },
    "deferredEffects": [
      { "type": "loadData" }  // Client knows to dispatch this
    ]
  }
</script>
```

**Pros**:
- ✅ Unified store implementation
- ✅ Explicit about what runs where
- ✅ Can replay effects on client

**Cons**:
- ❌ Effects need to be serializable (complex)
- ❌ Timing unclear: when to replay effects?
- ❌ Increases hydration payload size

### Approach 3: Server-Safe Effect Subset

**Concept**: Only allow specific effect types on server. Filter out unsafe effects automatically.

```typescript
function isServerSafe<A>(effect: Effect<A>): boolean {
  switch (effect._tag) {
    case 'None':
      return true;
    case 'Run':
      // Could inspect execute.toString() for browser APIs (fragile)
      return false;  // Conservative: assume unsafe
    case 'Batch':
      return effect.effects.every(isServerSafe);
    default:
      return false;  // All other effects are client-only
  }
}

function executeEffect(effect: Effect<Action>): void {
  if (isServer && !isServerSafe(effect)) {
    // Skip effect on server
    return;
  }
  // ... existing execution logic
}
```

**Pros**:
- ✅ Automatic, no developer annotation needed
- ✅ Safe by default
- ✅ Zero configuration

**Cons**:
- ❌ Too conservative (might skip safe effects)
- ❌ No way to run server-specific effects (data fetching)
- ❌ Silent failures (effects just don't run)

### Approach 4: Explicit Server/Client Effects

**Concept**: Add `Effect.serverOnly()` and `Effect.clientOnly()` variants.

```typescript
Effect.clientOnly = <A>(effect: Effect<A>): Effect<A> => ({
  _tag: 'ClientOnly',
  effect
});

Effect.serverOnly = <A>(effect: Effect<A>): Effect<A> => ({
  _tag: 'ServerOnly',
  effect
});

// Usage
case 'loadData': {
  return [
    { ...state, isLoading: true },
    Effect.batch(
      // Fetch data on server
      Effect.serverOnly(
        Effect.run(async (d) => {
          const data = await serverDb.query();
          d({ type: 'dataLoaded', data });
        })
      ),
      // Track analytics on client
      Effect.clientOnly(
        Effect.fireAndForget(() => {
          analytics.track('loadData');
        })
      )
    )
  ];
}
```

**Pros**:
- ✅ Explicit and clear
- ✅ Can optimize for each environment
- ✅ Type-safe

**Cons**:
- ❌ Verbose (extra wrapping)
- ❌ Easy to forget wrapping
- ❌ Breaks existing code (not backward compatible)

---

## Detailed Design Proposals

### Proposal 1: Isomorphic Store with Effect Environment Filtering

**Core Principle**: Single store implementation that adapts to environment.

#### Type Definitions

```typescript
/**
 * Store configuration with optional SSR settings.
 */
export interface StoreConfig<State, Action, Dependencies = any> {
  initialState: State;
  reducer: Reducer<State, Action, Dependencies>;
  dependencies?: Dependencies;
  maxHistorySize?: number;

  // NEW: SSR configuration
  ssr?: {
    /**
     * If true, effects are never executed on server.
     * Default: true (safe by default)
     */
    deferEffects?: boolean;

    /**
     * Custom function to determine if effect is server-safe.
     * If not provided, all effects are deferred on server.
     */
    isEffectServerSafe?: (effect: Effect<Action>) => boolean;

    /**
     * Custom state serializer for SSR.
     * Default: JSON.stringify
     */
    serializeState?: (state: State) => string;

    /**
     * Custom state deserializer for hydration.
     * Default: JSON.parse
     */
    deserializeState?: (data: string) => State;
  };
}

/**
 * Hydration data passed from server to client.
 */
export interface HydrationData<State> {
  state: State;
  timestamp: number;  // Server render timestamp
  version?: string;   // App version (for cache busting)
}
```

#### Store Implementation

```typescript
export function createStore<State, Action, Dependencies = any>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  const isServer = typeof window === 'undefined';
  const deferEffects = config.ssr?.deferEffects ?? true;

  let state = config.initialState;
  const actionHistory: Action[] = [];
  const inFlightEffects = new Map<string, AbortController>();
  const subscriptionCleanups = new Map<string, () => void | Promise<void>>();
  const subscribers = new Set<(state: State) => void>();
  const actionSubscribers = new Set<(action: Action, state: State) => void>();

  function dispatchCore(action: Action): void {
    // Record action
    if (config.maxHistorySize !== 0) {
      actionHistory.push(action);
      if (config.maxHistorySize && actionHistory.length > config.maxHistorySize) {
        actionHistory.shift();
      }
    }

    // Run reducer
    const [newState, effect] = config.reducer(
      state,
      action,
      config.dependencies as Dependencies
    );

    // Update state
    if (!Object.is(state, newState)) {
      state = newState;
      subscribers.forEach(listener => {
        try {
          listener(state);
        } catch (error) {
          console.error('[Composable Svelte] Subscriber error:', error);
        }
      });
    }

    // Notify action subscribers
    actionSubscribers.forEach(listener => {
      try {
        listener(action, state);
      } catch (error) {
        console.error('[Composable Svelte] Action subscriber error:', error);
      }
    });

    // Execute effect based on environment
    if (effect._tag !== 'None') {
      if (isServer && deferEffects) {
        // On server with deferEffects: true, skip all effects
        // This is safe default behavior
      } else if (isServer && config.ssr?.isEffectServerSafe) {
        // Custom server-safe check
        if (config.ssr.isEffectServerSafe(effect)) {
          executeEffect(effect);
        }
      } else if (!isServer) {
        // Client: always execute
        executeEffect(effect);
      }
    }
  }

  // ... rest of implementation (unchanged)

  return {
    get state() { return state; },
    dispatch: dispatchCore,
    select: (s) => s(state),
    subscribe,
    subscribeToActions,
    get history() { return actionHistory; },
    destroy
  };
}
```

#### Hydration Helpers

```typescript
/**
 * Serialize store state for SSR.
 * Call this on server to get state to send to client.
 */
export function serializeStore<State, Action>(
  store: Store<State, Action>,
  config?: StoreConfig<State, Action>
): string {
  const serialize = config?.ssr?.serializeState ?? JSON.stringify;
  const hydrationData: HydrationData<State> = {
    state: store.state,
    timestamp: Date.now()
  };
  return serialize(hydrationData);
}

/**
 * Create store with hydrated state from server.
 * Call this on client to restore server state.
 */
export function hydrateStore<State, Action, Dependencies = any>(
  serializedData: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  const deserialize = config.ssr?.deserializeState ?? JSON.parse;
  const hydrationData: HydrationData<State> = deserialize(serializedData);

  return createStore({
    ...config,
    initialState: hydrationData.state
  });
}
```

**Pros**:
- ✅ Single implementation
- ✅ Safe by default (all effects deferred)
- ✅ Opt-in customization
- ✅ Backward compatible

**Cons**:
- ❌ Effects are "lost" on server (no deferred execution)
- ❌ Requires manual hydration setup

---

### Proposal 2: Effect Metadata System

**Core Principle**: Effects carry metadata about execution environment.

#### Effect Metadata

```typescript
/**
 * Metadata for effect execution.
 */
export interface EffectMetadata {
  /**
   * Can this effect run on server?
   * Default: false (client-only)
   */
  serverSafe?: boolean;

  /**
   * Should this effect be deferred to client even if server-safe?
   * Useful for effects that should only run once on client.
   */
  deferToClient?: boolean;

  /**
   * Priority for execution order.
   * Higher priority effects run first.
   */
  priority?: number;
}

/**
 * Effect with optional metadata.
 */
export type Effect<Action> =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Run'; readonly execute: EffectExecutor<Action>; readonly meta?: EffectMetadata }
  | { readonly _tag: 'FireAndForget'; readonly execute: () => void | Promise<void>; readonly meta?: EffectMetadata }
  | { readonly _tag: 'Batch'; readonly effects: readonly Effect<Action>[]; readonly meta?: EffectMetadata }
  // ... other types with meta field
```

#### Effect Constructors

```typescript
export const Effect = {
  /**
   * Run effect (client-only by default).
   */
  run<A>(
    execute: EffectExecutor<A>,
    meta?: EffectMetadata
  ): Effect<A> {
    return { _tag: 'Run', execute, meta };
  },

  /**
   * Run effect that is safe on server.
   */
  runServer<A>(execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Run', execute, meta: { serverSafe: true } };
  },

  /**
   * Run effect only on client (even if technically server-safe).
   */
  runClient<A>(execute: EffectExecutor<A>): Effect<A> {
    return { _tag: 'Run', execute, meta: { deferToClient: true } };
  },

  // ... other constructors
};
```

#### Execution Logic

```typescript
function shouldExecuteEffect<A>(
  effect: Effect<A>,
  isServer: boolean
): boolean {
  // Get metadata with defaults
  const meta = 'meta' in effect ? effect.meta : undefined;
  const serverSafe = meta?.serverSafe ?? false;
  const deferToClient = meta?.deferToClient ?? false;

  if (isServer) {
    // On server: only execute if serverSafe AND not deferToClient
    return serverSafe && !deferToClient;
  }

  // On client: always execute
  return true;
}

function executeEffect(effect: Effect<Action>): void {
  if (!shouldExecuteEffect(effect, isServer)) {
    return;  // Skip execution
  }

  // ... existing execution logic
}
```

**Pros**:
- ✅ Explicit and type-safe
- ✅ Fine-grained control
- ✅ Self-documenting code

**Cons**:
- ❌ Breaking change (adds meta field to all effects)
- ❌ Verbose for common cases
- ❌ Easy to forget metadata

---

## Effect Handling Strategies

### Strategy 1: Pure Deferral (Recommended)

**Concept**: Server never executes effects. Client executes all effects after hydration.

```typescript
// Server
const store = createStore({
  initialState,
  reducer,
  ssr: { deferEffects: true }  // Default
});

// Initial action triggers effect, but it's skipped on server
store.dispatch({ type: 'init' });

// State is updated, effect is ignored
const html = renderToString(App, { store });
const serialized = serializeStore(store);

// Client
const hydrated = hydrateStore(serialized, {
  initialState,  // Will be overridden by hydration data
  reducer
});

// On mount, re-dispatch init to trigger effects
onMount(() => {
  hydrated.dispatch({ type: 'init' });
});
```

**Pros**:
- ✅ Simple and safe
- ✅ No complex serialization
- ✅ Predictable behavior

**Cons**:
- ❌ Duplicate action dispatching
- ❌ Might cause flicker if state changes
- ❌ Timing issues (when to re-dispatch?)

### Strategy 2: Server Data Fetching

**Concept**: Server executes data-fetching effects, client executes UI effects.

```typescript
// Mark data-fetching effects as server-safe
Effect.runServer(async (dispatch) => {
  const data = await fetch('/api/data');
  dispatch({ type: 'dataLoaded', data: await data.json() });
});

// Mark analytics as client-only
Effect.runClient(() => {
  analytics.track('pageView');
});

// Server: Runs data fetch, skips analytics
// Client: Skips data fetch (already in state), runs analytics
```

**Pros**:
- ✅ No double data fetching
- ✅ Faster client hydration
- ✅ SEO benefits (data in initial HTML)

**Cons**:
- ❌ Complex effect classification
- ❌ Requires different dependencies on server/client
- ❌ Risk of state mismatch

### Strategy 3: Effect Replay Buffer

**Concept**: Server buffers effects, client decides which to replay.

```typescript
interface ServerRenderResult<State> {
  state: State;
  effects: Action[];  // Actions that would trigger effects
}

// Server
const effectsBuffer: Action[] = [];
const store = createStore({
  initialState,
  reducer,
  ssr: {
    deferEffects: true,
    onEffectDeferred: (action) => {
      effectsBuffer.push(action);
    }
  }
});

// Client receives both state and effect actions
const result: ServerRenderResult<State> = {
  state: store.state,
  effects: effectsBuffer
};

// Client decides which effects to replay
onMount(() => {
  result.effects.forEach(action => {
    if (shouldReplay(action)) {
      hydratedStore.dispatch(action);
    }
  });
});
```

**Pros**:
- ✅ Flexible replay logic
- ✅ Client control over re-execution
- ✅ Can skip unnecessary effects

**Cons**:
- ❌ Complex mental model
- ❌ Requires serializable actions
- ❌ Increases payload size

---

## Dependency Management in SSR

### Pattern 1: Environment-Aware Dependencies

```typescript
import { isServer } from '@composable-svelte/core/utils';

const dependencies = {
  storage: isServer
    ? createNoOpStorage()      // Server: no-op implementation
    : createLocalStorage(),    // Client: real localStorage

  api: isServer
    ? createServerAPI(fetch)    // Server: Node fetch
    : createBrowserAPI(),       // Client: window.fetch

  websocket: isServer
    ? createNoOpWebSocket()     // Server: no-op
    : createWebSocket()         // Client: real WebSocket
};

const store = createStore({
  initialState,
  reducer,
  dependencies
});
```

**Pros**:
- ✅ Single configuration
- ✅ Automatic environment detection
- ✅ Type-safe

**Cons**:
- ❌ Increases bundle size (includes server code in client)
- ❌ Requires tree-shaking to remove dead code

### Pattern 2: Dependency Factories

```typescript
function createDependencies(options: {
  isServer: boolean;
  serverApi?: ServerAPI;
  clientApi?: ClientAPI;
}) {
  if (options.isServer) {
    return {
      storage: createNoOpStorage(),
      api: options.serverApi!
    };
  }
  return {
    storage: createLocalStorage(),
    api: options.clientApi!
  };
}

// Server
const serverDeps = createDependencies({
  isServer: true,
  serverApi: createServerAPI()
});

// Client
const clientDeps = createDependencies({
  isServer: false,
  clientApi: createBrowserAPI()
});
```

**Pros**:
- ✅ Clean separation
- ✅ No dead code
- ✅ Explicit configuration

**Cons**:
- ❌ Duplicate setup code
- ❌ Easy to forget server deps

### Pattern 3: Dependency Injection via SvelteKit

```typescript
// +page.server.ts
export async function load({ fetch }) {
  const serverDeps = {
    api: createServerAPI(fetch),  // SvelteKit's fetch
    storage: createNoOpStorage()
  };

  const store = createStore({
    initialState,
    reducer,
    dependencies: serverDeps
  });

  // Trigger initial data load
  store.dispatch({ type: 'init' });

  return {
    initialState: store.state
  };
}

// +page.svelte
<script lang="ts">
  export let data;

  const clientDeps = {
    api: createBrowserAPI(),
    storage: createLocalStorage()
  };

  const store = hydrateStore(
    JSON.stringify({ state: data.initialState }),
    {
      initialState: data.initialState,
      reducer,
      dependencies: clientDeps
    }
  );
</script>
```

**Pros**:
- ✅ Leverages SvelteKit patterns
- ✅ Clear server/client boundary
- ✅ No environment detection needed

**Cons**:
- ❌ Only works with SvelteKit
- ❌ More boilerplate

---

## State Serialization & Hydration

### Challenge: Non-Serializable State

```typescript
interface AppState {
  user: User;                    // ✅ Serializable
  connections: WebSocket[];      // ❌ Cannot serialize
  cache: Map<string, Data>;      // ❌ Serializes to {}
  timestamp: Date;               // ⚠️ Becomes ISO string
  abortController: AbortController; // ❌ Cannot serialize
}
```

### Solution 1: Serializable State Enforcement

```typescript
/**
 * Type guard for serializable values.
 */
type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { [key: string]: Serializable };

/**
 * Enforce serializable state at type level.
 */
export function createSSRStore<
  State extends Serializable,
  Action,
  Dependencies = any
>(
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  // State is guaranteed serializable
  return createStore(config);
}
```

**Pros**:
- ✅ Type-safe at compile time
- ✅ Prevents serialization errors
- ✅ Clear constraints

**Cons**:
- ❌ Restrictive (can't use Map, Set, Date, etc.)
- ❌ Breaking change for existing code

### Solution 2: State Transformers

```typescript
interface StoreConfig<State, Action, Dependencies> {
  // ... existing fields

  ssr?: {
    /**
     * Transform state before serialization.
     * Convert non-serializable fields to serializable equivalents.
     */
    toSerializable?: (state: State) => Serializable;

    /**
     * Restore state after deserialization.
     * Convert serializable data back to full state.
     */
    fromSerializable?: (data: Serializable) => State;
  };
}

// Example usage
const store = createStore({
  initialState: {
    user: null,
    connections: [],
    timestamp: new Date()
  },
  reducer,
  ssr: {
    toSerializable: (state) => ({
      user: state.user,
      // Omit connections (will be re-created on client)
      timestamp: state.timestamp.toISOString()
    }),
    fromSerializable: (data) => ({
      user: data.user,
      connections: [],  // Empty on hydration
      timestamp: new Date(data.timestamp)
    })
  }
});
```

**Pros**:
- ✅ Flexible and powerful
- ✅ Handles complex state
- ✅ Backward compatible

**Cons**:
- ❌ Manual transformation code
- ❌ Easy to forget fields
- ❌ Potential for bugs

### Solution 3: Partial Hydration

```typescript
/**
 * Mark fields as non-hydrated (client-only).
 */
interface StateMetadata {
  hydratable: (keyof State)[];
  clientOnly: (keyof State)[];
}

function partialHydrate<State>(
  serverState: Partial<State>,
  initialState: State,
  metadata: StateMetadata
): State {
  const hydrated = { ...initialState };

  metadata.hydratable.forEach(key => {
    if (key in serverState) {
      hydrated[key] = serverState[key]!;
    }
  });

  return hydrated;
}

// Usage
const hydratedState = partialHydrate(
  serverState,
  initialState,
  {
    hydratable: ['user', 'items'],
    clientOnly: ['connections', 'abortController']
  }
);
```

**Pros**:
- ✅ Clear separation
- ✅ No transformation needed
- ✅ Client fields always initialized

**Cons**:
- ❌ Requires metadata maintenance
- ❌ Risk of forgetting fields

---

## Component-Level Considerations

### Navigation Components (Modal, Sheet, Drawer)

**Challenge**: Animation on server makes no sense.

```typescript
// Server renders this state
{
  destination: { type: 'addItem', state: {...} },
  presentation: {
    status: 'presenting',  // ⚠️ No animation happens on server
    content: { type: 'addItem', state: {...} }
  }
}
```

**Solution 1: Render in Final State**

```typescript
// Server: Always render as 'presented'
function serverNormalizeState(state: FeatureState): FeatureState {
  if (state.presentation.status === 'presenting') {
    return {
      ...state,
      presentation: {
        status: 'presented',
        content: state.presentation.content
      }
    };
  }
  return state;
}

// Before server render
const normalizedState = serverNormalizeState(store.state);
```

**Solution 2: Skip Animation on Hydration**

```typescript
// Client: Check if coming from SSR
const isHydrating = !browser || document.querySelector('[data-ssr-hydrated]');

$effect(() => {
  if ($store.presentation.status === 'presenting' && !isHydrating) {
    // Only animate if not hydrating
    animateIn(element);
  }
});
```

### Image Gallery & Lightbox

**Challenge**: Can't preload images on server.

```typescript
// Client-only effect
case 'openLightbox': {
  return [
    { ...state, lightbox: { open: true, index } },
    Effect.runClient(() => {
      // Preload adjacent images
      preloadImage(images[index + 1]);
      preloadImage(images[index - 1]);
    })
  ];
}
```

### Forms with Validation

**Challenge**: Server can validate, but can't show interactive errors.

**Solution**: Server validates and includes errors in state.

```typescript
// Server load function
export async function load({ request }) {
  const formData = await request.formData();
  const result = formSchema.safeParse(Object.fromEntries(formData));

  return {
    formState: {
      values: Object.fromEntries(formData),
      errors: result.success ? {} : result.error.flatten()
    }
  };
}
```

---

## SvelteKit Integration Patterns

### Pattern 1: Load Function Initialization

```typescript
// src/routes/app/+page.server.ts
import { createStore, serializeStore } from '@composable-svelte/core';
import { appReducer, type AppState, type AppAction } from './store';

export async function load({ fetch, cookies }) {
  // Create server store with server dependencies
  const store = createStore<AppState, AppAction>({
    initialState: {
      user: null,
      items: []
    },
    reducer: appReducer,
    dependencies: {
      api: createServerAPI(fetch),
      cookies: createCookieStorage(cookies)
    },
    ssr: {
      deferEffects: true  // Don't execute effects on server
    }
  });

  // Trigger initial data load (reducer will update state)
  store.dispatch({ type: 'loadInitialData' });

  // Serialize state for client
  return {
    hydrationData: serializeStore(store)
  };
}
```

```svelte
<!-- src/routes/app/+page.svelte -->
<script lang="ts">
  import { browser } from '$app/environment';
  import { hydrateStore } from '@composable-svelte/core';
  import { appReducer } from './store';

  export let data;

  // Hydrate store on client
  const store = browser
    ? hydrateStore(data.hydrationData, {
        initialState: {},  // Will be overridden
        reducer: appReducer,
        dependencies: {
          api: createBrowserAPI(),
          cookies: createLocalCookies()
        }
      })
    : createStore({
        initialState: JSON.parse(data.hydrationData).state,
        reducer: appReducer,
        dependencies: {}  // Server-rendered, no deps needed
      });
</script>

<App {store} />
```

### Pattern 2: Universal Load Function

```typescript
// src/routes/app/+page.ts (runs on both server and client)
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch, data }) => {
  const isServer = typeof window === 'undefined';

  const store = createStore({
    initialState: data?.initialState ?? getInitialState(),
    reducer: appReducer,
    dependencies: {
      api: isServer ? createServerAPI(fetch) : createBrowserAPI()
    },
    ssr: {
      deferEffects: isServer
    }
  });

  // Load data if not already loaded on server
  if (!data?.initialState) {
    store.dispatch({ type: 'loadInitialData' });
  }

  return {
    store
  };
};
```

### Pattern 3: Prerendering (SSG)

```typescript
// src/routes/blog/[slug]/+page.ts
import { error } from '@sveltejs/kit';

export const prerender = true;

export async function load({ params }) {
  const store = createStore({
    initialState: {
      post: null,
      comments: []
    },
    reducer: blogReducer,
    ssr: {
      deferEffects: true,
      isEffectServerSafe: (effect) => {
        // Allow data fetching effects on server during prerender
        return effect._tag === 'Run';
      }
    }
  });

  // Load post data (effect will execute during prerender)
  store.dispatch({ type: 'loadPost', slug: params.slug });

  if (!store.state.post) {
    throw error(404, 'Post not found');
  }

  return {
    post: store.state.post,
    comments: store.state.comments
  };
}
```

---

## Testing Strategy

### Unit Testing SSR

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createStore, serializeStore, hydrateStore } from '@composable-svelte/core';

describe('SSR Store', () => {
  it('should defer effects on server', () => {
    const effectSpy = vi.fn();

    const store = createStore({
      initialState: { count: 0 },
      reducer: (state, action) => {
        if (action.type === 'increment') {
          return [
            { count: state.count + 1 },
            Effect.run(effectSpy)
          ];
        }
        return [state, Effect.none()];
      },
      ssr: { deferEffects: true }
    });

    store.dispatch({ type: 'increment' });

    expect(store.state.count).toBe(1);
    expect(effectSpy).not.toHaveBeenCalled();  // Effect deferred
  });

  it('should serialize and hydrate state', () => {
    const serverStore = createStore({
      initialState: { count: 0 },
      reducer: counterReducer
    });

    serverStore.dispatch({ type: 'increment' });

    const serialized = serializeStore(serverStore);
    const clientStore = hydrateStore(serialized, {
      initialState: { count: 0 },
      reducer: counterReducer
    });

    expect(clientStore.state.count).toBe(1);
  });
});
```

### Integration Testing with SvelteKit

```typescript
import { render } from '@testing-library/svelte';
import { load } from './+page.server';
import Page from './+page.svelte';

describe('SSR Integration', () => {
  it('should render with server data', async () => {
    const serverData = await load({
      fetch: global.fetch,
      cookies: mockCookies
    });

    const { getByText } = render(Page, {
      props: { data: serverData }
    });

    expect(getByText(/Welcome/)).toBeInTheDocument();
  });
});
```

---

## Migration Path

### Phase 1: Core SSR Infrastructure (2 weeks)

- Add `ssr` config option to `StoreConfig`
- Implement effect deferral logic in `executeEffect()`
- Add `serializeStore()` and `hydrateStore()` helpers
- Write unit tests for SSR functionality

### Phase 2: Dependency Management (1 week)

- Create server/client variants for dependencies
- Add `createNoOpStorage()`, `createNoOpWebSocket()`, etc.
- Document environment detection patterns
- Test with both server and client

### Phase 3: SvelteKit Integration (2 weeks)

- Create example SvelteKit app with SSR
- Document load function patterns
- Test with various routing scenarios
- Add prerendering examples

### Phase 4: Component Updates (2 weeks)

- Audit all navigation components for SSR compatibility
- Update animation logic to handle hydration
- Test Modal, Sheet, Drawer, etc. with SSR
- Document SSR considerations for each component

### Phase 5: Documentation & Examples (1 week)

- Write comprehensive SSR guide
- Create example apps (e-commerce, blog, dashboard)
- Add troubleshooting section
- Document performance best practices

---

## Performance Considerations

### Server-Side Performance

**Optimizations**:
- Skip effect execution (faster renders)
- Minimal subscription overhead (no listeners)
- Single-pass state computation (no reactivity)

**Benchmarks** (target):
- Store creation: < 1ms
- Dispatch + reducer: < 0.1ms per action
- Serialization: < 1ms for typical state

### Client-Side Performance

**Hydration Speed**:
```typescript
// Measure hydration time
const start = performance.now();
const store = hydrateStore(data.hydrationData, config);
const duration = performance.now() - start;
// Target: < 5ms for typical state
```

**Bundle Size Impact**:
- Add ~2-3KB for SSR helpers
- No impact if tree-shaken (client-only builds)
- SvelteKit integration: ~1KB

### Payload Size

**State Serialization**:
```typescript
// Typical state: ~1-10KB
{
  user: { id, name, email },
  items: [...],  // 10-100 items
  ui: { ... }
}

// Compressed (gzip): ~200-500 bytes
```

**Optimization**:
- Omit client-only fields
- Use partial hydration
- Compress with gzip/brotli

---

## Open Questions & Trade-offs

### Question 1: Effect Replay Mechanism

**Options**:
A. Never replay (client re-dispatches actions)
B. Automatic replay (serialize effects)
C. Selective replay (developer marks)

**Trade-off**: Simplicity vs. flexibility vs. correctness

**Recommendation**: **A (Never replay)** - simplest and most predictable.

### Question 2: State Validation

Should we validate that serialized state matches deserialized state?

**Options**:
A. No validation (trust developer)
B. Dev-only validation (console warnings)
C. Always validate (throw errors)

**Recommendation**: **B (Dev-only)** - helps catch bugs without production overhead.

### Question 3: Streaming SSR

SvelteKit supports streaming HTML. Should stores support this?

**Options**:
A. No streaming support (initial release)
B. Support out-of-order hydration
C. Progressive state updates

**Recommendation**: **A (No streaming)** - defer to Phase 15 (Advanced SSR).

### Question 4: Middleware in SSR

Should middleware run on server?

**Options**:
A. Skip all middleware on server
B. Run middleware, mark as server-safe
C. Separate server/client middleware

**Recommendation**: **B (Run with metadata)** - most flexible.

---

## Recommended Approach

### Summary

**Strategy**: **Isomorphic Store with Effect Deferral**

**Key Decisions**:
1. ✅ Single store implementation for server and client
2. ✅ Effects deferred by default on server (safe)
3. ✅ Opt-in server-safe effects via metadata (future)
4. ✅ Explicit hydration helpers (`serializeStore`, `hydrateStore`)
5. ✅ SvelteKit integration via load functions
6. ✅ Backward compatible (existing code works unchanged)

### Implementation Plan

**Phase 1: Core Infrastructure**
```typescript
// Add to StoreConfig
interface StoreConfig<State, Action, Dependencies> {
  // ... existing
  ssr?: {
    deferEffects?: boolean;  // Default: true
  };
}

// Modify executeEffect to check environment
function executeEffect(effect: Effect<Action>): void {
  const isServer = typeof window === 'undefined';
  const deferEffects = config.ssr?.deferEffects ?? true;

  if (isServer && deferEffects) {
    return;  // Skip on server
  }

  // ... existing execution logic
}

// Add hydration helpers
export function serializeStore<State, Action>(
  store: Store<State, Action>
): string {
  return JSON.stringify({ state: store.state, timestamp: Date.now() });
}

export function hydrateStore<State, Action, Dependencies>(
  data: string,
  config: StoreConfig<State, Action, Dependencies>
): Store<State, Action> {
  const { state } = JSON.parse(data);
  return createStore({ ...config, initialState: state });
}
```

**Phase 2: SvelteKit Integration**
- Document load function patterns
- Create example apps
- Test with various routing scenarios

**Phase 3: Advanced Features** (Phase 15)
- Server-safe effect metadata
- State transformers
- Streaming SSR support

### Success Metrics

- ✅ Zero breaking changes to existing API
- ✅ < 5KB bundle size increase
- ✅ Server render time < 10ms for typical store
- ✅ Hydration time < 5ms
- ✅ 100% test coverage for SSR paths
- ✅ Complete documentation with examples

---

## Conclusion

SSR support for Composable Svelte is **highly feasible** with the recommended approach:

1. **Minimal Changes**: Add optional `ssr` config, environment detection, and hydration helpers
2. **Safe by Default**: All effects deferred on server unless explicitly marked safe
3. **Backward Compatible**: Existing client-only code continues working
4. **SvelteKit Ready**: Integrates naturally with load functions
5. **Future-Proof**: Foundation for streaming, selective hydration, and more

**Next Steps**:
1. Create detailed specification (Phase 14)
2. Prototype core infrastructure
3. Build example SvelteKit app
4. Gather feedback from community
5. Implement and release as part of v1.0

**Estimated Timeline**: 6-8 weeks for full implementation and testing.
