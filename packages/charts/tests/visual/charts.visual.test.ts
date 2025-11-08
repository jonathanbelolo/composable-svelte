/**
 * Visual regression tests for chart rendering
 *
 * These tests capture screenshots of rendered charts and compare them against
 * baseline snapshots to detect unintended visual changes.
 *
 * To run these tests:
 * 1. Start the styleguide dev server: cd examples/styleguide && pnpm dev
 * 2. Run: pnpm test:visual
 *
 * To update snapshots: pnpm test:visual:update
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Chart Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for screenshots
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('scatter plot renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    // Wait for SVG to render
    await page.waitForSelector('svg', { timeout: 10000 });

    // Wait for animations to complete
    await page.waitForTimeout(500);

    // Find the scatter chart container
    const scatterChart = page.locator('[aria-label*="scatter chart"]').first();

    // Take screenshot
    await expect(scatterChart).toHaveScreenshot('scatter-plot.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('line chart renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    const lineChart = page.locator('[aria-label*="line chart"]').first();

    await expect(lineChart).toHaveScreenshot('line-chart.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('bar chart renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    const barChart = page.locator('[aria-label*="bar chart"]').first();

    await expect(barChart).toHaveScreenshot('bar-chart.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('histogram renders correctly', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    const histogram = page.locator('[aria-label*="histogram"]').first();

    await expect(histogram).toHaveScreenshot('histogram.png', {
      maxDiffPixels: 100,
      threshold: 0.2
    });
  });

  test('chart with zoom interaction', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Find chart with zoom controls
    const zoomChart = page.locator('[aria-label*="chart"]').first();

    // Capture initial state
    await expect(zoomChart).toHaveScreenshot('chart-initial.png', {
      maxDiffPixels: 100
    });

    // Click zoom in button
    await page.click('button:has-text("Zoom In"), button >> svg.lucide-zoom-in');
    await page.waitForTimeout(500);

    // Capture zoomed state
    await expect(zoomChart).toHaveScreenshot('chart-zoomed.png', {
      maxDiffPixels: 150 // Allow more variance after interaction
    });
  });

  test('chart with brush selection', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    const chart = page.locator('[aria-label*="scatter chart"]').first();

    // Capture before selection
    await expect(chart).toHaveScreenshot('chart-no-selection.png', {
      maxDiffPixels: 100
    });

    // Switch to brush mode
    const brushButton = page.locator('button:has-text("Brush Mode")');
    if (await brushButton.isVisible()) {
      await brushButton.click();
      await page.waitForTimeout(300);

      // Perform brush selection (drag)
      const svg = chart.locator('svg');
      const box = await svg.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 100, box.y + 100);
        await page.mouse.down();
        await page.mouse.move(box.x + 300, box.y + 300);
        await page.mouse.up();
        await page.waitForTimeout(300);

        // Capture with selection
        await expect(chart).toHaveScreenshot('chart-with-selection.png', {
          maxDiffPixels: 200
        });
      }
    }
  });

  test('responsive chart resizing', async ({ page }) => {
    await page.goto(`${BASE_URL}/charts`);

    await page.waitForSelector('svg', { timeout: 10000 });
    await page.waitForTimeout(500);

    // Desktop view
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(300);

    const chart = page.locator('[aria-label*="chart"]').first();
    await expect(chart).toHaveScreenshot('chart-desktop.png', {
      maxDiffPixels: 100
    });

    // Tablet view
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);

    await expect(chart).toHaveScreenshot('chart-tablet.png', {
      maxDiffPixels: 100
    });

    // Mobile view
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);

    await expect(chart).toHaveScreenshot('chart-mobile.png', {
      maxDiffPixels: 100
    });
  });
});
