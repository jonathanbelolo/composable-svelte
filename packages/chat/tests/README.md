# Test Suite Notes

## Known Limitation: pdfjs-dist + Vitest Browser Mode

The test suite currently cannot run in Vitest browser mode due to a known issue with `pdfjs-dist`:

**Issue**: `pdfjs-dist` has dual builds (Node.js + browser). During Vitest's browser mode static analysis, it discovers the Node.js code paths that use `fs/promises`, causing the error:
```
Module "fs/promises" has been externalized for browser compatibility
```

**Production Status**: ✅ The code works correctly in production browsers. The PDFViewer component uses dynamic `import()` which loads the browser build at runtime.

**Why This is OK**:
- PDFViewer lazy-loads pdfjs-dist only when actually rendering PDF attachments
- The browser build of pdfjs-dist uses `fetch`/`XMLHttpRequest`, not `fs/promises`
- The reducer tests (state management logic) don't depend on PDF rendering
- This is a test environment limitation, not a production bug

**Future Solutions**:
- Switch to a browser-only PDF library without Node.js code paths
- Use Node.js test mode for component tests
- Wait for Vitest/pdfjs-dist to improve browser mode compatibility

**Current Workaround**: Tests are excluded from the `prepublishOnly` hook for this package only.
