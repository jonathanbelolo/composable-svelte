/**
 * Browser integration tests for Product Gallery Example
 *
 * These tests use Vitest browser mode with Playwright to test actual user flows.
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/app/App.svelte';

// Helper to wait for DOM updates
const waitForUpdates = () => new Promise(resolve => setTimeout(resolve, 100));

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
      await userEvent.click(electronicsButton!);
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
      await userEvent.click(clothingButton!);
      await waitForUpdates();

      let productCards = container.querySelectorAll('[data-testid="product-card"]');
      const filteredCount = productCards.length;

      // Click again to deselect
      await userEvent.click(clothingButton!);
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
      const productCard = container.querySelector('[data-product-name="Wireless Headphones"]');
      expect(productCard).toBeTruthy();
      await userEvent.click(productCard!);
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
      const productCard = container.querySelector('[data-product-name="Wireless Headphones"]');
      await userEvent.click(productCard!);
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
      const productCard = container.querySelector('[data-product-name="Smart Watch"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Click Add to Cart button
      const modal = document.querySelector('[data-dialog-type="modal"]');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const addToCartButton = buttons.find(btn => btn.textContent?.includes('Add to Cart'));

      expect(addToCartButton).toBeTruthy();
      await userEvent.click(addToCartButton!);
      await waitForUpdates();

      // Sheet should be visible
      expect(document.body.textContent).toContain('Quantity');
    });

    test('increments quantity', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Navigate to Add to Cart sheet
      const productCard = container.querySelector('[data-product-name="Bluetooth Speaker"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      const modal = document.querySelector('[data-dialog-type="modal"]');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const addToCartButton = buttons.find(btn => btn.textContent?.includes('Add to Cart'));
      await userEvent.click(addToCartButton!);
      await waitForUpdates();

      // Click increment button
      const incrementButton = container.querySelector('button[aria-label="Increment quantity"]');
      if (incrementButton) {
        await userEvent.click(incrementButton);
        await waitForUpdates();

        // Verify quantity increased (would show "2")
        expect(container.textContent).toContain('2');
      }
    });
  });

  describe('Share Flow', () => {
    test('opens Share sheet when button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Open product detail
      const productCard = container.querySelector('[data-product-name="Cotton T-Shirt"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Click Share button
      const modal = document.querySelector('[data-dialog-type="modal"]');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const shareButton = buttons.find(btn => btn.textContent?.trim() === 'Share');

      expect(shareButton).toBeTruthy();
      await userEvent.click(shareButton!);
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
      const productCard = container.querySelector('[data-product-name="Yoga Mat"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Click Quick View
      const modal = document.querySelector('[data-dialog-type="modal"]');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const quickViewButton = buttons.find(btn => btn.textContent?.includes('Quick View'));

      expect(quickViewButton).toBeTruthy();
      await userEvent.click(quickViewButton!);
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
      const productCard = container.querySelector('[data-product-name="Smart Watch"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Click Delete
      const modal = document.querySelector('[data-dialog-type="modal"]');
      const buttons = Array.from(modal?.querySelectorAll('button') || []);
      const deleteButton = buttons.find(btn => btn.textContent?.trim() === 'Delete');

      expect(deleteButton).toBeTruthy();
      await userEvent.click(deleteButton!);
      await waitForUpdates();

      // Alert should be visible
      expect(document.body.textContent).toMatch(/Are you sure.*delete/i);
      expect(document.body.textContent).toContain('Cancel');
    });

    test('cancels delete and returns to product detail', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Navigate to delete alert
      const productCard = container.querySelector('[data-product-name="Bluetooth Speaker"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      const modal = document.querySelector('[data-dialog-type="modal"]');
      let buttons = Array.from(modal?.querySelectorAll('button') || []);
      const deleteButton = buttons.find(btn => btn.textContent?.trim() === 'Delete');
      await userEvent.click(deleteButton!);
      await waitForUpdates();

      // Click Cancel in the alert dialog
      const alert = document.querySelector('[data-dialog-type="alert"]');
      buttons = Array.from(alert?.querySelectorAll('button') || []);
      const cancelButton = buttons.find(btn => btn.textContent?.trim() === 'Cancel');

      expect(cancelButton).toBeTruthy();
      await userEvent.click(cancelButton!);
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
      const productCard = container.querySelector('[data-product-name="Wireless Headphones"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Click info button
      const infoButton = container.querySelector('button[aria-label="Info"]');
      if (infoButton) {
        await userEvent.click(infoButton);
        await waitForUpdates();

        // Popover should show product info
        expect(container.textContent).toContain('Product Information');
      }
    });
  });

  describe('Complex User Journey', () => {
    test('full user journey: filter → view product → add to cart → share', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Step 1: Filter by Electronics
      const sidebar = container.querySelector('[aria-label="Sidebar navigation"]');
      const sidebarButtons = Array.from(sidebar?.querySelectorAll('button') || []);
      const electronicsButton = sidebarButtons.find(btn => btn.textContent?.includes('Electronics'));
      await userEvent.click(electronicsButton!);
      await waitForUpdates();

      // Step 2: Click on a product
      const productCard = container.querySelector('[data-product-name="Wireless Headphones"]');
      await userEvent.click(productCard!);
      await waitForUpdates();

      // Step 3: Add to cart
      let modal = document.querySelector('[data-dialog-type="modal"]');
      let buttons = Array.from(modal?.querySelectorAll('button') || []);
      const addToCartButton = buttons.find(btn => btn.textContent?.includes('Add to Cart'));
      await userEvent.click(addToCartButton!);
      await waitForUpdates();

      // Step 4: Increment quantity
      const incrementButton = container.querySelector('button[aria-label="Increment quantity"]');
      if (incrementButton) {
        await userEvent.click(incrementButton);
        await waitForUpdates();
      }

      // Step 5: Confirm add to cart
      buttons = Array.from(container.querySelectorAll('button'));
      const addButton = buttons.filter(btn => btn.textContent?.trim() === 'Add').pop(); // Last "Add" button
      if (addButton) {
        await userEvent.click(addButton);
        await waitForUpdates();
      }

      // Step 6: Share the product
      modal = document.querySelector('[data-dialog-type="modal"]');
      buttons = Array.from(modal?.querySelectorAll('button') || []);
      const shareButton = buttons.find(btn => btn.textContent?.trim() === 'Share');
      if (shareButton) {
        await userEvent.click(shareButton);
        await waitForUpdates();

        // Step 7: Select Twitter
        buttons = Array.from(container.querySelectorAll('button'));
        const twitterButton = buttons.find(btn => btn.textContent?.includes('Twitter'));
        if (twitterButton) {
          await userEvent.click(twitterButton);
          await waitForUpdates();

          // Step 8: Complete share
          buttons = Array.from(container.querySelectorAll('button'));
          const finalShareButton = buttons.filter(btn => btn.textContent?.trim() === 'Share').pop();
          if (finalShareButton) {
            await userEvent.click(finalShareButton);
            await waitForUpdates();
          }
        }
      }

      // Should end up back at product detail
      expect(document.body.textContent).toContain('Product Details');
    });
  });
});
