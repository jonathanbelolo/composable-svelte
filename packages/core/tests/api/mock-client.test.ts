// ============================================================================
// Mock API Client Tests
// ============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockAPI, type MockRoutes } from '../../src/lib/api/testing/mock-client.js';
import { APIError } from '../../src/lib/api/errors.js';
import type { RequestConfig } from '../../src/lib/api/types.js';

describe('createMockAPI', () => {
  describe('Static Responses', () => {
    it('returns static value for GET request', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }]
      });

      const response = await mockAPI.get('/api/products');

      expect(response.status).toBe(200);
      expect(response.data).toEqual([{ id: '1', name: 'Product 1' }]);
      expect(response.headers['content-type']).toBe('application/json');
    });

    it('returns static value for POST request', async () => {
      const mockAPI = createMockAPI({
        'POST /api/products': { id: '2', name: 'Created Product' }
      });

      const response = await mockAPI.post('/api/products', { name: 'New Product' });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ id: '2', name: 'Created Product' });
    });

    it('returns static value for PUT request', async () => {
      const mockAPI = createMockAPI({
        'PUT /api/products/1': { id: '1', name: 'Updated Product' }
      });

      const response = await mockAPI.put('/api/products/1', { name: 'Updated' });

      expect(response.status).toBe(200);
      expect(response.data).toEqual({ id: '1', name: 'Updated Product' });
    });

    it('returns static value for PATCH request', async () => {
      const mockAPI = createMockAPI({
        'PATCH /api/products/1': { id: '1', name: 'Patched Product' }
      });

      const response = await mockAPI.patch('/api/products/1', { name: 'Patched' });

      expect(response.data).toEqual({ id: '1', name: 'Patched Product' });
    });

    it('returns static value for DELETE request', async () => {
      const mockAPI = createMockAPI({
        'DELETE /api/products/1': { success: true }
      });

      const response = await mockAPI.delete('/api/products/1');

      expect(response.data).toEqual({ success: true });
    });

    it('returns static value for HEAD request', async () => {
      const mockAPI = createMockAPI({
        'HEAD /api/products': null
      });

      const response = await mockAPI.head('/api/products');

      expect(response.status).toBe(200);
    });
  });

  describe('Promise Responses', () => {
    it('resolves promise response', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': Promise.resolve([{ id: '1', name: 'Product 1' }])
      });

      const response = await mockAPI.get('/api/products');

      expect(response.data).toEqual([{ id: '1', name: 'Product 1' }]);
    });
  });

  describe('Function Responses', () => {
    it('calls function to generate response', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': (config: RequestConfig) => {
          return [{ id: '1', name: 'Product from function' }];
        }
      });

      const response = await mockAPI.get('/api/products');

      expect(response.data).toEqual([{ id: '1', name: 'Product from function' }]);
    });

    it('passes config to response function', async () => {
      const mockAPI = createMockAPI({
        'POST /api/products': (config: RequestConfig) => {
          // `body` is `unknown` on the public type — the mock does not know what
          // a route was sent. The cast says what this test posts, three lines up.
          return { ...(config.body as Record<string, unknown>), id: '123' };
        }
      });

      const response = await mockAPI.post('/api/products', { name: 'New Product' });

      expect(response.data).toEqual({ name: 'New Product', id: '123' });
    });

    it('passes params to response function', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/:id': (config: RequestConfig, params: Record<string, string>) => {
          return { id: params.id, name: `Product ${params.id}` };
        }
      });

      const response = await mockAPI.get('/api/products/42');

      expect(response.data).toEqual({ id: '42', name: 'Product 42' });
    });

    it('handles async function responses', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return [{ id: '1', name: 'Async Product' }];
        }
      });

      const response = await mockAPI.get('/api/products');

      expect(response.data).toEqual([{ id: '1', name: 'Async Product' }]);
    });
  });

  describe('Delayed Responses', () => {
    it('delays response by specified duration', async () => {
      const mockAPI = createMockAPI({
        'GET /api/slow': {
          delay: 50,
          data: { message: 'Slow response' }
        }
      });

      const start = Date.now();
      const response = await mockAPI.get('/api/slow');
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(40); // Allow some timing variance
      expect(response.data).toEqual({ message: 'Slow response' });
    });

    it('handles delayed promise data', async () => {
      const mockAPI = createMockAPI({
        'GET /api/slow': {
          delay: 10,
          data: Promise.resolve({ message: 'Delayed promise' })
        }
      });

      const response = await mockAPI.get('/api/slow');

      expect(response.data).toEqual({ message: 'Delayed promise' });
    });

    it('handles delayed function data', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/:id': {
          delay: 10,
          data: (config: RequestConfig, params: Record<string, string>) => ({
            id: params.id,
            name: 'Delayed Product'
          })
        }
      });

      const response = await mockAPI.get('/api/products/99');

      expect(response.data).toEqual({ id: '99', name: 'Delayed Product' });
    });
  });

  describe('Error Simulation', () => {
    it('throws error from error response', async () => {
      const mockAPI = createMockAPI({
        'GET /api/error': {
          error: new APIError('Something went wrong', 500, null, {}, false)
        }
      });

      await expect(mockAPI.get('/api/error')).rejects.toThrow('Something went wrong');
    });

    it('throws custom error', async () => {
      const mockAPI = createMockAPI({
        'POST /api/error': {
          error: new Error('Custom error')
        }
      });

      await expect(mockAPI.post('/api/error', {})).rejects.toThrow('Custom error');
    });
  });

  describe('Pattern Matching', () => {
    it('matches single path parameter', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/:id': (config: RequestConfig, params: Record<string, string>) => ({
          id: params.id,
          name: `Product ${params.id}`
        })
      });

      const response = await mockAPI.get('/api/products/123');

      expect(response.data).toEqual({ id: '123', name: 'Product 123' });
    });

    it('matches multiple path parameters', async () => {
      const mockAPI = createMockAPI({
        'GET /api/users/:userId/posts/:postId': (config: RequestConfig, params: Record<string, string>) => ({
          userId: params.userId,
          postId: params.postId
        })
      });

      const response = await mockAPI.get('/api/users/42/posts/7');

      expect(response.data).toEqual({ userId: '42', postId: '7' });
    });

    it('matches slug parameters', async () => {
      const mockAPI = createMockAPI({
        'GET /api/posts/:slug': (config: RequestConfig, params: Record<string, string>) => ({
          slug: params.slug,
          title: `Post: ${params.slug}`
        })
      });

      const response = await mockAPI.get('/api/posts/hello-world');

      expect(response.data).toEqual({ slug: 'hello-world', title: 'Post: hello-world' });
    });

    it('prefers exact match over pattern match', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/new': { type: 'new-form' },
        'GET /api/products/:id': (config: RequestConfig, params: Record<string, string>) => ({ type: 'product', id: params.id })
      });

      const exactResponse = await mockAPI.get('/api/products/new');
      const patternResponse = await mockAPI.get('/api/products/123');

      expect(exactResponse.data).toEqual({ type: 'new-form' });
      expect(patternResponse.data).toEqual({ type: 'product', id: '123' });
    });
  });

  describe('Query String Handling', () => {
    it('strips query string for matching', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }]
      });

      const response = await mockAPI.get('/api/products?page=1&limit=10');

      expect(response.data).toEqual([{ id: '1', name: 'Product 1' }]);
    });

    it('passes query params in config', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': (config: RequestConfig) => {
          return {
            page: config.params?.page,
            limit: config.params?.limit
          };
        }
      });

      const response = await mockAPI.get('/api/products', {
        params: { page: 1, limit: 20 }
      });

      expect(response.data).toEqual({ page: 1, limit: 20 });
    });
  });

  describe('404 Errors', () => {
    it('throws 404 for unmatched GET route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.get('/api/unknown')).rejects.toThrow('No mock for: GET /api/unknown');
    });

    it('throws 404 for unmatched POST route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.post('/api/unknown', {})).rejects.toThrow('No mock for: POST /api/unknown');
    });

    it('throws 404 for unmatched PUT route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.put('/api/unknown', {})).rejects.toThrow('No mock for: PUT /api/unknown');
    });

    it('throws 404 for unmatched PATCH route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.patch('/api/unknown', {})).rejects.toThrow('No mock for: PATCH /api/unknown');
    });

    it('throws 404 for unmatched DELETE route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.delete('/api/unknown')).rejects.toThrow('No mock for: DELETE /api/unknown');
    });

    it('throws 404 for unmatched HEAD route', async () => {
      const mockAPI = createMockAPI({});

      await expect(mockAPI.head('/api/unknown')).rejects.toThrow('No mock for: HEAD /api/unknown');
    });
  });

  describe('request() method', () => {
    it('handles GET request', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });

      const response = await mockAPI.request({
        method: 'GET',
        url: '/api/products'
      });

      expect(response.data).toEqual([{ id: '1' }]);
    });

    it('handles POST request with body', async () => {
      const mockAPI = createMockAPI({
        'POST /api/products': (config: RequestConfig) => config.body
      });

      const response = await mockAPI.request({
        method: 'POST',
        url: '/api/products',
        config: { body: { name: 'New Product' } }
      });

      expect(response.data).toEqual({ name: 'New Product' });
    });

    it('handles path parameters in request', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/:id': (config: RequestConfig, params: Record<string, string>) => ({ id: params.id })
      });

      const response = await mockAPI.request({
        method: 'GET',
        url: '/api/products/789'
      });

      expect(response.data).toEqual({ id: '789' });
    });

    it('throws 404 for unmatched request', async () => {
      const mockAPI = createMockAPI({});

      await expect(
        mockAPI.request({
          method: 'GET',
          url: '/api/unknown'
        })
      ).rejects.toThrow('No mock for: GET /api/unknown');
    });
  });

  describe('Interceptors', () => {
    // These three were `expect(typeof cleanup).toBe('function')` and two
    // `not.toThrow()`s, which is what a total no-op passes. `addInterceptor`
    // returned an empty closure and `clearCache`/`invalidateCache` did nothing,
    // so any test exercising auth headers, response shaping or error mapping
    // against the mock proved the opposite of what it looked like.

    it('runs onRequest before the route is resolved', async () => {
      const seen: RequestConfig[] = [];
      const mockAPI = createMockAPI({
        'GET /api/me': (config: RequestConfig) => ({ token: config.headers?.authorization ?? null })
      });

      mockAPI.addInterceptor({
        onRequest: (_url, config) => {
          seen.push(config);
          return { ...config, headers: { ...config.headers, authorization: 'Bearer t' } };
        }
      });

      const response = await mockAPI.get<{ token: string | null }>('/api/me');

      expect(seen).toHaveLength(1);
      expect(response.data.token, 'the route never saw the injected header').toBe('Bearer t');
    });

    it('passes the resolved URL to onRequest', async () => {
      const urls: string[] = [];
      const mockAPI = createMockAPI({ 'GET /api/items': [] });

      mockAPI.addInterceptor({ onRequest: (url, config) => { urls.push(url); return config; } });
      await mockAPI.get('/api/items');

      expect(urls).toEqual(['/api/items']);
    });

    it('runs onResponse and lets it rewrite the response', async () => {
      const mockAPI = createMockAPI({ 'GET /api/items': [{ id: '1' }] });

      mockAPI.addInterceptor({
        onResponse: (response) => ({ ...response, status: 299 })
      });

      const response = await mockAPI.get('/api/items');
      expect(response.status).toBe(299);
    });

    it('runs onError, which may recover', async () => {
      const mockAPI = createMockAPI({
        'GET /api/boom': { error: new APIError('nope', 500, null, {}, false) }
      });

      mockAPI.addInterceptor({
        onError: () => ({ status: 200, headers: {}, data: { recovered: true } })
      });

      const response = await mockAPI.get<{ recovered: boolean }>('/api/boom');
      expect(response.data.recovered).toBe(true);
    });

    it('rethrows when no onError recovers', async () => {
      // Registers an actual `onError` that declines by throwing. The earlier
      // version of this test registered only an `onRequest`, so it never
      // entered the error loop at all and could not see that the loop returned
      // from the first hook without a try — which made a rethrowing hook
      // surface a *different* error under the mock than under the real client.
      const mockAPI = createMockAPI({
        'GET /api/boom': { error: new APIError('nope', 500, null, {}, false) }
      });
      mockAPI.addInterceptor({
        onError: () => {
          throw new Error('mapped, but still an error');
        }
      });

      await expect(mockAPI.get('/api/boom')).rejects.toThrow('nope');
    });

    it('falls through to a later onError when an earlier one declines', async () => {
      const mockAPI = createMockAPI({
        'GET /api/boom': { error: new APIError('nope', 500, null, {}, false) }
      });

      mockAPI.addInterceptor({
        onError: () => {
          throw new Error('not mine');
        }
      });
      mockAPI.addInterceptor({
        onError: () => ({ status: 200, headers: {}, data: { rescuedBySecond: true } })
      });

      const response = await mockAPI.get<{ rescuedBySecond: boolean }>('/api/boom');
      expect(response.data.rescuedBySecond).toBe(true);
    });

    it('the returned function removes the interceptor', async () => {
      let calls = 0;
      const mockAPI = createMockAPI({ 'GET /api/items': [] });

      const remove = mockAPI.addInterceptor({
        onRequest: (_url, config) => {
          calls += 1;
          return config;
        }
      });

      await mockAPI.get('/api/items');
      remove();
      await mockAPI.get('/api/items');

      expect(calls, 'cleanup did not remove it').toBe(1);
    });

    it('runs interceptors in the order they were added', async () => {
      const order: string[] = [];
      const mockAPI = createMockAPI({ 'GET /api/items': [] });

      mockAPI.addInterceptor({ onRequest: (_u, c) => { order.push('first'); return c; } });
      mockAPI.addInterceptor({ onRequest: (_u, c) => { order.push('second'); return c; } });
      await mockAPI.get('/api/items');

      expect(order).toEqual(['first', 'second']);
    });
  });

  describe('Cache', () => {
    // Each mock owns its cache, as each real client does; nothing to clear.

    it('does not cache by default, matching the real client', async () => {
      let hits = 0;
      const mockAPI = createMockAPI({
        'GET /api/count': () => ({ hits: (hits += 1) })
      });

      await mockAPI.get('/api/count');
      const second = await mockAPI.get<{ hits: number }>('/api/count');

      expect(second.data.hits, 'the mock cached without being asked to').toBe(2);
    });

    it('serves a cached GET when asked to cache', async () => {
      let hits = 0;
      const mockAPI = createMockAPI({
        'GET /api/count': () => ({ hits: (hits += 1) })
      });

      await mockAPI.get('/api/count', { cache: true });
      const second = await mockAPI.get<{ hits: number }>('/api/count', { cache: true });

      expect(second.data.hits).toBe(1);
      expect(second.cached).toBe(true);
    });

    it('clearCache actually clears it', async () => {
      let hits = 0;
      const mockAPI = createMockAPI({ 'GET /api/count': () => ({ hits: (hits += 1) }) });

      await mockAPI.get('/api/count', { cache: true });
      mockAPI.clearCache();
      const second = await mockAPI.get<{ hits: number }>('/api/count', { cache: true });

      expect(second.data.hits, 'clearCache was a no-op').toBe(2);
    });

    it('invalidateCache drops matching entries only', async () => {
      let items = 0;
      let others = 0;
      const mockAPI = createMockAPI({
        'GET /api/items': () => ({ n: (items += 1) }),
        'GET /api/others': () => ({ n: (others += 1) })
      });

      await mockAPI.get('/api/items', { cache: true });
      await mockAPI.get('/api/others', { cache: true });

      mockAPI.invalidateCache('/api/items');

      const refetchedItems = await mockAPI.get<{ n: number }>('/api/items', { cache: true });
      const stillCachedOthers = await mockAPI.get<{ n: number }>('/api/others', { cache: true });

      expect(refetchedItems.data.n).toBe(2);
      expect(stillCachedOthers.data.n, 'invalidate took out an unrelated entry').toBe(1);
    });

    it('never caches a POST', async () => {
      let hits = 0;
      const mockAPI = createMockAPI({ 'POST /api/things': () => ({ n: (hits += 1) }) });

      await mockAPI.post('/api/things', {}, { cache: true });
      const second = await mockAPI.post<{ n: number }>('/api/things', {}, { cache: true });

      expect(second.data.n).toBe(2);
    });
  });

  describe('Real-world Usage Examples', () => {
    it('mocks complete CRUD API', async () => {
      const products = [
        { id: '1', name: 'Product 1' },
        { id: '2', name: 'Product 2' }
      ];

      const mockAPI = createMockAPI({
        'GET /api/products': products,
        'GET /api/products/:id': (config: RequestConfig, params: Record<string, string>) => {
          return products.find(p => p.id === params.id) || null;
        },
        'POST /api/products': (config: RequestConfig) => ({
          id: '3',
          ...(config.body as Record<string, unknown>)
        }),
        'PUT /api/products/:id': (config: RequestConfig, params: Record<string, string>) => ({
          id: params.id,
          ...(config.body as Record<string, unknown>)
        }),
        'DELETE /api/products/:id': { success: true }
      });

      // List
      const list = await mockAPI.get('/api/products');
      expect(list.data).toHaveLength(2);

      // Get
      const get = await mockAPI.get('/api/products/1');
      expect(get.data).toEqual({ id: '1', name: 'Product 1' });

      // Create
      const create = await mockAPI.post('/api/products', { name: 'Product 3' });
      expect(create.data).toEqual({ id: '3', name: 'Product 3' });

      // Update
      const update = await mockAPI.put('/api/products/1', { name: 'Updated' });
      expect(update.data).toEqual({ id: '1', name: 'Updated' });

      // Delete
      const del = await mockAPI.delete('/api/products/1');
      expect(del.data).toEqual({ success: true });
    });

    it('mocks API with pagination', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products': (config: RequestConfig) => {
          const page = config.params?.page || 1;
          const pageSize = config.params?.pageSize || 10;

          return {
            data: [{ id: '1' }, { id: '2' }],
            total: 50,
            page,
            pageSize
          };
        }
      });

      const response = await mockAPI.get('/api/products', {
        params: { page: 2, pageSize: 20 }
      });

      expect(response.data).toEqual({
        data: [{ id: '1' }, { id: '2' }],
        total: 50,
        page: 2,
        pageSize: 20
      });
    });

    it('mocks API with authentication', async () => {
      const mockAPI = createMockAPI({
        'GET /api/protected': (config: RequestConfig) => {
          const token = config.headers?.['Authorization'];

          if (!token || token !== 'Bearer valid-token') {
            throw new APIError('Unauthorized', 401, null, {}, false);
          }

          return { data: 'Protected data' };
        }
      });

      // Without auth
      await expect(
        mockAPI.get('/api/protected')
      ).rejects.toThrow('Unauthorized');

      // With valid auth
      const response = await mockAPI.get('/api/protected', {
        headers: { 'Authorization': 'Bearer valid-token' }
      });

      expect(response.data).toEqual({ data: 'Protected data' });
    });
  });
});
