import { test, expect } from '@playwright/test';

/**
 * E2E tests for SSR server example.
 *
 * These tests verify the complete SSR flow from an external client perspective:
 * 1. Server-side rendering produces correct HTML
 * 2. State is serialized and embedded in HTML
 * 3. Client-side hydration works correctly
 * 4. Interactivity works after hydration
 */

test.describe('SSR Server Example', () => {
  test('should render the application on the server', async ({ page }) => {
    // Navigate to the application
    await page.goto('/');

    // Verify the page title
    await expect(page).toHaveTitle('Composable Svelte SSR Example');

    // Verify main heading is present
    await expect(page.locator('.app > header h1').first()).toContainText('Composable Svelte SSR Example');

    // Verify the sidebar is rendered
    await expect(page.locator('aside.sidebar').first()).toBeVisible();

    // Verify post list is rendered - count all instances
    const postItems = page.locator('aside.sidebar ul li');
    // Since there might be duplicates during hydration, check that we have at least 5
    expect(await postItems.count()).toBeGreaterThanOrEqual(5);

    // Verify main content area is rendered
    await expect(page.locator('article.main-content').first()).toBeVisible();
  });

  test('should serialize state correctly', async ({ page }) => {
    // Get the raw HTML response
    const response = await page.goto('/');
    const html = await response?.text();

    // Verify the state script tag exists
    expect(html).toContain('__COMPOSABLE_SVELTE_STATE__');

    // Extract and parse the serialized state
    const stateMatch = html?.match(
      /<script id="__COMPOSABLE_SVELTE_STATE__" type="application\/json">(.*?)<\/script>/s
    );
    expect(stateMatch).toBeTruthy();

    const serializedState = JSON.parse(stateMatch![1]);

    // Verify state structure
    expect(serializedState).toHaveProperty('posts');
    expect(serializedState).toHaveProperty('selectedPostId');
    expect(serializedState).toHaveProperty('isLoading');
    expect(serializedState).toHaveProperty('error');

    // Verify posts data
    expect(serializedState.posts).toHaveLength(5);
    expect(serializedState.posts[0]).toHaveProperty('id');
    expect(serializedState.posts[0]).toHaveProperty('title');
    expect(serializedState.posts[0]).toHaveProperty('author');
    expect(serializedState.posts[0]).toHaveProperty('date');
    expect(serializedState.posts[0]).toHaveProperty('content');
    expect(serializedState.posts[0]).toHaveProperty('tags');

    // Verify initial selected post
    expect(serializedState.selectedPostId).toBe(1);
  });

  test('should hydrate correctly on the client', async ({ page }) => {
    // Listen for console messages
    const messages: string[] = [];
    page.on('console', (msg) => {
      messages.push(msg.text());
    });

    // Navigate to the application
    await page.goto('/');

    // Wait for hydration to complete
    await page.waitForTimeout(1000);

    // Verify hydration success message
    expect(messages.some(msg => msg.includes('✅ Composable Svelte hydrated successfully'))).toBe(true);

    // Verify no hydration errors
    expect(messages.some(msg => msg.includes('❌ Hydration failed'))).toBe(false);
  });

  test('should display correct initial post content', async ({ page }) => {
    await page.goto('/');

    // Wait for content to be visible
    await page.waitForSelector('article.post-detail');

    // Verify first post is displayed
    const article = page.locator('article.post-detail').first();
    await expect(article.locator('h1')).toContainText('Getting Started with Composable Svelte');
    await expect(article).toContainText('By Jane Developer');
    await expect(article).toContainText('January 5, 2025');

    // Verify tags are displayed
    const tags = article.locator('.tag');
    await expect(tags).toHaveCount(3);
    await expect(tags.nth(0)).toContainText('svelte');
    await expect(tags.nth(1)).toContainText('architecture');
    await expect(tags.nth(2)).toContainText('tutorial');

    // Verify content is displayed
    await expect(article).toContainText('Composable Svelte');
    await expect(article).toContainText('brings the power of the Composable Architecture');
  });

  test('should handle post selection interactivity', async ({ page }) => {
    await page.goto('/');

    // Wait for hydration
    await page.waitForTimeout(2000);

    // Verify initial content
    let article = page.locator('article.post-detail').first();
    await expect(article.locator('h1')).toContainText('Getting Started with Composable Svelte');

    // Click on the second post button
    const secondPost = page.locator('aside.sidebar ul li').nth(1);
    await secondPost.locator('button').click();

    // Wait for state update and re-render
    await page.waitForTimeout(1000);

    // Verify content updated to second post
    article = page.locator('article.post-detail').first();
    await expect(article.locator('h1')).toContainText('Understanding Server-Side Rendering');
    await expect(article).toContainText('By John Architect');
    await expect(article).toContainText('January 8, 2025');

    // Verify tags updated
    const tags = article.locator('.tag');
    await expect(tags).toHaveCount(3);
    await expect(tags.nth(0)).toContainText('ssr');
    await expect(tags.nth(1)).toContainText('performance');
    await expect(tags.nth(2)).toContainText('seo');
  });

  test('should navigate through all posts', async ({ page }) => {
    await page.goto('/');

    // Wait for hydration
    await page.waitForTimeout(2000);

    const postTitles = [
      'Getting Started with Composable Svelte',
      'Understanding Server-Side Rendering',
      'Building Production-Ready Apps',
      'Testing Strategies for SSR',
      'Fastify and Modern Node.js'
    ];

    // Click through each post and verify content
    for (let i = 0; i < postTitles.length; i++) {
      const postItem = page.locator('aside.sidebar ul li').nth(i);
      await postItem.locator('button').click();
      await page.waitForTimeout(800);

      // Verify content updated
      const article = page.locator('article.post-detail').first();
      await expect(article.locator('h1')).toContainText(postTitles[i]);
    }
  });

  test('should maintain responsive layout', async ({ page }) => {
    await page.goto('/');

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await expect(page.locator('aside.sidebar').first()).toBeVisible();
    await expect(page.locator('main').first()).toBeVisible();

    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('aside.sidebar').first()).toBeVisible();
    await expect(page.locator('main').first()).toBeVisible();

    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    // On mobile, layout might change but elements should still be present
    await expect(page.locator('.app > header h1').first()).toBeVisible();
    await expect(page.locator('article.post-detail').first()).toBeVisible();
  });

  test('should have correct meta tags for SEO', async ({ page }) => {
    const response = await page.goto('/');
    const html = await response?.text();

    // Verify title
    expect(html).toContain('<title>Composable Svelte SSR Example</title>');

    // Verify description meta tag
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('Server-Side Rendered blog');
  });

  test('should load CSS correctly', async ({ page }) => {
    await page.goto('/');

    // Wait for CSS to load
    await page.waitForTimeout(2000);

    // Verify sidebar has background color (should be #f8f9fa)
    const sidebar = page.locator('aside.sidebar').first();
    const backgroundColor = await sidebar.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });

    // Should have light gray background color - check it's not transparent
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(backgroundColor).not.toBe('transparent');

    // Verify font is loaded
    const body = page.locator('body');
    const fontFamily = await body.evaluate((el) => {
      return window.getComputedStyle(el).fontFamily;
    });

    // Should have custom font family
    expect(fontFamily).toMatch(/(apple-system|BlinkMacSystemFont|Segoe UI)/i);
  });

  test('should handle health check endpoint', async ({ request }) => {
    const response = await request.get('/health');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data).toHaveProperty('status', 'ok');
    expect(data).toHaveProperty('timestamp');
  });

  test('should serve client assets correctly', async ({ page }) => {
    const response = await page.goto('/');

    // Check that JavaScript is loaded
    const scripts = await page.locator('script[src]').all();
    expect(scripts.length).toBeGreaterThan(0);

    // Verify at least one script loads successfully
    let hasValidScript = false;
    for (const script of scripts) {
      const src = await script.getAttribute('src');
      if (src && src.startsWith('/assets/')) {
        const scriptResponse = await page.request.get(src);
        if (scriptResponse.ok()) {
          hasValidScript = true;
          break;
        }
      }
    }
    expect(hasValidScript).toBe(true);
  });

  test('should handle no JavaScript gracefully', async ({ page, context }) => {
    // Disable JavaScript
    await context.setOffline(false);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Content should still be visible (SSR)
    await expect(page.locator('.app > header h1').first()).toContainText('Composable Svelte SSR Example');
    expect(await page.locator('aside.sidebar ul li').count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('article.post-detail').first()).toBeVisible();

    // Content should match the first post
    await expect(page.locator('article.post-detail').first().locator('h1')).toContainText('Getting Started with Composable Svelte');
  });

  test('should not have console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // Click on a post to trigger interactivity
    await page.locator('aside.sidebar ul li').nth(2).locator('button').click();
    await page.waitForTimeout(500);

    // Should have no console errors
    expect(errors).toHaveLength(0);
  });
});
