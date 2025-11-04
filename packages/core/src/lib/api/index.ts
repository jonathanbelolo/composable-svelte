// ============================================================================
// API Module - Public Exports
// ============================================================================

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

// Effect integration (side-effect: augments Effect namespace)
export { api, apiFireAndForget, apiAll } from './effect-api.js';
