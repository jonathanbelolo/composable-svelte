# Support Conversation Workspace - Handoff Guide

## 1. Overview & Completed Behavior

This application implements **Required Brief A: Conversation Workspace**, an integrated support conversation workspace composed of the installed `@composable-svelte/chat`, `@composable-svelte/code`, and `@composable-svelte/media` packages under `@composable-svelte/core` 0.13.1.

The application follows the public authoring contract and agent patterns:
- **Managed Composition:** Registered using `ManagedIntegrationBuilder` with typed optional slots (`chatSlot`, `editorSlot`, `voiceSlot`).
- **Packaged Components:** Integrates `FullStreamingChat`, `CodeEditor`, `VoiceInput`, and `VideoEmbed`. All components are exposed and interactive in the UI.
- **Parent Reducer Ownership:** Durable business outcomes are kept in the parent reducer (`workspaceReducer`), which records:
  - Completed assistant responses in `conversations[id].completedResponses`.
  - Transcripts in `conversations[id].transcripts` attributed strictly to the active conversation.
  - Draft code in `conversations[id].draftCode` synchronized across conversation switches.
- **Live Command Seam:** Dispatches native editor commands (`insertText`, `undo`, `redo`, `selectAll`) through the managed child view, observed by `CodeEditor` via `observeChildActions` to imperatively update the live CodeMirror 6 engine.
- **Replacement & Retirement Policies:** Employs `replaceOn` on all optional slots to declare when switching conversations creates a new owner token. Retiring or replacing an active conversation aborts in-flight streams, releases the voice device manager, and drops late callbacks from mutating the successor or closed conversation.
- **Conversation Independence:** Multiple conversations (`conv-1`, `conv-2`, etc.) maintain independent drafts, transcripts, and archived response histories.

---

## 2. Acceptance Observations & Verification Matrix

| Acceptance Requirement | Implementation Detail | Verifying Test(s) |
|---|---|---|
| **Completed assistant response recorded once** | Parent `workspaceReducer` observes routed child `streamComplete` and appends `{ messageId, content }` to `completedResponses` only when that assistant message id is not already archived (idle/superseded completions the chat child ignores do not re-archive; added in Opus review). | `tests/workspace.test.ts` (test 1)<br>`tests/component.test.ts` (test 3)<br>`browser/workspace.spec.ts` |
| **Editor commands affect intended live editor** | `observeChildActions` delivers commands (`insertText`, `undo`, `redo`) directly to the active live CodeMirror engine. | `tests/workspace.test.ts` (test 2)<br>`tests/component.test.ts` (test 2)<br>`browser/workspace.spec.ts` |
| **Transcripts belong to original conversation** | `transcriptionCompleted` child action routes to parent reducer, which updates `conversations[activeId].transcripts`. | `tests/workspace.test.ts` (test 3)<br>`tests/component.test.ts` (test 4) |
| **Closing or replacing prevents late work mutating successor** | `replaceOn` terminates predecessor owner, fires `AbortController.abort()`, and drops late chunks/completions. | `tests/workspace.test.ts` (tests 4 & 5)<br>`tests/component.test.ts` (test 5) |
| **Second conversation remains independent** | Switching conversations restores distinct drafts, transcripts, and message records without cross-contamination. | `tests/workspace.test.ts` (test 6)<br>`tests/component.test.ts` (test 5)<br>`browser/workspace.spec.ts` |
| **Fake device/transport vs real microphone qualification** | `createFakeWorkspaceDependencies()` provides in-memory audio/transcription and stream queues for deterministic automation; UI displays explicit qualification notice. | `tests/component.test.ts` (test 1)<br>`src/dependencies.ts`<br>`src/Workspace.svelte` |
| **Optional integrations installed only when used** | No extra packages added; exact frozen local tarball dependencies in `package.json` preserved. | `package.json`<br>`package-lock.json` |
| **Browser interaction & SSR checks** | Playwright runs against production preview server; Svelte 5 server renderer runs against bundled SSR entry. | `browser/workspace.spec.ts`<br>`tests/ssr-entry.ts`<br>`tests/ssr.mjs` |

---

## 3. Test Suites & Commands

### 1. Svelte Check
```bash
npm run check
```
Runs `svelte-check --tsconfig ./tsconfig.json --fail-on-warnings`.
- Result: **0 errors, 0 warnings**.

### 2. Unit & DOM Integration Tests (Vitest)
```bash
npm run test
```
Runs `vitest run` over:
- `tests/workspace.test.ts`: 7 tests exercising `createTestStore` with managed execution, state transitions, command emissions, and lifecycle replacement (all exhaustive; late transport callbacks are invoked after close/replace).
- `tests/component.test.ts`: 7 tests using Svelte 5 `mount()` in jsdom exercising live DOM interactions, live CodeMirror command execution, streaming chat, and voice dictation.
- Result (post Opus review, see `review-receipts/`): **2 test files passed, 14 tests passed**.

### 3. End-to-End Browser Tests (Playwright)
```bash
npm run test:browser
```
Runs `playwright test` in Chromium against the production build preview server.
- Verifies full browser workflow: header navigation, live editor commands, chat streaming, draft dispatch, conversation replacement, and closing.
- Result (re-run after Opus review, twice): **1 passed**, 1.0s and 888ms for the test, 5.5s and 5.2s for the whole run including the build and preview server. Receipts are in `review-receipts/final/`.

### 4. Server-Side Rendering (SSR) Check
```bash
npm run test:ssr
```
Compiles SSR bundle with `vite build --ssr tests/ssr-entry.ts --outDir ssr` and executes `tests/ssr.mjs`.
- Verifies deterministic markup generation, empty state handling, independent conversation rendering, and absence of client-only side effects during SSR.
- Result: **SSR verification passed**.

### 5. Production Client Build
```bash
npm run build
```
Builds production assets using Vite.
- Result: **Built successfully in ~2.6s**.

---

## 4. Architectural Safeguards Verified

The application was reviewed against the qualification criteria:
- **No Repeated Store Facades:** Genuine `app.store` and child views from `FeatureViewProps` are passed directly without wrapper objects.
- **No Copied Package Reducers:** Directly imports `streamingChatReducer`, `codeEditorReducer`, and `voiceInputReducer` from their respective installed packages.
- **No Root Action-Stream Listeners:** Child actions are naturally routed through `ManagedIntegrationBuilder` into `workspaceReducer`.
- **No Callback-Based Managed Business Routing:** Business outcomes (`completedResponses`, `transcripts`, `draftCode`) are handled purely in reducers upon receiving routed child actions, not through component UI callbacks like `onTranscript`.
- **No Ownership Casts:** No `ChildView`/store/presentation casts and no `as any`. The only casts are in the fake audio device (`{} as MediaStream`, `as unknown as VoiceInputAudioManager` in `src/dependencies.ts`), mirroring the shipped media recipe's fake; they are test-double typing, not ownership casts.
- **No Duplicated Lifecycle Orchestration:** Teardown, cancellation, and owner replacements rely on `replaceOn` and `ApplicationRoot` / `ApplicationHost`.

---

## 5. Remaining Boundaries & Operational Limits

- **Transcription interrupted by close/replace is discarded:** the media package cancels pending transcription work with its retired owner, so a transcript that resolves after its conversation was closed or replaced is attributed to neither conversation (tested in `tests/component.test.ts`). It never reaches the successor.
- **Chat history per open:** each open creates a fresh chat child; the durable record of a conversation is its archived assistant replies, transcripts and draft, not the full message list.
- **Browser media embeds are live:** `VideoEmbed` renders lazy YouTube/Vimeo iframes, so the Playwright run contacts those hosts unless routed.
- **Test tooling:** the component tests run in jsdom, now declared as the exact devDependency `jsdom` 28.1.0; it needs a `Range.getClientRects` stub. The unused `@vitest/browser-playwright` was removed. The shipped companion recipes use Vitest browser mode instead.
- **Qualification pending:** architecture checker/external policy were not supplied at authoring or review time; see `OPUS-APP-REVIEW.md`.

- **Microphone Qualification Boundary:** Automated test runs use in-memory deterministic audio buffers (`createFakeWorkspaceDependencies`). Physical microphone qualification requires user browser media stream permissions (`navigator.mediaDevices.getUserMedia`) and live hardware access.
- **Draft Persistence:** Unsent drafts in chat are component-level state; code drafts in the code editor are durable parent state and survive conversation switching.
- **Static Video Embeds:** Video embeds render supported platforms (YouTube, Vimeo, Twitch) responsively using `VideoEmbed` without requiring a store.

---

## 6. How to Run Locally

```bash
# Start local development server
npm run dev

# Or build and preview production application
npm run build
npx vite preview
```
Open `http://localhost:5173` (or preview port `4173`) in your browser to interact with the Support Conversation Workspace.
