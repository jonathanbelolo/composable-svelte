/**
 * Query Parameter Utilities - Unit Tests
 *
 * These tests expose bugs found during code review and ensure correctness.
 */

import { describe, it, expect } from 'vitest';
import {
	parseQueryParams,
	serializeQueryParams,
	parseQueryParamsWithSchema,
	mergeQueryParams,
	getQueryParam,
	getQueryParamAll,
	hasQueryParam
} from '../../src/lib/routing/query-params';
import { string, number, optional, object } from '../../src/lib/routing/schemas';

describe('parseQueryParams', () => {
	// Basic functionality
	it('parses simple key-value pairs', () => {
		const result = parseQueryParams('?search=laptop&page=2');
		expect(result).toEqual({
			search: 'laptop',
			page: '2'
		});
	});

	it('handles leading ? or no leading ?', () => {
		const with1 = parseQueryParams('?key=value');
		const without = parseQueryParams('key=value');
		expect(with1).toEqual(without);
		expect(with1).toEqual({ key: 'value' });
	});

	it('returns empty object for empty string', () => {
		expect(parseQueryParams('')).toEqual({});
		expect(parseQueryParams('?')).toEqual({});
	});

	// Array values
	it('handles array values (multiple same key)', () => {
		const result = parseQueryParams('?tag=electronics&tag=sale&tag=new');
		expect(result).toEqual({
			tag: ['electronics', 'sale', 'new']
		});
	});

	it('converts single value to array when second value added', () => {
		const result = parseQueryParams('?tag=first&tag=second');
		expect(Array.isArray(result.tag)).toBe(true);
		expect(result.tag).toEqual(['first', 'second']);
	});

	// URL encoding
	it('decodes URL-encoded values', () => {
		const result = parseQueryParams('?q=hello%20world&name=John%20Doe');
		expect(result).toEqual({
			q: 'hello world',
			name: 'John Doe'
		});
	});

	it('decodes special characters', () => {
		const result = parseQueryParams('?url=https%3A%2F%2Fexample.com%2Fpath%3Fkey%3Dvalue');
		expect(result).toEqual({
			url: 'https://example.com/path?key=value'
		});
	});

	// Empty values
	it('handles empty values', () => {
		const result = parseQueryParams('?flag=&name=');
		expect(result).toEqual({
			flag: '',
			name: ''
		});
	});

	it('handles keys without values', () => {
		const result = parseQueryParams('?flag');
		expect(result).toEqual({
			flag: ''
		});
	});

	// Edge cases
	it('skips empty pairs from trailing &', () => {
		const result = parseQueryParams('?a=1&b=2&');
		expect(result).toEqual({
			a: '1',
			b: '2'
		});
	});

	it('skips empty pairs from double &&', () => {
		const result = parseQueryParams('?a=1&&b=2');
		expect(result).toEqual({
			a: '1',
			b: '2'
		});
	});

	// ========================================================================
	// BUG #1: Multiple '=' in values (SHOULD FAIL UNTIL FIXED)
	// ========================================================================
	describe('BUG #1: Multiple equals signs in value', () => {
		it('preserves all = signs in value (JWT token example)', () => {
			const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
			const result = parseQueryParams(`?token=${jwt}`);

			// CURRENTLY FAILS: Gets truncated at first '.'
			// After fix: Should get full JWT
			expect(result.token).toBe(jwt);
		});

		it('preserves = in base64 padding', () => {
			const base64 = 'SGVsbG8gV29ybGQ=';
			const result = parseQueryParams(`?data=${base64}`);

			// CURRENTLY FAILS: Loses the = padding
			expect(result.data).toBe(base64);
		});

		it('handles multiple = signs in URL', () => {
			const result = parseQueryParams('?equation=a=b=c');

			// CURRENTLY FAILS: Gets only 'a'
			expect(result.equation).toBe('a=b=c');
		});

		it('handles empty value after =', () => {
			const result = parseQueryParams('?key=value=');

			// CURRENTLY FAILS
			expect(result.key).toBe('value=');
		});
	});

	// ========================================================================
	// BUG #5: Malformed URL encoding (SHOULD FAIL UNTIL FIXED)
	// ========================================================================
	describe('BUG #5: Malformed URL encoding', () => {
		it('handles malformed UTF-8 sequences gracefully', () => {
			// This will throw URIError in current implementation
			expect(() => {
				parseQueryParams('?key=%E0%A4%A');
			}).not.toThrow();
		});

		it('returns original value if decode fails', () => {
			const result = parseQueryParams('?key=%E0%A4%A');

			// Should return malformed string as-is rather than throwing
			expect(result.key).toBeDefined();
		});

		it('handles partially encoded strings', () => {
			expect(() => {
				parseQueryParams('?key=hello%20world%ZZ');
			}).not.toThrow();
		});
	});

	// Edge cases that should work
	it('handles keys with special characters', () => {
		const result = parseQueryParams('?key[]=value1&key[]=value2');
		// Note: These are two different keys: "key[]" appears twice
		expect(result['key[]']).toEqual(['value1', 'value2']);
	});

	it('handles numeric keys', () => {
		const result = parseQueryParams('?0=first&1=second');
		expect(result['0']).toBe('first');
		expect(result['1']).toBe('second');
	});
});

describe('serializeQueryParams', () => {
	// Basic functionality
	it('serializes simple key-value pairs', () => {
		const result = serializeQueryParams({
			search: 'laptop',
			page: 2
		});
		expect(result).toBe('search=laptop&page=2');
	});

	it('returns empty string for empty object', () => {
		expect(serializeQueryParams({})).toBe('');
	});

	// Array values
	it('serializes array values as multiple params', () => {
		const result = serializeQueryParams({
			tag: ['electronics', 'sale', 'new']
		});
		expect(result).toBe('tag=electronics&tag=sale&tag=new');
	});

	// URL encoding
	it('encodes special characters', () => {
		const result = serializeQueryParams({
			q: 'hello world',
			url: 'https://example.com/path?key=value'
		});
		expect(result).toContain('q=hello%20world');
		expect(result).toContain('url=https%3A%2F%2Fexample.com%2Fpath%3Fkey%3Dvalue');
	});

	// Null/undefined handling
	it('skips undefined values', () => {
		const result = serializeQueryParams({
			a: 'value',
			b: undefined,
			c: 'other'
		});
		expect(result).toBe('a=value&c=other');
	});

	it('skips null values', () => {
		const result = serializeQueryParams({
			a: 'value',
			b: null,
			c: 'other'
		});
		expect(result).toBe('a=value&c=other');
	});

	it('includes empty strings', () => {
		const result = serializeQueryParams({
			flag: '',
			name: 'John'
		});
		expect(result).toContain('flag=');
		expect(result).toContain('name=John');
	});

	// Array with null/undefined
	it('skips null/undefined items in arrays', () => {
		const result = serializeQueryParams({
			tags: ['a', null, 'b', undefined, 'c']
		});
		expect(result).toBe('tags=a&tags=b&tags=c');
	});

	// Type coercion
	it('converts numbers to strings', () => {
		const result = serializeQueryParams({
			page: 42,
			count: 0
		});
		expect(result).toContain('page=42');
		expect(result).toContain('count=0');
	});

	it('converts booleans to strings', () => {
		const result = serializeQueryParams({
			active: true,
			deleted: false
		});
		expect(result).toContain('active=true');
		expect(result).toContain('deleted=false');
	});

	// Objects (expected behavior - becomes [object Object])
	it('converts objects to [object Object]', () => {
		const result = serializeQueryParams({
			obj: { nested: 'value' }
		});
		expect(result).toBe('obj=%5Bobject%20Object%5D'); // Encoded "[object Object]"
	});
});

describe('parseQueryParamsWithSchema', () => {
	it('parses and validates with schema', () => {
		const schema = object({
			search: optional(string()),
			page: optional(number({ min: 1 }))
		});

		const result = parseQueryParamsWithSchema('?search=laptop&page=2', schema);

		expect(result).toEqual({
			search: 'laptop',
			page: 2 // Note: Number, not string!
		});
	});

	it('returns undefined for missing optional fields', () => {
		const schema = object({
			search: optional(string()),
			page: optional(number({ min: 1 }))
		});

		const result = parseQueryParamsWithSchema('?search=laptop', schema);

		expect(result).toEqual({
			search: 'laptop',
			page: undefined
		});
	});

	it('throws on validation error', () => {
		const schema = object({
			page: number({ min: 1, max: 100 })
		});

		expect(() => {
			parseQueryParamsWithSchema('?page=200', schema);
		}).toThrow('Number must be at most 100');
	});
});

describe('mergeQueryParams', () => {
	it('merges new params into existing', () => {
		const current = { search: 'laptop', page: '1', sort: 'price' };
		const updates = { page: '2' };

		const result = mergeQueryParams(current, updates);

		expect(result).toEqual({
			search: 'laptop',
			page: '2',
			sort: 'price'
		});
	});

	it('removes params when value is undefined', () => {
		const current = { search: 'laptop', page: '1', sort: 'price' };
		const updates = { sort: undefined };

		const result = mergeQueryParams(current, updates);

		expect(result).toEqual({
			search: 'laptop',
			page: '1'
		});
	});

	it('adds new params', () => {
		const current = { search: 'laptop' };
		const updates = { page: '1', sort: 'price' };

		const result = mergeQueryParams(current, updates);

		expect(result).toEqual({
			search: 'laptop',
			page: '1',
			sort: 'price'
		});
	});

	it('does not mutate original', () => {
		const current = { search: 'laptop', page: '1' };
		const updates = { page: '2' };

		mergeQueryParams(current, updates);

		expect(current).toEqual({ search: 'laptop', page: '1' }); // Unchanged
	});
});

describe('getQueryParam', () => {
	it('gets single value', () => {
		const params = { search: 'laptop', page: '2' };
		expect(getQueryParam(params, 'search')).toBe('laptop');
	});

	it('gets first element of array', () => {
		const params = { tag: ['a', 'b', 'c'] };
		expect(getQueryParam(params, 'tag')).toBe('a');
	});

	it('returns default for missing key', () => {
		const params = { search: 'laptop' };
		expect(getQueryParam(params, 'page', '1')).toBe('1');
	});

	it('returns undefined for missing key without default', () => {
		const params = { search: 'laptop' };
		expect(getQueryParam(params, 'page')).toBeUndefined();
	});
});

describe('getQueryParamAll', () => {
	it('returns array for array value', () => {
		const params = { tag: ['a', 'b', 'c'] };
		expect(getQueryParamAll(params, 'tag')).toEqual(['a', 'b', 'c']);
	});

	it('wraps single value in array', () => {
		const params = { search: 'laptop' };
		expect(getQueryParamAll(params, 'search')).toEqual(['laptop']);
	});

	it('returns empty array for missing key', () => {
		const params = { search: 'laptop' };
		expect(getQueryParamAll(params, 'page')).toEqual([]);
	});
});

describe('hasQueryParam', () => {
	it('returns true for existing key', () => {
		const params = { search: 'laptop', flag: '' };
		expect(hasQueryParam(params, 'search')).toBe(true);
	});

	it('returns true even for empty string value', () => {
		const params = { flag: '' };
		expect(hasQueryParam(params, 'flag')).toBe(true);
	});

	it('returns false for missing key', () => {
		const params = { search: 'laptop' };
		expect(hasQueryParam(params, 'page')).toBe(false);
	});
});

describe('Round-trip consistency', () => {
	it('maintains data through parse → serialize → parse', () => {
		const original = { search: 'laptop', page: '2', tags: ['a', 'b'] };
		const serialized = serializeQueryParams(original);
		const parsed = parseQueryParams('?' + serialized);

		expect(parsed).toEqual(original);
	});

	it('handles special characters round-trip', () => {
		const original = { query: 'hello world', url: 'https://example.com?key=value' };
		const serialized = serializeQueryParams(original);
		const parsed = parseQueryParams('?' + serialized);

		expect(parsed).toEqual(original);
	});
});
