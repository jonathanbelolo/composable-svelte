import { describe, it, expect } from 'vitest';
import { normalizeURL } from '../../src/lib/api/pipeline.js';
import { createAPIClient } from '../../src/lib/api/client.js';
import { createMockAPI } from '../../src/lib/api/testing/mock-client.js';
import type { RequestConfig } from '../../src/lib/api/types.js';
import { scriptFetch } from '../helpers/scripted-fetch.js';

describe('URL normalization (DEF-007)', () => {
	describe('normalizeURL', () => {
		it('preserves already absolute HTTP and HTTPS URLs', () => {
			expect(normalizeURL('https://api.example.com', 'https://other.example.com/resource')).toBe(
				'https://other.example.com/resource'
			);
			expect(normalizeURL('https://api.example.com', 'http://insecure.example.com/items')).toBe(
				'http://insecure.example.com/items'
			);
			expect(normalizeURL('https://api.example.com', 'HTTPS://UPPER.EXAMPLE.COM/PATH')).toBe(
				'HTTPS://UPPER.EXAMPLE.COM/PATH'
			);
		});

		it('preserves absolute URLs with query strings and fragments without mutating slashes', () => {
			expect(
				normalizeURL(
					'https://api.example.com',
					'https://other.example.com/api?redirect=https://auth.com//login&filter=a//b#section//1'
				)
			).toBe('https://other.example.com/api?redirect=https://auth.com//login&filter=a//b#section//1');
		});

		it('returns the path as given when baseURL is undefined', () => {
			expect(normalizeURL(undefined, '/relative/path')).toBe('/relative/path');
			expect(normalizeURL(undefined, 'https://example.com/abs')).toBe('https://example.com/abs');
			expect(normalizeURL(undefined, 'relative/no-slash')).toBe('relative/no-slash');
		});

		it('joins relative paths with baseURL (positive controls)', () => {
			expect(normalizeURL('https://api.example.com', '/users')).toBe('https://api.example.com/users');
			expect(normalizeURL('https://api.example.com', 'users')).toBe('https://api.example.com/users');
			expect(normalizeURL('https://api.example.com/', '/users')).toBe('https://api.example.com/users');
			expect(normalizeURL('https://api.example.com/', 'users')).toBe('https://api.example.com/users');
			expect(normalizeURL('https://api.example.com/v1', '/users')).toBe('https://api.example.com/v1/users');
			expect(normalizeURL('https://api.example.com/v1/', 'users')).toBe('https://api.example.com/v1/users');
		});

		it('collapses duplicate slashes in relative path joining outside scheme', () => {
			// Preserve the existing treatment of leading // as redundant path slashes.
			// Resolving a network-path reference to a separate host is outside DEF-007.
			expect(normalizeURL('https://api.example.com', '//users///list//')).toBe(
				'https://api.example.com/users/list/'
			);
			expect(normalizeURL('https://api.example.com//v1//', '//users')).toBe(
				'https://api.example.com/v1/users'
			);
		});

		it('does not mutate query or fragment contents during slash normalization of relative paths', () => {
			expect(
				normalizeURL(
					'https://api.example.com',
					'/search//items?redirect=https://other.com//foo&filter=a//b#frag//1'
				)
			).toBe('https://api.example.com/search/items?redirect=https://other.com//foo&filter=a//b#frag//1');
			expect(normalizeURL('https://api.example.com', '/items#section//2//3')).toBe(
				'https://api.example.com/items#section//2//3'
			);
			expect(normalizeURL('https://api.example.com', '/items?q=1//2')).toBe(
				'https://api.example.com/items?q=1//2'
			);
		});
	});

	describe('createAPIClient integration', () => {
		it('does not prefix an absolute URL with baseURL', async () => {
			const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
			const client = createAPIClient({ baseURL: 'https://api.example.com' });

			const res = await client.get<{ ok: boolean }>('https://external.example.com/data');

			expect(fetched.calls).toHaveLength(1);
			expect(fetched.calls[0]!.url).toBe('https://external.example.com/data');
			expect(res.data).toEqual({ ok: true });
		});

		it('preserves query and fragment on absolute URL requests through createAPIClient', async () => {
			const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
			const client = createAPIClient({ baseURL: 'https://api.example.com' });

			await client.get('https://external.example.com/search?target=https://foo//bar&filter=a//b#frag//1');

			expect(fetched.calls).toHaveLength(1);
			expect(fetched.calls[0]!.url).toBe(
				'https://external.example.com/search?target=https://foo//bar&filter=a//b#frag//1'
			);
		});

		it('supports POST requests to absolute URLs', async () => {
			const fetched = scriptFetch([{ match: /./, body: { created: true } }]);
			const client = createAPIClient({ baseURL: 'https://api.example.com' });

			await client.post('https://external.example.com/items', { name: 'widget' });

			expect(fetched.calls).toHaveLength(1);
			expect(fetched.calls[0]!.url).toBe('https://external.example.com/items');
			expect(fetched.calls[0]!.init?.method).toBe('POST');
		});

		it('resolves absolute URLs through the generic request API', async () => {
			const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
			const client = createAPIClient({ baseURL: 'https://api.example.com' });
			await client.request({ method: 'DELETE', url: 'https://external.example.com/items/1' });
			expect(fetched.calls).toHaveLength(1);
			expect(fetched.calls[0]!.url).toBe('https://external.example.com/items/1');
			expect(fetched.calls[0]!.init?.method).toBe('DELETE');
		});

		it('maintains relative path joining and slash normalization positive controls', async () => {
			const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
			const client = createAPIClient({ baseURL: 'https://api.example.com' });

			await client.get('/users//details');
			expect(fetched.calls[0]!.url).toBe('https://api.example.com/users/details');

			await client.get('products');
			expect(fetched.calls[1]!.url).toBe('https://api.example.com/products');

			await client.get('/search?filter=a//b&target=https://foo//bar');
			expect(fetched.calls[2]!.url).toBe('https://api.example.com/search?filter=a//b&target=https://foo//bar');
			expect(fetched.calls).toHaveLength(3);
		});
	});

	describe('createMockAPI compatibility controls (unaffected by normalizeURL)', () => {
		// The mock has no baseURL and never calls normalizeURL; these are unchanged controls.
		it('resolves routes defined with absolute URLs', async () => {
			const mock = createMockAPI({
				'GET https://external.example.com/items': [{ id: 'item-1' }],
				'POST https://external.example.com/items': (config: RequestConfig) => ({
					id: 'item-2',
					...(config.body as Record<string, unknown>)
				})
			});

			const listRes = await mock.get<{ id: string }[]>('https://external.example.com/items');
			expect(listRes.status).toBe(200);
			expect(listRes.data).toEqual([{ id: 'item-1' }]);

			const createRes = await mock.post<{ id: string; name: string }>(
				'https://external.example.com/items',
				{ name: 'new item' }
			);
			expect(createRes.data).toEqual({ id: 'item-2', name: 'new item' });
		});

		it('forwards an absolute query/fragment URL unchanged to request interceptors', async () => {
			const mock = createMockAPI({
				'GET https://external.example.com/items/:id': (_config: RequestConfig, params: Record<string, string>) => ({
					id: params.id
				})
			});

			const seenURLs: string[] = [];
			mock.addInterceptor({ onRequest: (url, config) => { seenURLs.push(url); return config; } });
			const res = await mock.get<{ id: string }>(
				'https://external.example.com/items/42?filter=a//b#hash//c'
			);
			expect(res.data).toEqual({ id: '42' });
			expect(seenURLs).toEqual(['https://external.example.com/items/42?filter=a//b#hash//c']);
		});

		it('matches relative routes with query strings containing slashes', async () => {
			const mock = createMockAPI({
				'GET /api/products': [{ id: '1', name: 'Product 1' }]
			});

			const res = await mock.get<{ id: string; name: string }[]>('/api/products?redirect=https://foo//bar');
			expect(res.data).toEqual([{ id: '1', name: 'Product 1' }]);
		});
	});
});
