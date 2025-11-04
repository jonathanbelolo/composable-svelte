import { APIError } from './errors.js';
import type { Effect as EffectType } from '../types.js';
import type { APIClient, APIRequest, APIResponse, InferResponse } from './types.js';
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
export declare function api<Request extends APIRequest<any>, SuccessAction, FailureAction>(client: APIClient, request: Request, onSuccess: (response: APIResponse<InferResponse<Request>>) => SuccessAction, onFailure: (error: APIError) => FailureAction): EffectType<SuccessAction | FailureAction>;
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
export declare function apiFireAndForget<Request extends APIRequest<any>, SuccessAction>(client: APIClient, request: Request, onSuccess: (response: APIResponse<InferResponse<Request>>) => SuccessAction): EffectType<SuccessAction>;
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
export declare function apiAll<Requests extends readonly APIRequest<any>[], SuccessAction, FailureAction>(client: APIClient, requests: Requests, onSuccess: (responses: {
    [K in keyof Requests]: APIResponse<InferResponse<Requests[K]>>;
}) => SuccessAction, onFailure: (error: APIError) => FailureAction): EffectType<SuccessAction | FailureAction>;
declare module '../effect.js' {
    interface Effect {
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
         */
        apiAll: typeof apiAll;
    }
}
//# sourceMappingURL=effect-api.d.ts.map