# Dependencies Overview

Comprehensive overview of injectable dependencies for Composable Svelte reducers.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Dependency Types](#dependency-types)
4. [Clock Dependency](#clock-dependency)
5. [Storage Dependencies](#storage-dependencies)
6. [API Client](#api-client)
7. [WebSocket Client](#websocket-client)
8. [Custom Dependencies](#custom-dependencies)
9. [Testing with Dependencies](#testing-with-dependencies)
10. [Security Considerations](#security-considerations)
11. [Best Practices](#best-practices)

## Overview

Dependencies make reducers **testable** and **pure** by providing controlled access to:

- **Time**: Clock for timestamps and time operations
- **Storage**: LocalStorage, SessionStorage, and Cookies
- **Network**: API client and WebSocket client
- **Custom**: Any external system or service

### Why Dependencies?

```typescript
// Bad - direct access (untestable, impure)
const reducer = (state: State, action: Action): [State, Effect] => {
  switch (action.type) {
    case 'save':
      localStorage.setItem('data', JSON.stringify(state.data)); // Impure!
      return [
        { ...state, lastSaved: Date.now() }, // Non-deterministic!
        Effect.none()
      ];
  }
};

// Good - dependencies (testable, pure)
const reducer = (state: State, action: Action, deps: Dependencies): [State, Effect] => {
  switch (action.type) {
    case 'save':
      deps.storage.setItem('data', state.data); // Injected!
      return [
        { ...state, lastSaved: deps.clock.now() }, // Controlled!
        Effect.none()
      ];
  }
};
```

## Quick Start

```typescript
import {
  createStore,
  createSystemClock,
  createLocalStorage,
  createAPIClient,
  createLiveWebSocket
} from '@composable-svelte/core';

// 1. Create dependencies
const dependencies = {
  clock: createSystemClock(),
  storage: createLocalStorage<UserData>(),
  api: createAPIClient({ baseURL: '/api' }),
  websocket: createLiveWebSocket()
};

// 2. Use in store
const store = createStore({
  initialState: { ... },
  reducer: myReducer,
  dependencies
});

// 3. Access in reducer
const myReducer = (state: State, action: Action, deps: typeof dependencies) => {
  const now = deps.clock.now();
  deps.storage.setItem('lastAction', now);
  // ...
};

// 4. Mock in tests
const testDeps = {
  clock: createMockClock(0),
  storage: createMockStorage(),
  api: createMockAPI({ ... }),
  websocket: createMockWebSocket()
};
```

## Dependency Types

Composable Svelte provides several built-in dependency types:

| Dependency | Production | Testing | Purpose |
|------------|-----------|---------|---------|
| Clock | `createSystemClock()` | `createMockClock()` | Time operations |
| LocalStorage | `createLocalStorage()` | `createMockStorage()` | Persistent storage |
| SessionStorage | `createSessionStorage()` | `createMockStorage()` | Session storage |
| CookieStorage | `createCookieStorage()` | `createMockCookieStorage()` | Cookie storage |
| API Client | `createAPIClient()` | `createMockAPI()` | HTTP requests |
| WebSocket | `createLiveWebSocket()` | `createMockWebSocket()` | Real-time communication |

## Clock Dependency

Controllable time operations for deterministic testing.

### Production: System Clock

```typescript
import { createSystemClock } from '@composable-svelte/core';

const clock = createSystemClock();

clock.now();           // Current timestamp (ms)
clock.date();          // Current Date object
clock.toISO();         // Current ISO string
clock.fromISO(iso);    // Parse ISO to timestamp
clock.format();        // Formatted date string
```

### Testing: Mock Clock

```typescript
import { createMockClock } from '@composable-svelte/core';

const clock = createMockClock(0); // Start at timestamp 0

clock.now();           // 0
clock.advance(1000);   // Advance by 1 second
clock.now();           // 1000
clock.setTime(5000);   // Set absolute time
clock.now();           // 5000
```

### Usage in Reducers

```typescript
interface State {
  lastSaved: number | null;
  data: string;
}

interface Dependencies {
  clock: Clock;
  storage: Storage<string>;
}

const reducer = (state: State, action: Action, deps: Dependencies) => {
  switch (action.type) {
    case 'save':
      deps.storage.setItem('data', state.data);
      return [
        { ...state, lastSaved: deps.clock.now() },
        Effect.none()
      ];
  }
};
```

### Example: Timestamps

```typescript
case 'createPost':
  const post = {
    id: crypto.randomUUID(),
    title: action.title,
    content: action.content,
    createdAt: deps.clock.now(),
    updatedAt: deps.clock.now()
  };

  return [
    { ...state, posts: [...state.posts, post] },
    Effect.none()
  ];
```

## Storage Dependencies

Type-safe, mockable storage for LocalStorage, SessionStorage, and Cookies.

### LocalStorage

Persistent storage that survives page reloads:

```typescript
import { createLocalStorage } from '@composable-svelte/core';

const storage = createLocalStorage<UserData>({
  prefix: 'app:',      // Namespace keys
  validator: isUserData, // Validate on read
  debug: true          // Log operations
});

storage.setItem('user', { id: 1, name: 'Alice' });
storage.getItem('user'); // { id: 1, name: 'Alice' }
storage.removeItem('user');
storage.clear();
```

### SessionStorage

Session-only storage (cleared on tab close):

```typescript
import { createSessionStorage } from '@composable-svelte/core';

const storage = createSessionStorage<FormData>({
  prefix: 'form:'
});

storage.setItem('draft', { title: 'My Post', content: '...' });
```

### Cookie Storage

Secure cookie storage for authentication:

```typescript
import { createCookieStorage } from '@composable-svelte/core';

const cookies = createCookieStorage<string>({
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600 // 1 hour
});

cookies.setItem('sessionToken', 'jwt_token', {
  path: '/app',
  secure: true
});
```

### Usage in Reducers

```typescript
interface Dependencies {
  storage: Storage<AppData>;
  clock: Clock;
}

case 'saveData':
  deps.storage.setItem('data', state.data);
  return [
    { ...state, lastSaved: deps.clock.now() },
    Effect.none()
  ];

case 'loadData':
  const data = deps.storage.getItem('data');
  return [
    { ...state, data: data || initialData },
    Effect.none()
  ];
```

### Cross-Tab Synchronization

LocalStorage supports cross-tab synchronization:

```typescript
const storage = createLocalStorage<User>();

const unsubscribe = storage.subscribe((event) => {
  if (event.key === 'user' && event.newValue === null) {
    // User logged out in another tab
    store.dispatch({ type: 'logout' });
  }
});
```

### More Information

For comprehensive documentation on Storage dependencies, see:
- [packages/core/src/dependencies/README.md](/Users/jonathanbelolo/dev/claude/code/composable-svelte/packages/core/src/dependencies/README.md) - Complete API reference, examples, and patterns
- [SECURITY.md](/Users/jonathanbelolo/dev/claude/code/composable-svelte/SECURITY.md) - Security guidelines for storage

## API Client

HTTP client for backend API integration.

### Quick Setup

```typescript
import { createAPIClient } from '@composable-svelte/core';

const api = createAPIClient({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000,
  retry: true,
  cache: true
});

const dependencies = { api };
```

### Usage in Reducers

```typescript
case 'loadProducts':
  return [
    { ...state, loading: true },
    Effect.api(
      deps.api,
      Request.get('/products'),
      (response) => ({ type: 'productsLoaded', products: response.data }),
      (error) => ({ type: 'productsLoadFailed', error: error.message })
    )
  ];
```

### More Information

For comprehensive API client documentation, see:
- [API Client Documentation](./api-client.md) - Complete guide with examples

## WebSocket Client

Real-time WebSocket communication.

### Quick Setup

```typescript
import { createLiveWebSocket } from '@composable-svelte/core';

const websocket = createLiveWebSocket({
  reconnect: {
    enabled: true,
    maxAttempts: 5
  }
});

const dependencies = { websocket };
```

### Usage in Reducers

```typescript
case 'connect':
  return [
    { ...state, connecting: true },
    Effect.websocket.connect(
      deps.websocket,
      'websocket-connection',
      'wss://api.example.com',
      undefined,
      (event) => ({ type: 'websocketEvent', event })
    )
  ];

case 'sendMessage':
  return [
    state,
    Effect.websocket.send(
      deps.websocket,
      { type: 'chat', text: action.text },
      () => ({ type: 'messageSent' }),
      (error) => ({ type: 'messageFailed', error: error.message })
    )
  ];
```

### More Information

For comprehensive WebSocket documentation, see:
- [WebSocket Documentation](./websocket.md) - Complete guide with examples

## Custom Dependencies

Inject any external system or service.

### Create Custom Dependency

```typescript
// Analytics service
interface AnalyticsService {
  track(event: string, data: any): void;
  identify(userId: string, traits: any): void;
}

const createAnalytics = (): AnalyticsService => ({
  track: (event, data) => {
    // Send to analytics backend
    console.log('Track:', event, data);
  },
  identify: (userId, traits) => {
    // Identify user
    console.log('Identify:', userId, traits);
  }
});

// Add to dependencies
const dependencies = {
  clock: createSystemClock(),
  storage: createLocalStorage(),
  api: createAPIClient({ baseURL: '/api' }),
  analytics: createAnalytics()
};
```

### Use in Reducer

```typescript
interface Dependencies {
  clock: Clock;
  storage: Storage<any>;
  api: APIClient;
  analytics: AnalyticsService;
}

case 'purchaseCompleted':
  deps.analytics.track('purchase', {
    productId: action.productId,
    price: action.price,
    timestamp: deps.clock.now()
  });

  return [
    { ...state, lastPurchase: action.productId },
    Effect.none()
  ];
```

### Mock Custom Dependency

```typescript
const createMockAnalytics = (): AnalyticsService & {
  events: Array<{ event: string; data: any }>;
} => {
  const events: Array<{ event: string; data: any }> = [];

  return {
    track: (event, data) => {
      events.push({ event, data });
    },
    identify: (userId, traits) => {
      events.push({ event: 'identify', data: { userId, traits } });
    },
    events
  };
};

// Use in tests
const mockAnalytics = createMockAnalytics();
const testDeps = { ...dependencies, analytics: mockAnalytics };

// Verify
expect(mockAnalytics.events).toContainEqual({
  event: 'purchase',
  data: { productId: '123', price: 99.99 }
});
```

## Testing with Dependencies

Mock all dependencies for deterministic testing.

### Full Test Setup

```typescript
import {
  TestStore,
  createMockClock,
  createMockStorage,
  createMockAPI,
  createMockWebSocket
} from '@composable-svelte/core';

describe('App Reducer', () => {
  it('should handle user actions', async () => {
    // Setup mocks
    const clock = createMockClock(1000);
    const storage = createMockStorage<User>();
    const api = createMockAPI({
      'GET /api/user': { id: 1, name: 'Alice' }
    });
    const websocket = createMockWebSocket();

    const testDeps = { clock, storage, api, websocket };

    // Create test store
    const store = new TestStore({
      initialState: { user: null, loading: false },
      reducer: appReducer,
      dependencies: testDeps
    });

    // Test actions
    await store.send({ type: 'loadUser' }, (state) => {
      expect(state.loading).toBe(true);
    });

    await store.receive({ type: 'userLoaded' }, (state) => {
      expect(state.user).toEqual({ id: 1, name: 'Alice' });
      expect(state.loading).toBe(false);
    });

    // Verify storage
    expect(storage.getItem('user')).toEqual({ id: 1, name: 'Alice' });

    // Verify timestamp
    expect(state.lastUpdated).toBe(1000);
  });
});
```

### Advance Time in Tests

```typescript
it('should expire session after timeout', async () => {
  const clock = createMockClock(0);
  const store = new TestStore({
    initialState: { session: { expiresAt: 5000 } },
    reducer: sessionReducer,
    dependencies: { clock }
  });

  // Initial state: not expired
  store.dispatch({ type: 'checkSession' });
  expect(store.state.session).not.toBeNull();

  // Advance past expiration
  clock.advance(6000);

  // Now expired
  store.dispatch({ type: 'checkSession' });
  expect(store.state.session).toBeNull();
});
```

### Replace Dependencies Mid-Test

```typescript
it('should handle API errors', async () => {
  // Start with success
  const successAPI = createMockAPI({
    'GET /api/data': { value: 123 }
  });

  const store = new TestStore({
    initialState: { data: null, error: null },
    reducer: dataReducer,
    dependencies: { api: successAPI }
  });

  await store.send({ type: 'load' });
  await store.receive({ type: 'loaded' }, (state) => {
    expect(state.data).toEqual({ value: 123 });
  });

  // Switch to error API
  const errorAPI = createMockAPI({
    'GET /api/data': { error: new APIError('Failed', 500) }
  });

  store.setDependencies({ api: errorAPI });

  await store.send({ type: 'load' });
  await store.receive({ type: 'loadFailed' }, (state) => {
    expect(state.error).toBe('Failed');
  });
});
```

## Security Considerations

### Storage Security

Browser storage is **NOT secure storage**. See the comprehensive security guide for details.

**Key Rules**:

1. **NEVER** store sensitive data (passwords, credit cards, API keys, SSNs)
2. **ALWAYS** use `secure: true` for cookies in production
3. **ALWAYS** use `sameSite: 'Strict'` for authentication cookies
4. **ALWAYS** validate retrieved data with schema validators
5. **ALWAYS** set expiration times for sensitive data
6. **ALWAYS** clear storage on logout

### Quick Example

```typescript
// Bad - insecure
const storage = createLocalStorage();
storage.setItem('password', 'secret123'); // NEVER!

// Good - secure cookies
const cookies = createCookieStorage<string>({
  secure: true,
  sameSite: 'Strict',
  maxAge: 3600
});
cookies.setItem('sessionToken', 'jwt_token');

// Clear on logout
function logout() {
  cookies.removeItem('sessionToken');
  storage.clear();
}
```

### More Information

For comprehensive security guidelines, see:
- [SECURITY.md](/Users/jonathanbelolo/dev/claude/code/composable-svelte/SECURITY.md) - Complete security guide

## Best Practices

### 1. Define Dependency Interface

```typescript
// Define interface for type safety
interface AppDependencies {
  clock: Clock;
  storage: Storage<UserData>;
  api: APIClient;
  websocket: WebSocketClient;
}

// Use in reducer
const reducer = (
  state: AppState,
  action: AppAction,
  deps: AppDependencies
): [AppState, Effect<AppAction>] => {
  // Type-safe access to dependencies
};
```

### 2. Create Dependency Factory

```typescript
// Production dependencies
export function createProductionDependencies(): AppDependencies {
  return {
    clock: createSystemClock(),
    storage: createLocalStorage<UserData>({ prefix: 'app:' }),
    api: createAPIClient({ baseURL: '/api' }),
    websocket: createLiveWebSocket({ reconnect: { enabled: true } })
  };
}

// Test dependencies
export function createTestDependencies(): AppDependencies {
  return {
    clock: createMockClock(0),
    storage: createMockStorage(),
    api: createMockAPI({}),
    websocket: createMockWebSocket()
  };
}
```

### 3. Use Namespaced Storage

```typescript
// Bad - global keys
const storage = createLocalStorage();
storage.setItem('user', user); // Collisions!

// Good - namespaced keys
const storage = createLocalStorage({
  prefix: 'myapp:'
});
storage.setItem('user', user); // Key: 'myapp:user'
```

### 4. Validate Storage Data

```typescript
// Define validator
interface User {
  id: number;
  name: string;
}

const isUser = (value: unknown): value is User => {
  return (
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'number' &&
    'name' in value && typeof value.name === 'string'
  );
};

// Use validator
const storage = createLocalStorage<User>({
  validator: isUser
});

// Invalid data returns null
const user = storage.getItem('user'); // null if validation fails
```

### 5. Handle Storage Errors

```typescript
case 'saveData':
  try {
    deps.storage.setItem('data', state.data);
    return [
      { ...state, lastSaved: deps.clock.now() },
      Effect.none()
    ];
  } catch (error) {
    if (error instanceof StorageQuotaExceededError) {
      return [
        { ...state, error: 'Storage full' },
        Effect.run(async (dispatch) => {
          const shouldClear = await confirmClearOldData();
          if (shouldClear) {
            deps.storage.clear();
            dispatch({ type: 'retrySave' });
          }
        })
      ];
    }
    throw error;
  }
```

### 6. SSR-Safe Dependencies

```typescript
import { isBrowser } from '@composable-svelte/core';

function createDependencies() {
  return {
    clock: createSystemClock(),
    storage: isBrowser()
      ? createLocalStorage()
      : createNoopStorage(), // SSR-safe fallback
    api: createAPIClient({ baseURL: '/api' })
  };
}
```

### 7. Cleanup in onDestroy

```typescript
// In Svelte component
import { onDestroy } from 'svelte';

const unsubscribe = storage.subscribe((event) => {
  // Handle storage events
});

onDestroy(() => {
  unsubscribe();
});
```

## Examples

### Authentication with Cookies

```typescript
interface AuthDependencies {
  clock: Clock;
  cookies: CookieStorage<string>;
  api: APIClient;
}

case 'login':
  return [
    { ...state, loading: true },
    Effect.api(
      deps.api,
      Request.post('/auth/login', {
        username: action.username,
        password: action.password
      }),
      (response) => {
        // Store session token in secure cookie
        deps.cookies.setItem('sessionToken', response.data.token, {
          secure: true,
          sameSite: 'Strict',
          maxAge: 3600
        });

        return { type: 'loginSuccess', user: response.data.user };
      },
      (error) => ({ type: 'loginFailed', error: error.message })
    )
  ];

case 'logout':
  deps.cookies.removeItem('sessionToken');
  return [
    { ...state, user: null },
    Effect.none()
  ];
```

### Form Draft Persistence

```typescript
interface FormDependencies {
  clock: Clock;
  storage: Storage<FormData>;
}

case 'updateField':
  const updatedForm = { ...state.form, [action.field]: action.value };

  deps.storage.setItem('formDraft', updatedForm);

  return [
    {
      ...state,
      form: updatedForm,
      lastSaved: deps.clock.now()
    },
    Effect.none()
  ];

case 'loadDraft':
  const draft = deps.storage.getItem('formDraft');
  return [
    { ...state, form: draft || initialForm },
    Effect.none()
  ];
```

### Real-Time Dashboard

```typescript
interface DashboardDependencies {
  clock: Clock;
  api: APIClient;
  websocket: WebSocketClient;
}

case 'init':
  return [
    state,
    Effect.batch(
      // Load initial data
      Effect.api(
        deps.api,
        Request.get('/dashboard/stats'),
        (response) => ({ type: 'statsLoaded', stats: response.data }),
        (error) => ({ type: 'loadFailed', error: error.message })
      ),

      // Connect WebSocket for live updates
      Effect.websocket.connect(
        deps.websocket,
        'dashboard-connection',
        'wss://api.example.com/dashboard',
        undefined,
        (event) => ({ type: 'websocketEvent', event })
      ),

      // Subscribe to updates
      Effect.websocket.subscribe(
        deps.websocket,
        'dashboard-updates',
        (message) => ({ type: 'statsUpdated', stats: message.data })
      )
    )
  ];
```

---

For more information, see:
- [API Client Documentation](./api-client.md)
- [WebSocket Documentation](./websocket.md)
- [Storage README](../../../src/dependencies/README.md)
- [Security Guidelines](../../../SECURITY.md)
- [Testing Guide](../testing/unit-testing.md)
