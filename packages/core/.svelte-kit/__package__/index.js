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
// Note: Most users won't need to explicitly import EffectType.
// TypeScript will infer the Effect type from Effect.none(), Effect.run(), etc.
// Use EffectType only when you need to annotate effect variables explicitly:
// const myEffect: EffectType<MyAction> = Effect.run(...);
// ============================================================================
// Store
// ============================================================================
export { createStore } from './store.js';
// ============================================================================
// Effects
// ============================================================================
export { Effect } from './effect.js';
// ============================================================================
// Composition
// ============================================================================
export { scope, scopeAction, combineReducers } from './composition/index.js';
export { PresentationActionHelpers, StackActionHelpers, ifLet, ifLetPresentation, createDestinationReducer, createDestination, isDestinationType, extractDestinationState, matchPresentationAction, isActionAtPath, matchPaths, extractDestinationOnAction, push, pop, popToRoot, setPath, handleStackAction, topScreen, rootScreen, canGoBack, stackDepth, scopeToDestination, scopeToOptional, createDismissDependency, createDismissDependencyWithCleanup, dismissDependency } from './navigation/index.js';
export { createSystemClock, createMockClock, createLocalStorage, createSessionStorage, createNoopStorage, createCookieStorage, createMockCookieStorage, isBrowser, getStorageQuota, getByteSize, isStorageAvailable, DependencyError, StorageQuotaExceededError, InvalidJSONError, SchemaValidationError, CookieSizeExceededError, EnvironmentNotSupportedError } from './dependencies/index.js';
// ============================================================================
// Testing
// ============================================================================
export { TestStore, createTestStore } from './test/test-store.js';
// Request builder
export { Request } from './api/index.js';
// Client factory
export { createAPIClient } from './api/index.js';
// Testing utilities
export { createMockAPI, createSpyAPI } from './api/index.js';
// Endpoint helpers
export { createRESTEndpoints, createPaginatedEndpoints, createSearchEndpoints, createFullEndpoints } from './api/index.js';
// Error classes
export { APIError, NetworkError, TimeoutError, ValidationError } from './api/index.js';
// Effect integration
export { api, apiFireAndForget, apiAll } from './api/index.js';
export { WebSocketError, WS_ERROR_CODES, JSONSerializer } from './websocket/index.js';
// Production client
export { createLiveWebSocket } from './websocket/index.js';
export { createMockWebSocket, createSpyWebSocket } from './websocket/index.js';
export { createHeartbeat } from './websocket/index.js';
export { createMessageQueue, createQueuedWebSocket } from './websocket/index.js';
export { createChannelRouter, createChannelWebSocket } from './websocket/index.js';
// Effect integration (side effect: registers Effect.websocket namespace)
import './websocket/effect-websocket.js';
// ============================================================================
// UI Components & Navigation Components
// ============================================================================
export * from './components-exports.js';
