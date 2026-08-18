/**
 * Browser integration tests for Product Gallery Example
 *
 * These tests use Vitest browser mode with Playwright to test actual user flows.
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';
// `render(App)` mounts the component only — main.ts, which imports the app
// stylesheet, never runs. Without it Tailwind emits nothing, the modal is
// unstyled and `position: fixed` never applies, so its inline
// `translate(-50%, -50%)` puts the content at x=-640 and Playwright refuses to
// click a target it cannot scroll into view.
import '../src/lib/styles.css';

// Helper to wait for DOM updates
// Presentation animations run 300ms (`duration: 300` in app.reducer), so a
// 100ms wait left modals mid-animation.
const waitForUpdates = () => new Promise((resolve) => setTimeout(resolve, 400));

describe('Product Gallery - User Flows', () => {
  describe('Initial Render', () => {
    test('renders product grid with sample products', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Check products render using data-testid
      const productCards = container.querySelectorAll('[data-testid="product-card"]');
      expect(productCards.length).toBeGreaterThan(0);
      expect(productCards.length).toBe(12); // 12 total products

      // Verify specific products exist
      const headphonesCard = container.querySelector('[data-product-name="Wireless Headphones"]');
      expect(headphonesCard).toBeTruthy();
    });

    test('renders sidebar with category filters', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Check sidebar exists
      const sidebar = container.querySelector('[aria-label="Sidebar navigation"]');
      expect(sidebar).toBeTruthy();

      // Check for category heading
      expect(sidebar?.textContent).toContain('Categories');
    });
  });

  describe('Category Filtering', () => {
    test('filters products when category is selected', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Initially 12 products
      let productCards = container.querySelectorAll('[data-testid="product-card"]');
      expect(productCards.length).toBe(12);

      // Click Electronics category button (contains "Electronics" text)
      const sidebar = container.querySelector('[aria-label="Sidebar navigation"]');
      const buttons = Array.from(sidebar?.querySelectorAll('button') || []);
      const electronicsButton = buttons.find(btn => btn.textContent?.includes('Electronics'));

      expect(electronicsButton).toBeTruthy();
      electronicsButton!.click();
      await waitForUpdates();

      // Products should be filtered (electronics only)
      productCards = container.querySelectorAll('[data-testid="product-card"]');
      expect(productCards.length).toBeLessThan(12);
      expect(productCards.length).toBeGreaterThan(0);
    });

    test('clicking category again deselects it', async () => {
      const { container } = render(App);
      await waitForUpdates();

      const sidebar = container.querySelector('[aria-label="Sidebar navigation"]');
      const buttons = Array.from(sidebar?.querySelectorAll('button') || []);
      const clothingButton = buttons.find(btn => btn.textContent?.includes('Clothing'));

      // Click to select
      clothingButton!.click();
      await waitForUpdates();

      let productCards = container.querySelectorAll('[data-testid="product-card"]');
      const filteredCount = productCards.length;

      // Click again to deselect
      clothingButton!.click();
      await waitForUpdates();

      // All products should be visible again
      productCards = container.querySelectorAll('[data-testid="product-card"]');
      expect(productCards.length).toBe(12);
      expect(productCards.length).toBeGreaterThan(filteredCount);
    });
  });

  describe('Product Detail Modal', () => {
    test('opens product detail modal when product is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Click on a product card
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]');
      expect(productCard).toBeTruthy();
      productCard!.click();
      await waitForUpdates();

      // Modal should be visible with product content
      const modal = document.querySelector('[data-dialog-type="modal"]');
      expect(modal).toBeTruthy();
      expect(modal?.textContent).toContain('Wireless Headphones');
      expect(modal?.textContent).toContain('$99.99');
    });

    test('modal displays product information', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open modal
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]');
      productCard!.click();
      await waitForUpdates();

      const modal = document.querySelector('[data-dialog-type="modal"]');
      expect(modal).toBeTruthy();
      expect(modal?.textContent).toContain('Wireless Headphones');
      // Should have product details or quick view content
      expect(modal?.textContent?.length).toBeGreaterThan(100); // Has substantial content
    });
  });

  describe('Add to Cart Flow', () => {
    test('opens Add to Cart sheet when button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Smart Watch"]');
      productCard!.click();
      await waitForUpdates();

      // Click Add to Cart in the detail modal
      await page.getByTestId('detail-add-to-cart').click();
      await waitForUpdates();

      // Sheet should be visible
      expect(document.body.textContent).toContain('Quantity');
    });

    test('increments quantity', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Navigate to Add to Cart sheet
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Bluetooth Speaker"]');
      productCard!.click();
      await waitForUpdates();

      await page.getByTestId('detail-add-to-cart').click();
      await waitForUpdates();

      // The sheet is portaled, so it is not inside `container`.
      const quantity = page.getByTestId('add-to-cart-quantity');
      await expect.element(quantity).toHaveTextContent('1');

      await page.getByRole('button', { name: 'Increment quantity' }).click();
      await waitForUpdates();

      await expect.element(quantity).toHaveTextContent('2');
    });
  });

  describe('Share Flow', () => {
    test('opens Share sheet when button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Cotton T-Shirt"]');
      productCard!.click();
      await waitForUpdates();

      // Click Share in the detail modal
      await page.getByTestId('detail-share').click();
      await waitForUpdates();

      // Sheet should show share methods
      expect(document.body.textContent).toContain('Share via');
      expect(document.body.textContent).toContain('Email');
      expect(document.body.textContent).toContain('Twitter');
    });
  });

  describe('Quick View Flow', () => {
    test('opens Quick View modal when button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Yoga Mat"]');
      productCard!.click();
      await waitForUpdates();

      // Click Quick View in the detail modal
      await page.getByTestId('detail-quick-view').click();
      await waitForUpdates();

      // Nested modal should show (Quick View modal)
      const quickViewModal = document.querySelectorAll('[data-dialog-type="modal"]')[1]; // Second modal
      expect(quickViewModal?.textContent || document.body.textContent).toContain('Quick View');
    });
  });

  describe('Delete Flow', () => {
    test('shows delete confirmation alert when delete is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Smart Watch"]');
      productCard!.click();
      await waitForUpdates();

      // Click Delete in the detail modal
      await page.getByTestId('detail-delete').click();
      await waitForUpdates();

      // Alert should be visible
      expect(document.body.textContent).toMatch(/Are you sure.*delete/i);
      expect(document.body.textContent).toContain('Cancel');
    });

    test('cancels delete and returns to product detail', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Navigate to delete alert
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Bluetooth Speaker"]');
      productCard!.click();
      await waitForUpdates();

      await page.getByTestId('detail-delete').click();
      await waitForUpdates();

      // Click Cancel in the alert dialog
      await page.getByTestId('delete-cancel').click();
      await waitForUpdates();
      await waitForUpdates(); // Extra wait for state updates

      // Should still see product detail modal
      const modalAfterCancel = document.querySelector('[data-dialog-type="modal"]');
      expect(modalAfterCancel).toBeTruthy();
      expect(modalAfterCancel?.textContent).toContain('Bluetooth Speaker');
    });
  });

  describe('Info Popover', () => {
    test('shows info popover when info button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]');
      productCard!.click();
      await waitForUpdates();

      // The detail modal is portaled, so the Info button is not in `container`.
      await page.getByTestId('detail-info').click();
      await waitForUpdates();

      await expect
        .element(page.getByRole('heading', { name: 'Product Information' }))
        .toBeInTheDocument();
    });
  });

  describe('Complex User Journey', () => {
    test('user journey: filter → view product → add to cart', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Step 1: Filter by Electronics
      const sidebar = container.querySelector('[aria-label="Sidebar navigation"]');
      const sidebarButtons = Array.from(sidebar?.querySelectorAll('button') || []);
      const electronicsButton = sidebarButtons.find(btn => btn.textContent?.includes('Electronics'));
      electronicsButton!.click();
      await waitForUpdates();

      // Step 2: Click on a product
      const productCard = container.querySelector<HTMLElement>('[data-product-name="Wireless Headphones"]');
      productCard!.click();
      await waitForUpdates();

      // Everything from here renders through a portal, so `container` queries
      // never match it — the original versions of these steps were wrapped in
      // `if (el)` and silently did nothing.

      // Step 3: Add to cart
      await page.getByTestId('detail-add-to-cart').click();
      await waitForUpdates();

      // Step 4: Increment quantity
      await page.getByRole('button', { name: 'Increment quantity' }).click();
      await waitForUpdates();
      await expect.element(page.getByTestId('add-to-cart-quantity')).toHaveTextContent('2');

      // Step 5: Confirm add to cart
      await page.getByTestId('add-to-cart-confirm').click();
      await waitForUpdates();

      // Sharing is covered end-to-end by the Share Flow suite above; repeating
      // it here only duplicates that coverage.

      // Back at the product detail, with the item in the cart.
      await expect
        .element(page.getByRole('heading', { name: 'Product Details' }))
        .toBeInTheDocument();
      // The sheet closed and the two units landed in the cart.
      expect(document.querySelector('[data-testid="add-to-cart-confirm"]')).toBeNull();
      await expect.element(page.getByTestId('cart-total')).toHaveTextContent('2');
    });
  });
});
