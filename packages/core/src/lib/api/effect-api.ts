// ============================================================================
// Effect.api() - API Call Integration with Effect System
// ============================================================================

import { Effect } from '../effect.js';
import { APIError } from './errors.js';
import type { Effect as EffectType } from '../types.js';
import type { APIClient, APIRequest, APIResponse, InferResponse } from './types.js';

// ============================================================================
// Effect.api() Implementation
// ============================================================================

function toAPIError(error: unknown): APIError {
  if (error instanceof APIError) {
    return error;
  }
  if (error instanceof Error) {
    const normalized = new APIError(error.message, null, null, {}, false);
    // Preserve the original name, stack and nested cause without changing the
    // established APIError shape or making diagnostics enumerable payload data.
    Object.defineProperty(normalized, 'cause', { value: error, configurable: true, writable: true });
    return normalized;
  }
  return new APIError(String(error), null, null, {}, false);
}

/**
 * Create an effect for making an API call with success/failure handling.
 *
 * This provides clean integration between the API client and the Effect system,
 * with full type inference for request/response types.
 *
 * @param client - API client to use
 * @param request - API request to execute
 * @param onSuccess - Map successful response to action
 * @param onFailure - Map error to action
 *
 * @example
 * ```typescript
 * case 'loadProductsRequested': {
 *   return [
 *     { ...state, loading: true },
 *     Effect.api(
 *       deps.api,
 *       endpoints.products.list(),
 *       (response) => ({ type: 'productsLoaded', products: response.data }),
 *       (error) => ({ type: 'productsLoadFailed', error: error.message })
 *     )
 *   ];
 * }
 * ```
 */
export function api<Request extends APIRequest<any>, SuccessAction, FailureAction>(
  client: APIClient,
  request: Request,
  onSuccess: (response: APIResponse<InferResponse<Request>>) => SuccessAction,
  onFailure: (error: APIError) => FailureAction
): EffectType<SuccessAction | FailureAction> {
  return Effect.run(async (dispatch) => {
    let response: APIResponse<InferResponse<Request>>;
    try {
      response = await client.request<InferResponse<Request>>(request);
    } catch (error: unknown) {
      dispatch(onFailure(toAPIError(error)));
      return;
    }

    dispatch(onSuccess(response));
  });
}

/**
 * Create an effect for making an API call with only success handling.
 * Request failures are ignored (fire-and-forget pattern).
 * Success mapper and dispatch failures propagate to the effect executor.
 *
 * @param client - API client to use
 * @param request - API request to execute
 * @param onSuccess - Map successful response to action
 *
 * @example
 * ```typescript
 * Effect.apiFireAndForget(
 *   deps.api,
 *   endpoints.analytics.track(event),
 *   () => ({ type: 'analyticsTracked' })
 * )
 * ```
 */
export function apiFireAndForget<Request extends APIRequest<any>, SuccessAction>(
  client: APIClient,
  request: Request,
  onSuccess: (response: APIResponse<InferResponse<Request>>) => SuccessAction
): EffectType<SuccessAction> {
  return Effect.run(async (dispatch) => {
    let response: APIResponse<InferResponse<Request>>;
    try {
      response = await client.request<InferResponse<Request>>(request);
    } catch {
      return;
    }

    dispatch(onSuccess(response));
  });
}

/**
 * Create an effect for making multiple API calls in parallel.
 * Starts every request and reports the first settled rejection, like Promise.all.
 * Other requests remain observed; failure does not abort caller-owned requests.
 * Request cancellation remains governed by each request's signal.
 *
 * @param client - API client to use
 * @param requests - Array of API requests to execute
 * @param onSuccess - Map successful responses to action
 * @param onFailure - Map error to action
 *
 * @example
 * ```typescript
 * Effect.apiAll(
 *   deps.api,
 *   [
 *     endpoints.products.list(),
 *     endpoints.categories.list()
 *   ],
 *   ([productsRes, categoriesRes]) => ({
 *     type: 'dataLoaded',
 *     products: productsRes.data,
 *     categories: categoriesRes.data
 *   }),
 *   (error) => ({ type: 'dataLoadFailed', error: error.message })
 * )
 * ```
 */
export function apiAll<Requests extends readonly APIRequest<any>[], SuccessAction, FailureAction>(
  client: APIClient,
  requests: Requests,
  onSuccess: (responses: {
    [K in keyof Requests]: APIResponse<InferResponse<Requests[K]>>
  }) => SuccessAction,
  onFailure: (error: APIError) => FailureAction
): EffectType<SuccessAction | FailureAction> {
  return Effect.run(async (dispatch) => {
    let responses: {
      [K in keyof Requests]: APIResponse<InferResponse<Requests[K]>>
    };
    try {
      const promises = requests.map(async req => client.request(req));
      responses = (await Promise.all(promises)) as any;
    } catch (error: unknown) {
      dispatch(onFailure(toAPIError(error)));
      return;
    }

    dispatch(onSuccess(responses));
  });
}

// ============================================================================
// Augment Effect Namespace
// ============================================================================

declare module '../effect.js' {
  interface EffectExtensions {
    /**
     * Create an effect for making an API call.
     */
    api: typeof api;

    /**
     * Create a fire-and-forget API call effect.
     */
    apiFireAndForget: typeof apiFireAndForget;

    /**
     * Create an effect for making multiple API calls in parallel.
 * Starts every request and reports the first settled rejection, like Promise.all.
 * Other requests remain observed; failure does not abort caller-owned requests.
 * Request cancellation remains governed by each request's signal.
     */
    apiAll: typeof apiAll;
  }
}

// Add to Effect namespace
(Effect as any).api = api;
(Effect as any).apiFireAndForget = apiFireAndForget;
(Effect as any).apiAll = apiAll;
