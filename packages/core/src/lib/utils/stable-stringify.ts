/**
 * JSON with object keys sorted, so `{ a: 1, b: 2 }` and `{ b: 2, a: 1 }`
 * serialise identically. The request key of the API client's deduplication
 * and cache layers, and the heartbeat's default pong comparison, are built on
 * it. Internal: not in any barrel.
 */
export function stableStringify(value: unknown): string {
	if (value === null) return 'null';
	if (value === undefined) return 'undefined';
	if (typeof value !== 'object') return JSON.stringify(value);

	if (Array.isArray(value)) {
		return '[' + value.map(stableStringify).join(',') + ']';
	}

	const record = value as Record<string, unknown>;
	const pairs = Object.keys(record)
		.sort()
		.map((key) => JSON.stringify(key) + ':' + stableStringify(record[key]));
	return '{' + pairs.join(',') + '}';
}
