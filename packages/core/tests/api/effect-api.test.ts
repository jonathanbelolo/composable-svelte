// ============================================================================
// Effect.api() Integration Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import { api, apiFireAndForget, apiAll } from '../../src/lib/api/effect-api.js';
import { createMockAPI } from '../../src/lib/api/testing/mock-client.js';
import { APIError } from '../../src/lib/api/errors.js';

describe('Effect.api()', () => {
  describe('Successful API Calls', () => {
    it('dispatches success action on successful API call', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }]
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/products' },
        (response) => ({ type: 'productsLoaded', products: response.data }),
        (error) => ({ type: 'productsFailed', error: error.message })
      );

      expect(effect._tag).toBe('Run');

      // Execute the effect
      const dispatched: any[] = [];
      const dispatch = (action: any) => dispatched.push(action);

      if (effect._tag === 'Run') {
        await effect.execute(dispatch);
      }

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0]).toEqual({
        type: 'productsLoaded',
        products: [{ id: '1', name: 'Product 1' }]
      });
    });

    it('passes full response to success handler', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': { data: 'test' }
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/products' },
        (response) => ({
          type: 'loaded',
          data: response.data,
          status: response.status,
          headers: response.headers
        }),
        (error) => ({ type: 'failed', error: error.message })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched[0]).toEqual({
        type: 'loaded',
        data: { data: 'test' },
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    });

    it('handles POST requests with body', async () => {
      const mockAPI = createMockAPI({
        'POST /api/products': (config) => ({ id: '2', ...config.body })
      });

      const effect = api(
        mockAPI,
        {
          method: 'POST',
          url: '/api/products',
          config: { body: { name: 'New Product' } }
        },
        (response) => ({ type: 'productCreated', product: response.data }),
        (error) => ({ type: 'createFailed', error: error.message })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched[0]).toEqual({
        type: 'productCreated',
        product: { id: '2', name: 'New Product' }
      });
    });
  });

  describe('Failed API Calls', () => {
    it('dispatches failure action on API error', async () => {
      const mockAPI = createMockAPI({
        'GET /api/error': {
          error: new APIError('Server error', 500, null, {}, false)
        }
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/error' },
        (response) => ({ type: 'success', data: response.data }),
        (error) => ({ type: 'failed', message: error.message, status: error.status })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].type).toBe('failed');
      expect(dispatched[0].message).toBe('Server error');
      expect(dispatched[0].status).toBe(500);
    });

    it('wraps generic Error in APIError', async () => {
      const mockAPI = createMockAPI({
        'GET /api/error': {
          error: new Error('Generic error')
        }
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/error' },
        (response) => ({ type: 'success' }),
        (error) => ({
          type: 'failed',
          isAPIError: error instanceof APIError,
          message: error.message
        })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched[0].isAPIError).toBe(true);
      expect(dispatched[0].message).toBe('Generic error');
    });

    it('wraps unknown errors in APIError', async () => {
      const mockAPI = createMockAPI({
        'GET /api/error': {
          error: { toString: () => 'Unknown error' } as any
        }
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/error' },
        (response) => ({ type: 'success' }),
        (error) => ({
          type: 'failed',
          isAPIError: error instanceof APIError,
          message: error.message
        })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched[0].isAPIError).toBe(true);
      expect(dispatched[0].message).toBe('Unknown error');
    });
  });

  describe('Type Inference', () => {
    it('infers response type from request', async () => {
      interface Product {
        id: string;
        name: string;
      }

      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }] as Product[]
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/products' } as const,
        (response) => {
          // Type should be inferred as Product[]
          const products: Product[] = response.data;
          return { type: 'productsLoaded', products };
        },
        (error) => ({ type: 'productsFailed', error: error.message })
      );

      const dispatched: any[] = [];
      if (effect._tag === 'Run') {
        await effect.execute((a) => dispatched.push(a));
      }

      expect(dispatched[0].products).toHaveLength(1);
    });
  });

  describe('Effect Namespace Integration', () => {
    it('is available on Effect namespace', () => {
      expect(Effect.api).toBe(api);
    });

    it('can be called as Effect.api()', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });

      const effect = Effect.api(
        mockAPI,
        { method: 'GET', url: '/api/products' },
        (response) => ({ type: 'success', data: response.data }),
        (error) => ({ type: 'failed', error: error.message })
      );

      expect(effect._tag).toBe('Run');
    });
  });
});

describe('Effect.apiFireAndForget()', () => {
  it('dispatches success action on successful call', async () => {
    const mockAPI = createMockAPI({
      'POST /api/analytics': { tracked: true }
    });

    const effect = apiFireAndForget(
      mockAPI,
      {
        method: 'POST',
        url: '/api/analytics',
        config: { body: { event: 'page_view' } }
      },
      (response) => ({ type: 'analyticsTracked' })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({ type: 'analyticsTracked' });
  });

  it('ignores errors silently', async () => {
    const mockAPI = createMockAPI({
      'POST /api/analytics': {
        error: new APIError('Server error', 500, null, {}, false)
      }
    });

    const effect = apiFireAndForget(
      mockAPI,
      { method: 'POST', url: '/api/analytics' },
      (response) => ({ type: 'analyticsTracked' })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    // No error action dispatched
    expect(dispatched).toHaveLength(0);
  });

  it('is available on Effect namespace', () => {
    expect(Effect.apiFireAndForget).toBe(apiFireAndForget);
  });

  it('can be called as Effect.apiFireAndForget()', async () => {
    const mockAPI = createMockAPI({
      'POST /api/log': { logged: true }
    });

    const effect = Effect.apiFireAndForget(
      mockAPI,
      { method: 'POST', url: '/api/log' },
      () => ({ type: 'logged' })
    );

    expect(effect._tag).toBe('Run');
  });
});

describe('Effect.apiAll()', () => {
  it('dispatches success action when all requests succeed', async () => {
    const mockAPI = createMockAPI({
      'GET /api/products': [{ id: '1', name: 'Product 1' }],
      'GET /api/categories': [{ id: 'c1', name: 'Category 1' }]
    });

    const effect = apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/products' },
        { method: 'GET', url: '/api/categories' }
      ],
      ([productsRes, categoriesRes]) => ({
        type: 'dataLoaded',
        products: productsRes.data,
        categories: categoriesRes.data
      }),
      (error) => ({ type: 'dataLoadFailed', error: error.message })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'dataLoaded',
      products: [{ id: '1', name: 'Product 1' }],
      categories: [{ id: 'c1', name: 'Category 1' }]
    });
  });

  it('dispatches failure action if any request fails', async () => {
    const mockAPI = createMockAPI({
      'GET /api/products': [{ id: '1' }],
      'GET /api/error': {
        error: new APIError('Failed to load', 500, null, {}, false)
      }
    });

    const effect = apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/products' },
        { method: 'GET', url: '/api/error' }
      ],
      ([productsRes, errorRes]) => ({ type: 'loaded' }),
      (error) => ({ type: 'failed', message: error.message })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({
      type: 'failed',
      message: 'Failed to load'
    });
  });

  it('handles empty request array', async () => {
    const mockAPI = createMockAPI({});

    const effect = apiAll(
      mockAPI,
      [],
      (responses) => ({ type: 'loaded', count: responses.length }),
      (error) => ({ type: 'failed', error: error.message })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toEqual({ type: 'loaded', count: 0 });
  });

  it('executes requests in parallel', async () => {
    const startTimes: number[] = [];
    const mockAPI = createMockAPI({
      'GET /api/slow1': {
        delay: 50,
        data: () => {
          startTimes.push(Date.now());
          return { id: '1' };
        }
      },
      'GET /api/slow2': {
        delay: 50,
        data: () => {
          startTimes.push(Date.now());
          return { id: '2' };
        }
      }
    });

    const effect = apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/slow1' },
        { method: 'GET', url: '/api/slow2' }
      ],
      (responses) => ({ type: 'loaded' }),
      (error) => ({ type: 'failed' })
    );

    const start = Date.now();
    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }
    const duration = Date.now() - start;

    // Should complete in ~50ms (parallel), not ~100ms (sequential)
    expect(duration).toBeLessThan(100);
    expect(duration).toBeGreaterThanOrEqual(40);

    // Both requests should start at roughly the same time
    if (startTimes.length === 2) {
      const timeDiff = Math.abs(startTimes[1] - startTimes[0]);
      expect(timeDiff).toBeLessThan(10); // Started within 10ms of each other
    }
  });

  it('wraps generic Error in APIError', async () => {
    const mockAPI = createMockAPI({
      'GET /api/products': [{ id: '1' }],
      'GET /api/error': { error: new Error('Generic error') }
    });

    const effect = apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/products' },
        { method: 'GET', url: '/api/error' }
      ],
      () => ({ type: 'loaded' }),
      (error) => ({
        type: 'failed',
        isAPIError: error instanceof APIError,
        message: error.message
      })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched[0].isAPIError).toBe(true);
    expect(dispatched[0].message).toBe('Generic error');
  });

  it('is available on Effect namespace', () => {
    expect(Effect.apiAll).toBe(apiAll);
  });

  it('can be called as Effect.apiAll()', async () => {
    const mockAPI = createMockAPI({
      'GET /api/a': { data: 'a' },
      'GET /api/b': { data: 'b' }
    });

    const effect = Effect.apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/a' },
        { method: 'GET', url: '/api/b' }
      ],
      () => ({ type: 'loaded' }),
      () => ({ type: 'failed' })
    );

    expect(effect._tag).toBe('Run');
  });
});

describe('Real-world Usage Examples', () => {
  it('loads product list in reducer', async () => {
    interface Product {
      id: string;
      name: string;
    }

    type Action =
      | { type: 'loadProductsRequested' }
      | { type: 'productsLoaded'; products: Product[] }
      | { type: 'productsLoadFailed'; error: string };

    const mockAPI = createMockAPI({
      'GET /api/products': [
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' }
      ]
    });

    const effect = Effect.api(
      mockAPI,
      { method: 'GET', url: '/api/products' },
      (response) => ({ type: 'productsLoaded', products: response.data }) as Action,
      (error) => ({ type: 'productsLoadFailed', error: error.message }) as Action
    );

    const dispatched: Action[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched[0]).toEqual({
      type: 'productsLoaded',
      products: [
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' }
      ]
    });
  });

  it('handles authentication flow', async () => {
    const mockAPI = createMockAPI({
      'POST /api/login': { token: 'abc123', user: { id: 'u1', name: 'John' } },
      'GET /api/profile': (config) => {
        if (config.headers?.['Authorization'] !== 'Bearer abc123') {
          throw new APIError('Unauthorized', 401, null, {}, false);
        }
        return { id: 'u1', name: 'John', email: 'john@example.com' };
      }
    });

    // Login
    const loginEffect = Effect.api(
      mockAPI,
      {
        method: 'POST',
        url: '/api/login',
        config: { body: { email: 'john@example.com', password: 'secret' } }
      },
      (response) => ({ type: 'loginSuccess', token: (response.data as any).token }),
      (error) => ({ type: 'loginFailed', error: error.message })
    );

    const loginActions: any[] = [];
    if (loginEffect._tag === 'Run') {
      await loginEffect.execute((a) => loginActions.push(a));
    }

    expect(loginActions[0].type).toBe('loginSuccess');
    const token = loginActions[0].token;

    // Load profile with token
    const profileEffect = Effect.api(
      mockAPI,
      {
        method: 'GET',
        url: '/api/profile',
        config: { headers: { 'Authorization': `Bearer ${token}` } }
      },
      (response) => ({ type: 'profileLoaded', profile: response.data }),
      (error) => ({ type: 'profileFailed', error: error.message })
    );

    const profileActions: any[] = [];
    if (profileEffect._tag === 'Run') {
      await profileEffect.execute((a) => profileActions.push(a));
    }

    expect(profileActions[0].type).toBe('profileLoaded');
    expect(profileActions[0].profile.email).toBe('john@example.com');
  });

  it('loads dashboard with parallel requests', async () => {
    const mockAPI = createMockAPI({
      'GET /api/products': [{ id: '1' }],
      'GET /api/categories': [{ id: 'c1' }],
      'GET /api/stats': { total: 42 }
    });

    const effect = Effect.apiAll(
      mockAPI,
      [
        { method: 'GET', url: '/api/products' },
        { method: 'GET', url: '/api/categories' },
        { method: 'GET', url: '/api/stats' }
      ],
      ([productsRes, categoriesRes, statsRes]) => ({
        type: 'dashboardLoaded',
        products: productsRes.data,
        categories: categoriesRes.data,
        stats: statsRes.data
      }),
      (error) => ({ type: 'dashboardFailed', error: error.message })
    );

    const dispatched: any[] = [];
    if (effect._tag === 'Run') {
      await effect.execute((a) => dispatched.push(a));
    }

    expect(dispatched[0].type).toBe('dashboardLoaded');
    expect(dispatched[0].products).toHaveLength(1);
    expect(dispatched[0].categories).toHaveLength(1);
    expect(dispatched[0].stats.total).toBe(42);
  });
});
