// ============================================================================
// Spy API Client Tests
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createSpyAPI } from '../../src/lib/api/testing/spy-client.js';
import { createMockAPI } from '../../src/lib/api/testing/mock-client.js';
import { APIError } from '../../src/lib/api/errors.js';

describe('createSpyAPI', () => {
  describe('Call Tracking', () => {
    it('tracks GET request calls', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('GET');
      expect(spy.calls[0].url).toBe('/api/products');
      expect(spy.calls[0].timestamp).toBeDefined();
    });

    it('tracks POST request calls with config', async () => {
      const mock = createMockAPI({
        'POST /api/products': { id: '1' }
      });
      const spy = createSpyAPI(mock);

      await spy.post('/api/products', { name: 'Product' }, { headers: { 'X-Custom': 'value' } });

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('POST');
      expect(spy.calls[0].url).toBe('/api/products');
      expect(spy.calls[0].config).toBeDefined();
      expect(spy.calls[0].config?.body).toEqual({ name: 'Product' });
      expect(spy.calls[0].config?.headers).toEqual({ 'X-Custom': 'value' });
    });

    it('tracks PUT request calls', async () => {
      const mock = createMockAPI({
        'PUT /api/products/1': { id: '1' }
      });
      const spy = createSpyAPI(mock);

      await spy.put('/api/products/1', { name: 'Updated' });

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('PUT');
      expect(spy.calls[0].url).toBe('/api/products/1');
    });

    it('tracks PATCH request calls', async () => {
      const mock = createMockAPI({
        'PATCH /api/products/1': { id: '1' }
      });
      const spy = createSpyAPI(mock);

      await spy.patch('/api/products/1', { name: 'Patched' });

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('PATCH');
    });

    it('tracks DELETE request calls', async () => {
      const mock = createMockAPI({
        'DELETE /api/products/1': { success: true }
      });
      const spy = createSpyAPI(mock);

      await spy.delete('/api/products/1');

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('DELETE');
    });

    it('tracks HEAD request calls', async () => {
      const mock = createMockAPI({
        'HEAD /api/products': null
      });
      const spy = createSpyAPI(mock);

      await spy.head('/api/products');

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('HEAD');
    });

    it('tracks request() method calls', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.request({
        method: 'GET',
        url: '/api/products'
      });

      expect(spy.calls).toHaveLength(1);
      expect(spy.calls[0].method).toBe('GET');
      expect(spy.calls[0].url).toBe('/api/products');
    });

    it('tracks multiple calls in order', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'POST /api/products': { id: '2' },
        'DELETE /api/products/1': { success: true }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.post('/api/products', { name: 'New' });
      await spy.delete('/api/products/1');

      expect(spy.calls).toHaveLength(3);
      expect(spy.calls[0].method).toBe('GET');
      expect(spy.calls[1].method).toBe('POST');
      expect(spy.calls[2].method).toBe('DELETE');
    });

    it('tracks timestamps for each call', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      const before = Date.now();
      await spy.get('/api/products');
      const after = Date.now();

      expect(spy.calls[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(spy.calls[0].timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('Response Tracking', () => {
    it('tracks successful response', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');

      expect(spy.responses).toHaveLength(1);
      expect(spy.responses[0].data).toEqual([{ id: '1', name: 'Product 1' }]);
      expect(spy.responses[0].status).toBe(200);
    });

    it('tracks multiple responses', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'POST /api/products': { id: '2' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.post('/api/products', { name: 'New' });

      expect(spy.responses).toHaveLength(2);
      expect(spy.responses[0].data).toEqual([{ id: '1' }]);
      expect(spy.responses[1].data).toEqual({ id: '2' });
    });

    it('returns response to caller', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      const response = await spy.get('/api/products');

      expect(response.data).toEqual([{ id: '1' }]);
      expect(response.status).toBe(200);
    });
  });

  describe('Error Tracking', () => {
    it('tracks error when request fails', async () => {
      const mock = createMockAPI({
        'GET /api/error': {
          error: new APIError('Server error', 500, null, {}, false)
        }
      });
      const spy = createSpyAPI(mock);

      await expect(spy.get('/api/error')).rejects.toThrow('Server error');

      expect(spy.errors).toHaveLength(1);
      expect(spy.errors[0]).toBeInstanceOf(APIError);
      expect(spy.errors[0].message).toBe('Server error');
    });

    it('tracks multiple errors', async () => {
      const mock = createMockAPI({
        'GET /api/error1': { error: new Error('Error 1') },
        'GET /api/error2': { error: new Error('Error 2') }
      });
      const spy = createSpyAPI(mock);

      await expect(spy.get('/api/error1')).rejects.toThrow();
      await expect(spy.get('/api/error2')).rejects.toThrow();

      expect(spy.errors).toHaveLength(2);
      expect(spy.errors[0].message).toBe('Error 1');
      expect(spy.errors[1].message).toBe('Error 2');
    });

    it('re-throws error to caller', async () => {
      const mock = createMockAPI({
        'GET /api/error': { error: new Error('Failed') }
      });
      const spy = createSpyAPI(mock);

      await expect(spy.get('/api/error')).rejects.toThrow('Failed');
    });

    it('does not track error in responses array', async () => {
      const mock = createMockAPI({
        'GET /api/error': { error: new Error('Error') }
      });
      const spy = createSpyAPI(mock);

      await expect(spy.get('/api/error')).rejects.toThrow();

      expect(spy.responses).toHaveLength(0);
      expect(spy.errors).toHaveLength(1);
    });
  });

  describe('callsTo()', () => {
    it('filters calls by method and URL', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'GET /api/users': [{ id: 'u1' }],
        'POST /api/products': { id: '2' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.get('/api/users');
      await spy.post('/api/products', {});

      const getCalls = spy.callsTo('GET', '/api/products');

      expect(getCalls).toHaveLength(1);
      expect(getCalls[0].method).toBe('GET');
      expect(getCalls[0].url).toBe('/api/products');
    });

    it('returns empty array when no matches', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');

      const calls = spy.callsTo('POST', '/api/products');

      expect(calls).toHaveLength(0);
    });

    it('matches exact URL only', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'GET /api/products/1': { id: '1' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.get('/api/products/1');

      const calls = spy.callsTo('GET', '/api/products');

      expect(calls).toHaveLength(1);
    });
  });

  describe('callsMatching()', () => {
    it('matches with wildcard method', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'POST /api/products': { id: '2' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.post('/api/products', {});

      const calls = spy.callsMatching('*', '/api/products');

      expect(calls).toHaveLength(2);
    });

    it('matches with wildcard URL pattern', async () => {
      const mock = createMockAPI({
        'GET /api/products/1': { id: '1' },
        'GET /api/products/2': { id: '2' },
        'GET /api/users/1': { id: 'u1' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products/1');
      await spy.get('/api/products/2');
      await spy.get('/api/users/1');

      const calls = spy.callsMatching('GET', '/api/products/*');

      expect(calls).toHaveLength(2);
    });

    it('matches with RegExp pattern', async () => {
      const mock = createMockAPI({
        'GET /api/products/123': { id: '123' },
        'GET /api/products/abc': { id: 'abc' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products/123');
      await spy.get('/api/products/abc');

      const calls = spy.callsMatching('GET', /\/api\/products\/\d+/);

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe('/api/products/123');
    });

    it('combines method and URL pattern filtering', async () => {
      const mock = createMockAPI({
        'GET /api/products/1': { id: '1' },
        'POST /api/products/2': { id: '2' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products/1');
      await spy.post('/api/products/2', {});

      const calls = spy.callsMatching('GET', '/api/products/*');

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe('GET');
    });
  });

  describe('reset()', () => {
    it('clears all tracked data', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'GET /api/error': { error: new Error('Error') }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await expect(spy.get('/api/error')).rejects.toThrow();

      expect(spy.calls).toHaveLength(2);
      expect(spy.responses).toHaveLength(1);
      expect(spy.errors).toHaveLength(1);

      spy.reset();

      expect(spy.calls).toHaveLength(0);
      expect(spy.responses).toHaveLength(0);
      expect(spy.errors).toHaveLength(0);
    });

    it('allows new tracking after reset', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      spy.reset();
      await spy.get('/api/products');

      expect(spy.calls).toHaveLength(1);
      expect(spy.responses).toHaveLength(1);
    });
  });

  describe('lastCall()', () => {
    it('returns most recent call', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'POST /api/products': { id: '2' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.post('/api/products', {});

      const last = spy.lastCall();

      expect(last?.method).toBe('POST');
      expect(last?.url).toBe('/api/products');
    });

    it('returns undefined when no calls', () => {
      const spy = createSpyAPI();

      expect(spy.lastCall()).toBeUndefined();
    });
  });

  describe('lastResponse()', () => {
    it('returns most recent response', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }],
        'POST /api/products': { id: '2', name: 'New' }
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');
      await spy.post('/api/products', {});

      const last = spy.lastResponse();

      expect(last?.data).toEqual({ id: '2', name: 'New' });
    });

    it('returns undefined when no responses', () => {
      const spy = createSpyAPI();

      expect(spy.lastResponse()).toBeUndefined();
    });
  });

  describe('lastError()', () => {
    it('returns most recent error', async () => {
      const mock = createMockAPI({
        'GET /api/error1': { error: new Error('Error 1') },
        'GET /api/error2': { error: new Error('Error 2') }
      });
      const spy = createSpyAPI(mock);

      await expect(spy.get('/api/error1')).rejects.toThrow();
      await expect(spy.get('/api/error2')).rejects.toThrow();

      const last = spy.lastError();

      expect(last?.message).toBe('Error 2');
    });

    it('returns undefined when no errors', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1' }]
      });
      const spy = createSpyAPI(mock);

      await spy.get('/api/products');

      expect(spy.lastError()).toBeUndefined();
    });
  });

  describe('Proxy Methods', () => {
    it('addInterceptor delegates to base client', () => {
      const spy = createSpyAPI();
      const cleanup = spy.addInterceptor({});

      expect(typeof cleanup).toBe('function');
    });

    it('clearCache delegates to base client', () => {
      const spy = createSpyAPI();

      expect(() => spy.clearCache()).not.toThrow();
    });

    it('invalidateCache delegates to base client', () => {
      const spy = createSpyAPI();

      expect(() => spy.invalidateCache('/api/*')).not.toThrow();
    });
  });

  describe('Real-world Usage Examples', () => {
    it('verifies API call sequence in component test', async () => {
      const mock = createMockAPI({
        'GET /api/products': [{ id: '1', name: 'Product 1' }],
        'POST /api/products': (config) => ({ id: '2', ...config.body }),
        'DELETE /api/products/1': { success: true }
      });
      const spy = createSpyAPI(mock);

      // Simulate component behavior
      await spy.get('/api/products'); // Load initial data
      await spy.post('/api/products', { name: 'New Product' }); // Create new
      await spy.delete('/api/products/1'); // Delete old

      // Verify call sequence
      expect(spy.calls).toHaveLength(3);
      expect(spy.calls[0].method).toBe('GET');
      expect(spy.calls[1].method).toBe('POST');
      expect(spy.calls[2].method).toBe('DELETE');

      // Verify responses
      expect(spy.responses[0].data).toHaveLength(1);
      expect(spy.responses[1].data).toEqual({ id: '2', name: 'New Product' });
      expect(spy.responses[2].data).toEqual({ success: true });
    });

    it('verifies retry behavior', async () => {
      let callCount = 0;
      const mock = createMockAPI({
        'GET /api/flaky': () => {
          callCount++;
          if (callCount < 3) {
            throw new APIError('Server error', 500, null, {}, false);
          }
          return { success: true };
        }
      });
      const spy = createSpyAPI(mock);

      // First two calls fail
      await expect(spy.get('/api/flaky')).rejects.toThrow();
      await expect(spy.get('/api/flaky')).rejects.toThrow();

      // Third call succeeds
      const response = await spy.get('/api/flaky');

      expect(spy.calls).toHaveLength(3);
      expect(spy.errors).toHaveLength(2);
      expect(spy.responses).toHaveLength(1);
      expect(response.data).toEqual({ success: true });
    });

    it('verifies authentication flow', async () => {
      const mock = createMockAPI({
        'POST /api/login': { token: 'abc123' },
        'GET /api/profile': (config) => {
          const auth = config.headers?.['Authorization'];
          if (!auth) throw new APIError('Unauthorized', 401, null, {}, false);
          return { name: 'John Doe' };
        }
      });
      const spy = createSpyAPI(mock);

      // Login
      const loginRes = await spy.post('/api/login', { email: 'user@example.com' });
      const token = (loginRes.data as any).token;

      // Get profile with token
      await spy.get('/api/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      // Verify sequence
      expect(spy.calls).toHaveLength(2);
      expect(spy.calls[0].method).toBe('POST');
      expect(spy.calls[1].config?.headers?.['Authorization']).toBe('Bearer abc123');
    });
  });
});
