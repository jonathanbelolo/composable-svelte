import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import type { ApplicationInstance } from '@composable-svelte/core/application';
import { nestedSlot, scopeTo } from '@composable-svelte/core/application';
import GalleryOwnerHarness from './GalleryOwnerHarness.svelte';
import {
  productDetailSlot
} from '../src/app/app.reducer.js';
import type { AppAction, AppState } from '../src/app/app.types.js';
import { productDetailDestinationSlot } from '../src/features/product-detail/product-detail.reducer.js';
import { SAMPLE_PRODUCTS } from '../src/models/sample-data.js';
import '../src/lib/styles.css';

const addSlot = nestedSlot(productDetailSlot, productDetailDestinationSlot.case('addToCart'));
const waitForPresentation = () => new Promise((resolve) => setTimeout(resolve, 400));

let previousURL: string;
afterEach(() => window.history.replaceState(null, '', previousURL));

function mountHarness() {
  previousURL = window.location.href;
  window.history.replaceState(null, '', '/');
  let app: ApplicationInstance<AppState, AppAction> | undefined;
  const rendered = render(GalleryOwnerHarness, { expose: (value: ApplicationInstance<AppState, AppAction>) => { app = value; } });
  if (!app) throw new Error('GalleryOwnerHarness must expose its application synchronously');
  return { app, ...rendered };
}

describe('gallery owner lifetime through visible exits', () => {
  test.each(['Escape', 'backdrop'] as const)(
    '%s retains the exact outer view and state through repeated exit requests',
    async (gesture) => {
      const { app, container } = mountHarness();
      container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]')!.click();
      await waitForPresentation();
      await vi.waitFor(
        () => expect(app.store.state.presentation.status).toBe('presented'),
        { timeout: 3_000 }
      );

      const owner = scopeTo(app.store, productDetailSlot)!;
      const exactState = owner.state;
      const modal = document.querySelector<HTMLElement>('[data-dialog-type="modal"]')!;
      const requestDismissal = async () => {
        if (gesture === 'Escape') {
          await userEvent.keyboard('{Escape}');
        } else {
          await page.elementLocator(modal.previousElementSibling as HTMLElement).click({
            position: { x: 8, y: 8 }
          });
        }
      };

      await requestDismissal();
      owner.dismiss();
      expect(scopeTo(app.store, productDetailSlot)).toBe(owner);
      expect(owner.state).toBe(exactState);
      expect(app.store.state.presentation).toMatchObject({ status: 'dismissing', duration: 200 });

      await vi.waitFor(() => expect(owner.state).toBeUndefined(), { timeout: 3_000 });
      expect(app.store.state.productDetail).toBeNull();
    }
  );

  test('retains an updated nested case owner through its 300ms exit', async () => {
    const { app, container } = mountHarness();
    container.querySelector<HTMLElement>('[data-product-name="Bluetooth Speaker"]')!.click();
    await waitForPresentation();
    await page.getByTestId('detail-add-to-cart').click();
    await waitForPresentation();
    await page.getByRole('button', { name: 'Increment quantity' }).click();

    const owner = scopeTo(app.store, addSlot)!;
    expect(owner.state?.quantity).toBe(2);
    const updatedState = owner.state;
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');

    expect(scopeTo(app.store, addSlot)).toBe(owner);
    expect(owner.state).toBe(updatedState);
    expect(app.store.state.productDetail?.presentation).toMatchObject({
      status: 'dismissing',
      duration: 300
    });

    await vi.waitFor(() => expect(owner.state).toBeUndefined(), { timeout: 3_000 });
    expect(scopeTo(app.store, productDetailSlot)?.state).toBeDefined();
  });

  test('an old captured completion cannot retire a replacement owner', async () => {
    const { app, container } = mountHarness();
    container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]')!.click();
    await waitForPresentation();
    await vi.waitFor(
      () => expect(app.store.state.presentation.status).toBe('presented'),
      { timeout: 3_000 }
    );
    const stale = scopeTo(app.store, productDetailSlot)!;
    stale.dismiss();
    expect(app.store.state.presentation.status).toBe('dismissing');

    app.store.dispatch({ type: 'productClicked', productId: SAMPLE_PRODUCTS[1]!.id });
    const successor = scopeTo(app.store, productDetailSlot)!;
    expect(successor).not.toBe(stale);
    await vi.waitFor(
      () => expect(app.store.state.presentation.status).toBe('presented'),
      { timeout: 3_000 }
    );
    successor.dismiss();
    const successorState = successor.state;
    expect(app.store.state.presentation.status).toBe('dismissing');
    stale.dispatch({ type: 'rootDismissalCompleted' });

    expect(stale.state).toBeUndefined();
    expect(scopeTo(app.store, productDetailSlot)).toBe(successor);
    expect(successor.state).toBe(successorState);
    expect(successor.state?.productId).toBe(SAMPLE_PRODUCTS[1]!.id);
    expect(app.store.state.presentation.status).toBe('dismissing');

    successor.dispatch({ type: 'rootDismissalCompleted' });
    expect(successor.state).toBeUndefined();
    expect(app.store.state.productDetail).toBeNull();
  });
});
