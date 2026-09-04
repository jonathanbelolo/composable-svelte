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

// `Effect` is exported from `./effect.js` below carrying **both** meanings —
// the constructor namespace and the type — because they are declared in one
// module there, which is the only arrangement TypeScript merges. This alias
// stays because every reducer in this repo and in `examples/` imports it, and
// because inside a file that also calls `Effect.run(...)` the longer name reads
// better. It is not deprecated.
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
  combineReducers,
  forEach,
  forEachElement,
  elementAction
} from './composition/index.js';

export type {
  StateLens,
  StateUpdater,
  ActionPrism,
  ActionEmbedder,
  IdentifiedItem,
  ElementAction,
  ForEachConfig
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
  ScopableStore,
  ScopedStore,
  DismissDependency
} from './navigation/index.js';

export {
  PresentationActionHelpers,
  StackActionHelpers,
  ifLet,
  ifLetPresentation,
  createDestinationReducer,
  createDestination,
  destinationState,
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
  scopeToElement,
  scopeTo,
  integrate,
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
  MockStorage,
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
  createMockStorage,
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
// Testing — import from '@composable-svelte/core/test' instead
// TestStore is NOT re-exported here because it dynamically imports vitest,
// which causes Vite to fail at build time when resolving the main entry.
// ============================================================================

// ============================================================================
// Utilities
// ============================================================================

export type {
  TreeConfig,
  TreeHelpers
} from './utils/tree.js';

export { createTreeHelpers } from './utils/tree.js';

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
  ClientCacheConfig,
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

// Effect integration (side effect: registers Effect.api, apiFireAndForget,
// apiAll). The bare import is the same form websocket uses below; a binding
// re-export alone is dropped by a bundler before the assignment runs unless
// every module on the chain is in package.json "sideEffects", which it now
// is (AUDIT-2026-09-03-FINDINGS P1).
import './api/effect-api.js';
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
// Server-Side Rendering (SSR) & Static Site Generation (SSG)
// ============================================================================

// Serialization
export { serializeStore, serializeState } from './ssr/index.js';

// Hydration
export { hydrateStore, parseState } from './ssr/index.js';
export { createTaggedSerializer } from './ssr/index.js';
export type { StateSerializer } from './ssr/index.js';

// Rendering
export {
  renderToHTML,
  renderComponent,
  buildHydrationScript,
  type RenderOptions
} from './ssr/index.js';

// Utilities
export { isServer } from './ssr/index.js';
// Note: isBrowser is already exported from ./dependencies/index.js

// ============================================================================
// UI Components & Navigation Components
// ============================================================================

export * from './components-exports.js';
