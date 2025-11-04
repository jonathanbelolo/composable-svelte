/**
 * @composable-svelte/core
 *
 * A Composable Architecture for Svelte 5.
 *
 * This library provides:
 * - Predictable state management through pure reducers
 * - Unidirectional data flow via actions (events)
 * - Type-safe feature composition
 * - First-class testing support
 * - Declarative side effect handling
 * - Full integration with Svelte 5's reactivity system
 *
 * @packageDocumentation
 */

// ============================================================================
// Core Types
// ============================================================================

export type {
  Reducer,
  Dispatch,
  Selector,
  EffectExecutor,
  Store,
  StoreConfig
  // Middleware and MiddlewareAPI deferred to Phase 5
  // Middleware,
  // MiddlewareAPI
} from './types.js';

// Export Effect type with alias to avoid name conflict with Effect namespace
export type { Effect as EffectType } from './types.js';

// Note: Most users won't need to explicitly import EffectType.
// TypeScript will infer the Effect type from Effect.none(), Effect.run(), etc.
// Use EffectType only when you need to annotate effect variables explicitly:
// const myEffect: EffectType<MyAction> = Effect.run(...);

// ============================================================================
// Store
// ============================================================================

export { createStore } from './store.svelte.js';

// ============================================================================
// Effects
// ============================================================================

export { Effect } from './effect.js';

// ============================================================================
// Composition
// ============================================================================

export {
  scope,
  scopeAction,
  combineReducers
} from './composition/index.js';

export type {
  StateLens,
  StateUpdater,
  ActionPrism,
  ActionEmbedder
} from './composition/index.js';

// ============================================================================
// Navigation
// ============================================================================

export type {
  PresentationAction,
  StackAction,
  Presentation,
  Stack,
  PresentationState,
  PresentationEvent,
  DestinationState,
  DestinationReducerMap,
  CasePath,
  StackResult,
  ScopedDestinationStore,
  DismissDependency
} from './navigation/index.js';

export {
  PresentationActionHelpers,
  StackActionHelpers,
  ifLet,
  ifLetPresentation,
  createDestinationReducer,
  createDestination,
  isDestinationType,
  extractDestinationState,
  matchPresentationAction,
  isActionAtPath,
  matchPaths,
  extractDestinationOnAction,
  push,
  pop,
  popToRoot,
  setPath,
  handleStackAction,
  topScreen,
  rootScreen,
  canGoBack,
  stackDepth,
  scopeToDestination,
  scopeToOptional,
  createDismissDependency,
  createDismissDependencyWithCleanup,
  dismissDependency
} from './navigation/index.js';

// ============================================================================
// Dependencies
// ============================================================================

export type {
  Clock,
  MockClock,
  Storage,
  SyncStorage,
  CookieStorage,
  StorageConfig,
  CookieConfig,
  CookieOptions,
  SchemaValidator,
  StorageEventData,
  StorageEventListener,
  Unsubscribe
} from './dependencies/index.js';

export {
  createSystemClock,
  createMockClock,
  createLocalStorage,
  createSessionStorage,
  createNoopStorage,
  createCookieStorage,
  createMockCookieStorage,
  isBrowser,
  getStorageQuota,
  getByteSize,
  isStorageAvailable,
  DependencyError,
  StorageQuotaExceededError,
  InvalidJSONError,
  SchemaValidationError,
  CookieSizeExceededError,
  EnvironmentNotSupportedError
} from './dependencies/index.js';

// ============================================================================
// Testing
// ============================================================================

export {
  TestStore,
  createTestStore
} from './test/test-store.js';

export type {
  TestStoreConfig,
  StateAssertion,
  PartialAction
} from './test/test-store.js';

// ============================================================================
// API Module
// ============================================================================

// Core types
export type {
  APIClient,
  APIResponse,
  RequestConfig,
  RetryConfig,
  CacheConfig,
  APIRequest,
  HTTPMethod,
  SafeHTTPMethod,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
  Interceptor,
  APIClientConfig,
  InferResponse
} from './api/index.js';

// Request builder
export { Request } from './api/index.js';

// Client factory
export { createAPIClient } from './api/index.js';

// Testing utilities
export {
  createMockAPI,
  type MockResponse,
  type MockRoutes,
  createSpyAPI,
  type SpyAPIClient,
  type RecordedCall
} from './api/index.js';

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
} from './api/index.js';

// Error classes
export {
  APIError,
  NetworkError,
  TimeoutError,
  ValidationError,
  type ValidationErrorField
} from './api/index.js';

// Effect integration
export { api, apiFireAndForget, apiAll } from './api/index.js';

// ============================================================================
// WebSocket Module
// ============================================================================

// Core types
export type {
  WebSocketClient,
  WebSocketConfig,
  WebSocketMessage,
  WebSocketEvent,
  WebSocketConnectedEvent,
  WebSocketDisconnectedEvent,
  WebSocketErrorEvent,
  WebSocketReconnectingEvent,
  WebSocketReconnectedEvent,
  ConnectionState,
  ConnectionStatus,
  ConnectionStats,
  ReconnectConfig,
  HeartbeatConfig,
  MessageSerializer,
  MessageListener,
  EventListener
  // Note: Unsubscribe is already exported from ./dependencies/index.js
} from './websocket/index.js';

export {
  WebSocketError,
  WS_ERROR_CODES,
  JSONSerializer
} from './websocket/index.js';

// Production client
export { createLiveWebSocket } from './websocket/index.js';

// Testing utilities
export type {
  MockWebSocketClient,
  SpyWebSocketClient,
  RecordedConnection,
  RecordedDisconnection
} from './websocket/index.js';

export {
  createMockWebSocket,
  createSpyWebSocket
} from './websocket/index.js';

// Advanced features
export type { Heartbeat } from './websocket/index.js';
export { createHeartbeat } from './websocket/index.js';

export type { MessageQueue } from './websocket/index.js';
export {
  createMessageQueue,
  createQueuedWebSocket
} from './websocket/index.js';

export type {
  ChannelRouter,
  ChannelExtractor
} from './websocket/index.js';

export {
  createChannelRouter,
  createChannelWebSocket
} from './websocket/index.js';

// Effect integration (side effect: registers Effect.websocket namespace)
import './websocket/effect-websocket.js';

// ============================================================================
// UI Components & Navigation Components
// ============================================================================

export * from './components-exports.js';
