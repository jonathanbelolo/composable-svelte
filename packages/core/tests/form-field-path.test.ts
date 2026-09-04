/**
 * The path helpers, on their own.
 *
 * `form-nested.test.ts` proves the reducer routes errors to the right field.
 * This file proves the four pieces it is built from behave at their edges,
 * because a reducer test failing tells you *that* something is wrong and these
 * tell you *which*.
 */

import { describe, expect, it } from 'vitest';

import {
	FIELD_PATH_MAX_DEPTH,
	collectFieldPaths,
	readAtPath,
	setAtPath,
	toFieldPath
} from '../src/lib/components/form/field-path.js';
import type { FieldPath } from '../src/lib/components/form/field-path.js';

describe('toFieldPath', () => {
	it('joins a nested path', () => {
		expect(toFieldPath(['address', 'zip'])).toBe('address.zip');
	});

	it('stringifies a numeric segment rather than dropping it', () => {
		// The old routing guarded with `typeof path[0] === 'string'`, so an array
		// element's issue was neither truthy at index 0 nor a string and fell
		// into `formErrors`, which no component renders.
		expect(toFieldPath(['items', 0, 'name'])).toBe('items.0.name');
		expect(toFieldPath(['items', 0])).toBe('items.0');
	});

	it('answers null for a form-level error', () => {
		expect(toFieldPath([])).toBeNull();
	});

	it('answers null for a symbol segment, which no component could target', () => {
		expect(toFieldPath(['a', Symbol('s')])).toBeNull();
	});
});

describe('collectFieldPaths', () => {
	it('keys every node, not only the leaves', () => {
		// `address` needs a record of its own: a whole-object `.refine()` produces
		// an issue at ['address'] and it has to land somewhere.
		expect(collectFieldPaths({ name: '', address: { zip: '' } })).toEqual([
			'name',
			'address',
			'address.zip'
		]);
	});

	it('does not key the root', () => {
		expect(collectFieldPaths({ a: 1 })).not.toContain('');
	});

	it('walks arrays by index', () => {
		expect(collectFieldPaths({ items: [{ name: 'a' }] })).toEqual([
			'items',
			'items.0',
			'items.0.name'
		]);
	});

	it.each([
		['a Date', new Date()],
		['a RegExp', /x/],
		['a Map', new Map([['k', 'v']])],
		['a class instance', new (class Thing { public x = 1; })()]
	])('treats %s as one field rather than a bag of fields', (_label, value) => {
		const paths = collectFieldPaths({ when: value });
		expect(paths).toContain('when');
		expect(paths.filter((p) => p.startsWith('when.'))).toEqual([]);
	});

	it('treats null and undefined as leaves without throwing', () => {
		expect(collectFieldPaths({ a: null, b: undefined })).toEqual(['a', 'b']);
	});

	it('agrees with the type-level cap in both directions', () => {
		// The runtime walk and `FieldPath<T>` carry the same number separately, and
		// drift between them is silent: a type that admits `l1.….l6` while the walk
		// never creates a record for it produces a key that compiles and is always
		// `undefined`.
		type Deep = { l1: { l2: { l3: { l4: { l5: { l6: string } } } } } };

		const atCap: FieldPath<Deep> = 'l1.l2.l3.l4.l5';
		expect(atCap).toBe('l1.l2.l3.l4.l5');

		// @ts-expect-error - one level past the cap. If the type widens, this
		// directive becomes unused, which `svelte-check --fail-on-warnings` fails.
		const pastCap: FieldPath<Deep> = 'l1.l2.l3.l4.l5.l6';
		expect(pastCap).toBe('l1.l2.l3.l4.l5.l6');
	});

	it('stops at the depth cap', () => {
		// Six levels deep; the cap is five.
		const deep = { l1: { l2: { l3: { l4: { l5: { l6: 'too far' } } } } } };
		const paths = collectFieldPaths(deep);
		expect(paths).toContain('l1.l2.l3.l4.l5');
		expect(paths).not.toContain('l1.l2.l3.l4.l5.l6');
		expect(FIELD_PATH_MAX_DEPTH).toBe(5);
	});
});

describe('readAtPath', () => {
	it('reads through objects and arrays', () => {
		expect(readAtPath({ a: { b: [{ c: 7 }] } }, 'a.b.0.c')).toBe(7);
	});

	it('answers undefined for a missing segment rather than throwing', () => {
		expect(readAtPath({ a: {} }, 'a.b.c')).toBeUndefined();
		expect(readAtPath({ a: null }, 'a.b')).toBeUndefined();
	});
});

describe('setAtPath', () => {
	it('replaces a nested value', () => {
		expect(setAtPath({ a: { b: 1, c: 2 } }, 'a.b', 9)).toEqual({ a: { b: 9, c: 2 } });
	});

	it('never mutates its input', () => {
		const before = { a: { b: 1 } };
		setAtPath(before, 'a.b', 9);
		expect(before.a.b).toBe(1);
	});

	it('shares every branch it did not touch', () => {
		// Structural sharing, asserted by identity. Copying the whole tree would
		// satisfy `toEqual` and defeat every `$derived` downstream.
		const before = { touched: { x: 1 }, untouched: { y: 2 } };
		const after = setAtPath(before, 'touched.x', 9);
		expect(after.untouched).toBe(before.untouched);
		expect(after.touched).not.toBe(before.touched);
	});

	it('builds an array for a numeric segment and an object otherwise', () => {
		expect(Array.isArray((setAtPath({}, 'items.0', 'a') as { items: unknown }).items)).toBe(true);
		expect(Array.isArray((setAtPath({}, 'items.x', 'a') as { items: unknown }).items)).toBe(false);
	});
});
