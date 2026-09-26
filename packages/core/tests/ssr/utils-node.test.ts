import { expect, it } from 'vitest';
import { isServer, isBrowser } from '../../src/lib/ssr/utils';

it('detects the server in the actual Node runner without browser globals', () => {
  expect(typeof window).toBe('undefined');
  expect(typeof document).toBe('undefined');
  expect(isServer()).toBe(true);
  expect(isBrowser()).toBe(false);
});
