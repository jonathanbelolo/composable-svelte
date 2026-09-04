/**
 * Vitest Setup File
 *
 * Mock Node.js-only modules that can't run in browser test environment
 */

/**
 * `pdfjs-dist` is mocked by the `resolve.alias` in `vitest.config.ts`, which
 * points the specifier at `tests/__mocks__/pdfjs-dist.ts`. It reaches
 * `fs/promises` under browser-mode static analysis otherwise.
 *
 * There used to be a second mock here as well — `vi.mock('pdfjs-dist', () => ({
 * getDocument: vi.fn(), … }))` — and `vi.mock` wins over the alias, so the file
 * with the working implementation was never loaded and `getDocument()` handed
 * back `undefined`. `PDFViewer` therefore failed inside its own catch before
 * reaching anything worth asserting, which is a large part of why it had no
 * tests. One mock, in one place, is the fix.
 */
