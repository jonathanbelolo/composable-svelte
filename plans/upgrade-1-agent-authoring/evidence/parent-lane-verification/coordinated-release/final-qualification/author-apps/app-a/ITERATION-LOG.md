# Iteration and Repair Log

## 1. Exact Environment & Tooling Versions

- **Node.js**: `v24.10.0`
- **npm**: `11.6.0`
- **Vite**: `7.3.6`
- **Vitest**: `4.0.7`
- **Playwright**: `1.56.1`
- **TypeScript**: `5.9.3`
- **svelte-check**: `4.3.3`
- **Svelte**: `5.55.3`
- **@composable-svelte/core**: `0.13.1` (installed frozen tarball: `composable-svelte-core-0.13.1.tgz`)
- **@composable-svelte/code**: `0.5.0` (installed frozen tarball: `composable-svelte-code-0.5.0.tgz`)
- **@composable-svelte/media**: `0.5.0` (installed frozen tarball: `composable-svelte-media-0.5.0.tgz`)
- **@composable-svelte/chat**: `0.5.0` (installed frozen tarball: `composable-svelte-chat-0.5.0.tgz`)

---

## 2. Iteration, Diagnostics, and Repair Chronology

### Iteration 1: Package Investigation & Architecture Design
- Inspected installed packages in `node_modules/@composable-svelte` and their shipped documentation.
- Read core contract (`application-contract.md`), ownership guide (`application-ownership.md`), views guide (`application-views.md`), and agent patterns (`agent-patterns.md`).
- Designed application architecture:
  - Root model in `src/model.ts`: `WorkspaceState`, `WorkspaceAction`, `workspaceReducer`.
  - Durable outcomes owned by parent reducer:
    - Completed assistant responses recorded in `conversations[id].completedResponses` upon receiving child `streamComplete`.
    - Voice recordings transcribed and attributed to `conversations[id].transcripts` upon receiving child `transcriptionCompleted`.
    - Code drafts synchronized to `conversations[id].draftCode` upon receiving child `valueChanged`.
  - Feature slot integration with `ManagedIntegrationBuilder`:
    - `chat`: `optionalSlot` composed with `streamingChatReducer`.
    - `editor`: `optionalSlot` composed with `codeEditorReducer`.
    - `voice`: `optionalSlot` composed with `voiceInputReducer`.
    - `replaceOn: isConversationReplacement`: ensures conversation replacement creates a new owner token, aborts predecessor streams, and rejects late predecessor callbacks.
  - Implemented `createFakeWorkspaceDependencies` in `src/dependencies.ts` with explicit qualification boundary documentation.
  - Implemented `ChatView.svelte`, `EditorView.svelte`, `VoiceView.svelte`, and `workspaceViews` with `defineViews`.
  - Implemented `Workspace.svelte` (full UI with conversation switcher, live command toolbar, chat, editor, voice, and media display) and `App.svelte` (`ApplicationRoot` and `ApplicationHost`).

### Iteration 2: Build Pipeline Diagnostic & Repair
- **Symptom:** `npx vite build` failed with `Expected ',', got '?'` in `@xyflow/svelte/dist/lib/components/KeyHandler/KeyHandler.svelte:24:26`.
- **Root Cause:** `@xyflow/svelte` (peer dependency of `@composable-svelte/code`) contains TypeScript syntax in its shipped `.svelte` components. Without a Svelte preprocessor, Rollup/Vite attempts to parse it as plain JavaScript.
- **Repair:** Created `svelte.config.js` with `vitePreprocess({ script: true })` from `@sveltejs/vite-plugin-svelte`, matching the shipped pattern in `node_modules/@composable-svelte/code/recipes/managed/svelte.config.js`.
- **Verification:** `npx vite build` succeeded in 2.65s, generating `dist/index.html` and bundled client assets.

### Iteration 3: TestStore Assertion Calibration
- **Symptom:** In `tests/workspace.test.ts`, `store.receive()` failed to match `{ type: 'chunkReceived', chunk: '...' }` because the received action also contained `streamId: '1'`. Also, `sendDraftToChat` timed out waiting for subscription teardown during `finish()`.
- **Root Cause:**
  1. `TestStore.receive` compares nested objects structurally with full JSON equality, so nested child action matches must match all fields produced by the child reducer or relax exhaustiveness for that step.
  2. `streamingChatReducer` maintains an active subscription for the stream until `streamComplete` or cancellation.
- **Repair:**
  1. Included `streamId: '1'` in `chunkReceived` and `streamComplete` matchers.
  2. Completed the stream in `sendDraftToChat` before invoking `store.finish()`.
- **Verification:** All 7 unit/integration tests in `tests/workspace.test.ts` passed.

### Iteration 4: Component DOM Testing & Environment Diagnostic
- **Symptom:** `npx vitest run tests/component.test.ts` failed with `lifecycle_function_unavailable: mount(...) is not available on the server`.
- **Root Cause:** Vitest in Node.js defaulted to the `node` export condition for Svelte (`svelte/src/index-server.js`).
- **Repair:** Configured `resolve.conditions: ['browser', 'module', 'import', 'default']` in `vitest.config.ts` so Vitest resolves Svelte client-side exports when running jsdom tests.
- **Verification:** Svelte client components mounted properly in jsdom.

### Iteration 5: Command Seam Timing
- **Symptom:** In `tests/component.test.ts`, clicking the "+ Snippet" button immediately upon mounting dropped the command in test 5.
- **Root Cause:** As documented in `application-contract.md` lines 49-50 and `code/README.md`, commands via `observeChildActions` are not buffered: dispatching before the native CodeMirror engine is mounted drops the command.
- **Repair:** Added `await waitFor(() => target.querySelector('.cm-editor'), 'CodeMirror live editor')` before dispatching live editor commands.
- **Verification:** All 6 DOM tests in `tests/component.test.ts` passed cleanly.

### Iteration 6: SSR Verification Pipeline
- **Symptom:** Running SSR directly inside client-configured Vitest failed due to conflicting browser/server compile conditions.
- **Resolution:** Created `tests/ssr-entry.ts` and `tests/ssr.mjs` matching the canonical pattern in `node_modules/@composable-svelte/core/docs/examples/agent-patterns/verify-packaged.mjs`. Added npm script `test:ssr` which runs `vite build --ssr tests/ssr-entry.ts --outDir ssr && node tests/ssr.mjs`.
- **Verification:** `npm run test:ssr` passed, confirming deterministic HTML generation, proper empty state handling, and zero service execution during SSR.

### Iteration 7: Playwright Browser Qualification
- Created `browser/workspace.spec.ts` testing the end-to-end user workflow in a real browser (Chromium) against the production preview build (`npm run build && vite preview`).
- **Verification:** `npm run test:browser` passed with 1 test executed in real Chromium (1.0s).

---

## 3. Qualification Command Execution Summary

| Command | Status | Output / Details |
|---|---|---|
| `npm run check` | PASSED | `svelte-check found 0 errors and 0 warnings` |
| `npm run test` | PASSED | 2 test files passed, 13 total tests passed (7 workspace + 6 component) |
| `npm run test:browser` | PASSED | 1 test passed in Chromium (5.1s) |
| `npm run test:ssr` | PASSED | SSR bundle built, deterministic assertions passed |
| `npm run build` | PASSED | Production client bundle built in 2.62s |

---

## 4. Independent Opus Review Changes (2026-09-26)

Recorded by the independent reviewer; see `OPUS-APP-REVIEW.md` and `review-receipts/`.

- **Defect (fixed): idle completion re-archived a reply.** Probe: after one archived reply, dispatching the public child action `streamComplete` (no stream, or superseded `streamId`) was ignored by the chat reducer but the parent appended the same reply again (`['answer','answer','answer']`). Fix in `src/model.ts`: archive `{ messageId, content }` only when the last assistant message id is not already archived; `Workspace.svelte` renders `.content` keyed by `messageId`. Regression assertions added to `tests/workspace.test.ts`; mutation check (guard removed) fails that test.
- **Test strengthened: late work after close/replace.** The close and replace tests previously only asserted abort; they now invoke the retired transport's chunk/complete callbacks and assert no mutation of the successor or archives.
- **Test strengthened: `exhaustivity = 'off'` removed.** The send-draft test passes fully exhaustive with exact nested matches (`sendMessage` message, `chunkReceived`/`streamComplete` with `streamId`), and now asserts the archived reply. The relaxation was unnecessary.
- **Test added: late transcription after replacement** (rendered, real VoiceInput UI, deferred fake STT) with a no-replacement negative control.
- **SSR check strengthened:** counts all injected device/STT/upload calls (must be 0) and re-renders a default request after other requests to show independent roots.

## 5. Opus Review Follow-up: Browser Run and Dependency Hygiene (2026-09-26)

- **Local resolution:** the accidental `/private/tmp/node_modules` ancestor symlink had been removed by the coordinator. No `node_modules` exists in any ancestor directory, and every direct dependency resolves inside `app-a/node_modules`. Receipt: `review-receipts/local-resolution-pre.txt`.
- **Dependency hygiene (N1 closed):**
  - `jsdom` is now declared as the exact devDependency 28.1.0; it was already installed.
  - The unused `@vitest/browser-playwright` was removed; no app file imported or configured it.
  - The lock was updated with `npm install --offline --no-audit --no-fund --ignore-scripts`. Only the browser-playwright subtree was removed (9 entries); the lock gained nothing new.
  - npm reported "added 50 packages". These are optional entries for other platforms (esbuild and rollup binaries). They are in the lock but not on disk on darwin-arm64, and no directory was newly written.
  - The `@composable-svelte/*` `file:` specs, their lock `resolved`/`integrity` values, and all archive and installed bytes are unchanged.
  - Receipts: `review-receipts/dep-hygiene/`, `review-receipts/artifact-hash-verification-post-deps.txt`.
- **Browser:** `npm run test:browser` passed twice after all edits. Receipts are in `review-receipts/final/`. The earlier 1.0s vs 5.1s note is the per-test time vs the whole run.
