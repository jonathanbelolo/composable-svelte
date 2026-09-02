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
export { serializeDestination, pathSegment } from './serializer.js';
export type { SerializerConfig } from './serializer.js';

// Parsing API
export { parseDestination, matchPath, createParserConfig } from './parser.js';
export type { ParserConfig, ParserRoutes, ParserConfigOptions } from './parser.js';

// Type Definitions
export type {
	RouteConfig,
	RouteMatcher,
	PathParams,
	DestinationType,
	DestinationState,
	Serializer,
	Parser,
	DestinationToActionMapper
} from './types.js';

// URL Sync Effect
export { createURLSyncEffect } from './sync-effect.js';
export type { URLSyncOptions } from './sync-effect.js';

// Browser History Integration
export { syncBrowserHistory } from './browser-history.js';
export type { BrowserHistoryConfig } from './browser-history.js';

// Deep Linking
export { createInitialStateFromURL } from './deep-link.js';

// Query Parameters (Phase 7.1)
export {
	parseQueryParams,
	serializeQueryParams,
	parseQueryParamsWithSchema,
	serializeTypedQueryParams,
	mergeQueryParams,
	getQueryParam,
	getQueryParamAll,
	hasQueryParam
} from './query-params.js';
export type { RawQueryParams } from './query-params.js';

// Schema System
export { string, number, boolean, array, optional, enumSchema, object, literal } from './schemas.js';
export type {
	Schema,
	StringOptions,
	NumberOptions
} from './schemas.js';
