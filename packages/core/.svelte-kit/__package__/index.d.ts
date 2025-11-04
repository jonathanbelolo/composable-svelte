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
export type { Reducer, Dispatch, Selector, EffectExecutor, Store, StoreConfig } from './types.js';
export type { Effect as EffectType } from './types.js';
export { createStore } from './store.js';
export { Effect } from './effect.js';
export { scope, scopeAction, combineReducers, forEach, forEachElement, elementAction } from './composition/index.js';
export type { StateLens, StateUpdater, ActionPrism, ActionEmbedder, IdentifiedItem, ElementAction, ForEachConfig } from './composition/index.js';
export type { PresentationAction, StackAction, Presentation, Stack, PresentationState, PresentationEvent, DestinationState, DestinationReducerMap, CasePath, StackResult, ScopedDestinationStore, ScopedStore, DismissDependency } from './navigation/index.js';
export { PresentationActionHelpers, StackActionHelpers, ifLet, ifLetPresentation, createDestinationReducer, createDestination, isDestinationType, extractDestinationState, matchPresentationAction, isActionAtPath, matchPaths, extractDestinationOnAction, push, pop, popToRoot, setPath, handleStackAction, topScreen, rootScreen, canGoBack, stackDepth, scopeToDestination, scopeToOptional, scopeToElement, scopeTo, integrate, createDismissDependency, createDismissDependencyWithCleanup, dismissDependency } from './navigation/index.js';
export type { Clock, MockClock, Storage, SyncStorage, CookieStorage, StorageConfig, CookieConfig, CookieOptions, SchemaValidator, StorageEventData, StorageEventListener, Unsubscribe } from './dependencies/index.js';
export { createSystemClock, createMockClock, createLocalStorage, createSessionStorage, createNoopStorage, createCookieStorage, createMockCookieStorage, isBrowser, getStorageQuota, getByteSize, isStorageAvailable, DependencyError, StorageQuotaExceededError, InvalidJSONError, SchemaValidationError, CookieSizeExceededError, EnvironmentNotSupportedError } from './dependencies/index.js';
export { TestStore, createTestStore } from './test/test-store.js';
export type { TestStoreConfig, StateAssertion, PartialAction } from './test/test-store.js';
export type { TreeConfig, TreeHelpers } from './utils/tree.js';
export { createTreeHelpers } from './utils/tree.js';
export type { APIClient, APIResponse, RequestConfig, RetryConfig, CacheConfig, APIRequest, HTTPMethod, SafeHTTPMethod, RequestInterceptor, ResponseInterceptor, ErrorInterceptor, Interceptor, APIClientConfig, InferResponse } from './api/index.js';
export { Request } from './api/index.js';
export { createAPIClient } from './api/index.js';
export { createMockAPI, type MockResponse, type MockRoutes, createSpyAPI, type SpyAPIClient, type RecordedCall } from './api/index.js';
export { createRESTEndpoints, createPaginatedEndpoints, createSearchEndpoints, createFullEndpoints, type RESTEndpoints, type PaginatedEndpoints, type SearchEndpoints, type FullEndpoints, type PaginationParams, type PaginatedResponse, type SearchParams } from './api/index.js';
export { APIError, NetworkError, TimeoutError, ValidationError, type ValidationErrorField } from './api/index.js';
export { api, apiFireAndForget, apiAll } from './api/index.js';
export type { WebSocketClient, WebSocketConfig, WebSocketMessage, WebSocketEvent, WebSocketConnectedEvent, WebSocketDisconnectedEvent, WebSocketErrorEvent, WebSocketReconnectingEvent, WebSocketReconnectedEvent, ConnectionState, ConnectionStatus, ConnectionStats, ReconnectConfig, HeartbeatConfig, MessageSerializer, MessageListener, EventListener } from './websocket/index.js';
export { WebSocketError, WS_ERROR_CODES, JSONSerializer } from './websocket/index.js';
export { createLiveWebSocket } from './websocket/index.js';
export type { MockWebSocketClient, SpyWebSocketClient, RecordedConnection, RecordedDisconnection } from './websocket/index.js';
export { createMockWebSocket, createSpyWebSocket } from './websocket/index.js';
export type { Heartbeat } from './websocket/index.js';
export { createHeartbeat } from './websocket/index.js';
export type { MessageQueue } from './websocket/index.js';
export { createMessageQueue, createQueuedWebSocket } from './websocket/index.js';
export type { ChannelRouter, ChannelExtractor } from './websocket/index.js';
export { createChannelRouter, createChannelWebSocket } from './websocket/index.js';
import './websocket/effect-websocket.js';
export * from './components-exports.js';
//# sourceMappingURL=index.d.ts.map