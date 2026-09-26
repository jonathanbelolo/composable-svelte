import { describe, it, expect, vi } from 'vitest';
import { createHttpAuthDeps } from '../src/lib/http/index.js';
import { MalformedSessionError } from '../src/lib/session/http.js';

function brokenResponse(error: unknown, status = 200) {
 return new Response(new ReadableStream({ start(controller) { controller.error(error); } }), { status });
}
const paths = ['session', 'account', 'error'] as const;
function request(path: typeof paths[number], response: Response, signal?: AbortSignal) {
 const deps = createHttpAuthDeps('', { fetch: vi.fn().mockResolvedValue(response) });
 return path === 'session' ? deps.fetchSession(signal) : deps.fetchAccount(signal);
}
describe('transport stream boundaries', () => {
 it.each(paths)('preserves correlated custom cancellation while reading %s', async path => {
  const controller = new AbortController();
  const reason = new SyntaxError('intentional caller cancellation');
  controller.abort(reason);
  await expect(request(path, brokenResponse(reason, path === 'error' ? 400 : 200), controller.signal)).rejects.toBe(reason);
 });
 it.each(paths)('classifies failed %s stream as network', async path => {
  await expect(request(path, brokenResponse(new TypeError('socket closed'), path === 'error' ? 400 : 200))).rejects.toMatchObject({ code: 'network' });
 });
 it.each(['session', 'account'] as const)('retains malformed %s JSON classification', async path => {
  await expect(request(path, new Response('{'))).rejects.toBeInstanceOf(MalformedSessionError);
 });
 it('retains HTTP fallback for malformed error JSON', async () => {
  await expect(request('error', new Response('{', { status: 403 }))).rejects.toMatchObject({ status: 403 });
 });
 it.each(['used', 'locked'] as const)('does not report %s body misuse as a network failure', async mode => {
  const response = new Response('{}');
  const reader = mode === 'locked' ? response.body!.getReader() : undefined;
  if (mode === 'used') await response.text();
  try { await expect(request('account', response)).rejects.toBeInstanceOf(TypeError); }
  finally { reader?.releaseLock(); }
 });
 it.each([new Error('cancel'), new DOMException('deadline', 'TimeoutError'), 'cancel'])('preserves signal reason at request boundary: %s', async reason => {
  const controller = new AbortController(); controller.abort(reason);
  const deps = createHttpAuthDeps('', { fetch: vi.fn().mockRejectedValue(reason) });
  await expect(deps.fetchAccount(controller.signal)).rejects.toBe(reason);
 });
 it('decodes split UTF-8 and BOM correctly and releases the reader lock', async () => {
  const bytes = new TextEncoder().encode('\uFEFF{"subject_id":"caf\u00e9","roles":[]}');
  let index = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
   if (index === bytes.length) { controller.close(); return; }
   controller.enqueue(bytes.slice(index, ++index));
  } });
  await expect(request('session', new Response(body))).resolves.toEqual({ subject_id: 'caf\u00e9', roles: [] });
  expect(body.locked).toBe(false);
 });
 it('does not treat an unrelated failure as cancellation merely because signal is aborted', async () => {
  const controller = new AbortController(); controller.abort(new Error('cancel'));
  const deps = createHttpAuthDeps('', { fetch: vi.fn().mockRejectedValue(new TypeError('independent socket failure')) });
  await expect(deps.fetchAccount(controller.signal)).rejects.toMatchObject({ code: 'network' });
 });
});
