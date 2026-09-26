# Opus independent review: App A (Chat + Code + Media conversation workspace)

Reviewer: claude-opus-5-5, fresh independent context, 2026-09-26. The review was updated after the coordinator released the browser lease.

Inputs used: the brief, the installed public package docs and dist (hash-verified), HANDOFF.md, ITERATION-LOG.md, PUBLIC-REFERENCE-GAPS.md, the tests, and the coordinator manifests. No repository or migration knowledge was used.

## Verdict: **PENDING** (no open app BLOCK; no acceptance claimed)

After the reviewer's bounded fixes, there is no remaining blocking application defect. Two focused independent re-reviews cover every reviewer code, test and dependency edit, and neither found a blocking issue. The evidence covers type checks, unit tests, rendered (jsdom) tests, SSR and the **real Chromium Playwright** run.

**I am not accepting or qualifying the app.** Open gates:

1. **Final architecture qualification: PENDING.**
   - The coordinator has not yet supplied the final reviewed checker or the externally controlled policy.
   - `@composable-svelte/architecture` is not installed in this app or in `artifacts-a/`, so no bundled developer profile was run either. Bundled selectors would only be developer feedback in any case.
   - The checker's five rule families were reviewed manually below; they are not enforced here. The five are: manual routing authority, subscription-driven presentation orchestration, impure reducer decisions, unowned infrastructure, and competing motion playback.
2. **Physical microphone qualification: not established; out of scope.** Every voice test uses the fake `VoiceInputAudioManager` and fake STT. They prove the handoff and retirement logic only.
3. **Parent decision on the shipped chat recipe finding.** The coordinator has passed the recipe finding to the parent, which owns its severity and owning scope. This app does not depend on that decision; the app-level fix is already in place.

## Artifact, transport and resolution verification

- **Transport is local candidate tarballs, not registry retrieval.**
  - `package.json` keeps the four `file:/private/tmp/composable-final-authoring/artifacts-a/*.tgz` specs. npm only re-sorted the keys; the values are unchanged.
  - In `package-lock.json`, the four `@composable-svelte/*` entries are unchanged: `resolved: file:../artifacts-a/…`, with integrity equal to the manifest sha512.
  - The install verification records `transport="local-candidate-tarballs"` and `registryRetrievalClaimed=false`.
- **Archive and installed bytes match the manifests.** I checked before the edits, after the code edits, after the dependency change and at the end: `review-receipts/artifact-hash-verification{,-post,-post-deps,-final}.txt`.
  - Archive sha256 values:
    - core 0.13.1 `30e044e1…d18b`
    - code 0.5.0 `f85b9452…7a37026`
    - media 0.5.0 `c0bfa652…78298`
    - chat 0.5.0 `cfbfe99d…07090`
  - Installed files: core 1258, code 69, media 101 and chat 157, with 0 mismatches and 0 extra files.
  - Script: `review-receipts/verify-artifacts.mjs`.
- **Local resolution.**
  - The coordinator removed the accidental `/private/tmp/node_modules` symlink.
  - No `node_modules` exists in `/private/tmp/composable-final-authoring`, `/private/tmp`, `/private` or `/`.
  - Every direct dependency resolves under `app-a/node_modules`.
  - The only symlinks under `node_modules` are in `.bin`.
  - Receipt: `review-receipts/local-resolution-pre.txt`.
- **App file identity.**
  - Before my edits, the app matched `APP-A-PRE-OPUS-HASHES.json`.
  - Final app file hashes: `review-receipts/final/app-file-hashes.txt`.
  - Cumulative reviewer diff: `review-receipts/opus-edits-final.diff`, sha256 `34655005…dc7a1`.
- **Not touched:** installed packages, archives, shipped recipes and qualification policies were never edited.

## Toolchain (exact)

- Runtime: node v24.10.0, npm 11.6.0.
- Build and test: vite 7.3.6, vitest 4.0.7, @playwright/test and playwright 1.56.1 (Chromium).
- Types: typescript 5.9.3, svelte-check 4.3.3.
- Svelte: svelte 5.55.3, @sveltejs/vite-plugin-svelte 6.2.1.
- Now declared: **jsdom 28.1.0** (devDependency, exact).
- Transitive: @xyflow/svelte 1.7.0, codemirror 6.0.2, prismjs 1.30.0, isomorphic-dompurify 2.36.0.
- Hashes, before → after (dependency change only):
  - `package.json`: `c6d350b5…50e2` → `9988d5a4…3a31`
  - `package-lock.json`: `05a652ba…13b8` → `258d875b…6d03`
- Records: `review-receipts/00-versions.txt`, `review-receipts/dep-hygiene/after-hashes.txt`.

## Commands run

Stdout, stderr and exit status are retained for every command.

| Command | Initial (`review-receipts/pre-*`) | After code edits (`post-*`) | Final, after all edits (`final/`) |
| --- | --- | --- | --- |
| `npm run check` | exit 0, 0/0 | exit 0, 0/0 | exit 0, 0 errors / 0 warnings |
| `npm run test` | exit 0, 13/13 | exit 0, 14/14 (+3 repeats 14/14) | exit 0, 14/14 |
| `npm run build` | exit 0 | exit 0 | exit 0 |
| `npm run test:ssr` | exit 0 | exit 0 (strengthened) | exit 0 |
| `npm run test:browser` | not run (lease) | not run (lease) | **exit 0, 1 passed** (test 1.0s, run 5.5s); **repeat exit 0** (888ms / 5.2s) |
| `npm ls --all` | – | – | exit 0 (`dep-hygiene/npm-ls*.txt`) |

- **Browser.** Playwright builds the production bundle and runs it under `vite preview` in Chromium. The spec asserts that:
  - all four packaged features are visible;
  - insert/undo commands reach the live CodeMirror;
  - a streamed reply is archived and shown with count 1, which exercises the reviewer's archived-reply rendering change;
  - "send draft to chat" works;
  - switching to conv-2 shows its independent draft and 0 replies;
  - switching back keeps the conv-1 archive;
  - close and reopen work;
  - there are no page errors.
- **Build stderr** contains only package-level warnings:
  - `node:async_hooks` is externalized from `svelte/src/internal/server/render-context.js`, reached through `@composable-svelte/core/dist/ssr/render.js`.
  - Rollup reports `/* @__PURE__ */` annotations in chat/xyflow `.svelte` files.
  - The main chunk exceeds 500 kB.
  - Node prints a `NO_COLOR`/`FORCE_COLOR` notice.

## Review priorities

| Priority | Finding | Evidence |
| --- | --- | --- |
| Real Chat + Code + Media features visible | **Met.** `FullStreamingChat`, `CodeEditor` (live CodeMirror), `VoiceInput` (push-to-talk) and `VideoEmbed` are rendered through managed outlets, plus a visible command toolbar, archived-reply list, transcript list and a fake-device notice. | component test 1; Playwright (final) |
| Completed assistant response archived once | **Defect found and fixed (F1).** An idle or superseded `streamComplete`, which the chat child ignores, used to re-archive the last reply. The parent now archives `{messageId, content}` only if that message id is not already archived. | `src/model.ts`; workspace test 1 fails when the guard is removed; Playwright count 1 |
| Editor commands target the intended live editor | **Met.** Commands go into the `editor` slot and reach the packaged `CodeEditor` through `observeChildActions` on its genuine `FeatureViewProps.store`. Replacement retires the old owner. | component tests 2 and 7; Playwright insert/undo |
| Recording/transcript tied to original conversation | **Met, with documented loss.** A transcript is attributed to the active conversation, whose lifetime is exactly the voice owner's lifetime. A transcription still in flight at close or replace is cancelled with its owner, so it reaches neither conversation, as the media package documents. | rendered deferred-STT test with a same-timing negative control |
| Close/replace stops late work mutating the successor | **Met.** The stream is aborted, and late callbacks that ignore abort are dropped. Conv-2 reuses `streamId '1'`, so the test would catch leakage. | workspace close and replace tests (late callbacks invoked), `finish()` |
| Second conversation independent | **Met.** | workspace test 6, component test 7, Playwright |
| Deterministic transport and fake devices | **Met and labelled.** These are fakes, not real microphone qualification. | `src/dependencies.ts`, UI notice, HANDOFF |
| Optional dependencies only when used | **Met (N1 closed).** code and media are used directly; the chat peers prismjs and pdfjs are not added. `jsdom` is declared because it is used; the unused `@vitest/browser-playwright` was removed. | `package.json`, `dep-hygiene/` |

## Ownership, factoring and glue

These are my manual review conclusions, backed by type and runtime evidence. Automated checker rules are inactive (pending).

- **Store facades:** none.
- **Copied package reducers:** none. The package reducers are imported.
- **Root action-stream listeners:** none. There is no `subscribeToActions`, `$effect` or `onMount` orchestration in `src/`.
- **Callback-based managed business routing:** none. Outcomes are handled in `workspaceReducer` from routed child actions.
- **Ownership casts:** none. The only casts are in the fake audio device, the same as the shipped media recipe's fake; HANDOFF's wording was corrected.
- **Duplicated lifecycle orchestration:** none. Lifetimes come from `ApplicationRoot`/`ApplicationHost` plus `replaceOn`, which requires the action kind and a change of active id.
- **Justified app bookkeeping:**
  - The per-conversation `draftCode` is synced on `valueChanged` and also on switch or close. This is redundant but harmless.
  - `completedResponses[].messageId` records identity and acceptance.
  - `activeConversationId` gates attribution.

## Reviewer edits and focused independent re-reviews

| Edit set | Scope | Focused re-review |
| --- | --- | --- |
| F1–F5 (fix plus test/SSR strengthening) | `src/model.ts`, `src/Workspace.svelte`, `tests/workspace.test.ts`, `tests/component.test.ts`, `tests/ssr.mjs` | **Re-review 1: no blocking issues.** `review-receipts/FOCUSED-REREVIEW-1.md` holds the exact result verbatim. The reviewed diff was reconstructed exactly as `rereview-1-reviewed.diff` (sha256 `77254a83…2eba`), because the original `opus-edits.diff` was regenerated afterwards. |
| Post-review nits (comment; the control uses the same fixed wait) | `src/model.ts` comment, `tests/component.test.ts` | **Re-review 2: no blocking issues.** `review-receipts/FOCUSED-REREVIEW-2.md` holds the exact result and the input sha256 values. |
| N1 dependency hygiene | `package.json`, `package-lock.json` | Re-review 2 (above). |
| After re-review 2 | `PUBLIC-REFERENCE-GAPS.md` stale jsdom sentence (documentation only) | No code or tests changed, so no further review is needed. |

Findings fixed by the reviewer:

- **F1:** the duplicate archive on an idle or superseded completion.
- **F2:** late-callback invocation after close and after replace.
- **F3:** removed the unnecessary `exhaustivity = 'off'`; the test is now exact and exhaustive and asserts the archived reply.
- **F4:** added the rendered late-transcription test with its negative control.
- **F5:** SSR now counts service calls (must be 0) and checks that request roots are independent (a later default render is byte-identical).
- **N1:** jsdom declared at exactly 28.1.0 and `@vitest/browser-playwright` removed.
  - The lock was updated offline from the existing install.
  - The lock diff is removals only: the 9-entry browser-playwright subtree plus the root block.
  - npm's "added 50 packages" message refers to optional binaries for other platforms. They are not on disk, were already in the lock, and nothing was downloaded.
  - Two empty folders were left behind under `node_modules` (`@polka`, `@napi-rs`); this is cosmetic.
- **N5 (partly resolved):** the author's "1.0s vs 5.1s" was the per-test time vs the whole run, not a contradiction. The author kept no raw logs; the reviewer receipts now exist.

## Remaining non-blocking observations

- **N2:** a transcript still in flight when its conversation is closed or replaced is discarded rather than kept for the original conversation. This is the package's documented behaviour and is noted in HANDOFF.
- **N3:** each open starts a fresh chat child, so the visible message history is not restored. Only archived replies, transcripts and the draft persist.
- **N4:** `VideoEmbed` renders live, lazy YouTube/Vimeo iframes, so the Playwright run contacts third-party hosts. The assertions do not depend on the load, but the run is not hermetic. Consider routing or blocking those hosts in the spec.
- **N6:** the TestStore transcript tests send the public `transcriptionCompleted` directly, which is acceptable at reducer level. The real VoiceInput flow is covered by rendered tests.
- **N7:** `openConversation` with an unknown id creates a record. That is a policy choice, and the UI cannot trigger it.
- **N8:** there is no starter-style browser lifetime fixture that unmounts the Root while real service work is pending.
- **N9:** the jsdom component tests need a `Range.getClientRects` stub. The shipped recipes' canonical rendered path is Vitest browser mode.
- **Accepted nits from re-review 1:**
  - The guard means "not yet archived", not "the chat just accepted this completion". A `stopGeneration` partial could be archived by an idle completion dispatched from outside; the package never emits one.
  - The send-draft test duplicates the message template.

## Public-reference gap assessment

Details are in PUBLIC-REFERENCE-GAPS.md.

- **Gap 1 (xyflow preprocessing):** documented in shipped public guidance, `code/recipes/managed/README.md` plus its `svelte.config.js`. The author's "internal" label is inaccurate. The only improvement needed is to also mention it in the main README Quick Start; this does not need a repack.
- **Gap 2 (jsdom resolve conditions):** this is an app tooling choice. The shipped paths are node Vitest plus Playwright, or Vitest browser mode, and the chat recipe already shows the `resolve.conditions` line. It is not a missing reference.
- **Gap 3 (nested TestStore matching / exhaustivity-off):** already documented in `core/docs/core-concepts/testing.md` under "Partial Action Matching". The claim is not supported.
- **Chat recipe duplicate-archive finding** (`chat/recipes/managed/ManagedChat.svelte`):
  - The coordinator has passed it to the parent, which owns the severity and owning-scope decision.
  - I did not edit the shipped recipe or any archive.

## Remaining gates before any acceptance

1. The coordinator supplies the final reviewed checker and external policy. Run both against this exact final app (`review-receipts/final/app-file-hashes.txt`) and these artifacts, and record the results. Until then, qualification stays **PENDING**.
2. Physical microphone and real STT qualification are separate, manual and not established.
3. The parent decides the severity and owning scope of the shipped chat recipe finding. This does not block the app.
