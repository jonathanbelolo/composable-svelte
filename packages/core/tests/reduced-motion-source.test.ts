import { it, expect, vi } from 'vitest';
import { expectConsole } from './helpers/console.js';
import * as animationBarrel from '../src/lib/animation/index.js';
import {
  prefersReducedMotion,
  watchReducedMotion,
  prefersReducedMotionIn,
  watchReducedMotionIn,
  connectMotionPreference,
  reportMotionPreferenceError
} from '../src/lib/animation/reduced-motion.js';

it('keeps injected-source helpers private from the animation barrel export surface', () => {
  expect('prefersReducedMotionIn' in animationBarrel).toBe(false);
  expect('watchReducedMotionIn' in animationBarrel).toBe(false);
  expect('connectMotionPreference' in animationBarrel).toBe(false);
  expect('reportMotionPreferenceError' in animationBarrel).toBe(false);
  expect(Object.keys(animationBarrel)).not.toContain('prefersReducedMotionIn');
  expect(Object.keys(animationBarrel)).not.toContain('watchReducedMotionIn');
  expect(typeof animationBarrel.prefersReducedMotion).toBe('function');
  expect(typeof animationBarrel.watchReducedMotion).toBe('function');
});

it('prefersReducedMotionIn returns false for missing or non-functional media sources', () => {
  expect(prefersReducedMotionIn(null)).toBe(false);
  expect(prefersReducedMotionIn(undefined)).toBe(false);
  expect(prefersReducedMotionIn({} as unknown as Window)).toBe(false);
  const throwingSource = {
    matchMedia: () => {
      throw new Error('matchMedia threw');
    }
  };
  expect(prefersReducedMotionIn(throwingSource)).toBe(false);
});

it('prefersReducedMotionIn correctly resolves matches boolean', () => {
  const trueSource = {
    matchMedia: vi.fn().mockReturnValue({ matches: true })
  };
  const falseSource = {
    matchMedia: vi.fn().mockReturnValue({ matches: false })
  };
  expect(prefersReducedMotionIn(trueSource)).toBe(true);
  expect(prefersReducedMotionIn(falseSource)).toBe(false);
  expect(trueSource.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
});

it('watchReducedMotionIn returns a no-op cleanup on missing or invalid sources without throwing', () => {
  const cleanup1 = watchReducedMotionIn(null, () => {});
  const cleanup2 = watchReducedMotionIn(undefined, () => {});
  const cleanup3 = watchReducedMotionIn({} as unknown as Window, () => {});
  expect(typeof cleanup1).toBe('function');
  expect(typeof cleanup2).toBe('function');
  expect(typeof cleanup3).toBe('function');
  cleanup1();
  cleanup2();
  cleanup3();
});

it('watchReducedMotionIn reads media.matches even for a plain Event("change") and contains throws', () => {
  let changeHandler!: (e: unknown) => void;
  let matchesValue = true;
  const mql = {
    get matches() {
      return matchesValue;
    },
    addEventListener: vi.fn((event: string, handler: (e: unknown) => void) => {
      changeHandler = handler;
    }),
    removeEventListener: vi.fn()
  };
  const source = {
    matchMedia: vi.fn().mockReturnValue(mql)
  };

  const received: boolean[] = [];
  const errors: unknown[] = [];
  const cleanup = watchReducedMotionIn(
    source,
    val => received.push(val),
    err => errors.push(err)
  );

  expect(source.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
  expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));

  // Plain event without .matches property (e.g. new Event('change'))
  changeHandler(new Event('change'));
  expect(received).toEqual([true]);

  matchesValue = false;
  changeHandler({ type: 'change' });
  expect(received).toEqual([true, false]);

  // Subscriber exception is caught and reported to onError
  const subscriberError = new Error('subscriber failed');
  const cleanupThrowing = watchReducedMotionIn(
    source,
    () => {
      throw subscriberError;
    },
    err => errors.push(err)
  );
  changeHandler(new Event('change'));
  expect(errors).toContain(subscriberError);

  cleanup();
  cleanupThrowing();
  expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
});

it('connectMotionPreference rolls back a partially throwing listener acquisition', async () => {
  const failure = new Error('add failed after partial install');
  let installed: (() => void) | undefined;
  const remove = vi.fn((_event: string, listener: () => void) => {
    if (installed === listener) installed = undefined;
  });
  const diagnostics: unknown[] = [];
  const connection = connectMotionPreference({
    matchMedia: vi.fn().mockReturnValue({
      matches: false,
      addEventListener(_event: string, listener: () => void) {
        installed = listener;
        throw failure;
      },
      removeEventListener: remove
    })
  }, () => {}, error => diagnostics.push(error));

  expect(connection).toBeUndefined();
  expect(remove).toHaveBeenCalledTimes(1);
  expect(installed).toBeUndefined();
  expect(diagnostics).toEqual([failure]);
  await Promise.resolve();
});

it('contains throwing and rejecting diagnostics plus async subscriber rejection', async () => {
  const rejection = new Error('async subscriber');
  const diagnosticRejection = new Error('diagnostic rejected');
  let listener!: () => void;
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, next: () => void) => { listener = next; }),
    removeEventListener: vi.fn(() => { throw new Error('remove failed'); })
  };
  const connection = connectMotionPreference(
    { matchMedia: () => media as unknown as MediaQueryList },
    () => Promise.reject(rejection),
    () => Promise.reject(diagnosticRejection)
  );
  expect(connection?.reduced).toBe(true);
  expect(() => listener()).not.toThrow();
  await Promise.resolve();
  await Promise.resolve();
  expect(() => connection?.dispose()).not.toThrow();
  reportMotionPreferenceError(() => { throw new Error('diagnostic threw'); }, new Error('source'));
  await Promise.resolve();
});

it('reads the acquired listener state after registration changes matches without emitting', () => {
  let matches = false;
  const remove = vi.fn();
  const connection = connectMotionPreference({
    matchMedia: () => ({
      get matches() { return matches; },
      addEventListener() { matches = true; },
      removeEventListener: remove
    } as unknown as MediaQueryList)
  }, () => {});

  expect(connection?.reduced).toBe(true);
  connection?.dispose();
  expect(remove).toHaveBeenCalledTimes(1);
});

it('reports an ambient source failure once and preserves the documented false fallback', () => {
  const failure = new Error('ambient matchMedia failed');
  const errors = expectConsole('error');
  vi.stubGlobal('window', {
    matchMedia() { throw failure; }
  });

  try {
    expect(prefersReducedMotion()).toBe(false);
    expect(errors).toEqual([
      ['[Composable Svelte] Reduced-motion preference error:', failure]
    ]);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('reports synchronous and asynchronous ambient subscriber failures without escaping', async () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: true,
    addEventListener: vi.fn((_event: string, listener: () => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_event: string, listener: () => void) => listeners.delete(listener))
  };
  vi.stubGlobal('window', { matchMedia: () => media });
  const synchronous = new Error('synchronous ambient subscriber');
  const asynchronous = new Error('asynchronous ambient subscriber');
  const errors = expectConsole('error', 2);

  try {
    const releaseSynchronous = watchReducedMotion(() => { throw synchronous; });
    const releaseAsynchronous = watchReducedMotion((() => Promise.reject(asynchronous)) as unknown as (reduced: boolean) => void);

    expect(() => listeners.forEach(listener => listener())).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
    expect(errors).toEqual([
      ['[Composable Svelte] Reduced-motion preference error:', synchronous],
      ['[Composable Svelte] Reduced-motion preference error:', asynchronous]
    ]);

    releaseSynchronous();
    releaseAsynchronous();
    expect(listeners.size).toBe(0);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('contains throwing and rejecting ambient diagnostic sinks', async () => {
  const sourceFailure = new Error('ambient source failed');
  vi.stubGlobal('window', {
    matchMedia() { throw sourceFailure; }
  });

  try {
    const consoleSpy = vi.spyOn(console, 'error');
    consoleSpy.mockImplementationOnce(() => { throw new Error('console threw'); });
    expect(() => prefersReducedMotion()).not.toThrow();

    consoleSpy.mockImplementationOnce((() => Promise.reject(new Error('console rejected'))) as unknown as typeof console.error);
    expect(prefersReducedMotion()).toBe(false);
    await Promise.resolve();
    await Promise.resolve();
    expect(consoleSpy).toHaveBeenCalledTimes(2);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
