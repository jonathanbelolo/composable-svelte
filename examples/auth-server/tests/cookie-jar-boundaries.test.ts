import { it, expect, vi } from 'vitest';
import { createCookieJar } from './cookie-jar.js';

it('uses the explicit fixture clock for expiry while retaining raw headers', async () => {
 const now = Date.parse('2020-01-01T00:00:00Z');
 const header = 'session=held; Expires=Thu, 02 Jan 2020 00:00:00 GMT';
 const base = vi.fn().mockImplementation(async () => new Response('', { headers: { 'set-cookie': header } }));
 const jar = createCookieJar(base, () => now);
 await jar.fetch('http://localhost');
 expect(jar.header()).toBe('session=held');
 expect(jar.seen).toEqual([header]);
});
it('respects explicit cookie headers in init and Request inputs', async () => {
 const base = vi.fn().mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'session=held' } })).mockImplementation(async () => new Response(''));
 const jar = createCookieJar(base);
 await jar.fetch('http://localhost');
 await jar.fetch('http://localhost', { headers: { cookie: 'session=manual' } });
 expect(new Headers(base.mock.calls[1]?.[1]?.headers).get('cookie')).toBe('session=manual');
 await jar.fetch(new Request('http://localhost', { headers: { cookie: 'session=request' } }));
 expect(new Headers(base.mock.calls[2]?.[1]?.headers).get('cookie')).toBe('session=request');
 await jar.fetch('http://localhost');
 expect(new Headers(base.mock.calls[3]?.[1]?.headers).get('cookie')).toBe('session=held');
});
it('still removes explicit expired and cleared cookies', async () => {
 const base = vi.fn().mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'session=held' } })).mockResolvedValueOnce(new Response('', { headers: { 'set-cookie': 'session=; Max-Age=0' } }));
 const jar = createCookieJar(base);
 await jar.fetch('http://localhost'); expect(jar.header()).toBe('session=held');
 await jar.fetch('http://localhost'); expect(jar.header()).toBe('');
});
