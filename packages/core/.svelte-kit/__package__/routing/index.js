/**
 * Routing Module - Public API
 *
 * Phase 7: URL Synchronization (Browser History Integration)
 *
 * This module provides framework-agnostic URL routing and browser history
 * integration for Composable Svelte applications.
 *
 * @module routing
 */
// Serialization API
export { serializeDestination, pathSegment } from './serializer';
// Parsing API
export { parseDestination, matchPath } from './parser';
// URL Sync Effect
export { createURLSyncEffect } from './sync-effect';
// Browser History Integration
export { syncBrowserHistory } from './browser-history';
// Deep Linking
export { createInitialStateFromURL } from './deep-link';
// Query Parameters (Phase 7.1)
export { parseQueryParams, serializeQueryParams, parseQueryParamsWithSchema, serializeTypedQueryParams, mergeQueryParams, getQueryParam, getQueryParamAll, hasQueryParam } from './query-params';
// Schema System
export { string, number, boolean, array, optional, enumSchema, object, literal } from './schemas';
