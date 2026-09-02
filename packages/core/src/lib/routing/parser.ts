/**
 * URL Parsing - URL Path → State
 *
 * This module provides functions to parse URL paths into destination state.
 * Part of Phase 7: URL Synchronization (Browser History Integration)
 *
 * @module routing/parser
 */

import { pathToRegexp } from 'path-to-regexp';

/**
 * Configuration for URL parsing.
 *
 * Provides a list of parser functions that attempt to match
 * URL paths to destination states. Parsers are tried in order
 * until one returns a match.
 *
 * @example
 * ```typescript
 * const config: ParserConfig<InventoryDestination> = {
 *   basePath: '/inventory',
 *   parsers: [
 *     // Try most specific patterns first
 *     (path) => {
 *       const params = matchPath('/item-:id/edit', path);
 *       return params ? { type: 'editItem', state: { itemId: params.id } } : null;
 *     },
 *     (path) => {
 *       const params = matchPath('/item-:id', path);
 *       return params ? { type: 'detailItem', state: { itemId: params.id } } : null;
 *     },
 *     (path) => path === '/add' ? { type: 'addItem', state: {} } : null
 *   ]
 * };
 * ```
 */
export interface ParserConfig<Dest extends { type: string; state: any }> {
	/**
	 * Base path for all routes.
	 * @default '/'
	 */
	basePath?: string;

	/**
	 * List of parsers to try in order.
	 *
	 * Each parser receives a relative path (with basePath stripped)
	 * and returns a destination state or null if no match.
	 *
	 * Order matters - place more specific patterns before general ones.
	 */
	parsers: Array<(path: string) => Dest | null>;
}

/**
 * A pattern-to-handler map, the shape {@link createParserConfig} takes.
 *
 * Each handler is given the parameters `matchPath` extracted and the path it
 * matched, and returns a destination — or `null` to decline, in which case the
 * next route is tried. Declining after a match is what lets a route reject a
 * value it does not like (an id that is not numeric, say) without claiming it.
 */
export type ParserRoutes<Dest extends { type: string; state: any }> = Record<
	string,
	(params: Record<string, string>, path: string) => Dest | null
>;

/** Options for {@link createParserConfig}. */
export interface ParserConfigOptions {
	/**
	 * Base path for all routes.
	 * @default '/'
	 */
	basePath?: string | undefined;
}

/**
 * Build a {@link ParserConfig} from a pattern-to-handler map.
 *
 * Sugar over the `parsers` list, which every call site was writing by hand as
 * `const p = matchPath(pattern, path); return p ? {...} : null`. It also
 * restores the symmetry with `SerializerConfig`, whose half has always been a
 * keyed map.
 *
 * **Order matters, and the map form hides that** — which is the one real cost
 * of this shape. Keys are tried in insertion order, so a more specific pattern
 * must come before a more general one, or the general one swallows it. (The
 * guarantee is exact rather than incidental: route patterns begin with `/`, so
 * they are never integer-like keys, which are the only ones JavaScript
 * reorders.)
 *
 * The `parsers` list is not going anywhere. Use it when a route is not a single
 * `matchPath` pattern — a custom regular expression, or one parser drawing on
 * two patterns. The two mix, because the config is a plain object:
 *
 * ```ts
 * const config = createParserConfig(routes, { basePath: '/app' });
 * const withFallback = { ...config, parsers: [...config.parsers, customParser] };
 * ```
 *
 * @example
 * ```typescript
 * import { createParserConfig, parseDestination } from '@composable-svelte/core/routing';
 *
 * type Dest =
 *   | { type: 'edit'; state: { itemId: string } }
 *   | { type: 'detail'; state: { itemId: string } }
 *   | { type: 'add'; state: Record<string, never> };
 *
 * const config = createParserConfig<Dest>({
 *   // Specific first: '/item/:id' would otherwise never reach '/item/:id/edit'.
 *   '/item/:id/edit': (params) => ({ type: 'edit', state: { itemId: params.id ?? '' } }),
 *   '/item/:id': (params) => ({ type: 'detail', state: { itemId: params.id ?? '' } }),
 *   '/add': () => ({ type: 'add', state: {} })
 * });
 *
 * const destination = parseDestination('/item/42/edit', config);
 * ```
 */
export function createParserConfig<Dest extends { type: string; state: any }>(
	routes: ParserRoutes<Dest>,
	options: ParserConfigOptions = {}
): ParserConfig<Dest> {
	const parsers = Object.entries(routes).map(
		([pattern, handler]) =>
			(path: string): Dest | null => {
				// `parseDestination` hands parsers a path with the base stripped, and
				// when there is no `basePath` it defaults to '/' and strips that —
				// so '/add' arrives as 'add', without its leading slash, while
				// '/shop/add' under basePath '/shop' arrives as '/add' with one.
				// Patterns are written with a leading slash either way, so normalise
				// rather than make every route author know that.
				const normalised = path.startsWith('/') ? path : `/${path}`;
				const params = matchPath(pattern, normalised);
				return params === null ? null : handler(params, normalised);
			}
	);

	// `exactOptionalPropertyTypes`: `basePath: undefined` is not assignable to
	// `basePath?: string`, so the key is omitted rather than set to undefined.
	return options.basePath !== undefined ? { basePath: options.basePath, parsers } : { parsers };
}

/**
 * Parse URL path to destination state.
 *
 * Attempts to parse a URL path into a destination state object
 * using the provided parser configuration. Tries each parser
 * in order until one matches.
 *
 * @param path - The URL path to parse
 * @param config - Parser configuration with base path and parser functions
 * @returns Destination state if path matches, null otherwise
 *
 * @example
 * ```typescript
 * // Root path returns null
 * parseDestination('/inventory', config);
 * // → null
 *
 * // Valid path returns destination
 * parseDestination('/inventory/item-123', config);
 * // → { type: 'detailItem', state: { itemId: '123' } }
 *
 * // Invalid path returns null
 * parseDestination('/invalid/path', config);
 * // → null
 * ```
 */
export function parseDestination<Dest extends { type: string; state: any }>(
	path: string,
	config: ParserConfig<Dest>
): Dest | null {
	const basePath = config.basePath ?? '/';

	// Check if path starts with base path
	if (!path.startsWith(basePath)) {
		return null;
	}

	// Strip base path to get relative path
	const relativePath = path.slice(basePath.length) || '/';

	// Try each parser in order
	for (const parser of config.parsers) {
		const result = parser(relativePath);
		if (result !== null) {
			return result;
		}
	}

	// No parser matched
	return null;
}

/**
 * Helper to match path patterns using path-to-regexp.
 *
 * Uses the path-to-regexp library for robust pattern matching.
 * Supports all path-to-regexp features (named params, optional params, wildcards, etc.)
 *
 * @param pattern - Path pattern with parameters (e.g., '/item-:id')
 * @param path - Actual path to match against
 * @returns Object with extracted parameters, or null if no match
 *
 * @see https://github.com/pillarjs/path-to-regexp
 *
 * @example
 * ```typescript
 * // Named parameter
 * matchPath('/item-:id', '/item-123');
 * // → { id: '123' }
 *
 * // Multiple parameters
 * matchPath('/item-:id/edit/:field', '/item-123/edit/name');
 * // → { id: '123', field: 'name' }
 *
 * // No match
 * matchPath('/item-:id', '/other/123');
 * // → null
 *
 * // Optional segment — a group, in path-to-regexp v8 syntax.
 * // The pre-v8 `:action?` form throws `Unexpected ?`.
 * matchPath('/item-:id{/:action}', '/item-123/edit');
 * // → { id: '123', action: 'edit' }
 * matchPath('/item-:id{/:action}', '/item-123');
 * // → { id: '123' }   // the key is absent, not undefined
 *
 * // Wildcard — named, in path-to-regexp v8 syntax.
 * // The pre-v8 bare `*` form throws `Missing parameter name`.
 * matchPath('/files/*path', '/files/docs/readme.md');
 * // → { path: 'docs/readme.md' }
 * ```
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
	// Compile pattern using path-to-regexp v8.x API
	// Returns { regexp: RegExp, keys: Keys }
	const { regexp, keys } = pathToRegexp(pattern);

	// Try to match path
	const match = regexp.exec(path);
	if (!match) {
		return null;
	}

	// Extract parameters from match
	const params: Record<string, string> = {};
	keys.forEach((key: { name: string | number }, index: number) => {
		const value = match[index + 1];
		if (value !== undefined) {
			params[String(key.name)] = value;
		}
	});

	return params;
}
