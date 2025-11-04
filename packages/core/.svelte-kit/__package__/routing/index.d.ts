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
export { serializeDestination, pathSegment } from './serializer';
export type { SerializerConfig } from './serializer';
export { parseDestination, matchPath } from './parser';
export type { ParserConfig } from './parser';
export type { RouteConfig, RouteMatcher, PathParams, DestinationType, DestinationState, Serializer, Parser, DestinationToActionMapper } from './types';
export { createURLSyncEffect } from './sync-effect';
export type { URLSyncOptions } from './sync-effect';
export { syncBrowserHistory } from './browser-history';
export type { BrowserHistoryConfig } from './browser-history';
export { createInitialStateFromURL } from './deep-link';
export { parseQueryParams, serializeQueryParams, parseQueryParamsWithSchema, serializeTypedQueryParams, mergeQueryParams, getQueryParam, getQueryParamAll, hasQueryParam } from './query-params';
export type { RawQueryParams } from './query-params';
export { string, number, boolean, array, optional, enumSchema, object, literal } from './schemas';
export type { Schema, StringOptions, NumberOptions } from './schemas';
//# sourceMappingURL=index.d.ts.map