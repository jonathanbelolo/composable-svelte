# Public Reference Gaps Report

This report documents discrepancies, missing guidance, or insufficient setup instructions discovered in the installed public package references of `@composable-svelte/core` (0.13.1), `@composable-svelte/code` (0.5.0), `@composable-svelte/chat` (0.5.0), and `@composable-svelte/media` (0.5.0).

---

### Gap 1: Svelte Preprocessing Requirement for `@xyflow/svelte` Peer in `@composable-svelte/code`

- **Required behavior:** Running `vite build` on an application importing components from `@composable-svelte/code` builds without syntax errors.
- **Installed versions:** `@composable-svelte/core` 0.13.1, `@composable-svelte/code` 0.5.0, `@sveltejs/vite-plugin-svelte` 6.2.1.
- **Supported paths examined:** The Quick Start guide in `node_modules/@composable-svelte/code/README.md` and consumer setup instructions in `node_modules/@composable-svelte/core/docs/consumer.md`.
- **Missing guarantee / documentation:** Neither doc mentions that `@composable-svelte/code` imports `@xyflow/svelte`, whose shipped `.svelte` components contain TypeScript syntax in `<script>` blocks (e.g., `key?: KeyDefinition | null` in `KeyHandler.svelte`). Without a `svelte.config.js` defining `preprocess: vitePreprocess({ script: true })`, Rollup/Vite fails during parse with `Expected ',', got '?'`. The configuration was present in the internal recipe `node_modules/@composable-svelte/code/recipes/managed/svelte.config.js`, but missing from the public README installation instructions.
- **Resolution in application:** Added `svelte.config.js` with `vitePreprocess({ script: true })` from `@sveltejs/vite-plugin-svelte`.
- **Proposed documentation fix:** Add a note to `@composable-svelte/code/README.md` stating: "When using `@composable-svelte/code` with Vite, ensure `svelte.config.js` includes `preprocess: vitePreprocess({ script: true })` to parse internal SvelteFlow components."

---

### Gap 2: Dual Resolution Conditions for Svelte 5 Client Testing vs SSR in Vitest

- **Required behavior:** Running both component-mounted interaction tests (`mount()`) and server-side rendering checks (`render()` from `svelte/server`).
- **Installed versions:** `svelte` 5.55.3, `vitest` 4.0.7, `@composable-svelte/core` 0.13.1.
- **Supported paths examined:** `node_modules/@composable-svelte/core/docs/consumer.md` and `testing-owned-work.md`.
- **Missing guarantee / documentation:** In Svelte 5, running `mount()` in Vitest under jsdom requires `resolve.conditions: ['browser', 'module', 'import', 'default']` in `vitest.config.ts`, otherwise Vitest defaults to the `node` export condition (`svelte/src/index-server.js`) and fails with `lifecycle_function_unavailable: mount(...) is not available on the server`. Conversely, building for SSR requires running `vite build --ssr` with server compilation. While `verify-packaged.mjs` demonstrated this split, `consumer.md` did not explain the Vitest configuration needed for Svelte 5 DOM testing.
- **Resolution in application:** Configured `vitest.config.ts` with `resolve.conditions: ['browser', 'module', 'import', 'default']` for jsdom component tests, and provided a dedicated `npm run test:ssr` pipeline using `vite build --ssr` and `tests/ssr.mjs` matching the canonical core pattern.
- **Proposed documentation fix:** Document the `resolve.conditions: ['browser', ...]` Vitest configuration in `consumer.md` under testing setup.

---

### Gap 3: Nested Partial Matching Semantics for Presentation-Wrapped Actions in TestStore

- **Required behavior:** Asserting effect-dispatched actions in `createTestStore` when features are composed with `ManagedIntegrationBuilder`.
- **Installed versions:** `@composable-svelte/core` 0.13.1.
- **Supported paths examined:** `node_modules/@composable-svelte/core/docs/testing-owned-work.md` and `core-concepts/testing.md`.
- **Missing guarantee / documentation:** The docs state that `store.receive()` performs partial matching. However, for nested objects (such as `{ type: 'chat', action: { type: 'presented', action: { type: 'chunkReceived' } } }`), TestStore compares nested object fields structurally in full. Internal child reducer properties (e.g. `streamId: "1"` attached by `streamingChatReducer`) cause the nested match to fail unless explicitly specified or `store.exhaustivity = 'off'` is set.
- **Resolution in application:** Explicitly specified child action fields (like `streamId: '1'`) or used `store.exhaustivity = 'off'` for top-level dispatched action assertions.
- **Proposed documentation fix:** Clarify in `testing-owned-work.md` that nested action properties inside `PresentationAction` wrapper objects are matched structurally, and demonstrate matching child-dispatched actions under managed integration.

---

## Independent reviewer assessment (Opus review, 2026-09-26)

Checked against the installed, hash-verified package files only.

- **Gap 1 (xyflow preprocessing): discoverable in shipped guidance; not a missing reference.** `node_modules/@composable-svelte/code/recipes/managed/README.md` ships in the public tarball. It says to `cp recipes/managed/svelte.config.js ./svelte.config.js` and that "The Svelte config preprocesses the TypeScript syntax in xyflow's `.svelte` files". Calling that recipe "internal" is inaccurate. There is a minor placement improvement: the main `code/README.md` Quick Start does not mention it. This does not require a package repack.
- **Gap 2 (jsdom resolve conditions): app-specific tooling choice; not a missing reference.** The starter (`core/consumer`) uses node Vitest for reducer tests and Playwright for rendered tests. The companion recipes use Vitest browser mode with `@vitest/browser-playwright`. The chat recipe's `vitest.config.ts` also shows the exact `resolve.conditions: ['browser', 'module', 'import', 'default']` line this app copied. jsdom is not a documented path, and it needed a `Range.getClientRects` stub here. At review time jsdom was not a declared devDependency and resolved only through `isomorphic-dompurify`. The reviewer follow-up has since declared it as the exact devDependency 28.1.0 (see ITERATION-LOG.md §5).
- **Gap 3 (nested TestStore matching / exhaustivity-off): documented; claim not supported.** `core/docs/core-concepts/testing.md` ("Partial Action Matching") says that top-level keys are partial and that a nested value is compared "structurally, as a whole ... an `event` carrying one more field does not match". `exhaustivity = 'off'` was unnecessary: the send-draft test passes fully exhaustive with exact nested matches. That test has been restored to exhaustive form.
- **New finding (package guidance, chat managed recipe):** `chat/recipes/managed/ManagedChat.svelte` archives `messages.at(-1)` on every routed `streamComplete`. The chat reducer ignores an idle or superseded `streamComplete`, but the parent still receives it, so the same reply is archived again. This app inherited the pattern and fixed it with a message-id guard. The recipe README says its test proves "no duplicate archive", but that test covers only a late completion from a retired owner, not an idle completion on the live owner. `core/docs/agent-patterns.md` asks to "Verify idle completions cannot commit." Owning scope: the chat recipe, fixed by a package maintainer. This app did not edit the package.
