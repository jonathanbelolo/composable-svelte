import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCookieStorage } from '../../src/lib/dependencies/cookie-storage.js';
import { createLocalStorage, createMockStorage } from '../../src/lib/dependencies/local-storage.js';

afterEach(() => {
  vi.restoreAllMocks();
  for (const part of document.cookie.split(';')) {
    document.cookie = `${part.trim().split('=')[0]}=; Max-Age=0; Path=/`;
  }
});

describe('independent storage ownership regressions', () => {
  it('clears visible prefixed cookies after adapter recreation, preserving unrelated cookies', () => {
    createCookieStorage<string>({prefix:'owned:'}).setItem('one','value');
    createCookieStorage<string>({prefix:'other:'}).setItem('one','untouched');
    const recreated = createCookieStorage<string>({prefix:'owned:'});
    recreated.clear();
    expect(recreated.getItem('one')).toBeNull();
    expect(createCookieStorage<string>({prefix:'other:'}).getItem('one')).toBe('untouched');
  });
  it('isolates malformed cookie encodings from healthy values', () => {
    const storage = createCookieStorage<string>({prefix:'healthy:'});
    storage.setItem('one','valid');
    document.cookie='bad%=broken%; Path=/';
    expect(storage.getItem('one')).toBe('valid');
    expect(storage.getItem('absent')).toBeNull();
  });
  it('attaches a listener only while subscriptions exist and independently releases duplicate callbacks', () => {
    const add = vi.spyOn(window,'addEventListener');
    const remove = vi.spyOn(window,'removeEventListener');
    const storage = createLocalStorage<string>({prefix:'lifetime:'});
    const storageAdds = () => add.mock.calls.filter(([name]) => name === 'storage');
    expect(storageAdds()).toHaveLength(0);
    const callback=vi.fn();
    const stop1=storage.subscribe(callback);
    const stop2=storage.subscribe(callback);
    try {
      expect(storageAdds()).toHaveLength(1);
      stop1(); stop1();
      window.dispatchEvent(new StorageEvent('storage',{key:'lifetime:key',newValue:'"value"',storageArea:localStorage}));
      expect(callback).toHaveBeenCalled();
      callback.mockClear();
      stop2();
      window.dispatchEvent(new StorageEvent('storage',{key:'lifetime:key',newValue:'"later"',storageArea:localStorage}));
      expect(callback).not.toHaveBeenCalled();
      const removed=remove.mock.calls.filter(([name]) => name === 'storage');
      expect(removed).toHaveLength(1);
      expect(removed[0]?.[1]).toBe(storageAdds()[0]?.[1]);
    } finally { stop1();stop2(); }
  });
});

for (const kind of ['real', 'mock'] as const) {
  it(`${kind} skips a subscription removed by an earlier callback`, () => {
    const mock = kind === 'mock' ? createMockStorage<string>({prefix:'stop:'}) : null;
    const storage = mock ?? createLocalStorage<string>({prefix:'stop:'});
    const later = vi.fn();
    let stopLater = () => {};
    const stopFirst = storage.subscribe(() => stopLater());
    stopLater = storage.subscribe(later);
    try {
      if (mock) mock.simulateSetItem('key','value');
      else window.dispatchEvent(new StorageEvent('storage',{key:'stop:key',newValue:'"value"',storageArea:localStorage}));
      expect(later).not.toHaveBeenCalled();
    } finally { stopFirst();stopLater(); }
  });
}

it('keeps the configured cookie domain in fallback removal', () => {
  const write = vi.spyOn(document, 'cookie', 'set');
  createCookieStorage({prefix:'domain:',domain:'example.test'}).removeItem('key');
  expect(write).toHaveBeenCalledWith('domain%3Akey=; Path=/; Max-Age=0; Domain=example.test');
});
