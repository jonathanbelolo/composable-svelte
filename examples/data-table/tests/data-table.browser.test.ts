/**
 * Browser integration tests for DataTable Example
 *
 * These tests use Vitest browser mode with Playwright to test actual user flows.
 */

import { expect, test, describe } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import App from '../src/App.svelte';

// Helper to wait for DOM updates
const waitForUpdates = () => new Promise(resolve => setTimeout(resolve, 100));

describe('DataTable - User Flows', () => {
  describe('Initial Render', () => {
    test('renders table with paginated products', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Should show 5 rows (pageSize: 5)
      const rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(5);

      // Verify first row is Laptop
      const firstRow = container.querySelector('[data-testid="table-row-1"]');
      expect(firstRow?.textContent).toContain('Laptop');
      expect(firstRow?.textContent).toContain('$999');
    });

    test('renders pagination controls', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Check pagination info
      const paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo).toBeTruthy();
      expect(paginationInfo?.textContent).toContain('1-5 of 15');
    });
  });

  describe('Filtering', () => {
    test('filters products when Filter Electronics button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Initially 15 products, showing first 5
      let rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(5);

      // Click Filter Electronics button
      const filterBtn = container.querySelector('[data-testid="filter-electronics-btn"]');
      expect(filterBtn).toBeTruthy();
      await userEvent.click(filterBtn!);
      await waitForUpdates();

      // Should now show only 5 Electronics products (out of 6 total)
      rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(5);

      // All visible rows should be Electronics
      rows.forEach((row) => {
        expect(row.textContent).toContain('Electronics');
      });

      // Pagination should show 6 total electronics
      const paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('1-5 of 6');
    });

    test('clears filters when Clear Filters button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // First filter
      const filterBtn = container.querySelector('[data-testid="filter-electronics-btn"]');
      await userEvent.click(filterBtn!);
      await waitForUpdates();

      let paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('6'); // 6 electronics

      // Now clear filters
      const clearBtn = container.querySelector('[data-testid="clear-filters-btn"]');
      expect(clearBtn).toBeTruthy();
      await userEvent.click(clearBtn!);
      await waitForUpdates();

      // Should show all 15 products again
      paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('1-5 of 15');
    });
  });

  describe('Sorting', () => {
    test('sorts products when column header is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Click Price column header to sort ascending
      const priceHeader = container.querySelectorAll('button[class*="h-8"]')[1]; // Second column is Price
      expect(priceHeader).toBeTruthy();
      await userEvent.click(priceHeader!);
      await waitForUpdates();

      // First row should now be Pencil ($1)
      const firstRow = container.querySelector('[data-testid^="table-row-"]');
      expect(firstRow?.textContent).toContain('Pencil');
      expect(firstRow?.textContent).toContain('$1');

      // Click again to sort descending
      await userEvent.click(priceHeader!);
      await waitForUpdates();

      // First row should now be Laptop ($999)
      const newFirstRow = container.querySelector('[data-testid^="table-row-"]');
      expect(newFirstRow?.textContent).toContain('Laptop');
      expect(newFirstRow?.textContent).toContain('$999');
    });
  });

  describe('Pagination', () => {
    test('navigates to next page when next button is clicked', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Verify we're on page 1
      let paginationInfo = container.querySelector('[data-testid="page-indicator"]');
      expect(paginationInfo?.textContent).toContain('Page 1 of 3');

      // Click next page button
      const nextBtn = container.querySelectorAll('button[aria-label*="next"]')[0];
      expect(nextBtn).toBeTruthy();
      await userEvent.click(nextBtn!);
      await waitForUpdates();

      // Should now be on page 2
      paginationInfo = container.querySelector('[data-testid="page-indicator"]');
      expect(paginationInfo?.textContent).toContain('Page 2 of 3');

      // Should show different products
      const rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(5);
    });

    test('changes page size when dropdown is changed', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // Find the page size dropdown
      const pageSizeSelect = container.querySelector('select');
      expect(pageSizeSelect).toBeTruthy();

      // Change to 10 items per page
      await userEvent.selectOptions(pageSizeSelect!, '10');
      await waitForUpdates();

      // Should now show 10 rows
      const rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(10);

      // Pagination should show 1-10 of 15
      const paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('1-10 of 15');
    });
  });

  describe('Combined Operations', () => {
    test('filter + sort + pagination work together', async () => {
      const { container } = render(App);
      await waitForUpdates();

      // 1. Filter to Electronics
      const filterBtn = container.querySelector('[data-testid="filter-electronics-btn"]');
      await userEvent.click(filterBtn!);
      await waitForUpdates();

      // Should show 6 electronics
      let paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('6');

      // 2. Sort by Price (ascending)
      const priceHeader = container.querySelectorAll('button[class*="h-8"]')[1];
      await userEvent.click(priceHeader!);
      await waitForUpdates();

      // First product should be Mouse ($25)
      let firstRow = container.querySelector('[data-testid^="table-row-"]');
      expect(firstRow?.textContent).toContain('Mouse');
      expect(firstRow?.textContent).toContain('$25');

      // 3. Change page size to 3
      const pageSizeSelect = container.querySelector('select');
      await userEvent.selectOptions(pageSizeSelect!, '3');
      await waitForUpdates();

      // Should show 3 rows
      const rows = container.querySelectorAll('[data-testid^="table-row-"]');
      expect(rows.length).toBe(3);

      // Should show 1-3 of 6
      paginationInfo = container.querySelector('.flex.items-center.justify-between');
      expect(paginationInfo?.textContent).toContain('1-3 of 6');
    });
  });
});
