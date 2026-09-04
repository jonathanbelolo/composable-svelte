/**
 * Field paths: how a form addresses a value that is not at the top level.
 *
 * `FormState.fields` used to be keyed by `keyof T`, and the reducer routed Zod
 * issues with `issue.path[0]`. So an issue at `['address','zip']` landed on the
 * key `address` — the message could not be shown beside the input that caused
 * it, and the field it *did* name might not be on screen at all.
 *
 * Keys are now dotted paths: `'address.zip'`, `'items.0.name'`. A flat schema
 * produces exactly the keys it always did, which is what keeps every existing
 * form working unchanged.
 */

import type { FieldState } from './form.types.js';

/** Depth cap. Shared by the type and the runtime walk; a test pins that they agree. */
export const FIELD_PATH_MAX_DEPTH = 5;

/** Decrements the depth budget. `FieldPathAll` recurses until this runs out. */
type Prev = [never, 0, 1, 2, 3, 4, 5];

/**
 * Values that are one field, not a bag of fields.
 *
 * A `Date` is an input, not an object with a `getTime` field to validate.
 */
type Leaf = string | number | boolean | bigint | symbol | null | undefined | Date | RegExp;

/**
 * Prefixes `K` onto every path in `R`.
 *
 * The `string extends R` arm is what keeps a loosely-typed value usable: when
 * the value at `K` is `any`, `R` widens to `string`, and without this arm
 * `Join` would produce only `` `K.${string}` `` — losing the bare `K`. That is
 * not hypothetical: `Form.svelte` infers its `T` from a Zod schema, whose
 * values arrive as `any`, so *every* top-level field name would have been
 * rejected while nested ones passed.
 */
type Join<K extends string, R extends string> = string extends R
	? K | `${K}.${string}`
	: R extends ''
		? K
		: `${K}.${R}`;

/** `any` satisfies both branches of a conditional, so it needs catching first. */
type IsAny<T> = 0 extends 1 & T ? true : false;

type FieldPathAll<T, D extends number = typeof FIELD_PATH_MAX_DEPTH> = [D] extends [never]
	? ''
	: // Stop at zero, not merely at `never`. `Prev[1]` is `0`, and `0` is a
		// perfectly good number — so without this the type recursed one level
		// further than `collectFieldPaths` walks, admitting a six-segment path for
		// which no record is ever created. Caught by the cap-agreement test.
		D extends 0
		? ''
		: IsAny<T> extends true
			? // Unknowable, so permit anything below it rather than nothing.
				string
			: T extends Leaf
				? ''
				: T extends readonly (infer E)[]
					? '' | Join<`${number}`, FieldPathAll<E, Prev[D]>>
					: T extends object
						?
								| ''
								| {
										[K in keyof T & string]: Join<K, FieldPathAll<T[K], Prev[D]>>;
									}[keyof T & string]
						: '';

/**
 * Every addressable path in `T`, to {@link FIELD_PATH_MAX_DEPTH} levels.
 *
 * **The `& string` is load-bearing and not cosmetic.** Without it this is a
 * bare conditional type, which TypeScript will not accept as a `Record` key, a
 * computed property name, or something with `.split` inside a still-generic
 * function body — four separate errors, and the reducer cannot be written
 * without a cast on every line. Intersecting here fixes all four at once.
 *
 * @example
 * ```typescript
 * import type { FieldPath } from '@composable-svelte/core/components/form';
 *
 * type Order = { email: string; address: { zip: string } };
 * const a: FieldPath<Order> = 'address.zip';
 * const b: FieldPath<Order> = 'email';
 * ```
 */
export type FieldPath<T> = Exclude<FieldPathAll<T>, ''> & string;

/** The type of the value at `P` in `T`. Companion to {@link FieldPath}. */
export type FieldValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
	? T extends readonly (infer E)[]
		? FieldValue<E, Rest>
		: Head extends keyof T
			? FieldValue<T[Head], Rest>
			: never
	: T extends readonly (infer E)[]
		? E
		: P extends keyof T
			? T[P]
			: never;

/**
 * Joins a Zod issue path into a field key, or `null` for a form-level error.
 *
 * `null` for an empty path (a top-level `.refine()`) and for any symbol
 * segment, which cannot be written as a key a component could target.
 *
 * Numeric segments stringify rather than being dropped. The old code guarded
 * with `typeof path[0] === 'string'`, so an array element's issue was both
 * falsy at index 0 and not a string, and fell through to `formErrors` where no
 * component renders it.
 *
 * @example
 * ```typescript
 * import { toFieldPath } from '@composable-svelte/core/components/form';
 *
 * toFieldPath(['address', 'zip']);   // 'address.zip'
 * toFieldPath(['items', 0, 'name']); // 'items.0.name'
 * toFieldPath([]);                   // null — a form-level error
 * ```
 */
export function toFieldPath(path: readonly PropertyKey[]): string | null {
	if (path.length === 0) return null;
	const segments: string[] = [];
	for (const segment of path) {
		if (typeof segment === 'symbol') return null;
		segments.push(String(segment));
	}
	return segments.join('.');
}

/**
 * A field with no record yet.
 *
 * Exactly five keys — `form-field-record.test.ts` asserts that `value` and
 * `focused` are absent, because they were a second source of truth.
 *
 * A function rather than a shared constant: `warnings` is an array, and one
 * frozen instance spread into every field would alias them all together.
 */
export function defaultFieldState(): FieldState {
	return { touched: false, dirty: false, error: null, isValidating: false, warnings: [] };
}

/** Whether a value's children are addressable, or whether it is one field. */
function isWalkable(value: unknown): value is object {
	if (value === null || typeof value !== 'object') return false;
	if (Array.isArray(value)) return true;
	const proto: unknown = Object.getPrototypeOf(value);
	// Plain objects only. A `Date`, a `File`, a `Map` or a class instance is a
	// leaf: walking it would key its methods as though they were inputs.
	return proto === Object.prototype || proto === null;
}

/**
 * Every path in `data`, to `maxDepth` levels.
 *
 * **Every node is keyed, not only the leaves.** A whole-object `.refine()`
 * produces an issue at `['address']`, and it needs somewhere to land. The root
 * is not keyed — an empty path is a form-level error.
 */
export function collectFieldPaths(data: unknown, maxDepth = FIELD_PATH_MAX_DEPTH): string[] {
	const paths: string[] = [];

	const walk = (value: unknown, prefix: string, depth: number): void => {
		if (!isWalkable(value) || depth >= maxDepth) return;
		for (const key of Object.keys(value)) {
			const path = prefix === '' ? key : `${prefix}.${key}`;
			paths.push(path);
			walk((value as Record<string, unknown>)[key], path, depth + 1);
		}
	};

	walk(data, '', 0);
	return paths;
}

/** Reads the value at a dotted path. `undefined` for a missing segment, never a throw. */
export function readAtPath(data: unknown, path: string): unknown {
	let current: unknown = data;
	for (const segment of path.split('.')) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

/**
 * Returns `data` with the value at `path` replaced, sharing every untouched branch.
 *
 * Creates an array for a numeric segment and an object otherwise, so writing to
 * `items.0.name` through a missing `items` builds an array rather than an
 * object with a `"0"` key.
 */
export function setAtPath<T>(data: T, path: string, value: unknown): T {
	const [head, ...rest] = path.split('.');
	if (head === undefined) return data;

	const container: Record<string, unknown> =
		data !== null && typeof data === 'object'
			? Array.isArray(data)
				? ([...data] as unknown as Record<string, unknown>)
				: { ...(data as Record<string, unknown>) }
			: /^\d+$/.test(head)
				? ([] as unknown as Record<string, unknown>)
				: {};

	container[head] =
		rest.length === 0 ? value : setAtPath(container[head] ?? undefined, rest.join('.'), value);

	return container as unknown as T;
}

/**
 * Per-field state, keyed by path.
 *
 * **`Partial`, and that is deliberate.** A total record would have compiled
 * with no churn at all — and then thrown, because a path only has an entry once
 * it exists in the data. `FieldPath<{a?: string}>` includes `'a'`, but nothing
 * walks a key that is absent; an array path may appear only after a submit. A
 * type promising an entry that is not there is the exact lie
 * `form-field-record.test.ts` exists to refuse.
 *
 * The cost is that `state.fields.email.error` becomes `state.fields.email?.error`.
 * `noUncheckedIndexedAccess` is already on repo-wide, so widening to
 * `Record<string, FieldState>` would pay that same cost and lose the typo
 * checking as well.
 */
export type FormFields<T> = Partial<Record<FieldPath<T>, FieldState>>;

/** Async validators, keyed by path, each still typed to the value at that path. */
export type AsyncValidators<T> = {
	[P in FieldPath<T>]?: (value: FieldValue<T, P>) => Promise<void>;
};

/**
 * Returns `fields` with `path` patched, creating a complete entry when absent.
 *
 * The one place a field record is written. Basing every write on
 * `defaultFieldState()` is what fixes the old whole-form path, which spread
 * `undefined` into a new object and produced a two-key record missing
 * `warnings` and `isValidating`.
 */
export function withField<T>(
	fields: FormFields<T>,
	path: FieldPath<T>,
	patch: Partial<FieldState>
): FormFields<T> {
	return { ...fields, [path]: { ...defaultFieldState(), ...fields[path], ...patch } };
}

/**
 * The state of one field, or a default when it has no entry yet.
 *
 * For callers who want totality: they opt into it here, explicitly, rather than
 * getting it from a type that claims it and cannot deliver.
 *
 * @example
 * ```typescript
 * import { fieldStateAt } from '@composable-svelte/core/components/form';
 * import type { FormState } from '@composable-svelte/core/components/form';
 *
 * declare const state: FormState<{ address: { zip: string } }>;
 * const error: string | null = fieldStateAt(state, 'address.zip').error;
 * ```
 */
export function fieldStateAt<T extends Record<string, any>>(
	state: { fields: FormFields<T> },
	path: FieldPath<T>
): FieldState {
	return state.fields[path] ?? defaultFieldState();
}
