// ============================================================================
// API Module - Public Exports
// ============================================================================
// Error classes
export { APIError, NetworkError, TimeoutError, ValidationError } from './errors.js';
// Request builder
export { Request } from './types.js';
// Client factory
export { createAPIClient } from './client.js';
// Testing utilities
export { createMockAPI } from './testing/mock-client.js';
export { createSpyAPI } from './testing/spy-client.js';
// Endpoint helpers
export { createRESTEndpoints, createPaginatedEndpoints, createSearchEndpoints, createFullEndpoints } from './endpoints.js';
// Effect integration (side-effect: augments Effect namespace)
export { api, apiFireAndForget, apiAll } from './effect-api.js';
