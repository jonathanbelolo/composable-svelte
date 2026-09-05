// ============================================================================
// Base API Client Implementation
// ============================================================================

import { APIError, ValidationError } from './errors.js';
import { createInFlightRegistry, isDeduplicableMethod, requestKey } from './deduplication.js';
import { resolveRetryConfig, retryRequest } from './retry.js';
import { cacheKeyFor, createResponseCache, normalizePath, validateCacheConfig } from './cache.js';
import {
  classifyFetchFailure,
  finalizeRequest,
  isInstance,
  mergeHeaders,
  normalizeURL,
  recoverWithErrorInterceptors,
  runRequestInterceptors,
  runResponseInterceptors,
  validateTimeout,
  type PreparedRequest
} from './pipeline.js';
import type {
  APIClient,
  APIClientConfig,
  APIRequest,
  APIResponse,
  HTTPMethod,
  Interceptor,
  RequestConfig
} from './types.js';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse response headers from Headers object to plain object.
 */
function parseHeaders(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};

  headers.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

/**
 * Parse response body based on Content-Type.
 */
async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') || '';

  // Handle empty responses (204 No Content)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return null;
  }

  // JSON response
  if (contentType.includes('application/json')) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  // Text response
  if (contentType.includes('text/')) {
    return await response.text();
  }

  // Fallback: try JSON, then text
  try {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  } catch {
    return await response.text();
  }
}

/** The error for a response that is not OK; 422 is a `ValidationError`. */
function responseError(response: Response, body: unknown, headers: Record<string, string>): APIError {
  if (response.status === 422) {
    return new ValidationError(response.statusText || 'Validation failed', response.status, body, headers);
  }
  const isRetryable = response.status >= 500 || response.status === 408 || response.status === 429;
  return new APIError(
    response.statusText || `Request failed with status ${response.status}`,
    response.status,
    body,
    headers,
    isRetryable
  );
}

// ============================================================================
// Base API Client
// ============================================================================

/**
 * Create an API client with the given configuration.
 *
 * Every request runs the same pipeline, once per caller: the URL is resolved
 * and the client's headers merged (names lower-cased); the request
 * interceptors run, in order, and may change headers, body and params; the
 * request is finalised — a plain body serialised to JSON, a `BodyInit`
 * passed through — and keyed; the cache is consulted; the request joins the
 * attempt in flight for its key or starts one, whose retries fetch the same
 * frozen request; the response interceptors run once on the attempt's
 * response, which every caller receives as its own clone; the cache is
 * filled. A failure, other than this caller's own cancellation, is offered
 * to the error interceptors once, after any retries.
 *
 * `timeout` is a positive number of milliseconds or `Infinity`;
 * `cache.ttl` a positive finite number; `cache.maxEntries` a positive
 * integer — anything else is a `TypeError` here or at the request.
 */
export function createAPIClient(config: APIClientConfig = {}): APIClient {
  const {
    baseURL,
    headers: defaultHeaders = {},
    deduplicate = true,
    retry: defaultRetry = false,
    cache: defaultCache = false,
    interceptors: initialInterceptors = []
  } = config;
  const defaultTimeout = validateTimeout(config.timeout ?? 30000, 'createAPIClient');
  validateCacheConfig(defaultCache, 'createAPIClient');

  // Interceptors state
  const interceptors: Interceptor[] = [...initialInterceptors];

  // This client's in-flight requests and response cache. Both were
  // module-global — one map for every client in the process — so two clients
  // built for two users coalesced into one fetch and shared one cached body
  // (AUDIT-2026-09-03-FINDINGS A1, A2).
  const inFlight = createInFlightRegistry();
  const cache = createResponseCache({
    maxEntries: typeof defaultCache === 'object' ? defaultCache.maxEntries : undefined
  });

  /**
   * One attempt: fetch, parse, classify. Nothing else — the layers around it
   * own retry, sharing, the interceptors and the cache, so nothing here runs
   * twice for one request. The signal is the shared attempt's, owned by the
   * in-flight registry: it aborts when every caller has detached. Each
   * caller's own signal and timeout settle that caller's promise there, not
   * here (A7, A3).
   */
  async function executeFetch<T>(prepared: PreparedRequest, signal: AbortSignal): Promise<APIResponse<T>> {
    const init: RequestInit = { method: prepared.method, headers: prepared.headers, signal };
    if (prepared.body !== undefined && prepared.method !== 'GET' && prepared.method !== 'HEAD') {
      init.body = prepared.body;
    }

    let response: Response;
    let responseHeaders: Record<string, string>;
    let responseBody: unknown;
    try {
      response = await fetch(prepared.url, init);
      responseHeaders = parseHeaders(response.headers);
      responseBody = await parseResponseBody(response);
    } catch (error: unknown) {
      // The attempt was abandoned (every caller detached) or the network
      // failed. An abandoned attempt is a CancelledError, which the retry
      // layer never retries — the first form mapped every abort to the
      // retryable TimeoutError.
      throw classifyFetchFailure(error);
    }

    if (!response.ok) {
      throw responseError(response, responseBody, responseHeaders);
    }

    return { status: response.status, headers: responseHeaders, data: responseBody as T };
  }

  /**
   * The pipeline, once per caller. Order matters: the interceptors run
   * before the key is computed, so what they add is part of the request's
   * identity (R1 keyed first, so a token an interceptor added was not —
   * R1-REVIEW 1.7); the body is serialised before the request joins an
   * attempt, so a body with no JSON form is this caller's error with no
   * fetch and no retry (A15); the response interceptors run on the shared
   * attempt, once, so joiners see what the creator saw.
   */
  async function executeRequest<T>(
    method: HTTPMethod,
    url: string,
    config: RequestConfig = {}
  ): Promise<APIResponse<T>> {
    const timeout = config.timeout === undefined ? defaultTimeout : validateTimeout(config.timeout, 'request');
    validateCacheConfig(config.cache, 'request');
    const cacheConfig = config.cache !== undefined ? config.cache : defaultCache;
    const retry = resolveRetryConfig(method, config.retry !== undefined ? config.retry : defaultRetry);
    const resolvedURL = normalizeURL(baseURL, url);
    const path = normalizePath(url);
    // The request's flag wins; the client's default was destructured and
    // never read, so it could not be turned off per client
    // (AUDIT-2026-09-03-FINDINGS A1). Only safe methods coalesce by default:
    // two identical POSTs are two intents, and a client-level `true` cannot
    // be told from the default, so a mutation is coalesced only when its own
    // request says `deduplicate: true` (A11).
    const coalesce =
      config.deduplicate === true ||
      (config.deduplicate !== false && deduplicate && isDeduplicableMethod(method));

    try {
      // A throwing request interceptor rejects this caller with what it
      // threw: no fetch, no retry, no NetworkError wrapper (A8).
      const intercepted = await runRequestInterceptors(interceptors, resolvedURL, {
        ...config,
        headers: mergeHeaders(defaultHeaders, config.headers)
      });
      const prepared = finalizeRequest(method, resolvedURL, intercepted, retry);
      const key = requestKey(prepared.identity);
      const cacheKey = cacheKeyFor(key, url, intercepted, cacheConfig);

      // Layer 1: Cache (outermost - fastest exit)
      const cached = cache.get<T>(method, cacheKey, cacheConfig);
      if (cached) {
        return cached;
      }

      // Layers 2 to 4 as one unit the registry can share: retry, response
      // interceptors, and the warning for a response a clone would flatten.
      const shared = coalesce && key !== null;
      const cloned = shared || cache.stores(method, cacheKey, cacheConfig);
      const run = async (signal: AbortSignal): Promise<APIResponse<T>> => {
        const raw = await retryRequest<T>(() => executeFetch<T>(prepared, signal), retry, signal);
        const response = await runResponseInterceptors(interceptors, raw);
        if (cloned && isInstance(response.data)) {
          cache.warnOnce(
            `instance:${path}`,
            `[Composable Svelte] Response for ${path} is a class instance; a shared or cached response is a plain-object clone`
          );
        }
        return response;
      };

      // Every caller gets its own promise, bounded by its own signal and
      // timeout; the shared fetch is aborted only when every caller is gone.
      const response = await inFlight.join(shared ? key : null, run, { signal: config.signal, timeout });

      // Store in cache if applicable; the entry is filed under the path.
      cache.set(method, cacheKey, path, response, cacheConfig);

      // Invalidate cache on mutations
      cache.invalidateOnMutation(method, path, cacheConfig);

      return response;
    } catch (error: unknown) {
      return recoverWithErrorInterceptors<T>(interceptors, error);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  return {
    get: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeRequest<T>('GET', url, config);
    },

    post: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('POST', url, { ...config, body });
    },

    put: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('PUT', url, { ...config, body });
    },

    patch: <T = unknown>(url: string, body?: unknown, config?: RequestConfig) => {
      return executeRequest<T>('PATCH', url, { ...config, body });
    },

    delete: <T = unknown>(url: string, config?: RequestConfig) => {
      return executeRequest<T>('DELETE', url, config);
    },

    head: (url: string, config?: RequestConfig) => {
      return executeRequest<void>('HEAD', url, config);
    },

    request: <T = unknown>(request: APIRequest<T>) => {
      return executeRequest<T>(request.method, request.url, request.config);
    },

    addInterceptor: (interceptor: Interceptor) => {
      interceptors.push(interceptor);

      // Return cleanup function
      return () => {
        const index = interceptors.indexOf(interceptor);
        if (index !== -1) {
          interceptors.splice(index, 1);
        }
      };
    },

    clearCache: () => {
      cache.clear();
    },

    invalidateCache: (pattern: string) => {
      cache.invalidate(pattern);
    }
  };
}
