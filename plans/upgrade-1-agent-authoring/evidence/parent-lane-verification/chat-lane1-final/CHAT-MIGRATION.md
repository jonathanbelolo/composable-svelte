# Chat migration: managed views, owner-scoped effects, business handoff, optional peers

- **Worker:** Claude Opus 5.5, the chat-only implementation worker.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`.
- **Inputs:** `COMMAND-DELIVERY-DECISION.lead-copy.md`; `INVENTORY.md` §4.7–4.10, O1, O10–O12, O15 and §6.3 (B3); `MEDIA-MIGRATION.md`; the current core source and built `dist` of `@composable-svelte/core/application`.
- **Status:** uncommitted and unpublished. Edits are confined to `packages/chat` and this file. No version, peer range, lockfile, root config, core, code or media file was changed.

## Outcome

These surfaces now accept either a standalone `Store` or a genuine managed `ChildView` (`FeatureViewProps.store`, `composition.bind`, typed `scopeTo`):

- the three variants: `MinimalStreamingChat`, `StandardStreamingChat`, `FullStreamingChat`;
- the store-taking primitives on `./streaming-chat`: `ChatMessageWithActions` and `ActionButtons` (plus the internal `ContextMenu`);
- the four collaborative hooks: `usePresenceTracking`, `useTypingEmitter`, `useCursorTracking`, `useHeartbeat`.

**Public API.** The `store` prop and hook parameter widen from `Store<S, A>` to `Store<S, A> | ChildView<S, A>`. The action unions are unchanged; a view of another feature's actions is still a type error (pinned by `tests/test-components/ManagedPropTypes.svelte` against the built declarations). No prop was added or removed, and no member was added to `ChildView` or `Store`.

**Retirement.** A retired view reads `undefined`. Each component then renders nothing and never dereferences it. That includes `FullStreamingChat`'s unmount cleanup, which on HEAD threw.

**Effects.** The streaming transport (`Effect.subscription('streaming-chat/stream')`) and per-message uploads (`streaming-chat/upload/<id>`) are unchanged in the reducer. Under managed composition core qualifies both ids per owner (`qualifyEffect` → `resourceKey(origin, …)`). Tests show that:

- sibling chats do not cancel each other;
- retirement, replacement and root destruction abort the transport and cancel uploads;
- late callbacks from a retired owner reach nobody, even when the replacement reuses the same stream id.

**Business handoff.** This goes through the parent reducer: children reduce first and the parent reads the child's updated state. The README states what the chat does by itself and what it leaves to the application. For example, reactions, deletions and edits are local state only.

**Defect found and fixed.** Server-side syntax highlighting was broken whenever `prismjs` was installed. The fix is in `markdown.ts`; details are in the section on optional peers.

## Decisions

### No action observer in chat (deviation from the brief, deliberate)

The brief asked for a dual-path helper built on `observeChildActions` / `subscribeToActions`. I did not add the action-observation half, and I did not add a runtime import of `@composable-svelte/core/application`.

**Evidence.** No chat component, primitive or hook observes actions: `grep subscribeToActions packages/chat/src` finds only a comment in the reducer, and INVENTORY §2 records the same. The only candidates are business results: `copySuccess`, `streamComplete`, `streamSuperseded`, reactions. The ADR routes those through the parent reducer, not through an observer ("Ordinary business handoff remains parent reducer composition"). Chat has no native command, in the sense that CodeEditor or NodeCanvas have one.

**Why not add it anyway.** A helper with no caller would be untested dead code. It would also invite exactly the observer-based business handoff that the ADR rules out.

**What the shared internal helper does instead.** `src/lib/internal/view-store.ts` is not reachable from `exports` and imports types only. It provides:

- `ViewStore<S, A>`, the prop type;
- `watchRetirement(source, onRetired)`, which lets the collaborative hooks release themselves on managed retirement.

There is therefore no warn-once path: both members chat needs (`subscribe`, `dispatch`) are required on both input kinds. `watchRetirement` also tolerates a hand-rolled `{ dispatch }` cast to `Store`, which the hooks accepted before; a test covers this.

**Consequence.** Chat's own runtime needs no newer core; only its type surface names `ChildView`, which `^0.13.0` already exports. If the parent prefers the helper for symmetry with code/media, that is a small change, but it needs a real caller first.

### Retirement and reactivity (O10)

- **Variants.** Each variant derives `chat = $derived($store)` and wraps its markup in `{#if chat}`. `ChatMessageWithActions` and `ActionButtons` render nothing when retired, and `ContextMenu` reads `$store?.…`. The bound elements became `$state`, so the scroll-follower effect re-arms when the container binds.
- **`FullStreamingChat` blob URLs.** The component keeps the last `pendingAttachments` it saw. It revokes them when the view reports `undefined` (retirement), or at unmount as before, but never twice. On the server nothing is held, so nothing is revoked.
- **Hooks.** Under a managed view each hook disposes itself when the owner retires. The returned teardown is guarded, so a consumer's later call does not dispose twice (`CleanupTracker` would warn "Already disposed"). A view that has already retired installs nothing that outlives the call. A standalone store never retires, so its behaviour is unchanged. B3's "release hook listeners and timers without a consumer disposer" is met for managed use.

### No cross-owner delivery

- **Draft on store change.** An unkeyed variant whose `store` prop changes clears its unsent draft (and re-enables auto-scroll). Text typed for one owner is never dispatched to the next. The `$effect.pre` that does this also runs at mount, where it is a no-op.
- **File reads.** `FullStreamingChat.handleFileSelect` captures the `store` at the moment of picking. Reading files is asynchronous. The attachments land in the store they were picked in, even if the prop has changed meanwhile. If that owner has retired, their freshly created blob URLs are revoked instead of being dispatched into a dropped turn.
- **Retired views.** A dispatch through a retired view is dropped by core (`stale-owner`); a test pins that it does not reach the replacement.

### Streams and uploads (§4.7, §4.8, B3 retirement)

The reducer's semantics are unchanged and were re-proved under managed composition:

- stream-id correlation;
- supersession, via `streamSuperseded`, which is now composed into the parent in a test;
- concurrent per-message uploads;
- "only the latest reply streams";
- Stop cancelling only its own owner's work.

There is one thing correlation alone cannot do. A replaced owner starts again at `streamGeneration` 1, so the predecessor's late callbacks carry the same `streamId`. What rejects them is owner identity, together with the subscription's own `live` flag. The test "a replaced owner starts again at the same stream id without hearing its predecessor" pins this.

### Business handoff (the brief's "honest mapping")

The README table maps each user intent to what the chat does and what the parent should do:

| Action | Chat does | Parent does |
| --- | --- | --- |
| `sendMessage` | Uploads the attachments, then streams via `streamMessage` | Records the prompt. There is no `messageSent`. |
| `streamComplete` / `streamError` | — | Persists the reply, which is the child's last message after reduction. |
| `copyMessage` → `copySuccess` / `copyError` | Writes to the clipboard in its own effect | Shows the confirmation. |
| reactions, delete, edit, clear | Updates local state only | Sends the change to the server, if the app has one. |

Nothing is performed silently on the parent's behalf: the chat has no dependency that sends reactions, deletions or edits anywhere, and the README says so.

## Optional peers (O12, O15, B3 matrix)

`packages/chat/scripts/verify-optional-peers.mjs` is repository-only; the package's `files` field keeps it out of the tarball. It works as follows:

1. Packs core and chat with `npm pack --ignore-scripts` into `$TMPDIR`. No workspace file is written.
2. Installs them with npm, which never installs optional peers, together with the workspace's exact versions of svelte, vite, vite-plugin-svelte and typescript.
3. Asserts that `prismjs`, `@composable-svelte/code`, `@composable-svelte/media` and `pdfjs-dist` are absent. With those peers absent:
   1. A plain Node import of `./streaming-chat/markdown` works: `optionalDependenciesReady` settles, code renders escaped and unhighlighted, and there is no `VideoEmbed` or video extraction.
   2. `tsc` with `skipLibCheck: false` and `exactOptionalPropertyTypes` passes over all three entry points, including a `ChildView` fed to a variant, a primitive and a hook.
   3. Vite SSR renders the three variants from the root and `ChatMessageWithActions` from `./streaming-chat`, after the lazy load has settled.
   4. `vite build` succeeds.
   5. Chromium loads the build. The chat renders, a PDF attachment shows the missing library in its own error box, a message streams, and there are no page errors.
4. Then **installs `prismjs` into the same consumer**, with no code change. Node and Vite SSR now highlight. A positive control shows that the plain-code assertion rejects highlighted output.

**Emitted declarations.** They mention the optional peers only in comments; verified with `grep` over `dist/**/*.d.ts` and by step 2 above.

**Defect found by phase B.** `markdown.ts` did `Prism = await import('prismjs')`. `prismjs` is CommonJS, so Node's ESM loader, and any SSR build that leaves it external, exposes it only as `default`. `Prism.languages` was therefore `undefined`. Every block rendered plain and logged "Failed to highlight code block" on the server. Bundled browser builds were unaffected. The fix is `module.default ?? module`.

- **Mutation.** With HEAD's `markdown.ts` rebuilt, the script fails in phase B with `node with prismjs: not highlighted`; with the fix restored it passes.
- **A test I removed.** I first wrote an in-suite Node test for this. It passed against HEAD too, because vite-node applies its own CJS interop. A test that cannot fail is not a guard, so I deleted it. The script is the guard.

**Not covered here.** Matrix rows (c) prismjs + code and (d) media present, in the packed form. Both packages are being edited by other workers and their `dist` is not a frozen candidate. See "Remaining gates".

## Tests added

| File | Env | Tests | Covers |
| --- | --- | ---: | --- |
| `tests/managed-chat.test.ts` | Chromium | 20 | Each variant: standalone stream, managed stream plus parent handoff once, retirement empties the component and aborts once with no late delivery (×3 each). Sibling isolation on shared effect ids. Replacement with the same stream id. Unkeyed store change clears the draft. File pick across a store change. File read across retirement. Blob revocation at retirement, once. Upload in flight at retirement never replies. Concurrent per-message uploads with supersession and sibling independence. Root destroy aborts all. Copy and reaction handoff through the real UI. Retired primitives render nothing. |
| `tests/managed-collaborative.test.ts` | Chromium | 5 | Retiring closes the socket and drops its frames. Hooks release window/input listeners, the interval and typing timers without a disposer (`vi.getTimerCount() === 0`, no warnings). An already-retired view. The standalone teardown is unchanged. The `{ dispatch }` stand-in still works. |
| `tests/readme-recipes.test.ts` | Chromium | 2 | The README recipe is quoted verbatim. Mounted through `ApplicationRoot` / `FeatureViews` / `FeatureOutlet`: replies are archived once, close aborts mid-reply, reopening is a fresh owner, and there are no console errors or warnings. |
| `tests/ssr/managed-ssr.test.ts` | Node | 6 | Server render from a standalone store, a live view and a retired view, for each variant and primitive. No revoke on the server. The recipe renders without touching the transport. |
| `tests/test-components/ManagedPropTypes.svelte` | svelte-check | — | Built declarations accept `ChildView` for every store-taking public surface. `@ts-expect-error` shows that a foreign action union and a chat view passed to a collaborative hook are both rejected. |

**Fixtures and recipe:**

- `tests/fixtures/managed-chat.ts`: two sibling slots, a parent handoff reducer, a driven transport and an uploader;
- `tests/recipes/ManagedChat.svelte`.

## Mutation verification

Each mutant was applied to a copy and restored from a saved tree. I confirmed with `diff -r` that the restored tree is identical.

| Mutant | Result |
| --- | --- |
| HEAD variants, primitives and hooks | 10 of 27 new browser tests fail. Every retirement, draft, file and hook case fails; the live-stream, isolation and upload cases pass, as they should, because they pin unchanged reducer and core behaviour. |
| HEAD components under SSR | 4 of 6 fail, with a `TypeError` on the retired view. |
| `FullStreamingChat` without the release at retirement | 1 fails: the revocation case. |
| File pick dispatching to the current `store` | 1 fails: file pick across the store change. |
| No release of files read after retirement | 1 fails. |
| `MinimalStreamingChat` without the draft reset | 1 fails. |
| `watchRetirement` made inert | 2 fail: the hook release cases. |
| Hooks without the double-dispose guard | 2 fail. |
| `ChatMessageWithActions` rendering when retired | 1 fails. |
| HEAD `markdown.ts` in the packed-install script | Phase B fails. |

## Verification (exact results, final bytes)

All commands were run in `packages/chat` unless noted.

| Command | Result |
| --- | --- |
| Baseline `pnpm exec vitest run`, before any edit | 28 files / 254 tests passed. 2 files failed to load with `Vitest failed to find the runner` / `No test suite found` while other workers' Chromium instances were running. Rerun of those 2 files: 51/51. Baseline total **305/305**, matching INVENTORY §1. |
| Baseline SSR (`--config vitest.ssr.config.ts`) | 2 files, **5/5** |
| `pnpm run build` | exit 0 (`src/lib -> dist`, 25 declaration bridges) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` (svelte-check `--fail-on-warnings`: tests, recipe and type fixture against built `dist`) | exit 0, **0 errors, 0 warnings** |
| `pnpm test`, final | Browser: 33 files, **332/332**. SSR: 3 files, **11/11**. Exit 0. |
| One intermediate full-suite run | Died with `[birpc] rpc is closed` (browser connection lost under contention) and reported no results. The immediate rerun passed 305/305. Nothing was changed in between. |
| `node scripts/verify-optional-peers.mjs` (after build) | exit 0, phases A1–A5 and B as described above |
| `git diff --check -- packages/chat` | clean |
| Console scan of the final run | Only the pre-existing `cleanup-tracker.test.ts` warnings, which are identical in the baseline log. No `dispatch after destroy`, `Already disposed` from hooks, `Subscriber error` or `Failed to highlight`. |

**Test count.** 305 + 20 (`managed-chat`) + 5 (`managed-collaborative`) + 2 (`readme-recipes`) = **332**. SSR is 5 + 6 = **11**. No existing test was changed or removed.

**Core repository guards, run read-only.** Command (in `packages/core`): `pnpm exec vitest run --config vitest.node.config.ts` over 18 `tests/repo` guards: animation-policy, peer-ranges, published-files, export-surface, doc-examples, doc-typecheck, front-door, skill-examples, satellite-theming, changelog-shape, component-coverage, dist-freshness, dist-import, side-effects, optional-props, typecheck-coverage, check-coverage and flat-barrel. `git status --porcelain` was the same before and after.

- **Passed:** 14 files; 389 of 410 tests.
- **Failed:** 21 tests in 4 files. All are environmental: auth, charts, graphics and maps have no `dist` in this worktree (`dist-freshness`, `side-effects`, `doc-typecheck` "ran against a built library", `flat-barrel`). No failing arm names chat.
- **Not run:** `guard-integrity`, which writes into core's `tests/`.

## Files

**Source:**

- `src/lib/internal/view-store.ts` (new);
- the variants `{Minimal,Standard,Full}StreamingChat.svelte`;
- the primitives `{ChatMessageWithActions,ActionButtons,ContextMenu}.svelte`;
- `collaborative-hooks.ts`;
- `markdown.ts` (the Prism interop fix);
- `src/lib/streaming-chat/README.md` (the prop type).

**Tests:** the files in the tables above.

**Configuration:**

- `vitest.config.ts`: the alias list, plus the package name resolved to source for the recipe;
- `vitest.ssr.config.ts`: the same alias, plus server compilation of rune modules (core's `.svelte.js` store), mirroring media.

**Script:** `scripts/verify-optional-peers.mjs`.

**Docs:**

- `README.md`:
  - a new "Managed applications" section (recipe, retirement, store change, hooks, business table, operational limits);
  - optional-peer degradation, under Installation;
- `CHANGELOG.md`: `Unreleased` gains Changed, Added and Fixed entries.

## Remaining gates and parent items (outside this lane's authority)

1. **Peer floors (O15, A2).**
   - Chat's own runtime needs only what core `^0.13.0` exports.
   - The optional `@composable-svelte/media` peer now imports `isManagedChildView` / `observeChildActions` at runtime (MEDIA-MIGRATION item 6). A consumer with media present therefore needs the core release that exports them.
   - The optional `code`/`media` ranges (`^0.4.0`) must follow their release lines.
   - The parent sets all three.
2. **Optional-peer matrix rows (c) and (d) in packed form.** Run `verify-optional-peers.mjs` extended with the frozen code and media candidate tarballs, as prismjs + code, and as media present with lazy `VideoEmbed` arrival. The workspace suite already covers media present from source (`video-embed-lazy`, `chat-optional-video`, `ssr/video-embed-ssr`).
3. **The script ran against core's current, uncommitted `dist`,** packed with `--ignore-scripts`. Rerun it on the frozen core candidate. Also consider adding it to CI or to `verify-consumer.mjs`.
4. **Skill file.** `.claude/skills/composable-svelte-chat/SKILL.md` documents only standalone `createStore` use. It needs the managed recipe and the hook retirement note, and it is guarded by core's `skill-examples`.
5. **`scripts/verify-consumer.mjs`** at integration. The README's `consumer-file` blocks are unchanged, and the new recipe block is not a consumer-file.
6. **Behaviour change to note in release notes.** The collaborative hooks now subscribe to their store, in order to detect retirement. For a standalone store this is one extra state listener per hook, and it releases with the teardown.
7. **Known limits, documented in the README:**
   - the blob URLs of already-sent attachments are not revoked at retirement;
   - the draft and scroll position do not survive a remount;
   - hiding a `FullStreamingChat` without retiring its store still revokes its pending previews at unmount, which is pre-existing standalone behaviour and was kept.

## Follow-up: independent review M1, L1, L2, L3 (2026-09-25)

Scope: `packages/chat` only. Core, code and media were not touched, nor were the root, the version or the peers. Nothing was committed or published. The source is `CHAT-INDEPENDENT-REVIEW.md` §1.

### Changes

**M1: absent `prismjs` in a production Vite build.**

- `markdown.ts` now accepts the resolved `prismjs` module only when it has Prism's shape: a `highlight` function and a `languages` object. The new `asPrism` helper checks this.
- Vite's `export default {}` stub for an absent optional peer (client or `--ssr` production) therefore leaves `Prism` at `null`. The renderer already treats `null` as "not installed", so no per-block `Failed to highlight` warning appears.
- Node's CommonJS `default` interop (`module.default ?? module`) is kept. Phase B still highlights under plain Node and SSR.

**Found while doing M1.**

- In the same production SSR bundle, `getVideoEmbedComponent()` returned `undefined` when media was absent. The contract says `null`.
- Both media members are now `?? null`. The components were unaffected because they gate on truthiness.
- The new A3 production-SSR assertion (`video === false` via `!== null`) caught this on its first run.

**`verify-optional-peers.mjs`.**

- **A3:** adds a production `vite build --ssr` render. `ssr-build.mjs` captures `console.warn`/`console.error`. The render must produce the three variants, plain code, no `VideoEmbed`, and an empty console list.
- **A5:** collects Chromium `console` warnings and errors alongside `pageerror`, and asserts both are empty.
- **Streamed reply:** the consumer's reply now streams a fenced block. Without that, A5 cannot see the defect: the fixture's only code block renders before the lazy peer load settles, and nothing re-renders it afterwards.
- **Deliberate mutation, inside the script:** the installed chat's `node_modules/.../dist/streaming-chat/markdown.js` is rewritten to `Prism = module.default ?? module;`, which is the pre-fix line. The target line must exist. The script then rebuilds and asserts:
  - the A3 check throws, and its issues name `Failed to highlight`;
  - the A5 check throws the same way.

  The file is restored in `finally`, before phase B.
- **Development evidence:** before the streamed block was added, the browser half of the mutation did *not* fail (`Missing expected exception`). This is how the gap above was found. The control is therefore known to be able to fail.

**L1: `useTypingEmitter`.**

- `start` returns immediately once `cleanup.disposed` is true.
- `update` requires `isTyping && !cleanup.disposed`.
- After automatic retirement or teardown, the emitter dispatches nothing, arms no timer and does not warn.

**L2: `FullStreamingChat` attachment custody.**

- The single `heldAttachments` list is replaced by a per-source `Map<ViewStore, { held, stop }>`.
- For each `store` value the component has shown, `hold(source)` subscribes once through the new internal helper `followOwner(source, onState, onRetired)` in `internal/view-store.ts`. `watchRetirement` is now `followOwner` with a no-op `onState`. This is the existing owner-state mechanism, extended rather than duplicated.
- `onState` records the latest `pendingAttachments`. `onRetired` revokes that last-notified list and drops the entry. The retired store is never read.
- **A prop change revokes nothing**, whether it goes live → live or live → already-retired.
- **A previous source stays followed while the component is mounted.** When its owner later retires, its URLs are revoked.
- **Unmount policy:** unmount revokes every source still held, not only the current one. This is the pre-existing "unmount revokes" rule, generalised so that no followed conversation leaks. It keeps the pre-existing hazard: a still-live previous conversation shown elsewhere loses its previews when this instance unmounts. See the gaps below.
- The subscription is made in `$effect.pre` under `untrack`, so it does not run on the server. There, `onDestroy` finds an empty map, as `managed-ssr` requires.
- Stream and upload ownership, file-pick targeting and business handoff are unchanged. The reducer is not touched.

**L3.** "Does not carry the draft across" is now `it.each(variants)` over Minimal, Standard and Full.

**Docs.**

- `README.md`: store-change custody, inert typing emitter after release, and quiet absent-`prismjs` production builds.
- `CHANGELOG.md` Unreleased: three Fixed entries and an expanded script entry.

### New tests

| File | Test | Pins |
| --- | --- | --- |
| `managed-collaborative.test.ts` | a typing emitter retired under its consumer stays inert and quiet | L1: after `leave`, `start`/`update`/`stop` add no frame, no action and no timer (`getTimerCount() === 0`), and `console.warn` is never called |
| `managed-chat.test.ts` | a live-to-live store change revokes nothing; each owner revokes its own URLs when it retires (×2: previous-first, current-first) | L2, both directions |
| `managed-chat.test.ts` | a change to an already-retired view leaves the live conversation's URLs alone | L2, the review's first scenario |
| `managed-chat.test.ts` | unmount revokes every conversation it still holds, once, and a later retirement adds nothing | L2 unmount policy, no double revoke |
| `managed-chat.test.ts` | an unkeyed {Minimal,Standard,Full}StreamingChat whose store changes does not carry the draft across | L3 (was Minimal only) |

### Mutation checks

Each check applied one mutation to the final source, ran only the affected file, and restored the source from a copy. Afterwards the restored bytes were confirmed with `grep`, and the build was rerun.

| Mutation | Result |
| --- | --- |
| L1 guards removed (`start` and `update`) | `managed-collaborative`: 1 failed, 5 passed. The failure was the new inert test. |
| L2: the previous `heldAttachments` / `$effect.pre` release restored verbatim | `managed-chat`: 4 failed, 22 passed. All four L2 tests failed. |
| `StandardStreamingChat` draft reset removed (`inputValue = ''`) | `-t draft`: 1 failed (Standard), 2 passed |
| `FullStreamingChat` draft reset removed | `-t draft`: 1 failed (Full), 2 passed |
| Installed `markdown.js` reverted to accept the stub (in-script, every run) | A3: 3 warnings. A5: 2 warnings. Both assertions threw as required. |

### Verification (final bytes)

All commands were run in `packages/chat`.

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/managed-chat.test.ts tests/managed-collaborative.test.ts` | 2 files, **32/32**: `managed-chat` 26 (was 20), `managed-collaborative` 6 (was 5) |
| `pnpm run build` | exit 0: `src/lib -> dist`, `Emitted 25 NodeNext Svelte declaration bridges` |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` | exit 0: `svelte-check found 0 errors and 0 warnings` |
| `pnpm test`, once, final | exit 0. Browser: `Test Files 33 passed (33)`, `Tests 339 passed (339)`. SSR: `Test Files 3 passed (3)`, `Tests 11 passed (11)`. The SSR run took 659.81 s wall time (`transform 660.29s`) because other workers loaded the machine. The tests themselves took 644 ms. |
| Console scan of that log | The only match for `Failed to highlight` / `Setting timeout after dispose` / `Subscriber error` / `dispatch after destroy` is the intentional `cleanup-tracker.test.ts` "does not create active timer … after dispose" line, identical in the previous final log. |
| `node scripts/verify-optional-peers.mjs`, after the final build and after the suite | exit 0. Output below. |
| `git diff --check -- packages/chat` | clean |

Full output of `node scripts/verify-optional-peers.mjs`:

```
Phase A: installed without prismjs, @composable-svelte/code, @composable-svelte/media, pdfjs-dist
  1. node import of ./streaming-chat/markdown: plain code, no video
  2. tsc skipLibCheck:false over root, ./streaming-chat, ./streaming-chat/markdown
  3. SSR of the three variants and ChatMessageWithActions
  3. production SSR bundle: same render, no console warning or error
  4. vite build
  5. browser: renders, PDF reports its missing library in place, streams; no page error, no console warning or error
  mutation: the stub taken for Prism is caught by A3 (3 warning(s)) and A5 (2)
Phase B: prismjs installed later is picked up lazily by Node and SSR; positive control rejected the plain-code check
  packed composable-svelte-chat-0.4.1.tgz
  packed composable-svelte-core-0.13.0.tgz
```

Test count is now **339** browser tests, +7 over 332: L1 +1, L2 +4, L3 +2. SSR is **11**, unchanged.

### Remaining gaps

1. **The L2 unmount policy is a choice.** Unmount revokes every conversation the instance still follows. That includes a previous one that is still live and possibly shown by another component.
   - The alternative is to keep following past unmount and revoke only at retirement. It would leak a listener forever on a standalone `Store`, which never retires, and chat cannot tell the two kinds apart without a runtime core import.
   - The parent may revisit this. The behaviour is documented and pinned.
2. **Entries accumulate.** An unkeyed instance swapped across many standalone stores keeps one small subscription per store until unmount. Managed stores release theirs at retirement. Stores are keyed by identity, so a parent that rebinds a new view object for the same owner on every render adds one entry per binding. Revocation is still correct, and a duplicate revoke is harmless.
3. **The phase-A console assertions cover the no-peer row only.** Rows (c) and (d) of the packed matrix, run against frozen code and media tarballs, are still parent items, as are all of review §4.
4. **The script still packs core's working-tree `dist`.** Rerun it on the frozen core candidate. It is not yet wired into CI or `verify-consumer.mjs`.
5. **Cosmetic:** the script prints two lines numbered `3.` (dev-server SSR and production SSR). It was left as is so the recorded output matches the final bytes.

## Final installed archive and shipped managed recipe

The final archive `/private/tmp/t5-chat/composable-svelte-chat-0.4.1.tgz`
(SHA-256 `191596e3c4c32df71383e6a7633e30ec4343034abefb62c028124bba683622ae`)
includes `recipes/managed/ManagedChat.svelte`, its deterministic Chromium test,
Vitest config and an ownership/troubleshooting README. The test passed 1/1
from files extracted directly from the archive; with the local Svelte 5.30
compiler and TypeScript toolchain, `svelte-check` found 0 errors and 0 warnings.
The recipe config explicitly prebundles CommonJS `isomorphic-dompurify`; without
that Vite's browser test import lacks a default export. The archive's `dist/`
is byte-identical to the reviewed runtime archive SHA `d0bfe4e594887e4edfd74c7eaa7c0ea916e9d0b37a84854da61ff8c8d3803e51`.
The earlier Chat archive is superseded. The optional-peer A/B script now accepts
exact Core/Chat tarball paths via environment variables; the frozen Core+Chat
A/B run and Code/Media C/D additions are recorded in `LANE-FINAL-HANDOFF.md`.
