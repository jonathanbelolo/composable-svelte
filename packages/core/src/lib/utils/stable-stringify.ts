/**
 * JSON with object keys sorted, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }`
 * serialise identically. The request key of the API client's deduplication
 * and cache layers, the heartbeat's default pong comparison, and TestStore's
 * partial matching are built on it. Internal: not in any barrel.
 *
 * JSON semantics, as `JSON.stringify`: an object with a `toJSON` method is
 * rendered by its result (a `Date` by its ISO string, a `URL` by its href);
 * a property whose value is `undefined`, a function or a symbol is omitted;
 * inside an array such a value renders as `null`; `NaN` and `Infinity` are
 * `null`. The first form walked `Object.keys` only, so every `Date` rendered
 * as `{}` — two dates keyed identically and matched each other — and
 * `{ a: undefined }` differed from `{}` (R1-REVIEW 1.6, 1.7).
 *
 * A top-level `undefined` renders as the string `undefined`, which the
 * heartbeat compares to a pong that was never `undefined`; a `bigint` throws,
 * as `JSON.stringify` does — a caller that must not throw checks the value
 * first (`isPlainData` in the API client).
 */
export function stableStringify(value: unknown): string {
	return render(value, true) ?? 'undefined';
}

/** `undefined` when the value has no JSON form (omitted as a property, `null` in an array). */
function render(value: unknown, topLevel: boolean): string | undefined {
	if (value === null) return 'null';
	if (value === undefined) return topLevel ? 'undefined' : undefined;
	const kind = typeof value;
	if (kind === 'function' || kind === 'symbol') return undefined;
	if (kind !== 'object') return JSON.stringify(value);

	const object = value as { toJSON?: unknown };
	if (typeof object.toJSON === 'function') {
		return render((object.toJSON as () => unknown)(), topLevel);
	}

	if (Array.isArray(value)) {
		return '[' + value.map((item) => render(item, false) ?? 'null').join(',') + ']';
	}

	const record = value as Record<string, unknown>;
	const pairs: string[] = [];
	for (const key of Object.keys(record).sort()) {
		const rendered = render(record[key], false);
		if (rendered !== undefined) pairs.push(JSON.stringify(key) + ':' + rendered);
	}
	return '{' + pairs.join(',') + '}';
}
