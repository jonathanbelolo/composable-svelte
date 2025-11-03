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
 * // Optional parameter (v1.1 feature - deferred)
 * matchPath('/item-:id/:action?', '/item-123');
 * // → { id: '123', action: undefined }
 *
 * // Wildcard (v1.1 feature - deferred)
 * matchPath('/files/*', '/files/docs/readme.md');
 * // → { '0': 'docs/readme.md' }
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
