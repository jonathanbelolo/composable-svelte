/**
 * @vitest-environment node
 *
 * What actually crosses the hydration boundary, and what a serializer fixes.
 *
 * The documentation claimed `serializeState` **throws** on a `Date` or a `Map`.
 * It does not, and the claim was dangerous precisely because the documented
 * failure mode is the safe one: a throw is loud. What really happens is silent
 * type corruption — `state.at` is a `Date` on the server and a `string` on the
 * client, while TypeScript says `Date` on both sides.
 *
 * The first block pins the truth table so that claim cannot come back. Those
 * arms pass with or without the serializer; they document JSON, not us.
 */

import { describe, expect, it } from 'vitest';

import { serializeState } from '../../src/lib/ssr/serialize.js';
import { parseState } from '../../src/lib/ssr/hydrate.js';
import { createTaggedSerializer } from '../../src/lib/ssr/serializer.js';

describe('what JSON does to non-JSON values, unaided', () => {
	it('turns a Date into a string without complaining', () => {
		const json = serializeState({ at: new Date('2026-01-01T00:00:00.000Z') });
		const back = parseState<{ at: Date }>(json);

		expect(typeof back.at).toBe('string');
		expect(back.at).not.toBeInstanceOf(Date);
	});

	it('empties a Map and a Set without complaining', () => {
		const json = serializeState({ m: new Map([['k', 'v']]), s: new Set([1]) });
		const back = parseState<{ m: unknown; s: unknown }>(json);

		expect(back.m).toEqual({});
		expect(back.s).toEqual({});
	});

	it('drops an undefined property', () => {
		const back = parseState<Record<string, unknown>>(serializeState({ a: undefined, b: 1 }));
		expect('a' in back).toBe(false);
	});

	it('throws only for BigInt and cycles — the two the docs did not mention', () => {
		expect(() => serializeState({ n: 1n })).toThrow(TypeError);
		const cyclic: Record<string, unknown> = {};
		cyclic['self'] = cyclic;
		expect(() => serializeState(cyclic)).toThrow(TypeError);
	});
});

describe('createTaggedSerializer', () => {
	const serializer = createTaggedSerializer();

	it('round-trips a Date', () => {
		const at = new Date('2026-01-01T00:00:00.000Z');
		const back = parseState<{ at: Date }>(serializeState({ at }, serializer), serializer);

		expect(back.at).toBeInstanceOf(Date);
		expect(back.at.getTime()).toBe(at.getTime());
	});

	it('round-trips a Map with its entries', () => {
		const m = new Map([
			['a', 1],
			['b', 2]
		]);
		const back = parseState<{ m: Map<string, number> }>(
			serializeState({ m }, serializer),
			serializer
		);

		expect(back.m).toBeInstanceOf(Map);
		expect([...back.m]).toEqual([
			['a', 1],
			['b', 2]
		]);
	});

	it('round-trips a Set', () => {
		const back = parseState<{ s: Set<string> }>(
			serializeState({ s: new Set(['x', 'y']) }, serializer),
			serializer
		);

		expect(back.s).toBeInstanceOf(Set);
		expect([...back.s]).toEqual(['x', 'y']);
	});

	it('round-trips nested and collection-held values', () => {
		// The arm that catches a replacer that only looks at the top level.
		const state = {
			deep: { list: [new Date('2026-02-02T00:00:00.000Z')] },
			byId: new Map([['k', new Date('2026-03-03T00:00:00.000Z')]])
		};
		const back = parseState<typeof state>(serializeState(state, serializer), serializer);

		expect(back.deep.list[0]).toBeInstanceOf(Date);
		expect(back.byId.get('k')).toBeInstanceOf(Date);
	});

	it('leaves ordinary values untouched', () => {
		const state = { n: 1, s: 'text', b: true, nil: null, arr: [1, 2], obj: { a: 1 } };
		expect(parseState(serializeState(state, serializer), serializer)).toEqual(state);
	});

	it('does not unwrap an object that merely looks tagged', () => {
		const state = { odd: { __composableType: 'NotAKnownTag', value: 1 } };
		const back = parseState<typeof state>(serializeState(state, serializer), serializer);
		expect(back.odd).toEqual({ __composableType: 'NotAKnownTag', value: 1 });
	});

	it('is inert when only one half is supplied', () => {
		// The asymmetry this design exists to prevent, shown rather than asserted:
		// a tag written with no reviver to read it arrives as the raw wrapper.
		const json = serializeState({ at: new Date('2026-01-01T00:00:00.000Z') }, serializer);
		const back = parseState<{ at: unknown }>(json);

		expect(back.at).toEqual({
			__composableType: 'Date',
			value: '2026-01-01T00:00:00.000Z'
		});
	});
});
