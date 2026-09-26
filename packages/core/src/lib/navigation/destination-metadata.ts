import type { Reducer } from '../types.js';

/**
 * Immutable metadata captured at destination construction.
 */
export interface DestinationCases {
	readonly reducer: Reducer<any, any, any>;
	readonly keys: readonly string[];
	readonly routes: Readonly<Record<string, Reducer<any, any, any>>>;
}

const cases = new WeakMap<object, DestinationCases>();
const generated = new WeakSet<object>();

/**
 * Registers metadata for a destination result object and tracks its generated reducer.
 */
export function registerDestinationCases(result: object, metadata: DestinationCases): void {
	cases.set(result, metadata);
	generated.add(metadata.reducer);
}

/**
 * Retrieves destination case metadata or throws if the value is not a genuine destination.
 */
export function destinationCases(value: unknown): DestinationCases {
	if (typeof value === 'object' && value !== null) {
		const metadata = cases.get(value);
		if (metadata !== undefined) {
			return metadata;
		}
	}
	throw new TypeError('Expected a destination created by createDestination');
}

/**
 * Checks if a value is a generated destination reducer.
 * Membership-only negative guard for composition slices.
 */
export function isDestinationReducer(value: unknown): boolean {
	if (typeof value === 'function' || (typeof value === 'object' && value !== null)) {
		return generated.has(value);
	}
	return false;
}
