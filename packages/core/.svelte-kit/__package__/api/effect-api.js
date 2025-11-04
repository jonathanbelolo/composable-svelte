// ============================================================================
// Effect.api() - API Call Integration with Effect System
// ============================================================================
import { Effect } from '../effect.js';
import { APIError } from './errors.js';
// ============================================================================
// Effect.api() Implementation
// ============================================================================
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
export function api(client, request, onSuccess, onFailure) {
    return Effect.run(async (dispatch) => {
        try {
            const response = await client.request(request);
            dispatch(onSuccess(response));
        }
        catch (error) {
            // Convert to APIError if needed
            if (error instanceof APIError) {
                dispatch(onFailure(error));
            }
            else if (error instanceof Error) {
                // Wrap unexpected errors
                dispatch(onFailure(new APIError(error.message, null, null, {}, false)));
            }
            else {
                // Unknown error type
                dispatch(onFailure(new APIError(String(error), null, null, {}, false)));
            }
        }
    });
}
/**
 * Create an effect for making an API call with only success handling.
 * Errors are ignored (fire-and-forget pattern).
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
export function apiFireAndForget(client, request, onSuccess) {
    return Effect.run(async (dispatch) => {
        try {
            const response = await client.request(request);
            dispatch(onSuccess(response));
        }
        catch {
            // Ignore errors
        }
    });
}
/**
 * Create an effect for making multiple API calls in parallel.
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
export function apiAll(client, requests, onSuccess, onFailure) {
    return Effect.run(async (dispatch) => {
        try {
            const promises = requests.map(req => client.request(req));
            const responses = await Promise.all(promises);
            dispatch(onSuccess(responses));
        }
        catch (error) {
            if (error instanceof APIError) {
                dispatch(onFailure(error));
            }
            else if (error instanceof Error) {
                dispatch(onFailure(new APIError(error.message, null, null, {}, false)));
            }
            else {
                dispatch(onFailure(new APIError(String(error), null, null, {}, false)));
            }
        }
    });
}
// Add to Effect namespace
Effect.api = api;
Effect.apiFireAndForget = apiFireAndForget;
Effect.apiAll = apiAll;
