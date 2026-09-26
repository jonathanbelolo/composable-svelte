import { expect, it } from 'vitest';
import * as actions from '../src/lib/actions/index.js';

it('keeps document coordinator seams private to the actions implementation', () => {
  const surface = actions as Record<string, unknown>;

  expect(typeof surface.focusTrap).toBe('function');
  expect(typeof surface.clickOutside).toBe('function');
  expect(typeof surface.portal).toBe('function');

  expect(surface.enrollLayer).toBeUndefined();
  expect(surface.registerDismissalLayer).toBeUndefined();
  expect(surface.requestNavigationFocus).toBeUndefined();
  expect(surface.rehomeAdoptedLayers).toBeUndefined();
});
