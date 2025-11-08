# Visual Regression Tests

Visual regression tests for chart rendering using Playwright.

## Setup

Visual regression tests require a running development server to capture screenshots of rendered charts.

### Prerequisites

1. Install Playwright browsers:
   ```bash
   pnpm exec playwright install
   ```

2. Start the styleguide dev server:
   ```bash
   cd examples/styleguide
   pnpm dev
   ```

## Running Visual Tests

```bash
# Run visual regression tests
pnpm test:visual

# Update snapshots
pnpm test:visual:update
```

## Test Structure

Visual tests are organized by chart type:

- `scatter-plot.visual.test.ts` - Scatter plot rendering
- `line-chart.visual.test.ts` - Line chart rendering
- `bar-chart.visual.test.ts` - Bar chart rendering
- `histogram.visual.test.ts` - Histogram rendering

## Adding New Visual Tests

```typescript
import { test, expect } from '@playwright/test';

test('scatter plot renders correctly', async ({ page }) => {
  // Navigate to chart demo
  await page.goto('http://localhost:5173/charts/scatter');

  // Wait for chart to render
  await page.waitForSelector('svg', { timeout: 5000 });

  // Wait for animation to complete
  await page.waitForTimeout(500);

  // Take screenshot and compare
  await expect(page).toHaveScreenshot('scatter-plot.png', {
    maxDiffPixels: 100 // Allow small rendering differences
  });
});
```

## Debugging Visual Failures

When visual tests fail:

1. Check the diff images in `tests/visual/__screenshots__/`
2. Review the actual vs expected images
3. If changes are intentional, update snapshots with `--update-snapshots`

## Best Practices

1. **Wait for SVG**: Always wait for the `<svg>` element to appear
2. **Wait for Animations**: Add a small delay after render to let animations complete
3. **Stable Data**: Use fixed data in tests to ensure consistent rendering
4. **Tolerance**: Set `maxDiffPixels` to handle minor rendering differences
5. **Viewport**: Use consistent viewport sizes across tests

## CI/CD Integration

Visual tests should run in CI with:
- Headless browser mode
- Consistent viewport (1280x720)
- Screenshot comparison with tolerance
- Failure artifacts uploaded for review
