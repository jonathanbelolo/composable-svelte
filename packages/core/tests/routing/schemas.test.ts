/**
 * Schema System - Unit Tests
 *
 * These tests expose bugs found during code review and ensure correctness.
 */

import { describe, it, expect } from 'vitest';
import {
	string,
	number,
	boolean,
	array,
	optional,
	enumSchema,
	object,
	literal
} from '../../src/lib/routing/schemas';

describe('string schema', () => {
	it('accepts valid strings', () => {
		const schema = string();
		expect(schema.parse('hello')).toBe('hello');
	});

	it('converts arrays to first element', () => {
		const schema = string();
		expect(schema.parse(['first', 'second'])).toBe('first');
	});

	it('converts numbers to strings', () => {
		const schema = string();
		expect(schema.parse(42)).toBe('42');
	});

	it('throws on undefined without default', () => {
		const schema = string();
		expect(() => schema.parse(undefined)).toThrow('Value is required');
	});

	it('returns default for undefined', () => {
		const schema = string({ default: 'default-value' });
		expect(schema.parse(undefined)).toBe('default-value');
	});

	// Validation
	it('validates minLength', () => {
		const schema = string({ minLength: 3 });
		expect(schema.parse('hello')).toBe('hello');
		expect(() => schema.parse('hi')).toThrow('at least 3 characters');
	});

	it('validates maxLength', () => {
		const schema = string({ maxLength: 5 });
		expect(schema.parse('hello')).toBe('hello');
		expect(() => schema.parse('too long')).toThrow('at most 5 characters');
	});

	it('validates pattern', () => {
		const schema = string({ pattern: /^[a-z]+$/ });
		expect(schema.parse('hello')).toBe('hello');
		expect(() => schema.parse('Hello')).toThrow('does not match pattern');
	});

	it('validates enum', () => {
		const schema = string({ enum: ['red', 'green', 'blue'] });
		expect(schema.parse('red')).toBe('red');
		expect(() => schema.parse('yellow')).toThrow('must be one of');
	});
});

describe('number schema', () => {
	it('accepts valid numbers', () => {
		const schema = number();
		expect(schema.parse('42')).toBe(42);
		expect(schema.parse(42)).toBe(42);
	});

	it('converts string to number', () => {
		const schema = number();
		expect(schema.parse('3.14')).toBe(3.14);
	});

	it('converts arrays to first element', () => {
		const schema = number();
		expect(schema.parse(['42', '99'])).toBe(42);
	});

	it('throws on undefined without default', () => {
		const schema = number();
		expect(() => schema.parse(undefined)).toThrow('Value is required');
	});

	it('returns default for undefined', () => {
		const schema = number({ default: 42 });
		expect(schema.parse(undefined)).toBe(42);
	});

	it('throws on invalid number', () => {
		const schema = number();
		expect(() => schema.parse('not-a-number')).toThrow('Invalid number');
	});

	// Validation
	it('validates min', () => {
		const schema = number({ min: 0 });
		expect(schema.parse('10')).toBe(10);
		expect(() => schema.parse('-5')).toThrow('at least 0');
	});

	it('validates max', () => {
		const schema = number({ max: 100 });
		expect(schema.parse('50')).toBe(50);
		expect(() => schema.parse('200')).toThrow('at most 100');
	});

	it('validates integer', () => {
		const schema = number({ integer: true });
		expect(schema.parse('42')).toBe(42);
		expect(() => schema.parse('3.14')).toThrow('must be an integer');
	});

	// ========================================================================
	// BUG #3a: Empty string becomes 0 (SHOULD FAIL UNTIL FIXED)
	// ========================================================================
	describe('BUG #3a: Empty string handling', () => {
		it('rejects empty string', () => {
			const schema = number();

			// CURRENTLY FAILS: Number('') is 0, not NaN
			expect(() => schema.parse('')).toThrow();
		});

		it('rejects whitespace-only string', () => {
			const schema = number();

			// CURRENTLY FAILS: Number('  ') is 0
			expect(() => schema.parse('   ')).toThrow();
		});

		it('rejects tab/newline strings', () => {
			const schema = number();

			expect(() => schema.parse('\t')).toThrow();
			expect(() => schema.parse('\n')).toThrow();
		});
	});

	// ========================================================================
	// BUG #3b: Infinity accepted (SHOULD FAIL UNTIL FIXED)
	// ========================================================================
	describe('BUG #3b: Infinity handling', () => {
		it('rejects Infinity', () => {
			const schema = number();

			// CURRENTLY FAILS: Infinity is not NaN, so it passes
			expect(() => schema.parse('Infinity')).toThrow();
		});

		it('rejects -Infinity', () => {
			const schema = number();

			// CURRENTLY FAILS
			expect(() => schema.parse('-Infinity')).toThrow();
		});

		it('rejects Infinity even with min/max constraints', () => {
			const schema = number({ min: 1, max: 100 });

			// CURRENTLY FAILS: Infinity > 100 but still passes isNaN check
			expect(() => schema.parse('Infinity')).toThrow();
		});
	});
});

describe('boolean schema', () => {
	it('accepts "true" as true', () => {
		const schema = boolean();
		expect(schema.parse('true')).toBe(true);
	});

	it('accepts "false" as false', () => {
		const schema = boolean();
		expect(schema.parse('false')).toBe(false);
	});

	it('accepts "1" as true', () => {
		const schema = boolean();
		expect(schema.parse('1')).toBe(true);
	});

	it('accepts "0" as false', () => {
		const schema = boolean();
		expect(schema.parse('0')).toBe(false);
	});

	it('accepts "yes"/"no"', () => {
		const schema = boolean();
		expect(schema.parse('yes')).toBe(true);
		expect(schema.parse('no')).toBe(false);
	});

	it('accepts "on"/"off"', () => {
		const schema = boolean();
		expect(schema.parse('on')).toBe(true);
		expect(schema.parse('off')).toBe(false);
	});

	it('is case-insensitive', () => {
		const schema = boolean();
		expect(schema.parse('TRUE')).toBe(true);
		expect(schema.parse('False')).toBe(false);
		expect(schema.parse('YES')).toBe(true);
	});

	it('throws on undefined without default', () => {
		const schema = boolean();
		expect(() => schema.parse(undefined)).toThrow('Value is required');
	});

	it('returns default for undefined', () => {
		const schema = boolean({ default: true });
		expect(schema.parse(undefined)).toBe(true);
	});

	it('throws on invalid boolean value', () => {
		const schema = boolean();
		expect(() => schema.parse('invalid')).toThrow('Invalid boolean value');
	});

	it('handles empty string with default', () => {
		const schema = boolean({ default: false });
		expect(schema.parse('')).toBe(false);
	});

	it('converts arrays to first element', () => {
		const schema = boolean();
		expect(schema.parse(['true', 'false'])).toBe(true);
	});
});

describe('array schema', () => {
	it('validates array of strings', () => {
		const schema = array(string());
		expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
	});

	it('validates array of numbers', () => {
		const schema = array(number());
		expect(schema.parse(['1', '2', '3'])).toEqual([1, 2, 3]);
	});

	it('normalizes single value to array', () => {
		const schema = array(string());
		expect(schema.parse('single')).toEqual(['single']);
	});

	it('returns empty array for undefined', () => {
		const schema = array(string());
		expect(schema.parse(undefined)).toEqual([]);
	});

	it('validates minLength', () => {
		const schema = array(string(), { minLength: 2 });
		expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
		expect(() => schema.parse(['a'])).toThrow('at least 2 elements');
	});

	it('validates maxLength', () => {
		const schema = array(string(), { maxLength: 3 });
		expect(schema.parse(['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
		expect(() => schema.parse(['a', 'b', 'c', 'd'])).toThrow('at most 3 elements');
	});

	it('throws on element validation error with index', () => {
		const schema = array(number({ min: 0 }));
		expect(() => schema.parse(['1', '-5', '3'])).toThrow('Array element at index 1');
	});

	it('validates nested arrays', () => {
		const schema = array(array(string()));
		expect(schema.parse([['a', 'b'], ['c']])).toEqual([['a', 'b'], ['c']]);
	});
});

describe('optional schema', () => {
	it('returns undefined for undefined', () => {
		const schema = optional(string());
		expect(schema.parse(undefined)).toBeUndefined();
	});

	it('returns undefined for null', () => {
		const schema = optional(string());
		expect(schema.parse(null)).toBeUndefined();
	});

	it('returns undefined for empty string', () => {
		const schema = optional(string());
		expect(schema.parse('')).toBeUndefined();
	});

	it('validates non-undefined values', () => {
		const schema = optional(number({ min: 1 }));
		expect(schema.parse('42')).toBe(42);
		expect(() => schema.parse('0')).toThrow('at least 1');
	});

	it('works with nested schemas', () => {
		const schema = optional(array(string()));
		expect(schema.parse(undefined)).toBeUndefined();
		expect(schema.parse(['a', 'b'])).toEqual(['a', 'b']);
	});
});

describe('enumSchema', () => {
	it('accepts valid enum values', () => {
		const schema = enumSchema(['red', 'green', 'blue'] as const);
		expect(schema.parse('red')).toBe('red');
		expect(schema.parse('green')).toBe('green');
	});

	it('throws on invalid enum value', () => {
		const schema = enumSchema(['asc', 'desc'] as const);
		expect(() => schema.parse('invalid')).toThrow('must be one of: asc, desc');
	});

	it('returns default for undefined', () => {
		const schema = enumSchema(['asc', 'desc'] as const, { default: 'asc' });
		expect(schema.parse(undefined)).toBe('asc');
	});

	it('converts arrays to first element', () => {
		const schema = enumSchema(['red', 'green', 'blue'] as const);
		expect(schema.parse(['red', 'green'])).toBe('red');
	});

	it('provides type safety', () => {
		const schema = enumSchema(['asc', 'desc'] as const);
		const result = schema.parse('asc');

		// TypeScript should infer: 'asc' | 'desc'
		const check: 'asc' | 'desc' = result;
		expect(check).toBe('asc');
	});
});

describe('object schema', () => {
	it('validates object with multiple fields', () => {
		const schema = object({
			search: optional(string()),
			page: optional(number({ min: 1 })),
			sort: optional(enumSchema(['asc', 'desc'] as const))
		});

		const result = schema.parse({
			search: 'laptop',
			page: '2',
			sort: 'asc'
		});

		expect(result).toEqual({
			search: 'laptop',
			page: 2,
			sort: 'asc'
		});
	});

	it('throws on null input', () => {
		const schema = object({ key: string() });
		expect(() => schema.parse(null)).toThrow('must be an object');
	});

	it('throws on non-object input', () => {
		const schema = object({ key: string() });
		expect(() => schema.parse('string')).toThrow('must be an object');
	});

	it('throws field validation error with field name', () => {
		const schema = object({
			page: number({ min: 1, max: 100 })
		});

		expect(() => schema.parse({ page: '200' })).toThrow('Field "page"');
		expect(() => schema.parse({ page: '200' })).toThrow('at most 100');
	});

	it('validates nested objects', () => {
		const schema = object({
			user: object({
				name: string(),
				age: number({ min: 0 })
			})
		});

		const result = schema.parse({
			user: {
				name: 'John',
				age: '30'
			}
		});

		expect(result).toEqual({
			user: {
				name: 'John',
				age: 30
			}
		});
	});

	it('handles optional fields correctly', () => {
		const schema = object({
			search: optional(string()),
			page: optional(number())
		});

		const result = schema.parse({
			search: 'laptop'
			// page is missing
		});

		expect(result).toEqual({
			search: 'laptop',
			page: undefined
		});
	});
});

describe('literal schema', () => {
	it('accepts matching string literal', () => {
		const schema = literal('active');
		expect(schema.parse('active')).toBe('active');
	});

	it('rejects non-matching string literal', () => {
		const schema = literal('active');
		expect(() => schema.parse('inactive')).toThrow('Value must be active');
	});

	it('accepts matching number literal', () => {
		const schema = literal(42);
		expect(schema.parse('42')).toBe(42);
	});

	it('rejects non-matching number literal', () => {
		const schema = literal(42);
		expect(() => schema.parse('99')).toThrow('Value must be 42');
	});

	// ========================================================================
	// BUG #1: Boolean literals broken (SHOULD FAIL UNTIL FIXED)
	// ========================================================================
	describe('BUG #1: Boolean literal comparison', () => {
		it('accepts literal true', () => {
			const schema = literal(true);

			// CURRENTLY FAILS: String('true') !== true (type mismatch)
			expect(schema.parse('true')).toBe(true);
		});

		it('rejects literal false when input is "true"', () => {
			const schema = literal(false);

			expect(() => schema.parse('true')).toThrow('Value must be false');
		});

		it('accepts literal false', () => {
			const schema = literal(false);

			// CURRENTLY FAILS
			expect(schema.parse('false')).toBe(false);
		});

		it('rejects non-matching boolean literal', () => {
			const schema = literal(true);

			expect(() => schema.parse('false')).toThrow('Value must be true');
		});

		it('handles case-insensitive boolean strings', () => {
			const schema = literal(true);

			// Should accept TRUE, True, true
			expect(schema.parse('TRUE')).toBe(true);
			expect(schema.parse('True')).toBe(true);
		});

		it('accepts "1" for literal true', () => {
			const schema = literal(true);

			expect(schema.parse('1')).toBe(true);
		});

		it('accepts "0" for literal false', () => {
			const schema = literal(false);

			expect(schema.parse('0')).toBe(false);
		});
	});

	it('converts arrays to first element', () => {
		const schema = literal('active');
		expect(schema.parse(['active', 'inactive'])).toBe('active');
	});
});

describe('Complex schema compositions', () => {
	it('validates complex query parameter schemas', () => {
		const schema = object({
			q: optional(string({ minLength: 1, maxLength: 100 })),
			page: number({ min: 1, integer: true, default: 1 }),
			perPage: number({ min: 1, max: 100, integer: true, default: 20 }),
			sort: enumSchema(['asc', 'desc'] as const, { default: 'asc' }),
			tags: optional(array(string())),
			active: boolean({ default: true })
		});

		const result = schema.parse({
			q: 'laptop',
			page: '2',
			tags: ['electronics', 'sale'],
			active: 'true'
		});

		expect(result).toEqual({
			q: 'laptop',
			page: 2,
			perPage: 20, // Default
			sort: 'asc', // Default
			tags: ['electronics', 'sale'],
			active: true
		});
	});

	it('handles all-optional fields with empty input', () => {
		const schema = object({
			search: optional(string()),
			page: optional(number())
		});

		const result = schema.parse({});

		expect(result).toEqual({
			search: undefined,
			page: undefined
		});
	});
});
