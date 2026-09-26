import { afterEach, describe, expect, it, vi } from 'vitest';
import { deferred, scriptFetch } from './helpers/scripted-fetch';

afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });
const URL = 'http://localhost/scripted';
function request(controller: AbortController): Request { return new Request(URL, { signal: controller.signal }); }
function observe(promise: Promise<Response>) {
  return promise.then(response => ({ status: 'fulfilled' as const, response }), (error: unknown) => ({ status: 'rejected' as const, error }));
}
function aborted(result: Awaited<ReturnType<typeof observe>>) {
  expect(result).toMatchObject({ status: 'rejected', error: { name: 'AbortError' } });
}

describe('scriptFetch signal selection', () => {
  // JavaScript callers can supply explicit undefined even though the DOM
  // RequestInit type disallows it under exactOptionalPropertyTypes.
  const explicitUndefined: RequestInit = {};
  Object.defineProperty(explicitUndefined, 'signal', { value: undefined, enumerable: true });
  it.each([
    { name: 'omitted init', init: undefined },
    { name: 'empty init', init: {} },
    { name: 'explicit undefined', init: explicitUndefined }
  ])('inherits pre-aborted Request signal with $name', async ({ init }) => {
    const controller = new AbortController(); controller.abort();
    scriptFetch([{ match: '/scripted', body: 'ok' }]);
    aborted(await observe(fetch(request(controller), init)));
  });
  it('explicit null disables a pre-aborted Request signal', async () => {
    const controller = new AbortController(); controller.abort();
    scriptFetch([{ match: '/scripted', body: 'ok' }]);
    expect(await (await fetch(request(controller), { signal: null })).text()).toBe('ok');
  });
  it('a live init signal replaces Request cancellation and controls the wait', async () => {
    const requestOwner = new AbortController(); const initOwner = new AbortController(); const gate = deferred();
    scriptFetch([{ match: '/scripted', until: gate.promise, body: 'ok' }]);
    const input = request(requestOwner);
    const inheritedListener = vi.spyOn(input.signal, 'addEventListener');
    const activeListener = vi.spyOn(initOwner.signal, 'addEventListener');
    const result = observe(fetch(input, { signal: initOwner.signal }));
    expect(inheritedListener).not.toHaveBeenCalled();
    expect(activeListener).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });
    requestOwner.abort(); initOwner.abort(); gate.resolve();
    aborted(await result);
  });
  it('pre-aborted init rejects even when Request signal is live', async () => {
    const owner = new AbortController(); owner.abort();
    scriptFetch([{ match: '/scripted', body: 'ok' }]);
    aborted(await observe(fetch(new Request(URL), { signal: owner.signal })));
  });
  it('preserves string URL/init cancellation and recording', async () => {
    const owner = new AbortController(); owner.abort();
    const scripted = scriptFetch([{ match: '/scripted', body: 'ok' }]);
    aborted(await observe(fetch(URL, { signal: owner.signal })));
    expect(scripted.calls).toEqual([{ url: URL, init: { signal: owner.signal } }]);
  });
});

describe('scriptFetch delay ownership', () => {
  it('normal delay settlement removes the listener from the actual Request signal', async () => {
    vi.useFakeTimers(); const input = request(new AbortController());
    // Request clones its input signal; the owner controller is not the listener target.
    const add = vi.spyOn(input.signal, 'addEventListener');
    const remove = vi.spyOn(input.signal, 'removeEventListener');
    scriptFetch([{ match: '/scripted', delayMs: 50, body: { ok: true } }]);
    const pending = fetch(input);
    expect(vi.getTimerCount()).toBe(1);
    const listener = add.mock.calls[0]?.[1]; expect(listener).toBeTypeOf('function');
    vi.advanceTimersByTime(50);
    expect(await (await pending).json()).toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', listener);
  });
  it('live Request abort clears the pending delay timer and exact listener', async () => {
    vi.useFakeTimers(); const owner = new AbortController(); const input = request(owner);
    const add = vi.spyOn(input.signal, 'addEventListener'); const remove = vi.spyOn(input.signal, 'removeEventListener');
    scriptFetch([{ match: '/scripted', delayMs: 100, body: 'ok' }]);
    const pending = observe(fetch(input));
    expect(vi.getTimerCount()).toBe(1);
    const listener = add.mock.calls[0]?.[1]; expect(listener).toBeTypeOf('function');
    owner.abort();
    expect(vi.getTimerCount()).toBe(0);
    expect(remove).toHaveBeenCalledWith('abort', listener);
    aborted(await pending);
  });
});

describe('scriptFetch until ownership', () => {
  it('live Request abort rejects an active until wait and later gate settlement stays observed', async () => {
    const gate = deferred(); const owner = new AbortController(); const input = request(owner);
    const add = vi.spyOn(input.signal, 'addEventListener'); const remove = vi.spyOn(input.signal, 'removeEventListener');
    scriptFetch([{ match: '/scripted', until: gate.promise, body: 'ok' }]);
    const pending = observe(fetch(input));
    const listener = add.mock.calls[0]?.[1]; expect(listener).toBeTypeOf('function');
    owner.abort(); gate.reject(new Error('late route failure'));
    aborted(await pending);
    expect(remove).toHaveBeenCalledWith('abort', listener);
  });
  it('until success and rejection settle with listener cleanup', async () => {
    for (const failure of [false, true]) {
      const gate = deferred(); const input = request(new AbortController()); const cause = new Error('route failure');
      const add = vi.spyOn(input.signal, 'addEventListener'); const remove = vi.spyOn(input.signal, 'removeEventListener');
      scriptFetch([{ match: '/scripted', until: gate.promise, body: 'ok' }]);
      const pending = observe(fetch(input)); const listener = add.mock.calls[0]?.[1];
      expect(listener).toBeTypeOf('function');
      if (failure) gate.reject(cause); else gate.resolve();
      const result = await pending;
      if (failure) { expect(result.status).toBe('rejected'); if (result.status === 'rejected') expect(result.error).toBe(cause); }
      else { expect(result.status).toBe('fulfilled'); if (result.status === 'fulfilled') expect(await result.response.text()).toBe('ok'); }
      expect(remove).toHaveBeenCalledWith('abort', listener);
    }
  });
  it('honors abort after a plain delay settles but before the response returns', async () => {
    vi.useFakeTimers(); const owner = new AbortController();
    scriptFetch([{ match: '/scripted', delayMs: 50, body: 'ok' }]);
    const pending = observe(fetch(URL, { signal: owner.signal }));
    vi.advanceTimersByTime(50); owner.abort();
    aborted(await pending);
  });
  it('honors abort between until settlement and the async response continuation', async () => {
    const owner = new AbortController(); const gate = deferred();
    scriptFetch([{ match: '/scripted', until: gate.promise, body: 'ok' }]);
    const pending = observe(fetch(URL, { signal: owner.signal }));
    gate.resolve();
    // The gate reaction is queued first; resolving its wrapper then queues the
    // fetch continuation behind this explicitly scheduled cancellation.
    queueMicrotask(() => owner.abort());
    aborted(await pending);
  });
  it('aborts between delay settlement and until registration without losing gate rejection', async () => {
    vi.useFakeTimers(); const gate = deferred(); const owner = new AbortController();
    scriptFetch([{ match: '/scripted', delayMs: 50, until: gate.promise, body: 'ok' }]);
    const pending = observe(fetch(URL, { signal: owner.signal }));
    // Synchronous timer advancement resolves the delay, but has not resumed the
    // async fetch continuation. Abort specifically in that boundary interval.
    vi.advanceTimersByTime(50); owner.abort(); gate.reject(new Error('route failed after cancellation'));
    aborted(await pending);
    expect(vi.getTimerCount()).toBe(0);
  });
});
