import { describe, it, expect } from 'vitest';
import { isServer, isBrowser } from '../../src/lib/ssr/utils';

describe('isServer', () => {
  it('returns false in browser environment (vitest/jsdom)', () => {
    // In vitest with jsdom, window and document are defined
    expect(isServer()).toBe(false);
  });

  it('returns consistent results', () => {
    const result1 = isServer();
    const result2 = isServer();
    const result3 = isServer();

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it('checks for window and document globals', () => {
    // This test verifies the function works by checking its behavior
    // In browser environment (where we are now), it should return false
    expect(typeof window).not.toBe('undefined');
    expect(typeof document).not.toBe('undefined');
    expect(isServer()).toBe(false);
  });
});

describe('isBrowser', () => {
  it('returns true in browser environment (vitest/jsdom)', () => {
    expect(isBrowser()).toBe(true);
  });

  it('is opposite of isServer', () => {
    expect(isBrowser()).toBe(!isServer());
  });

  it('returns consistent results', () => {
    const result1 = isBrowser();
    const result2 = isBrowser();
    const result3 = isBrowser();

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });
});

describe('isServer and isBrowser are mutually exclusive', () => {
  it('exactly one is true at any time', () => {
    const server = isServer();
    const browser = isBrowser();

    // XOR: exactly one must be true
    expect(server !== browser).toBe(true);

    // More explicit
    if (server) {
      expect(browser).toBe(false);
    } else {
      expect(browser).toBe(true);
    }
  });

  it('in normal browser environment', () => {
    // Ensure we're in browser mode
    expect(typeof window).not.toBe('undefined');
    expect(typeof document).not.toBe('undefined');

    expect(isServer()).toBe(false);
    expect(isBrowser()).toBe(true);
  });
});
