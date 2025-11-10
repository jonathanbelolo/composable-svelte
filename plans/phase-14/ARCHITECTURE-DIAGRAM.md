# SSR Architecture Diagram

Visual representation of the recommended SSR architecture for Composable Svelte.

---

## High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT REQUEST                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       SERVER (Node.js)                          │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  SvelteKit Load Function (+page.server.ts)            │   │
│  │                                                        │   │
│  │  const store = createStore({                          │   │
│  │    initialState,                                       │   │
│  │    reducer,                                            │   │
│  │    dependencies: serverDeps,  // Node-compatible      │   │
│  │    ssr: { deferEffects: true } // Skip effects!       │   │
│  │  });                                                   │   │
│  │                                                        │   │
│  │  store.dispatch({ type: 'init' });                    │   │
│  │                                                        │   │
│  │  return {                                              │   │
│  │    hydrationData: serializeStore(store)               │   │
│  │  };                                                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Svelte Component Rendering                           │   │
│  │                                                        │   │
│  │  - Reducer runs (pure function)                       │   │
│  │  - State updates                                       │   │
│  │  - Effects SKIPPED (deferEffects: true)               │   │
│  │  - HTML generated                                      │   │
│  └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  State Serialization                                   │   │
│  │                                                        │   │
│  │  {                                                     │   │
│  │    "state": { "count": 0, "user": {...} },            │   │
│  │    "timestamp": 1704916800000                          │   │
│  │  }                                                     │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       HTTP RESPONSE                             │
│                                                                 │
│  <!DOCTYPE html>                                                │
│  <html>                                                         │
│    <body>                                                       │
│      <!-- Server-rendered content -->                           │
│      <div>Count: 0</div>                                        │
│                                                                 │
│      <!-- Hydration data -->                                    │
│      <script id="hydration" type="application/json">            │
│        {"state":{"count":0},"timestamp":1704916800000}          │
│      </script>                                                  │
│                                                                 │
│      <!-- Client JavaScript bundle -->                          │
│      <script src="/app.js"></script>                            │
│    </body>                                                      │
│  </html>                                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       CLIENT (Browser)                          │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Hydration (+page.svelte)                             │   │
│  │                                                        │   │
│  │  export let data;                                      │   │
│  │                                                        │   │
│  │  const store = hydrateStore(                          │   │
│  │    data.hydrationData,                                │   │
│  │    {                                                   │   │
│  │      initialState,                                     │   │
│  │      reducer,                                          │   │
│  │      dependencies: clientDeps  // Browser APIs        │   │
│  │    }                                                   │   │
│  │  );                                                    │   │
│  └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Component Mount                                       │   │
│  │                                                        │   │
│  │  onMount(() => {                                       │   │
│  │    // Re-dispatch actions to trigger effects          │   │
│  │    store.dispatch({ type: 'init' });                  │   │
│  │  });                                                   │   │
│  │                                                        │   │
│  │  - Reducer runs                                        │   │
│  │  - State may update                                    │   │
│  │  - Effects EXECUTE (client environment)                │   │
│  └────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌────────────────────────────────────────────────────────┐   │
│  │  Interactive Application                               │   │
│  │                                                        │   │
│  │  ✅ Server state restored                              │   │
│  │  ✅ Effects running                                    │   │
│  │  ✅ Fully interactive                                  │   │
│  └────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Store Behavior Comparison

### Client-Only Mode (Current)

```
┌──────────────────────────────────────────────────────┐
│ createStore()                                        │
├──────────────────────────────────────────────────────┤
│ - State: $state (reactive)                           │
│ - Effects: Always execute                            │
│ - Subscriptions: Active                              │
│ - Environment: Browser only                          │
└──────────────────────────────────────────────────────┘
         │
         │ dispatch(action)
         ▼
┌──────────────────────────────────────────────────────┐
│ reducer(state, action, deps)                         │
│  → [newState, effect]                                │
└──────────────────────────────────────────────────────┘
         │
         ├──► State updated
         │
         └──► Effect executed
```

### SSR Mode (Server)

```
┌──────────────────────────────────────────────────────┐
│ createStore({ ssr: { deferEffects: true } })        │
├──────────────────────────────────────────────────────┤
│ - State: Plain object (non-reactive)                 │
│ - Effects: SKIPPED                                   │
│ - Subscriptions: No-op                               │
│ - Environment: Node.js                               │
└──────────────────────────────────────────────────────┘
         │
         │ dispatch(action)
         ▼
┌──────────────────────────────────────────────────────┐
│ reducer(state, action, serverDeps)                   │
│  → [newState, effect]                                │
└──────────────────────────────────────────────────────┘
         │
         ├──► State updated
         │
         └──► Effect IGNORED ❌
```

### SSR Mode (Client Hydration)

```
┌──────────────────────────────────────────────────────┐
│ hydrateStore(serializedData, config)                 │
├──────────────────────────────────────────────────────┤
│ - State: Restored from server                        │
│ - Effects: Execute normally                          │
│ - Subscriptions: Active                              │
│ - Environment: Browser                               │
└──────────────────────────────────────────────────────┘
         │
         │ dispatch(action) [re-dispatched on mount]
         ▼
┌──────────────────────────────────────────────────────┐
│ reducer(state, action, clientDeps)                   │
│  → [newState, effect]                                │
└──────────────────────────────────────────────────────┘
         │
         ├──► State may update
         │
         └──► Effect executed ✅
```

---

## Effect Execution Decision Tree

```
                  ┌─────────────────┐
                  │ Effect Created  │
                  └────────┬────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │ Environment?    │
                  └────┬───────┬────┘
                       │       │
              SERVER ◄─┘       └─► CLIENT
                  │                  │
                  ▼                  ▼
         ┌──────────────┐    ┌──────────────┐
         │ deferEffects?│    │ Execute      │
         └───┬──────┬───┘    │ Immediately  │
             │      │        └──────────────┘
     true ◄──┘      └──► false
         │                │
         ▼                ▼
    ┌────────┐      ┌────────────┐
    │ SKIP   │      │ Execute    │
    └────────┘      │ (if safe)  │
                    └────────────┘
```

---

## Dependency Injection Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                    Dependency Configuration                 │
└─────────────────────────────────────────────────────────────┘

SERVER DEPENDENCIES                CLIENT DEPENDENCIES
┌─────────────────────┐           ┌─────────────────────┐
│ {                   │           │ {                   │
│   api:              │           │   api:              │
│     createServerAPI │           │     createBrowserAPI│
│     (fetch),        │           │     (),             │
│                     │           │                     │
│   storage:          │           │   storage:          │
│     createNoOp      │           │     createLocal     │
│     Storage(),      │           │     Storage(),      │
│                     │           │                     │
│   websocket:        │           │   websocket:        │
│     createNoOp      │           │     createWebSocket │
│     WebSocket(),    │           │     (),             │
│                     │           │                     │
│   clock:            │           │   clock:            │
│     SystemClock     │           │     SystemClock     │
│ }                   │           │ }                   │
└─────────────────────┘           └─────────────────────┘
         │                                 │
         │                                 │
         ▼                                 ▼
┌─────────────────────┐           ┌─────────────────────┐
│ Server Store        │           │ Client Store        │
│                     │           │                     │
│ - Safe APIs only    │           │ - Full browser APIs │
│ - No side effects   │           │ - All effects work  │
│ - Node.js compat    │           │ - Interactive       │
└─────────────────────┘           └─────────────────────┘
```

---

## State Serialization Pipeline

```
SERVER                                       CLIENT
┌──────────────┐                     ┌──────────────┐
│ Store State  │                     │ Hydrated     │
│              │                     │ Store State  │
│ {            │                     │              │
│   user: {    │                     │ {            │
│     id: 1,   │                     │   user: {    │
│     name: "A"│                     │     id: 1,   │
│   },         │                     │     name: "A"│
│   items: [], │                     │   },         │
│   ui: {...}  │                     │   items: [], │
│ }            │                     │   ui: {...}  │
└──────┬───────┘                     └──────▲───────┘
       │                                    │
       │ serializeStore()                   │ hydrateStore()
       ▼                                    │
┌──────────────┐     HTTP Response   ┌──────────────┐
│ JSON String  │────────────────────►│ JSON String  │
│              │                     │              │
│ {            │                     │ {            │
│   "state": {│ <script id="data"> │   "state": {│
│     ...      │ type="application/ │     ...      │
│   },         │ json">...</script> │   },         │
│   "timestamp"│                     │   "timestamp"│
│ }            │                     │ }            │
└──────────────┘                     └──────────────┘
```

---

## Component Rendering Timeline

```
TIME ───────────────────────────────────────────────────────────►

SERVER
  │
  ├─► createStore()
  │
  ├─► dispatch({ type: 'init' })
  │     │
  │     ├─► Reducer runs
  │     ├─► State updated
  │     └─► Effects SKIPPED
  │
  ├─► Render component to HTML
  │
  ├─► serializeStore()
  │
  └─► Send HTML + JSON
         │
         │  Network latency...
         │
         ▼
CLIENT
  │
  ├─► Browser receives HTML
  │
  ├─► Display server-rendered content (INSTANT)
  │
  ├─► Download JavaScript bundle
  │
  ├─► hydrateStore(data)
  │     │
  │     └─► State restored
  │
  ├─► onMount() fires
  │     │
  │     └─► dispatch({ type: 'init' })
  │           │
  │           ├─► Reducer runs
  │           ├─► State may update
  │           └─► Effects EXECUTE
  │
  └─► Fully interactive ✅
```

---

## Error Handling Flow

```
┌────────────────────────────────────────────────────┐
│ Server Render Errors                               │
├────────────────────────────────────────────────────┤
│                                                    │
│  Reducer throws error                              │
│    ↓                                               │
│  Catch in dispatchCore()                           │
│    ↓                                               │
│  Log error                                         │
│    ↓                                               │
│  Return 500 error page                             │
│                                                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Serialization Errors                               │
├────────────────────────────────────────────────────┤
│                                                    │
│  Non-serializable value in state                   │
│    ↓                                               │
│  JSON.stringify() throws                           │
│    ↓                                               │
│  [DEV] Console warning with details                │
│    ↓                                               │
│  [PROD] Fallback to default initial state          │
│                                                    │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ Hydration Errors                                   │
├────────────────────────────────────────────────────┤
│                                                    │
│  Corrupted hydration data                          │
│    ↓                                               │
│  JSON.parse() throws                               │
│    ↓                                               │
│  [DEV] Console error with helpful message          │
│    ↓                                               │
│  Fallback to client-side initialization            │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## File Structure

```
packages/core/src/
├── lib/
│   ├── store.ts                  ← Modified: environment detection
│   ├── ssr.ts                    ← NEW: hydration helpers
│   ├── utils.ts                  ← Modified: isServer, isClient
│   ├── types.ts                  ← Modified: SSR config types
│   │
│   └── dependencies/
│       ├── server-storage.ts     ← NEW: No-op storage for server
│       ├── server-websocket.ts   ← NEW: No-op WebSocket for server
│       └── server-api.ts         ← NEW: Server-compatible API client
│
└── tests/
    └── ssr/
        ├── store.test.ts         ← NEW: SSR store tests
        ├── serialization.test.ts ← NEW: Hydration tests
        └── integration.test.ts   ← NEW: SvelteKit integration

examples/
└── sveltekit-ssr/                ← NEW: Example SvelteKit app
    ├── src/routes/
    │   ├── +page.server.ts       ← Server load function
    │   └── +page.svelte          ← Client component
    │
    └── README.md                 ← Usage guide
```

---

## Type Flow

```typescript
// Server
const serverStore: Store<AppState, AppAction> = createStore({
  initialState: { count: 0 },
  reducer: appReducer,
  dependencies: ServerDependencies,
  ssr: { deferEffects: true }
  //    └─► Config: { deferEffects?: boolean }
});

const serialized: string = serializeStore(serverStore);
//                         └─► Returns JSON string


// Client
const clientStore: Store<AppState, AppAction> = hydrateStore(
  serialized,  // ← string
  {
    initialState: { count: 0 },  // Will be overridden
    reducer: appReducer,
    dependencies: ClientDependencies
  }
);
//└─► Returns fully-typed Store<AppState, AppAction>
```

---

This architecture ensures:
- ✅ **Type Safety**: Full TypeScript support throughout
- ✅ **Zero Runtime Overhead**: No SSR code in client bundles (tree-shaking)
- ✅ **Progressive Enhancement**: Works without JavaScript
- ✅ **Developer Experience**: Simple, explicit API
- ✅ **Performance**: Minimal serialization/hydration cost
