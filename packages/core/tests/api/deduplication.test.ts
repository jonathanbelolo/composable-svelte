/**
 * The identity and registry layers of the API client, in isolation. The
 * client-level consequences are in `client.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import {
	createInFlightRegistry,
	isPlainData,
	requestKey,
	retryIdentity,
	type RequestIdentity
} from '../../src/lib/api/deduplication.js';
import { resolveRetryConfig } from '../../src/lib/api/retry.js';
import type { APIResponse } from '../../src/lib/api/types.js';
import { deferred } from '../helpers/scripted-fetch.js';

const identity = (over: Partial<RequestIdentity>): RequestIdentity => ({
	method: 'GET',
	url: 'https://a.example/x',
	params: undefined,
	headers: {},
	body: undefined,
	retry: null,
	...over
});

describe('isPlainData', () => {
	it.each([
		['null', null],
		['undefined', undefined],
		['a string', 's'],
		['a number', 1],
		['a boolean', true],
		['an array of plain values', [1, 'a', null, { b: [2] }]],
		['a plain object', { a: 1, b: { c: [true] } }],
		['a null-prototype object', Object.assign(Object.create(null), { a: 1 })],
		['a Date', new Date(0)],
		['a URL', new URL('https://a.example')],
		['an object whose toJSON returns plain data', { toJSON: () => ({ a: 1 }) }]
	])('%s is plain', (_name, value) => {
		expect(isPlainData(value)).toBe(true);
	});

	it.each([
		['a FormData', new FormData()],
		['a Blob', new Blob(['x'])],
		['an ArrayBuffer', new ArrayBuffer(2)],
		['a typed array', new Uint8Array(2)],
		['a URLSearchParams', new URLSearchParams()],
		['a Map', new Map()],
		['a Set', new Set()],
		['a class instance', new (class Thing {})()],
		['a bigint', 1n],
		['a symbol', Symbol('s')],
		['a function', () => 1],
		['a plain object holding a FormData', { upload: new FormData() }],
		['an array holding a Map', [new Map()]],
		['an object whose toJSON returns a Map', { toJSON: () => new Map() }]
	])('%s is not', (_name, value) => {
		expect(isPlainData(value)).toBe(false);
	});

	it('a cyclic structure is not plain, and does not overflow the stack', () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(isPlainData(cyclic)).toBe(false);
	});

	it('an object referenced twice, without a cycle, is plain', () => {
		const shared = { a: 1 };
		expect(isPlainData({ x: shared, y: shared })).toBe(true);
	});
});

describe('requestKey', () => {
	it('is null for a body with no identifying JSON form', () => {
		expect(requestKey(identity({ method: 'POST', body: new FormData() }))).toBeNull();
		expect(requestKey(identity({ method: 'POST', body: { at: new Map() } }))).toBeNull();
	});

	it('differs by method, URL, params, headers, body and retry policy', () => {
		const base = requestKey(identity({}));
		expect(requestKey(identity({ method: 'HEAD' }))).not.toBe(base);
		expect(requestKey(identity({ url: 'https://a.example/y' }))).not.toBe(base);
		expect(requestKey(identity({ params: { a: 1 } }))).not.toBe(base);
		expect(requestKey(identity({ headers: { authorization: 'x' } }))).not.toBe(base);
		expect(requestKey(identity({ body: { a: 1 } }))).not.toBe(base);
		expect(requestKey(identity({ retry: resolveRetryConfig('GET', true) }))).not.toBe(base);
	});

	it('does not depend on key order, and renders a Date by its instant', () => {
		expect(requestKey(identity({ params: { a: 1, b: 2 } }))).toBe(requestKey(identity({ params: { b: 2, a: 1 } })));
		expect(requestKey(identity({ body: { at: new Date(0) } }))).not.toBe(requestKey(identity({ body: { at: new Date(1) } })));
	});
});

describe('retryIdentity', () => {
	it('is null for no policy, and keys the default predicate as 0', () => {
		expect(retryIdentity(null)).toBeNull();
		expect(retryIdentity(resolveRetryConfig('GET', true))).toMatchObject({ maxAttempts: 3, shouldRetry: 0 });
	});

	it('gives the same function the same id, and two functions different ids', () => {
		const predicate = () => true;
		const a = retryIdentity(resolveRetryConfig('GET', { shouldRetry: predicate })) as { shouldRetry: number };
		const b = retryIdentity(resolveRetryConfig('GET', { shouldRetry: predicate })) as { shouldRetry: number };
		const c = retryIdentity(resolveRetryConfig('GET', { shouldRetry: () => true })) as { shouldRetry: number };
		expect(a.shouldRetry).toBe(b.shouldRetry);
		expect(a.shouldRetry).not.toBe(0);
		expect(c.shouldRetry).not.toBe(a.shouldRetry);
	});
});

describe('resolveRetryConfig', () => {
	it('false is no policy; undefined is the defaults for safe methods and none for POST and PATCH', () => {
		expect(resolveRetryConfig('GET', false)).toBeNull();
		expect(resolveRetryConfig('GET', undefined)).toMatchObject({ maxAttempts: 3 });
		expect(resolveRetryConfig('DELETE', undefined)).toMatchObject({ maxAttempts: 3 });
		expect(resolveRetryConfig('POST', undefined)).toBeNull();
		expect(resolveRetryConfig('PATCH', undefined)).toBeNull();
	});

	it('true and a partial policy apply to any method, merged with the defaults', () => {
		expect(resolveRetryConfig('POST', true)).toMatchObject({ maxAttempts: 3, initialDelay: 1000 });
		expect(resolveRetryConfig('POST', { maxAttempts: 5 })).toMatchObject({ maxAttempts: 5, initialDelay: 1000 });
	});
});

describe('createInFlightRegistry', () => {
	const response = (data: unknown): APIResponse<unknown> => ({ status: 200, headers: {}, data });
	const turn = () => new Promise<void>((r) => setTimeout(r, 0));

	it('the attempt leaves the registry when its last caller aborts, synchronously', () => {
		// It stayed until the rejection settled, and a caller arriving in that
		// window joined it (R1-REVIEW 1.2).
		const registry = createInFlightRegistry();
		const gate = deferred<APIResponse<unknown>>();
		const ac = new AbortController();

		const p = registry.join('k', () => gate.promise, { signal: ac.signal, timeout: Infinity });
		const rejected = expect(p).rejects.toMatchObject({ name: 'AbortError' });
		expect(registry.size).toBe(1);

		ac.abort();
		expect(registry.size).toBe(0);
		return rejected;
	});

	it('a later attempt under the same key survives the earlier one settling late', async () => {
		const registry = createInFlightRegistry();
		const first = deferred<APIResponse<unknown>>();
		const second = deferred<APIResponse<unknown>>();
		const ac = new AbortController();

		const a = registry.join('k', () => first.promise, { signal: ac.signal, timeout: Infinity });
		const aRejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
		ac.abort();
		await aRejected;

		const b = registry.join('k', () => second.promise, { timeout: Infinity });
		expect(registry.size).toBe(1);

		first.reject(new Error('late'));
		await turn();
		expect(registry.size).toBe(1);

		second.resolve(response(1));
		expect((await b).data).toBe(1);
		expect(registry.size).toBe(0);
	});

	it('a null key runs alone, and Infinity arms no timer', async () => {
		const registry = createInFlightRegistry();
		let runs = 0;
		const execute = async () => {
			runs++;
			return response(runs);
		};

		const [a, b] = await Promise.all([
			registry.join(null, execute, { timeout: Infinity }),
			registry.join(null, execute, { timeout: Infinity })
		]);

		expect([a.data, b.data]).toEqual([1, 2]);
		expect(registry.size).toBe(0);
	});
});
