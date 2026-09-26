import { afterEach, expect, it, vi } from 'vitest';
import { waitForState } from './helpers/wait-for-state.js';

afterEach(() => vi.useRealTimers());

function observable(initial: number) {
  const listeners = new Set<(value: number) => void>();
  const unsubscribe = vi.fn((listener: (value: number) => void) => listeners.delete(listener));
  return {
    listeners, unsubscribe,
    subscribe(listener: (value: number) => void) {
      listeners.add(listener);
      listener(initial);
      return () => { unsubscribe(listener); };
    },
    emit(value: number) { for (const listener of [...listeners]) listener(value); }
  };
}

it('releases a synchronously matching subscription exactly once', async () => {
  vi.useFakeTimers();
  const store = observable(7);
  await expect(waitForState(store, value => value === 7)).resolves.toBe(7);
  expect(store.listeners.size).toBe(0);
  expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
  store.emit(7);
  expect(store.unsubscribe).toHaveBeenCalledTimes(1);
});

it('releases a later matching subscription and its timeout', async () => {
  vi.useFakeTimers();
  const store = observable(0);
  const result = waitForState(store, value => value === 2);
  expect(store.listeners.size).toBe(1);
  store.emit(1);
  expect(store.listeners.size).toBe(1);
  store.emit(2);
  await expect(result).resolves.toBe(2);
  expect(store.listeners.size).toBe(0);
  expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases the subscription when the timeout rejects', async () => {
  vi.useFakeTimers();
  const store = observable(0);
  const result = waitForState(store, value => value === 2, { timeout: 25, description: 'two' });
  const rejected = expect(result).rejects.toThrow('Timeout waiting for two after 25ms');
  await vi.advanceTimersByTimeAsync(25);
  await rejected;
  expect(store.listeners.size).toBe(0);
  expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it.each([true, false])('cleans up when a predicate throws (initial=%s)', async initial => {
  vi.useFakeTimers();
  const store = observable(0);
  const failure = new Error('predicate');
  const result = waitForState(store, value => {
    if (initial || value === 1) throw failure;
    return false;
  });
  const rejected = expect(result).rejects.toBe(failure);
  if (!initial) store.emit(1);
  await rejected;
  expect(store.listeners.size).toBe(0);
  expect(store.unsubscribe).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});
