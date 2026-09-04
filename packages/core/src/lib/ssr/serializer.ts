/**
 * Custom serializers for state that crosses the hydration boundary.
 *
 * `serializeState` is `JSON.stringify`, and the documentation used to say it
 * **throws** on a `Date` or a `Map`. It does not, and that was the dangerous
 * half of the claim — the documented failure mode was the safe one:
 *
 * | in state          | serialized      | after `parseState`        | throws? |
 * |-------------------|-----------------|---------------------------|---------|
 * | `Date`            | an ISO string   | a **`string`** typed `Date` | no    |
 * | `Map` / `Set`     | `{}`            | `{}` — every entry lost   | no      |
 * | `undefined` prop  | key omitted     | key absent                | no      |
 * | `BigInt`, cycles  | —               | —                         | yes     |
 *
 * So the real failure is silent type corruption at the boundary, with
 * TypeScript asserting `Date` on both sides while the client holds a string.
 *
 * A serializer fixes it by tagging on the way out and untagging on the way in.
 * The two halves must agree, which is why they travel as one object.
 */

/** The tag wrapper written into the JSON. Two keys, so it is cheap to recognise. */
interface Tagged {
	readonly __composableType: 'Date' | 'Map' | 'Set';
	readonly value: unknown;
}

/**
 * A matched pair of `JSON.stringify` replacer and `JSON.parse` reviver.
 *
 * **One object, deliberately.** Each function is passed to a different half of
 * the round trip — the replacer to `serializeState` / `renderToHTML`, the
 * reviver to `parseState` / `hydrateStore` — and a tag written by one that the
 * other does not know how to read is worse than no tagging at all. Keeping them
 * on one value means a caller defines them once and hands the same object to
 * both sides.
 */
export interface StateSerializer {
	/**
	 * Passed to `JSON.stringify`.
	 *
	 * **Declared as a method, not an arrow**, because it needs `this`. See
	 * {@link createTaggedSerializer} for why.
	 */
	replacer(this: unknown, key: string, value: unknown): unknown;

	/** Passed to `JSON.parse`. Must undo exactly what `replacer` did. */
	reviver(this: unknown, key: string, value: unknown): unknown;
}

function isTagged(value: unknown): value is Tagged {
	if (value === null || typeof value !== 'object') return false;
	const keys = Object.keys(value);
	if (keys.length !== 2 || !keys.includes('__composableType') || !keys.includes('value')) {
		return false;
	}
	const tag = (value as { __composableType: unknown }).__composableType;
	return tag === 'Date' || tag === 'Map' || tag === 'Set';
}

/**
 * A serializer that round-trips `Date`, `Map` and `Set`.
 *
 * Hand-writing a replacer/reviver pair is a footgun — the tagging has to be
 * symmetric and survive nesting — so this ships rather than being described.
 *
 * **`undefined` properties are deliberately not tagged.** A replacer could do
 * it, but the reviver would then restore the key as *present with value
 * `undefined`*, which under `exactOptionalPropertyTypes` is a different type
 * from absent. Dropping the key is `JSON`'s behaviour and is left alone.
 *
 * Known limit: state that genuinely contains a `__composableType` key is
 * untagged on the way back. The reviver only unwraps an object with exactly
 * those two keys and a tag it knows, which makes a collision unlikely rather
 * than impossible.
 *
 * @example
 * ```typescript
 * import { serializeState, parseState, createTaggedSerializer } from '@composable-svelte/core';
 *
 * const serializer = createTaggedSerializer();
 * interface State { at: Date; seen: Set<string> }
 *
 * const state: State = { at: new Date(), seen: new Set(['a']) };
 *
 * // The SAME object goes to both halves.
 * const json = serializeState(state, serializer);
 * const back = parseState<State>(json, serializer);
 *
 * back.at instanceof Date;   // true — without a serializer this is a string
 * back.seen.has('a');        // true — without a serializer this is {}
 * ```
 */
export function createTaggedSerializer(): StateSerializer {
	return {
		replacer(this: unknown, key: string, value: unknown): unknown {
			// `JSON.stringify` calls `toJSON` BEFORE the replacer, so a `Date` has
			// already been flattened to a string by the time `value` is bound —
			// checking `value instanceof Date` here never matches. The original is
			// still reachable on the holder, which is what `this` is.
			//
			// This is also why `replacer` is a method and not an arrow: an arrow
			// captures the enclosing `this` and the `Date` arm silently stops
			// working while `Map` and `Set` keep passing.
			const raw = (this as Record<string, unknown> | undefined)?.[key];
			if (raw instanceof Date) {
				return { __composableType: 'Date', value: raw.toISOString() } satisfies Tagged;
			}
			// `Map` and `Set` have no `toJSON`, so `value` is the live object.
			if (value instanceof Map) {
				return { __composableType: 'Map', value: [...value] } satisfies Tagged;
			}
			if (value instanceof Set) {
				return { __composableType: 'Set', value: [...value] } satisfies Tagged;
			}
			return value;
		},

		reviver(this: unknown, _key: string, value: unknown): unknown {
			if (!isTagged(value)) return value;
			switch (value.__composableType) {
				case 'Date':
					return new Date(value.value as string);
				case 'Map':
					return new Map(value.value as Iterable<readonly [unknown, unknown]>);
				case 'Set':
					return new Set(value.value as Iterable<unknown>);
			}
		}
	};
}
