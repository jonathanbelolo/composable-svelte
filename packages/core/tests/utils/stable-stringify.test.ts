/**
 * `stableStringify` is the request key of the API client's deduplication and
 * cache layers, the heartbeat's default pong comparison and TestStore's
 * partial matching. It has JSON semantics: R1's form walked `Object.keys`
 * only, so every `Date` rendered as `{}` and matched every other, and
 * `{ a: undefined }` differed from `{}` (R1-REVIEW 1.6, 1.7).
 */

import { describe, it, expect } from 'vitest';
import { stableStringify } from '../../src/lib/utils/stable-stringify.js';

describe('stableStringify', () => {
	it('sorts object keys at every depth, so key order never changes the string', () => {
		expect(stableStringify({ b: [{ d: 2, c: 1 }], a: { y: 2, x: 1 } })).toBe('{"a":{"x":1,"y":2},"b":[{"c":1,"d":2}]}');
		expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
	});

	it('agrees with JSON.stringify on plain data whose keys are already sorted', () => {
		const value = { a: [1, 'two', true, null], b: { c: 1.5, d: '' } };
		expect(stableStringify(value)).toBe(JSON.stringify(value));
	});

	it('renders a Date by its toJSON, so two instants differ and one instant matches', () => {
		expect(stableStringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
		expect(stableStringify({ at: new Date(0) })).not.toBe(stableStringify({ at: new Date(1) }));
		expect(stableStringify({ at: new Date(5) })).toBe(stableStringify({ at: new Date(5) }));
		// R1's form: `{}` for every Date, so these were equal.
		expect(stableStringify(new Date(0))).not.toBe('{}');
	});

	it('renders a URL by its href, and follows toJSON through nested results', () => {
		expect(stableStringify(new URL('https://a.example/x?y=1'))).toBe('"https://a.example/x?y=1"');
		const nested = { toJSON: () => ({ when: new Date(0) }) };
		expect(stableStringify(nested)).toBe('{"when":"1970-01-01T00:00:00.000Z"}');
	});

	it('omits undefined, function and symbol properties, as JSON.stringify does', () => {
		expect(stableStringify({ a: undefined, b: () => 1, c: Symbol('s') })).toBe('{}');
		expect(stableStringify({ a: undefined })).toBe(stableStringify({}));
	});

	it('renders undefined, functions and symbols inside arrays as null', () => {
		expect(stableStringify([undefined, () => 1, Symbol('s'), 1])).toBe('[null,null,null,1]');
	});

	it('renders NaN and Infinity as null', () => {
		expect(stableStringify({ n: NaN, i: Infinity, m: -Infinity })).toBe('{"i":null,"m":null,"n":null}');
	});

	it('renders a top-level undefined as the string undefined, which no pong equals', () => {
		expect(stableStringify(undefined)).toBe('undefined');
		expect(stableStringify(undefined)).not.toBe(stableStringify(null));
	});

	it('throws for a bigint, as JSON.stringify does', () => {
		expect(() => stableStringify({ big: 1n })).toThrow(TypeError);
	});

	it('escapes strings and keys as JSON does', () => {
		expect(stableStringify({ 'a"b': 'c\nd' })).toBe('{"a\\"b":"c\\nd"}');
	});
});
