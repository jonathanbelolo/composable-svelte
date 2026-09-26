// ============================================================================
// Effect.api() Integration Tests
// ============================================================================

import { describe, it, expect, vi } from 'vitest';
import { Effect } from '../../src/lib/effect.js';
import { api, apiFireAndForget, apiAll } from '../../src/lib/api/effect-api.js';
import { createMockAPI, type MockHandler } from '../../src/lib/api/testing/mock-client.js';
import { APIError } from '../../src/lib/api/errors.js';
import { Request, type APIClient } from '../../src/lib/api/types.js';

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
        // `MockRoutes` is `Record<string, MockResponse<any>>`, and a union
        // containing `any` *is* `any`, so an inline handler is never
        // contextually typed. `satisfies MockHandler` supplies the shape.
        'POST /api/products': ((config) => ({
          id: '2',
          // `RequestConfig.body` is `unknown` — it has to be, it carries whatever
          // the caller sends. This test sends an object and asserts it is
          // echoed back.
          ...(config.body as Record<string, unknown>)
        })) satisfies MockHandler
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
        // `APIRequest` carries its response type in a phantom `_response`
        // property, so a plain object literal cannot supply one and
        // `InferResponse` yields `unknown`. `Request.get<T>` is what makes the
        // inference this test is named for actually happen — with the literal
        // the assertion below was vacuous.
        Request.get<Product[]>('/api/products'),
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
        products: productsRes!.data,
        categories: categoriesRes!.data
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

  it('starts both requests before either settles', async () => {
    type Response = { data: number; status: number; headers: Record<string, string> };
    let resolveFirst!: (response: Response) => void;
    let resolveSecond!: (response: Response) => void;
    const first = new Promise<Response>(resolve => { resolveFirst = resolve; });
    const second = new Promise<Response>(resolve => { resolveSecond = resolve; });
    const request = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const client: APIClient = { ...createMockAPI({}), request };
    const success = vi.fn(() => ({ type: 'loaded' }));
    const failure = vi.fn(() => ({ type: 'failed' }));
    const dispatch = vi.fn();
    const effect = apiAll(client, [
      { method: 'GET', url: '/first' }, { method: 'GET', url: '/second' }
    ], success, failure);
    if (effect._tag !== 'Run') throw new Error('expected Run');
    const execution = effect.execute(dispatch);
    try {
      expect(request).toHaveBeenCalledTimes(2);
      expect(dispatch).not.toHaveBeenCalled();
      resolveSecond({ data: 2, status: 200, headers: {} });
      resolveFirst({ data: 1, status: 200, headers: {} });
      await execution;
      expect(success).toHaveBeenCalledWith([
        { data: 1, status: 200, headers: {} }, { data: 2, status: 200, headers: {} }
      ]);
      expect(failure).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: 'loaded' });
    } finally {
      resolveFirst({ data: 1, status: 200, headers: {} });
      resolveSecond({ data: 2, status: 200, headers: {} });
      await execution;
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
      'GET /api/profile': ((config) => {
        if (config.headers?.['authorization'] !== 'Bearer abc123') {
          throw new APIError('Unauthorized', 401, null, {}, false);
        }
        return { id: 'u1', name: 'John', email: 'john@example.com' };
      }) satisfies MockHandler
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
        products: productsRes!.data,
        categories: categoriesRes!.data,
        stats: statsRes!.data
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

describe('Error Boundary Regressions (B001-04)', () => {
  describe('Effect.api()', () => {
    it('propagates success mapper programming error without invoking onFailure', async () => {
      const mockAPI = createMockAPI({
        'GET /api/test': { ok: true }
      });
      const mapperError = new TypeError('Syntax/programming bug in success mapper');
      const onFailure = vi.fn();

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/test' },
        () => {
          throw mapperError;
        },
        onFailure
      );

      const dispatch = vi.fn();
      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(mapperError);
      }
      expect(onFailure).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('propagates dispatch/reducer error from successful request without invoking onFailure or double dispatch', async () => {
      const mockAPI = createMockAPI({
        'GET /api/test': { ok: true }
      });
      const dispatchError = new Error('Reducer state failure');
      const onFailure = vi.fn();
      const dispatch = vi.fn().mockImplementation(() => {
        throw dispatchError;
      });

      const effect = api(
        mockAPI,
        { method: 'GET', url: '/api/test' },
        (res) => ({ type: 'success', data: res.data }),
        onFailure
      );

      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(dispatchError);
      }
      expect(onFailure).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('normalizes synchronous client.request throw to APIError and dispatches failure once', async () => {
      const syncError = new Error('Immediate sync network setup fault');
      const mockClient = {
        request: vi.fn().mockImplementation(() => {
          throw syncError;
        })
      } as unknown as APIClient;

      const onFailure = vi.fn((err: APIError) => ({ type: 'failed', error: err }));
      const dispatch = vi.fn();

      const effect = api(
        mockClient,
        { method: 'GET', url: '/api/sync' },
        () => ({ type: 'success' }),
        onFailure
      );

      if (effect._tag === 'Run') {
        await effect.execute(dispatch);
      }

      expect(onFailure).toHaveBeenCalledTimes(1);
      const passedError = onFailure.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(APIError);
      expect(passedError.message).toBe('Immediate sync network setup fault');
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith({
        type: 'failed',
        error: passedError
      });
    });
  });

  describe('Effect.apiFireAndForget()', () => {
    it('propagates success mapper programming error instead of swallowing it', async () => {
      const mockAPI = createMockAPI({
        'POST /api/track': { recorded: true }
      });
      const mapperError = new TypeError('Mapper fault in fire-and-forget');

      const effect = apiFireAndForget(
        mockAPI,
        { method: 'POST', url: '/api/track' },
        () => {
          throw mapperError;
        }
      );

      const dispatch = vi.fn();
      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(mapperError);
      }
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('propagates dispatch/reducer error instead of swallowing it', async () => {
      const mockAPI = createMockAPI({
        'POST /api/track': { recorded: true }
      });
      const dispatchError = new Error('Reducer fault in fire-and-forget');
      const dispatch = vi.fn().mockImplementation(() => {
        throw dispatchError;
      });

      const effect = apiFireAndForget(
        mockAPI,
        { method: 'POST', url: '/api/track' },
        () => ({ type: 'tracked' })
      );

      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(dispatchError);
      }
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('ignores synchronous client.request throw and async rejection', async () => {
      const syncMock = {
        request: vi.fn().mockImplementation(() => {
          throw new Error('Sync fail');
        })
      } as unknown as APIClient;
      const dispatch = vi.fn();

      const syncEffect = apiFireAndForget(
        syncMock,
        { method: 'POST', url: '/api/track' },
        () => ({ type: 'tracked' })
      );
      if (syncEffect._tag === 'Run') {
        await syncEffect.execute(dispatch);
      }
      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  describe('Effect.apiAll()', () => {
    it('propagates success mapper programming error without invoking onFailure', async () => {
      const mockAPI = createMockAPI({
        'GET /api/a': { a: 1 },
        'GET /api/b': { b: 2 }
      });
      const mapperError = new RangeError('Tuple index invalid in mapper');
      const onFailure = vi.fn();

      const effect = apiAll(
        mockAPI,
        [
          { method: 'GET', url: '/api/a' },
          { method: 'GET', url: '/api/b' }
        ],
        () => {
          throw mapperError;
        },
        onFailure
      );

      const dispatch = vi.fn();
      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(mapperError);
      }
      expect(onFailure).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('propagates dispatch/reducer error from successful requests without invoking onFailure or double dispatch', async () => {
      const mockAPI = createMockAPI({
        'GET /api/a': { a: 1 }
      });
      const dispatchError = new Error('Reducer crash in apiAll');
      const onFailure = vi.fn();
      const dispatch = vi.fn().mockImplementation(() => {
        throw dispatchError;
      });

      const effect = apiAll(
        mockAPI,
        [{ method: 'GET', url: '/api/a' }],
        ([res]) => ({ type: 'loaded', data: res!.data }),
        onFailure
      );

      expect(effect._tag).toBe('Run');
      if (effect._tag === 'Run') {
        await expect(effect.execute(dispatch)).rejects.toBe(dispatchError);
      }
      expect(onFailure).not.toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledTimes(1);
    });

    it('normalizes synchronous client.request throw in batch request', async () => {
      const syncMock = {
        request: vi.fn().mockImplementation(() => {
          throw new Error('Batch sync throw');
        })
      } as unknown as APIClient;

      const onFailure = vi.fn((err: APIError) => ({ type: 'failed', error: err }));
      const dispatch = vi.fn();

      const effect = apiAll(
        syncMock,
        [{ method: 'GET', url: '/api/a' }],
        () => ({ type: 'loaded' }),
        onFailure
      );

      if (effect._tag === 'Run') {
        await effect.execute(dispatch);
      }

      expect(onFailure).toHaveBeenCalledTimes(1);
      const passedError = onFailure.mock.calls[0]![0];
      expect(passedError).toBeInstanceOf(APIError);
      expect(passedError.message).toBe('Batch sync throw');
      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });
});
