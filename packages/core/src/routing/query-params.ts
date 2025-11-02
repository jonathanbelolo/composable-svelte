/**
 * Query Parameter Utilities
 *
 * This module provides utilities for parsing and serializing URL query parameters
 * with optional type validation and coercion.
 *
 * Part of Phase 7.1: Query Parameter Support
 *
 * @module routing/query-params
 */

import type { Schema } from './schemas';

/**
 * Safely decode a URI component, returning the original string if decoding fails.
 */
function safeDecodeURIComponent(str: string): string {
	try {
		return decodeURIComponent(str);
	} catch (e) {
		// Return original if decode fails (malformed encoding)
		return str;
	}
}

/**
 * Query parameters as a flat key-value object.
 * All values are strings until validated/coerced by schema.
 */
export type RawQueryParams = Record<string, string | string[]>;

/**
 * Parse query parameters from URL search string.
 *
 * Handles:
 * - Standard key=value pairs
 * - Array values (e.g., ?tag=a&tag=b → { tag: ['a', 'b'] })
 * - URL decoding
 * - Empty values (e.g., ?flag → { flag: '' })
 * - Special characters
 *
 * @param search - URL search string (with or without leading '?')
 * @returns Parsed query parameters
 *
 * @example
 * ```typescript
 * parseQueryParams('?search=laptop&page=2');
 * // → { search: 'laptop', page: '2' }
 *
 * parseQueryParams('?tag=electronics&tag=sale');
 * // → { tag: ['electronics', 'sale'] }
 *
 * parseQueryParams('?q=hello%20world');
 * // → { q: 'hello world' }
 *
 * parseQueryParams('');
 * // → {}
 * ```
 */
export function parseQueryParams(search: string): RawQueryParams {
	// Remove leading '?' if present
	const queryString = search.startsWith('?') ? search.slice(1) : search;

	if (!queryString) {
		return {};
	}

	const params: Record<string, string | string[]> = {};
	const pairs = queryString.split('&');

	for (const pair of pairs) {
		if (!pair) continue; // Skip empty pairs

		const parts = pair.split('=');
		const key = parts[0];
		const value = parts.slice(1).join('='); // Preserve all = signs in value

		if (!key) continue; // Skip if key is empty

		const decodedKey = safeDecodeURIComponent(key);
		const decodedValue = safeDecodeURIComponent(value);

		// Handle array values (multiple params with same key)
		const existing = params[decodedKey];
		if (existing !== undefined) {
			if (Array.isArray(existing)) {
				existing.push(decodedValue);
			} else {
				params[decodedKey] = [existing, decodedValue];
			}
		} else {
			params[decodedKey] = decodedValue;
		}
	}

	return params;
}

/**
 * Serialize query parameters to URL search string.
 *
 * Handles:
 * - Standard key-value pairs
 * - Array values (e.g., { tag: ['a', 'b'] } → 'tag=a&tag=b')
 * - URL encoding
 * - Undefined/null filtering (omitted from output)
 * - Empty strings (included as 'key=')
 * - Special characters
 *
 * @param params - Query parameters to serialize
 * @returns URL search string (without leading '?'), or empty string if no params
 *
 * @example
 * ```typescript
 * serializeQueryParams({ search: 'laptop', page: '2' });
 * // → 'search=laptop&page=2'
 *
 * serializeQueryParams({ tag: ['electronics', 'sale'] });
 * // → 'tag=electronics&tag=sale'
 *
 * serializeQueryParams({ q: 'hello world' });
 * // → 'q=hello%20world'
 *
 * serializeQueryParams({ a: undefined, b: null, c: '' });
 * // → 'c='  (undefined/null omitted, empty string included)
 *
 * serializeQueryParams({});
 * // → ''
 * ```
 */
export function serializeQueryParams(params: Record<string, any>): string {
	const pairs: string[] = [];

	for (const [key, value] of Object.entries(params)) {
		// Skip undefined and null values
		if (value === undefined || value === null) {
			continue;
		}

		const encodedKey = encodeURIComponent(key);

		// Handle array values
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item !== undefined && item !== null) {
					const encodedValue = encodeURIComponent(String(item));
					pairs.push(`${encodedKey}=${encodedValue}`);
				}
			}
		} else {
			// Single value
			const encodedValue = encodeURIComponent(String(value));
			pairs.push(`${encodedKey}=${encodedValue}`);
		}
	}

	return pairs.join('&');
}

/**
 * Parse and validate query parameters using a schema.
 *
 * This function combines parsing with type coercion and validation:
 * 1. Parse raw query string → RawQueryParams
 * 2. Apply schema to coerce types and validate values
 * 3. Return typed result
 *
 * @template T - The expected output type after schema validation
 * @param search - URL search string (with or without leading '?')
 * @param schema - Schema for validation and type coercion
 * @returns Validated and typed query parameters
 *
 * @example
 * ```typescript
 * import { string, number, optional } from './schemas';
 *
 * const schema = {
 *   search: optional(string()),
 *   page: optional(number({ min: 1 })),
 *   perPage: optional(number({ min: 1, max: 100 }))
 * };
 *
 * const result = parseQueryParamsWithSchema('?search=laptop&page=2', schema);
 * // → { search: 'laptop', page: 2, perPage: undefined }
 * // Types: { search?: string; page?: number; perPage?: number }
 * ```
 */
export function parseQueryParamsWithSchema<T>(search: string, schema: Schema<T>): T {
	const raw = parseQueryParams(search);
	return schema.parse(raw);
}

/**
 * Serialize typed query parameters to URL search string.
 *
 * This is a convenience wrapper around serializeQueryParams that works
 * with typed objects (no additional processing needed since we already
 * have the typed values).
 *
 * @param params - Typed query parameters
 * @returns URL search string (without leading '?')
 *
 * @example
 * ```typescript
 * const params = {
 *   search: 'laptop',
 *   page: 2,
 *   tags: ['electronics', 'sale']
 * };
 *
 * serializeTypedQueryParams(params);
 * // → 'search=laptop&page=2&tags=electronics&tags=sale'
 * ```
 */
export function serializeTypedQueryParams(params: Record<string, any>): string {
	return serializeQueryParams(params);
}

/**
 * Merge query parameters with existing params.
 *
 * Useful for updating specific query params while preserving others.
 *
 * @param current - Current query parameters
 * @param updates - Parameters to add/update (undefined removes param)
 * @returns Merged query parameters
 *
 * @example
 * ```typescript
 * const current = { search: 'laptop', page: '1', sort: 'price' };
 * const updates = { page: '2', sort: undefined };
 *
 * mergeQueryParams(current, updates);
 * // → { search: 'laptop', page: '2' }
 * // (sort was removed because it's undefined)
 * ```
 */
export function mergeQueryParams(
	current: RawQueryParams,
	updates: Record<string, string | string[] | undefined>
): RawQueryParams {
	const result = { ...current };

	for (const [key, value] of Object.entries(updates)) {
		if (value === undefined) {
			delete result[key];
		} else {
			result[key] = value;
		}
	}

	return result;
}

/**
 * Get a single query parameter value.
 *
 * Handles array values by returning the first element.
 *
 * @param params - Query parameters
 * @param key - Parameter key
 * @param defaultValue - Default value if key not found
 * @returns Parameter value or default
 *
 * @example
 * ```typescript
 * const params = { search: 'laptop', tag: ['a', 'b'] };
 *
 * getQueryParam(params, 'search');
 * // → 'laptop'
 *
 * getQueryParam(params, 'tag');
 * // → 'a' (first element of array)
 *
 * getQueryParam(params, 'missing', 'default');
 * // → 'default'
 * ```
 */
export function getQueryParam(
	params: RawQueryParams,
	key: string,
	defaultValue?: string
): string | undefined {
	const value = params[key];
	if (value === undefined) {
		return defaultValue;
	}
	return Array.isArray(value) ? value[0] : value;
}

/**
 * Get all values for a query parameter (as array).
 *
 * Normalizes single values to array.
 *
 * @param params - Query parameters
 * @param key - Parameter key
 * @returns Array of values (empty if key not found)
 *
 * @example
 * ```typescript
 * const params = { search: 'laptop', tag: ['a', 'b'] };
 *
 * getQueryParamAll(params, 'search');
 * // → ['laptop']
 *
 * getQueryParamAll(params, 'tag');
 * // → ['a', 'b']
 *
 * getQueryParamAll(params, 'missing');
 * // → []
 * ```
 */
export function getQueryParamAll(params: RawQueryParams, key: string): string[] {
	const value = params[key];
	if (value === undefined) {
		return [];
	}
	return Array.isArray(value) ? value : [value];
}

/**
 * Check if a query parameter exists.
 *
 * @param params - Query parameters
 * @param key - Parameter key
 * @returns True if parameter exists (even if empty string)
 *
 * @example
 * ```typescript
 * const params = { search: 'laptop', flag: '' };
 *
 * hasQueryParam(params, 'search');
 * // → true
 *
 * hasQueryParam(params, 'flag');
 * // → true (empty string is still present)
 *
 * hasQueryParam(params, 'missing');
 * // → false
 * ```
 */
export function hasQueryParam(params: RawQueryParams, key: string): boolean {
	return key in params;
}
