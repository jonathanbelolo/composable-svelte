// ============================================================================
// API Module - Public Exports
// ============================================================================

// Retry helpers
export { parseRetryAfter } from './retry.js';

// Error classes
export {
  APIError,
  NetworkError,
  TimeoutError,
  ValidationError,
  type ValidationErrorField
} from './errors.js';

// Core types
export type {
  HTTPMethod,
  SafeHTTPMethod,
  RequestConfig,
  RetryConfig,
  CacheConfig,
  ClientCacheConfig,
  APIRequest,
  APIResponse,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  Interceptor,
  APIClient,
  APIClientConfig,
  InferResponse
} from './types.js';

// Request builder
export { Request } from './types.js';

// Client factory
export { createAPIClient } from './client.js';

// Testing utilities
export {
  createMockAPI,
  type MockResponse,
  type MockHandler,
  type MockRoutes
} from './testing/mock-client.js';

export {
  createSpyAPI,
  type SpyAPIClient,
  type RecordedCall
} from './testing/spy-client.js';

// Endpoint helpers
export {
  createRESTEndpoints,
  createPaginatedEndpoints,
  createSearchEndpoints,
  createFullEndpoints,
  type RESTEndpoints,
  type PaginatedEndpoints,
  type SearchEndpoints,
  type FullEndpoints,
  type PaginationParams,
  type PaginatedResponse,
  type SearchParams
} from './endpoints.js';

// Effect integration (side-effect: augments Effect namespace). Imported for
// the side effect as well as re-exported, as websocket/index.ts does.
import './effect-api.js';
export { api, apiFireAndForget, apiAll } from './effect-api.js';
