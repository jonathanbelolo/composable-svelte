import { describe, it, expect } from 'vitest';
import { createAPIClient } from '../../src/lib/api/client.js';
import { createMockAPI } from '../../src/lib/api/testing/mock-client.js';
import type { RequestConfig } from '../../src/lib/api/types.js';
import { scriptFetch } from '../helpers/scripted-fetch.js';

describe('API URL contracts v2 (B001-03, NEW-API-001..003)', () => {
	it('merges query params before fragment, preserves query bytes, and strips fragment from request identity', async () => {
		const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
		const client = createAPIClient();

		await client.get('/items?a=1&tag=x#frag', { params: { tag: 'y', b: 2, c: null } });
		expect(fetched.calls[0]!.url).toBe('/items?a=1&tag=y&b=2#frag');

		await Promise.all([client.get('/items#a'), client.get('/items#b')]);
		expect(fetched.calls).toHaveLength(2);
	});

	it('mock router ignores query and fragment in matching/params and escapes regex literals', async () => {
		const mock = createMockAPI({
			'GET https://external.example.com/items/:id': (_c: RequestConfig, p: Record<string, string>) => ({ id: p.id })
		});

		const res = await mock.get<{ id: string }>('https://external.example.com/items/42#hash');
		expect(res.data).toEqual({ id: '42' });

		await expect(mock.get('https://externalXexampleYcom/items/42')).rejects.toThrow('No mock for:');
	});

	it('handles relative/absolute cache aliasing, invalidation orderings, and isolates external origins', async () => {
		const fetched = scriptFetch([{ match: /./, body: { ok: true } }]);
		const client = createAPIClient({ baseURL: 'https://api.example.com', cache: true });

		await client.get('https://api.example.com/items');
		await client.get('/items');
		expect(fetched.calls).toHaveLength(1);

		client.invalidateCache('/items');
		await client.get('/items');
		expect(fetched.calls).toHaveLength(2);

		await client.get('https://external.example.com/items');
		expect(fetched.calls).toHaveLength(3);
		client.invalidateCache('/items*');
		await client.get('https://external.example.com/items');
		expect(fetched.calls).toHaveLength(3);
	});
});

// Preserve the existing order-independent params-object identity contract.
describe('query identity and decoding boundaries', () => {
 it('caches object params independent of insertion order', async () => {
  const fetched = scriptFetch([{match:/./,body:{ok:true}}]); const api=createAPIClient({cache:true});
  await api.get('/items',{params:{a:1,b:2}});
  await api.get('/items',{params:{b:2,a:1}});
  expect(fetched.calls).toHaveLength(1);
 });
 it('overrides a form-encoded inline key while preserving unrelated bytes', async () => {
  const fetched=scriptFetch([{match:/./,body:{ok:true}}]); const api=createAPIClient();
  await api.get('/items?first+name=old&raw=%2f%2F#hash',{params:{'first name':'new'}});
  expect(fetched.calls[0]!.url).toBe('/items?raw=%2f%2F&first%20name=new#hash');
 });
});


describe('mock route and cache invalidation review boundaries', () => {
 it('does not silently choose a query-qualified mock for a different query', async () => {
  const mock=createMockAPI({'GET /items?kind=a':{kind:'a'},'GET /items?kind=b':{kind:'b'}});
  await expect(mock.get('/items?kind=b')).rejects.toThrow('No mock for:');
 });
 it('absolute invalidation reaches a relative entry and mutation reaches an absolute entry', async () => {
  const fetched=scriptFetch([{match:/./,body:{ok:true}}]);
  const api=createAPIClient({baseURL:'https://api.example.com/v1',cache:true});
  await api.get('/items');
  api.invalidateCache('https://api.example.com/v1/items');
  await api.get('/items');
  expect(fetched.calls).toHaveLength(2);
  await api.post('https://api.example.com/v1/items',{});
  await api.get('/items');
  expect(fetched.calls).toHaveLength(4);
 });
 it('root-prefix invalidation clears base entries and retains unrelated origins', async () => {
  const fetched=scriptFetch([{match:/./,body:{ok:true}}]);
  const api=createAPIClient({baseURL:'https://api.example.com/v1',cache:true});
  await api.get('/'); await api.get('/items'); await api.get('https://other.example.com/items');
  api.invalidateCache('https://api.example.com/v1*');
  await api.get('/'); await api.get('/items'); await api.get('https://other.example.com/items');
  expect(fetched.calls).toHaveLength(5);
 });
});


describe('query encoding boundaries', () => {
	it('does not confuse encoded and literal percent keys', async () => {
		const fetched = scriptFetch([{ match: /./, body: {} }]);
		await createAPIClient().get('/items?a%2Cb=1', { params: { 'a%2Cb': 'x' } });
		expect(fetched.calls[0]!.url).toBe('/items?a%2Cb=1&a%252Cb=x');
	});
	it.each(['/items?a=1&&b=2', '/items?', '/items?#frag'])('preserves untouched URL %s', async (url) => {
		const fetched = scriptFetch([{ match: /./, body: {} }]);
		await createAPIClient().get(url, { params: { omitted: null } });
		expect(fetched.calls[0]!.url).toBe(url);
	});
});
