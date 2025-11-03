# API Client

Comprehensive guide to the HTTP API client for backend integration in Composable Svelte.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Creating an API Client](#creating-an-api-client)
4. [Making Requests](#making-requests)
5. [Request Configuration](#request-configuration)
6. [Interceptors](#interceptors)
7. [Retry Logic](#retry-logic)
8. [Caching](#caching)
9. [Error Handling](#error-handling)
10. [Endpoint Helpers](#endpoint-helpers)
11. [Effect Integration](#effect-integration)
12. [Testing](#testing)
13. [Best Practices](#best-practices)
14. [Advanced Patterns](#advanced-patterns)

## Overview

The API client provides a type-safe, feature-rich HTTP client with:

- **Type-safe requests**: Full TypeScript inference for request/response types
- **Automatic retries**: Exponential backoff for failed requests
- **Response caching**: In-memory caching for GET requests
- **Request deduplication**: Coalesce identical concurrent requests
- **Interceptors**: Request/response/error transformation
- **Effect integration**: Declarative API calls in reducers
- **Testing utilities**: Mock and spy clients for testing

## Quick Start

```typescript
import { createAPIClient, Effect } from '@composable-svelte/core';

// 1. Create client
const api = createAPIClient({
  baseURL: 'https://api.example.com',
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 30000,
  retry: true,
  cache: true
});

// 2. Make requests
const response = await api.get('/products');
console.log(response.data); // Type-safe!

// 3. Use in reducers
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

## Creating an API Client

### Basic Client

```typescript
import { createAPIClient } from '@composable-svelte/core';

const api = createAPIClient({
  baseURL: 'https://api.example.com'
});
```

### Full Configuration

```typescript
const api = createAPIClient({
  // Base URL prepended to all relative paths
  baseURL: 'https://api.example.com',

  // Default headers for all requests
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  },

  // Default timeout (milliseconds)
  timeout: 30000,

  // Enable request deduplication
  deduplicate: true,

  // Default retry configuration
  retry: {
    maxAttempts: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableStatusCodes: [408, 429, 500, 502, 503, 504]
  },

  // Default cache configuration
  cache: {
    ttl: 300000, // 5 minutes
    invalidateOnMutation: true
  },

  // Initial interceptors
  interceptors: [
    {
      onRequest: (url, config) => {
        console.log('Request:', url);
        return config;
      }
    }
  ]
});
```

### Multiple Clients

Create separate clients for different APIs:

```typescript
// Public API
const publicAPI = createAPIClient({
  baseURL: 'https://api.example.com'
});

// Admin API
const adminAPI = createAPIClient({
  baseURL: 'https://admin.example.com',
  headers: {
    'X-Admin-Token': process.env.ADMIN_TOKEN
  }
});

// Dependencies
const dependencies = {
  publicAPI,
  adminAPI
};
```

## Making Requests

### GET Requests

```typescript
// Simple GET
const response = await api.get('/products');
console.log(response.data); // unknown

// Type-safe GET
interface Product {
  id: string;
  name: string;
  price: number;
}

const response = await api.get<Product[]>('/products');
console.log(response.data[0].name); // Type-safe!

// GET with query parameters
const response = await api.get('/products', {
  params: {
    category: 'electronics',
    sort: 'price',
    page: 1
  }
});
// Sends: GET /products?category=electronics&sort=price&page=1
```

### POST Requests

```typescript
// Simple POST
const response = await api.post('/products', {
  name: 'New Product',
  price: 99.99
});

// Type-safe POST
interface CreateProductDTO {
  name: string;
  price: number;
}

interface Product {
  id: string;
  name: string;
  price: number;
}

const response = await api.post<Product>('/products', {
  name: 'New Product',
  price: 99.99
} as CreateProductDTO);

console.log(response.data.id); // Type-safe!
```

### PUT/PATCH Requests

```typescript
// Full update (PUT)
const response = await api.put('/products/123', {
  name: 'Updated Product',
  price: 149.99
});

// Partial update (PATCH)
const response = await api.patch('/products/123', {
  price: 149.99
});
```

### DELETE Requests

```typescript
// Delete resource
const response = await api.delete('/products/123');

// Delete with configuration
const response = await api.delete('/products/123', {
  headers: {
    'X-Reason': 'discontinued'
  }
});
```

### HEAD Requests

```typescript
// Check if resource exists
const response = await api.head('/products/123');
console.log(response.status); // 200 if exists, 404 if not
console.log(response.headers); // Access headers
```

### Custom Requests

```typescript
import { Request } from '@composable-svelte/core';

// Build type-safe request
const request = Request.get<Product[]>('/products', {
  params: { category: 'electronics' },
  cache: true
});

// Execute request
const response = await api.request(request);
console.log(response.data); // Type-safe Product[]
```

## Request Configuration

Every request method accepts an optional configuration object:

```typescript
interface RequestConfig {
  // Request timeout (milliseconds)
  timeout?: number;

  // Additional headers
  headers?: Record<string, string>;

  // Query parameters
  params?: Record<string, string | number | boolean | null | undefined>;

  // Request body (for POST/PUT/PATCH)
  body?: unknown;

  // Manual cancellation
  signal?: AbortSignal;

  // Enable/disable deduplication
  deduplicate?: boolean;

  // Enable/disable retry
  retry?: boolean | RetryConfig;

  // Enable/disable caching
  cache?: boolean | CacheConfig;
}
```

### Example: Custom Configuration

```typescript
// Override timeout for slow endpoint
const response = await api.get('/large-report', {
  timeout: 60000 // 1 minute
});

// Add authentication header
const response = await api.get('/user/profile', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

// Disable retry for specific request
const response = await api.post('/payment', paymentData, {
  retry: false // Don't retry payments!
});

// Manual cancellation
const controller = new AbortController();

const response = await api.get('/search', {
  signal: controller.signal
});

// Later: cancel request
controller.abort();
```

## Interceptors

Interceptors allow you to transform requests, responses, and errors globally.

### Request Interceptors

```typescript
// Add authentication token to all requests
api.addInterceptor({
  onRequest: async (url, config) => {
    const token = await getAuthToken();
    return {
      ...config,
      headers: {
        ...config.headers,
        'Authorization': `Bearer ${token}`
      }
    };
  }
});
```

### Response Interceptors

```typescript
// Transform all responses
api.addInterceptor({
  onResponse: (response) => {
    // Unwrap nested data structure
    if (response.data && typeof response.data === 'object' && 'data' in response.data) {
      return {
        ...response,
        data: response.data.data
      };
    }
    return response;
  }
});
```

### Error Interceptors

```typescript
// Handle authentication errors globally
api.addInterceptor({
  onError: async (error) => {
    if (error instanceof APIError && error.status === 401) {
      // Refresh token
      const newToken = await refreshAuthToken();

      // Retry request with new token
      // (Return response to recover from error)
      return await api.get(error.url, {
        headers: {
          'Authorization': `Bearer ${newToken}`
        }
      });
    }

    // Don't handle - propagate error
    throw error;
  }
});
```

### Removing Interceptors

```typescript
// addInterceptor returns cleanup function
const removeInterceptor = api.addInterceptor({
  onRequest: (url, config) => {
    console.log('Request:', url);
    return config;
  }
});

// Later: remove interceptor
removeInterceptor();
```

### Multiple Interceptors

```typescript
// Interceptors run in order
api.addInterceptor({
  onRequest: (url, config) => {
    console.log('1. Logging');
    return config;
  }
});

api.addInterceptor({
  onRequest: (url, config) => {
    console.log('2. Auth');
    return {
      ...config,
      headers: { ...config.headers, 'Authorization': 'Bearer token' }
    };
  }
});

api.addInterceptor({
  onRequest: (url, config) => {
    console.log('3. Metrics');
    return config;
  }
});

// Order: 1 -> 2 -> 3 -> request -> response
```

## Retry Logic

Automatic retry with exponential backoff for failed requests.

### Default Retry Behavior

```typescript
// Enabled by default for safe methods (GET, HEAD, OPTIONS, PUT, DELETE)
const api = createAPIClient({
  retry: true
});

// Safe methods automatically retry on failure
const response = await api.get('/products'); // Retries on failure

// Unsafe methods don't retry by default
const response = await api.post('/products', data); // No retry
```

### Custom Retry Configuration

```typescript
const api = createAPIClient({
  retry: {
    // Maximum retry attempts
    maxAttempts: 5,

    // Initial delay before first retry (ms)
    initialDelay: 1000,

    // Maximum delay between retries (ms)
    maxDelay: 30000,

    // Exponential backoff multiplier
    backoffMultiplier: 2,

    // HTTP status codes that trigger retry
    retryableStatusCodes: [408, 429, 500, 502, 503, 504],

    // Custom retry predicate
    shouldRetry: (error, attempt) => {
      // Retry timeouts up to 3 times
      if (error instanceof TimeoutError) {
        return attempt < 3;
      }
      // Retry rate limits with longer delay
      if (error instanceof APIError && error.status === 429) {
        return attempt < 5;
      }
      return false;
    }
  }
});
```

### Per-Request Retry

```typescript
// Enable retry for POST
const response = await api.post('/analytics', data, {
  retry: true
});

// Custom retry for specific request
const response = await api.get('/flaky-endpoint', {
  retry: {
    maxAttempts: 10,
    initialDelay: 500
  }
});

// Disable retry
const response = await api.get('/no-retry', {
  retry: false
});
```

### Retry Delays

Delays use exponential backoff with jitter:

```
Attempt 1: initialDelay = 1000ms
Attempt 2: 1000 * 2^1 = 2000ms
Attempt 3: 2000 * 2^1 = 4000ms
Attempt 4: 4000 * 2^1 = 8000ms
Attempt 5: 8000 * 2^1 = 16000ms (capped at maxDelay)
```

Jitter adds randomness (±30%) to prevent thundering herd.

## Caching

In-memory response caching for GET requests.

### Default Caching

```typescript
// Enable caching globally
const api = createAPIClient({
  cache: {
    ttl: 300000, // 5 minutes
    invalidateOnMutation: true
  }
});

// GET requests are cached
const response1 = await api.get('/products'); // Cache miss - hits network
const response2 = await api.get('/products'); // Cache hit - instant
console.log(response2.cached); // true

// Mutations invalidate cache
await api.post('/products', newProduct); // Clears cache for /products
const response3 = await api.get('/products'); // Cache miss - fetches new data
```

### Per-Request Caching

```typescript
// Enable cache for specific request
const response = await api.get('/products', {
  cache: true
});

// Custom cache TTL
const response = await api.get('/static-data', {
  cache: {
    ttl: 3600000 // 1 hour
  }
});

// Disable cache
const response = await api.get('/real-time-data', {
  cache: false
});
```

### Cache Keys

Cache keys are generated from normalized URL + params:

```typescript
// Same cache key
api.get('/products', { params: { sort: 'name', page: 1 } });
api.get('/products', { params: { page: 1, sort: 'name' } }); // Same order doesn't matter

// Different cache keys
api.get('/products', { params: { page: 1 } });
api.get('/products', { params: { page: 2 } });
```

### Custom Cache Keys

```typescript
const response = await api.get('/products', {
  cache: {
    ttl: 300000,
    key: (url, config) => {
      // Custom key ignores page parameter
      return `products-${config.params?.category || 'all'}`;
    }
  }
});
```

### Cache Invalidation

```typescript
// Invalidate specific endpoint
api.invalidateCache('/products');

// Invalidate pattern (prefix matching)
api.invalidateCache('/products*'); // Clears /products, /products/123, etc.

// Invalidate on mutation
api.post('/products', data, {
  cache: {
    invalidates: ['/products', '/categories'] // Invalidate multiple endpoints
  }
});

// Clear all cache
api.clearCache();
```

## Error Handling

The API client throws specific error types for different failure scenarios.

### Error Types

```typescript
import { APIError, NetworkError, TimeoutError, ValidationError } from '@composable-svelte/core';
```

#### APIError

HTTP errors (4xx, 5xx):

```typescript
try {
  await api.get('/products/invalid-id');
} catch (error) {
  if (error instanceof APIError) {
    console.log(error.message); // "Not Found"
    console.log(error.status); // 404
    console.log(error.body); // Response body
    console.log(error.headers); // Response headers
    console.log(error.isRetryable); // true for 5xx, false for 4xx
  }
}
```

#### ValidationError

Validation errors (422):

```typescript
try {
  await api.post('/products', invalidData);
} catch (error) {
  if (error instanceof ValidationError) {
    console.log(error.status); // 422
    console.log(error.body); // { errors: [...] }
    console.log(error.getFieldErrors()); // Parsed field errors
  }
}
```

#### TimeoutError

Request timeout:

```typescript
try {
  await api.get('/slow-endpoint', { timeout: 5000 });
} catch (error) {
  if (error instanceof TimeoutError) {
    console.log(error.message); // "Request timeout after 5000ms"
    console.log(error.timeout); // 5000
  }
}
```

#### NetworkError

Network failures:

```typescript
try {
  await api.get('/products');
} catch (error) {
  if (error instanceof NetworkError) {
    console.log(error.message); // "Network request failed"
    console.log(error.cause); // Original error
  }
}
```

### Error Handling Patterns

```typescript
// Pattern 1: Specific error handling
try {
  const response = await api.get('/products');
  return response.data;
} catch (error) {
  if (error instanceof ValidationError) {
    // Handle validation errors
    showValidationErrors(error.getFieldErrors());
  } else if (error instanceof TimeoutError) {
    // Handle timeouts
    showRetryButton();
  } else if (error instanceof NetworkError) {
    // Handle network errors
    showOfflineMessage();
  } else if (error instanceof APIError) {
    // Handle API errors
    if (error.status === 404) {
      showNotFoundMessage();
    } else if (error.status >= 500) {
      showServerErrorMessage();
    }
  }
  throw error; // Re-throw if not handled
}

// Pattern 2: Use interceptors for global handling
api.addInterceptor({
  onError: (error) => {
    if (error instanceof APIError && error.status === 401) {
      // Redirect to login
      redirectToLogin();
    }
    throw error;
  }
});

// Pattern 3: Use Effect.api() for reducer integration
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

## Endpoint Helpers

Pre-built helpers for common REST patterns.

### REST Endpoints

```typescript
import { createRESTEndpoints } from '@composable-svelte/core';

interface Product {
  id: string;
  name: string;
  price: number;
}

interface CreateProductDTO {
  name: string;
  price: number;
}

// Create REST endpoints
const products = createRESTEndpoints<Product, CreateProductDTO>('/api/products');

// Use endpoints
const listReq = products.list();              // GET /api/products
const getReq = products.get('123');           // GET /api/products/123
const createReq = products.create({ ... });   // POST /api/products
const updateReq = products.update('123', ...); // PUT /api/products/123
const patchReq = products.patch('123', ...);  // PATCH /api/products/123
const deleteReq = products.delete('123');     // DELETE /api/products/123

// Execute requests
const response = await api.request(products.list());
console.log(response.data); // Product[]
```

### Paginated Endpoints

```typescript
import { createPaginatedEndpoints } from '@composable-svelte/core';

const products = createPaginatedEndpoints<Product>('/api/products');

// Paginated list
const request = products.listPaginated({
  page: 1,
  pageSize: 20
});

const response = await api.request(request);
console.log(response.data.data); // Product[]
console.log(response.data.total); // Total count
console.log(response.data.hasMore); // Has next page
```

### Search Endpoints

```typescript
import { createSearchEndpoints } from '@composable-svelte/core';

const productSearch = createSearchEndpoints<Product>('/api/products');

// Search with filters
const request = productSearch.search({
  query: 'laptop',
  sort: 'price',
  order: 'asc',
  page: 1,
  pageSize: 20,
  filters: {
    category: 'electronics',
    inStock: true
  }
});

const response = await api.request(request);
```

### Full Endpoints

All features combined:

```typescript
import { createFullEndpoints } from '@composable-svelte/core';

const products = createFullEndpoints<Product>('/api/products');

// All operations available
products.list();                         // GET /api/products
products.listPaginated({ page: 1 });    // GET /api/products?page=1
products.search({ query: 'laptop' });    // GET /api/products/search?query=laptop
products.get('123');                     // GET /api/products/123
products.create({ ... });                // POST /api/products
products.update('123', { ... });        // PUT /api/products/123
products.delete('123');                  // DELETE /api/products/123
```

## Effect Integration

Declarative API calls in reducers using the Effect system.

### Effect.api()

```typescript
import { Effect, Request } from '@composable-svelte/core';

case 'loadProducts':
  return [
    { ...state, loading: true },
    Effect.api(
      deps.api,
      Request.get<Product[]>('/products'),
      (response) => ({ type: 'productsLoaded', products: response.data }),
      (error) => ({ type: 'productsLoadFailed', error: error.message })
    )
  ];

case 'productsLoaded':
  return [
    { ...state, loading: false, products: action.products },
    Effect.none()
  ];

case 'productsLoadFailed':
  return [
    { ...state, loading: false, error: action.error },
    Effect.none()
  ];
```

### Effect.apiFireAndForget()

Fire-and-forget API calls (ignore errors):

```typescript
case 'trackEvent':
  return [
    state,
    Effect.apiFireAndForget(
      deps.api,
      Request.post('/analytics', { event: action.event }),
      () => ({ type: 'eventTracked' })
    )
  ];
```

### Effect.apiAll()

Parallel API calls:

```typescript
case 'loadDashboard':
  return [
    { ...state, loading: true },
    Effect.apiAll(
      deps.api,
      [
        Request.get<Product[]>('/products'),
        Request.get<Category[]>('/categories'),
        Request.get<Stats>('/stats')
      ],
      ([productsRes, categoriesRes, statsRes]) => ({
        type: 'dashboardLoaded',
        products: productsRes.data,
        categories: categoriesRes.data,
        stats: statsRes.data
      }),
      (error) => ({ type: 'dashboardLoadFailed', error: error.message })
    )
  ];
```

### Full Example

```typescript
// State
interface AppState {
  products: Product[];
  loading: boolean;
  error: string | null;
}

// Actions
type AppAction =
  | { type: 'loadProducts' }
  | { type: 'productsLoaded'; products: Product[] }
  | { type: 'productsLoadFailed'; error: string }
  | { type: 'createProduct'; name: string; price: number }
  | { type: 'productCreated'; product: Product };

// Dependencies
interface AppDependencies {
  api: APIClient;
}

// Endpoints
const products = createRESTEndpoints<Product>('/api/products');

// Reducer
const appReducer = (
  state: AppState,
  action: AppAction,
  deps: AppDependencies
): [AppState, Effect<AppAction>] => {
  switch (action.type) {
    case 'loadProducts':
      return [
        { ...state, loading: true },
        Effect.api(
          deps.api,
          products.list(),
          (response) => ({ type: 'productsLoaded', products: response.data }),
          (error) => ({ type: 'productsLoadFailed', error: error.message })
        )
      ];

    case 'productsLoaded':
      return [
        { ...state, loading: false, products: action.products },
        Effect.none()
      ];

    case 'productsLoadFailed':
      return [
        { ...state, loading: false, error: action.error },
        Effect.none()
      ];

    case 'createProduct':
      return [
        state,
        Effect.api(
          deps.api,
          products.create({ name: action.name, price: action.price }),
          (response) => ({ type: 'productCreated', product: response.data }),
          (error) => ({ type: 'productsLoadFailed', error: error.message })
        )
      ];

    case 'productCreated':
      return [
        { ...state, products: [...state.products, action.product] },
        Effect.none()
      ];
  }
};

// Store
const store = createStore({
  initialState: { products: [], loading: false, error: null },
  reducer: appReducer,
  dependencies: {
    api: createAPIClient({ baseURL: '/api' })
  }
});
```

## Testing

Mock and spy clients for testing reducers and components.

### createMockAPI

Mock API client with predefined responses:

```typescript
import { createMockAPI } from '@composable-svelte/core';

// Define mock routes
const mockAPI = createMockAPI({
  'GET /api/products': [
    { id: '1', name: 'Product 1', price: 99.99 },
    { id: '2', name: 'Product 2', price: 149.99 }
  ],
  'GET /api/products/:id': (config, params) => ({
    id: params.id,
    name: `Product ${params.id}`,
    price: 99.99
  }),
  'POST /api/products': (config) => ({
    id: '3',
    ...config.body
  }),
  'GET /api/slow': { delay: 1000, data: { ok: true } },
  'GET /api/error': { error: new APIError('Not found', 404) }
});

// Use in tests
describe('Product Reducer', () => {
  it('should load products', async () => {
    const store = createStore({
      initialState: { products: [], loading: false },
      reducer: productReducer,
      dependencies: { api: mockAPI }
    });

    store.dispatch({ type: 'loadProducts' });

    // Wait for effect
    await new Promise(resolve => setTimeout(resolve, 10));

    expect(store.state.products).toHaveLength(2);
    expect(store.state.loading).toBe(false);
  });
});
```

### createSpyAPI

Spy API client that tracks all calls:

```typescript
import { createSpyAPI } from '@composable-svelte/core';

// Wrap mock API with spy
const mockAPI = createMockAPI({
  'GET /api/products': [{ id: '1', name: 'Product 1' }]
});

const spy = createSpyAPI(mockAPI);

// Make requests
await spy.get('/api/products');
await spy.post('/api/products', { name: 'New Product' });

// Verify calls
expect(spy.calls).toHaveLength(2);
expect(spy.calls[0].method).toBe('GET');
expect(spy.calls[0].url).toBe('/api/products');
expect(spy.calls[1].method).toBe('POST');

// Get specific calls
const getCalls = spy.callsTo('GET', '/api/products');
expect(getCalls).toHaveLength(1);

// Pattern matching
const allCalls = spy.callsMatching('*', '/api/products*');
expect(allCalls).toHaveLength(2);

// Verify responses
expect(spy.responses).toHaveLength(2);
expect(spy.lastResponse()?.data).toEqual([{ id: '1', name: 'Product 1' }]);

// Reset between tests
spy.reset();
```

### TestStore Pattern

```typescript
import { TestStore } from '@composable-svelte/core';

describe('API Integration', () => {
  it('should handle success and failure', async () => {
    const mockAPI = createMockAPI({
      'GET /api/products': [{ id: '1', name: 'Product 1' }]
    });

    const store = new TestStore({
      initialState: { products: [], loading: false, error: null },
      reducer: productReducer,
      dependencies: { api: mockAPI }
    });

    // Test success path
    await store.send({ type: 'loadProducts' }, (state) => {
      expect(state.loading).toBe(true);
    });

    await store.receive({ type: 'productsLoaded' }, (state) => {
      expect(state.loading).toBe(false);
      expect(state.products).toHaveLength(1);
    });

    // Test failure path
    const errorAPI = createMockAPI({
      'GET /api/products': { error: new APIError('Failed', 500) }
    });

    store.setDependencies({ api: errorAPI });

    await store.send({ type: 'loadProducts' });
    await store.receive({ type: 'productsLoadFailed' }, (state) => {
      expect(state.error).toBe('Failed');
    });
  });
});
```

## Best Practices

### 1. Use Type-Safe Requests

```typescript
// Bad
const response = await api.get('/products');
console.log(response.data.name); // No type safety

// Good
const response = await api.get<Product[]>('/products');
console.log(response.data[0].name); // Type-safe!
```

### 2. Define Endpoint Helpers

```typescript
// Bad - scattered endpoints
api.get('/api/products');
api.get('/api/products/123');
api.post('/api/products', data);

// Good - centralized endpoints
const products = createRESTEndpoints<Product>('/api/products');

api.request(products.list());
api.request(products.get('123'));
api.request(products.create(data));
```

### 3. Use Interceptors for Common Logic

```typescript
// Bad - repeated auth logic
api.get('/products', {
  headers: { 'Authorization': `Bearer ${token}` }
});

api.post('/products', data, {
  headers: { 'Authorization': `Bearer ${token}` }
});

// Good - use interceptor
api.addInterceptor({
  onRequest: (url, config) => ({
    ...config,
    headers: {
      ...config.headers,
      'Authorization': `Bearer ${getAuthToken()}`
    }
  })
});
```

### 4. Handle Errors Appropriately

```typescript
// Bad - generic error handling
try {
  await api.post('/payment', data);
} catch (error) {
  alert('Error');
}

// Good - specific error handling
try {
  await api.post('/payment', data, { retry: false });
} catch (error) {
  if (error instanceof ValidationError) {
    showValidationErrors(error.getFieldErrors());
  } else if (error instanceof NetworkError) {
    showRetryButton();
  } else {
    showGenericError();
  }
}
```

### 5. Use Effect Integration in Reducers

```typescript
// Bad - async logic in components
async function loadProducts() {
  try {
    const response = await api.get('/products');
    store.dispatch({ type: 'productsLoaded', products: response.data });
  } catch (error) {
    store.dispatch({ type: 'productsLoadFailed', error });
  }
}

// Good - declarative effects in reducer
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

## Advanced Patterns

### Request Cancellation

```typescript
// Store abort controller in state
interface State {
  abortController: AbortController | null;
}

case 'startSearch':
  // Cancel previous search
  if (state.abortController) {
    state.abortController.abort();
  }

  const controller = new AbortController();

  return [
    { ...state, abortController: controller },
    Effect.api(
      deps.api,
      Request.get('/search', {
        params: { q: action.query },
        signal: controller.signal
      }),
      (response) => ({ type: 'searchCompleted', results: response.data }),
      (error) => ({ type: 'searchFailed', error: error.message })
    )
  ];

case 'searchCompleted':
  return [
    { ...state, results: action.results, abortController: null },
    Effect.none()
  ];
```

### Optimistic Updates

```typescript
case 'deleteProduct':
  return [
    {
      ...state,
      products: state.products.filter(p => p.id !== action.id),
      deletedProduct: state.products.find(p => p.id === action.id)
    },
    Effect.api(
      deps.api,
      Request.delete(`/products/${action.id}`),
      () => ({ type: 'deleteCompleted' }),
      () => ({ type: 'deleteReverted' })
    )
  ];

case 'deleteReverted':
  // Revert optimistic update
  return [
    {
      ...state,
      products: state.deletedProduct
        ? [...state.products, state.deletedProduct]
        : state.products,
      deletedProduct: null
    },
    Effect.none()
  ];
```

### Polling

```typescript
case 'startPolling':
  return [
    { ...state, polling: true },
    Effect.batch(
      // Initial load
      Effect.api(
        deps.api,
        Request.get('/status'),
        (response) => ({ type: 'statusUpdated', status: response.data }),
        (error) => ({ type: 'pollingFailed', error: error.message })
      ),
      // Schedule next poll
      Effect.afterDelay(5000, () => ({ type: 'poll' }))
    )
  ];

case 'poll':
  if (!state.polling) {
    return [state, Effect.none()];
  }

  return [
    state,
    Effect.batch(
      Effect.api(
        deps.api,
        Request.get('/status'),
        (response) => ({ type: 'statusUpdated', status: response.data }),
        (error) => ({ type: 'pollingFailed', error: error.message })
      ),
      Effect.afterDelay(5000, () => ({ type: 'poll' }))
    )
  ];

case 'stopPolling':
  return [
    { ...state, polling: false },
    Effect.none()
  ];
```

### Batching Requests

```typescript
case 'loadDashboard':
  return [
    { ...state, loading: true },
    Effect.apiAll(
      deps.api,
      [
        Request.get('/products'),
        Request.get('/categories'),
        Request.get('/stats'),
        Request.get('/notifications')
      ],
      ([products, categories, stats, notifications]) => ({
        type: 'dashboardLoaded',
        data: {
          products: products.data,
          categories: categories.data,
          stats: stats.data,
          notifications: notifications.data
        }
      }),
      (error) => ({ type: 'dashboardLoadFailed', error: error.message })
    )
  ];
```

---

For more information, see:
- [Dependencies Overview](./dependencies.md)
- [WebSocket Client](./websocket.md)
- [Effect System](../core-concepts/effects.md)
- [Testing Guide](../testing/unit-testing.md)
