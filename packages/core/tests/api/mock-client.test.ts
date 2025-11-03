// ============================================================================
// Mock API Client Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { createMockAPI, type MockRoutes } from '../../src/api/testing/mock-client.js';
import { APIError } from '../../src/api/errors.js';

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
        'GET /api/products': (config) => {
          return [{ id: '1', name: 'Product from function' }];
        }
      });

      const response = await mockAPI.get('/api/products');

      expect(response.data).toEqual([{ id: '1', name: 'Product from function' }]);
    });

    it('passes config to response function', async () => {
      const mockAPI = createMockAPI({
        'POST /api/products': (config) => {
          return { ...config.body, id: '123' };
        }
      });

      const response = await mockAPI.post('/api/products', { name: 'New Product' });

      expect(response.data).toEqual({ name: 'New Product', id: '123' });
    });

    it('passes params to response function', async () => {
      const mockAPI = createMockAPI({
        'GET /api/products/:id': (config, params) => {
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
          data: (config, params) => ({ id: params.id, name: 'Delayed Product' })
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
        'GET /api/products/:id': (config, params) => ({
          id: params.id,
          name: `Product ${params.id}`
        })
      });

      const response = await mockAPI.get('/api/products/123');

      expect(response.data).toEqual({ id: '123', name: 'Product 123' });
    });

    it('matches multiple path parameters', async () => {
      const mockAPI = createMockAPI({
        'GET /api/users/:userId/posts/:postId': (config, params) => ({
          userId: params.userId,
          postId: params.postId
        })
      });

      const response = await mockAPI.get('/api/users/42/posts/7');

      expect(response.data).toEqual({ userId: '42', postId: '7' });
    });

    it('matches slug parameters', async () => {
      const mockAPI = createMockAPI({
        'GET /api/posts/:slug': (config, params) => ({
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
        'GET /api/products/:id': (config, params) => ({ type: 'product', id: params.id })
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
        'GET /api/products': (config) => {
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
        'POST /api/products': (config) => config.body
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
        'GET /api/products/:id': (config, params) => ({ id: params.id })
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

  describe('No-op Methods', () => {
    it('addInterceptor returns cleanup function', () => {
      const mockAPI = createMockAPI({});
      const cleanup = mockAPI.addInterceptor({});

      expect(typeof cleanup).toBe('function');
      cleanup(); // Should not throw
    });

    it('clearCache does not throw', () => {
      const mockAPI = createMockAPI({});

      expect(() => mockAPI.clearCache()).not.toThrow();
    });

    it('invalidateCache does not throw', () => {
      const mockAPI = createMockAPI({});

      expect(() => mockAPI.invalidateCache('/api/*')).not.toThrow();
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
        'GET /api/products/:id': (config, params) => {
          return products.find(p => p.id === params.id) || null;
        },
        'POST /api/products': (config) => ({
          id: '3',
          ...config.body
        }),
        'PUT /api/products/:id': (config, params) => ({
          id: params.id,
          ...config.body
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
        'GET /api/products': (config) => {
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
        'GET /api/protected': (config) => {
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
