# Chat migration: independent production review

- **Reviewer:** Claude Opus 5.5, independent read-only review. Bounded to about 15 minutes.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`, with the chat worker's uncommitted diff.
- **Scope:**
  - the `packages/chat` diff and `CHAT-MIGRATION.md`;
  - checked against `COMMAND-DELIVERY-DECISION.lead-copy.md` and the chat rows of `INVENTORY.md` (§4.7–4.10, O10–O12, O15, §6.3 B3).
- **Method:**
  - read the source diff, the new tests, the fixture, the recipe, the type fixture, the script and the emitted `dist`;
  - read the Vite 6.4.1 resolver source for the optional-peer path.
  - I did not rerun the suite. The worker's recorded results stand as their evidence: browser 332/332, SSR 11/11, and the absent-peer script passing.
  - I ran no executable probes and created no files other than this one. Neither finding below needed a probe: both follow directly from source that I quote.

## Verdict

**The chat migration is acceptable for integration. I found no prepublish blocker in the chat package itself.**

- There is one Medium finding. It is pre-existing, cheap, and not a correctness failure. It is a gap in the O12 absent-peer evidence, and I recommend fixing it before publishing.
- There are three Low findings.
- The deliberate absence of an action observer is correct under the ADR.
- Publication is still gated on the parent items in §4. These are version, peer floors, the packed matrix rows (c)/(d), a rerun on the frozen core, and the skill file.

## 1. Findings

### M1: without `prismjs`, a production Vite build warns once per code block on every render (Medium, pre-existing, not caught by the script)

**Source chain (read, not executed):**

1. Vite 6.4.1's resolver maps an absent optional peer to `__vite-optional-peer-dep:…`. `chat/package.json` marks `prismjs` optional. When `isProduction` is set, the resolver loads that id as `export default {}`. See `vite/dist/node/chunks/dep-D4NMHUTW.js:15891-15897`.
2. `markdown.ts:89-92` then sets `Prism = module.default ?? module`, which is `{}`. HEAD's `Prism = await import(...)` produced `{ default: {} }` instead. Both are truthy, so the defect predates this diff.
3. In `markdown.ts:175`, the guard `Prism && … && Prism.languages[language]` throws a `TypeError` because `languages` is `undefined`. The `catch` at :179 then runs `console.warn('Failed to highlight code block with language: …')` and falls back to escaped output.

**Effect:**

- A consumer without `prismjs` gets correctly escaped code.
- They also get one console warning per fenced block per `renderMarkdown` call. A streaming reply re-renders on every chunk, so the warnings repeat throughout streaming.
- This also happens in a production SSR build (`vite build --ssr`), where chat is bundled because vite-plugin-svelte marks it `noExternal`.
- It does not happen with dev `ssrLoadModule`. There the stub throws, the `catch` at :93 runs and `Prism` stays `null`.

**Why the evidence missed it:**

- `verify-optional-peers.mjs` phase A5 records only `pageerror` events (`:275`), not `console` events.
- Phase A3 uses dev `ssrLoadModule`, which takes the throwing path.
- So CHAT-MIGRATION's statement that absent-peer degradation is verified clean holds for page errors, not for console output. The migration's console scan (`No … Failed to highlight`) covers only the workspace suite, where `prismjs` is present.

**Repro:**

1. In the script's phase-A consumer, run `vite build`.
2. Add `page.on('console', m => m.type() === 'warning' && warns.push(m.text()))`.
3. Load the build. Expect `Failed to highlight code block with language: javascript` at least once. The conversation fixture contains a ```` ```js ```` block.

**Fix (small):**

- In `markdown.ts`, keep the resolved module only if it really is Prism, for example `const candidate = module.default ?? module; Prism = typeof candidate?.highlight === 'function' && candidate.languages ? candidate : null;`.
- Make the script collect console warnings and errors in phase A5 and assert that there are none.
- Optionally, add a production `vite build --ssr` render to phase A3.

### L1: `useTypingEmitter` warns on every keystroke after automatic retirement (Low)

- `releaseOnRetirement` now disposes the `CleanupTracker` when a managed owner retires. The consumer is not told.
- `start()` and `update()` are still callable afterwards. Each calls `cleanup.setTimeout`, and `CleanupTracker.setTimeout` warns `[CleanupTracker] Setting timeout after dispose` once disposed (`cleanup-tracker.ts`).
- The `startTyping` dispatch through the retired view is dropped silently by core, which is correct.

**Repro:**

1. Using `managed-collaborative.test.ts`'s `managedRoom()`, create `const t = useTypingEmitter(view, 'message')`.
2. Run `store.dispatch({ type: 'leave' })`, then `t.start()`.
3. `console.warn` is called.

This only matters where a component outlives its view's retirement, for example a hand-bound view kept mounted. Through `FeatureOutlet` the component unmounts in the same flush.

**Fix:** have `start` and `update` return early once `cleanup.disposed` is set. That matches the "calling the teardown afterwards is harmless" promise in the README.

### L2: `FullStreamingChat` revokes the previous store's live attachments when `store` changes to an already-retired view (Low, source-inferred)

- The `$effect.pre` at `FullStreamingChat.svelte:340-343` revokes `heldAttachments` whenever `chat` becomes `undefined`.
- Suppose an unkeyed instance showing live store A, with pending attachments, receives an already-retired view B as its new `store`. It then revokes A's blob URLs while A still holds them. Its previews break, and so does any later upload that fetches the URL.
- The converse is also a leak. If `store` moves A → B while A is live, and A later retires with no component bound to it, A's pending URLs are never revoked.
- Both need a hand-bound, unkeyed prop swap. `FeatureOutlet` does not produce either.

**Fix:** reset `heldAttachments` to `[]` when the `store` identity changes (the draft-reset `$effect.pre` already runs on that). Revoke only on the same store reporting `undefined`. Alternatively, document the behaviour next to the existing "known limits".

### L3: the draft reset is pinned for `MinimalStreamingChat` only (Low, test gap)

- `StandardStreamingChat.svelte:74` and `FullStreamingChat.svelte:127` carry the same `$effect.pre` draft reset.
- The only test is "an unkeyed chat whose store changes does not carry the draft across", which mounts `MinimalStreamingChat`, and the mutation table mutates only Minimal. Removing the reset from Standard or Full would fail nothing.

**Fix:** turn that test into a `describe.each(variants)`.

## 2. Areas checked and accepted

**No action observer (deliberate deviation from the brief).** Accepted.

- `grep` confirms that nothing in `src` observes actions.
- The only candidates are business results, and the ADR routes those through the parent reducer: "Ordinary business handoff remains parent reducer composition". The dual-path helper the ADR describes is for "package-owned command bindings", and chat has none.
- Adding `observeChildActions` with no caller would be dead code and would invite observer-based business handoff.
- The ADR's "reject unsupported structural imitations" applies to the observer path. Chat never drops a command on a wrapper, so accepting any object with `subscribe`/`dispatch` loses nothing.
- If code or media land a shared helper later, chat does not need it until it has a native command.

**`ChildView` prop typing (`ViewStore<S,A> = Store<S,A> | ChildView<S,A>`).** Accepted.

- It is type-only and lives in `dist/internal/view-store.{js,d.ts}`. That file ships under `files: ["dist"]` and is reachable only through relative imports, not `exports`.
- `ChildView` is exported from `@composable-svelte/core/application` at HEAD, the published 0.13.0, and its interface is unchanged in the candidate diff.
- `ManagedPropTypes.svelte` runs against the built declarations. Its two `@ts-expect-error` lines would fail svelte-check if they became unused.
- Informational, not a chat defect: `ChildView.dispatch` is method syntax and therefore bivariant. A view whose action type is a subset or superset of `StreamingChatAction` would be accepted. The foreign-union rejection holds only for disjoint unions. This is core's contract.

**Retirement (O10).**

- All three variants gate their markup on `chat = $derived($store)`. That includes the preview modal, so an open presentation is dropped.
- The primitives render nothing, and `ContextMenu` uses `$store?.`.
- `FullStreamingChat`'s unmount no longer dereferences a retired view.
- SSR: `onDestroy` runs on the server, but `heldAttachments` is only filled by `$effect.pre`, which does not run there. So nothing is revoked on the server, and `managed-ssr` pins this.

**Stream and upload isolation and freshness (§4.7, §4.8).**

- The reducer is unchanged. Its `live` flag and `cleanup`, together with core's per-owner qualification, give the owner isolation.
- Tests cover:
  - sibling Stop;
  - same-id replacement, where both owners are at `activeStreamId === '1'`;
  - late chunk and completion after retirement;
  - upload resolving after retirement;
  - root destroy;
  - concurrent per-message uploads.
- These are real behavioural tests through the managed store, not mocks of core.

**Parent business handoff.**

- The fixture and the README recipe reduce the child first and read the child's post-reduction state. `sendMessage` has no reducer guard, so "record the prompt" never records a phantom.
- "Archive the last message on `streamComplete`" relies on the package's `live` flag, which stops a stale completion from being dispatched. It is correct for package transports.
- The README table states honestly that the chat does nothing server-side for reactions, deletes or edits.

**Collaborative hooks (O11, B3).**

- `watchRetirement` handles all of these:
  - synchronous notification during `subscribe`;
  - an already-retired view;
  - an idempotent stop;
  - a `{ dispatch }` stand-in.
- The double-dispose guard works. The tests assert `vi.getTimerCount() === 0` and that nothing warns after the consumer's late teardown.

**Prism SSR interop fix (`module.default ?? module`).**

- It is correct for Node ESM and for SSR that externalizes `prismjs`, where only `default` exists.
- It is correct for bundled builds, where `default` is Prism.
- It was mutation-proved by the script's phase B.
- The worker removed their own in-suite test because vite-node's interop made it pass against HEAD. That was the right call.

**Emitted declarations and optional peers.**

- `dist/**/*.d.ts` names optional peers only in comments.
- The script's `tsc` step runs with `skipLibCheck: false` and `exactOptionalPropertyTypes`, with the peers absent.

**Exports.** Unchanged. No new entry point, no new public value, and no `ChildView`/`Store` member added.

## 3. Prepublish blockers (chat package)

**None found.**

M1 is recommended before publish. It is a two-line fix plus a script assertion, and it makes the O12 evidence claim literally true. It is not a correctness blocker.

## 4. Parent gates (outside the chat lane, required before publication)

1. **Version.** The `store` prop and hook parameters are widened in public types, and hooks now release on retirement. Chat is still `0.4.1` with an `Unreleased` changelog. The parent assigns a minor bump for the 0.x line.
2. **Peer floors (O15).**
   - Chat's own runtime and types need only what core `^0.13.0` exports. That is source-verified, not executed against the published tarball: the script packs the working-tree core, which includes the unpublished `owner-actions`.
   - The optional `@composable-svelte/media` peer now needs the core release that exports `observeChildActions`/`isManagedChildView`. Media's own core floor must carry that, and chat's `^0.4.0` code/media ranges must move to the released lines.
3. **Packed optional-peer matrix rows (c) prismjs + code and (d) media present.** Run these against frozen code and media tarballs. Row (c) also needs code's `loadLanguage` grammar loading to work under Node SSR against the same Prism instance chat now takes from `default`.
4. **Rerun the absent-peer script on the frozen core candidate,** and optionally once on published core 0.13.0 to execute the "no newer core" claim. Wire the script into CI or into `verify-consumer.mjs`, including M1's console assertion.
5. **Skill.** `.claude/skills/composable-svelte-chat/SKILL.md` still shows only standalone use. Add the managed recipe and the hook-retirement note. Core's `skill-examples` guard covers it.
6. **`verify-consumer.mjs`** at integration.
7. **Release notes.** Hooks now hold one state subscription each, and managed retirement auto-disposes them. Also carry the known limits from CHAT-MIGRATION item 7, plus L2 if it is not fixed.
