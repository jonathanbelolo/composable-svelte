# Media migration: managed views, native ownership, business handoff

- **Worker:** Claude Opus 5.5, the media-only implementation worker.
- **Date:** 2026-09-25.
- **Worktree:** 2359, HEAD `ffd3ca51`.
- **Inputs:** `COMMAND-DELIVERY-DECISION.lead-copy.md`, `B1-CONTRACT-REVIEW.md` (K1, K2, A1, A2, R3, R5) and `INVENTORY.md` §4.4–4.6, O7–O10, O14 and proof rows M1–M12.
- **Status:** uncommitted and unpublished. No version, peer floor, lockfile, checker, core, code or chat file was changed. Edits are confined to `packages/media` and this file.

## Outcome

`MinimalAudioPlayer`, `FullAudioPlayer`, `PlaylistView` and `VoiceInput`, together with the internal voice panels, now accept either kind of store:

- a standalone `Store`;
- a genuine managed `ChildView`: `FeatureViewProps.store`, `composition.bind` or typed `scopeTo`.

**Retirement.** When the owner retires, the view's state becomes `undefined`. Each component then renders nothing and releases its native resource. Nothing throws.

**Audio ids.** A player given an explicit `id` never shares an audio element with another player (policy: **isolate**).

**Microphone ownership.** `VoiceInput` no longer releases the microphone itself. The store owns the microphone, so an injected `deleteAudioManager` is honoured.

**Transcripts.** Under managed composition, the parent reducer owns the business result (the transcript). `onTranscript` still works on both paths, and is now optional.

**Pre-existing defect.** While doing this work I found and fixed a defect that no test had caught: mounted players never drove their `<audio>` element.

## Decisions

### Prop type and the dual path (K1, K2)

- **Prop type.** The components' `store` prop is `ViewStore<S, A> = Store<S, A> | ChildView<S, A>` (`src/lib/internal/view-store.ts`). This type is internal and cannot be reached from any `exports` entry.
- **Action observation.** It goes through one shared helper, `observeActions(source, listener, component)`, as the decision requires. There is one path per kind of input:
  - **A genuine managed view** goes to `isManagedChildView`, then `observeChildActions`. A retired view is inert, as core defines it.
  - **A value with a callable `subscribeToActions`** uses that function. The check is an explicit capability check, which is the form K1's refinement pins for the `Store | ChildView` false branch.
  - **Anything else** still renders and dispatches. It warns once per source, and the warning names the likely causes:
    - a copy or wrapper of a view;
    - an `ApplicationStore`;
    - a second copy of core;
    - a custom `Store` without `subscribeToActions`.

    It never throws, per K2.
- **TestStore.** The legacy throw from `TestStore.subscribeToActions` is neither masked nor changed (R7).
- **Where the helper is used.** Only `VoiceInput` needs action observation. The players and the playlist are state-driven, so they have no command channel.

### Retirement (O10, M6)

- **Reads.** Every read is `S | undefined`:
  - the players and the playlist derive `playerState` and wrap their markup in `{#if playerState}`;
  - handlers guard or use `duration()`;
  - the voice panels read `$store?.…`.
- **Rendering.** A retired view renders nothing.
- **Players.** A player releases its element when the state becomes `undefined`, and not only at unmount. A player bound by hand, which outlives its owner, therefore stops playing for nobody.
- **Voice.** For voice, the owner's resources (microphone, loops, transcriptions) are released by core's owner retirement. The component dispatches nothing to a retired view.

### Audio player engine ownership (O9, M1–M4)

**Ownership.**

- Each mounted player creates its own `AudioManager`, and so its own `HTMLAudioElement`, through `createAudioEngine` (`src/lib/audio-player/audio-engine.ts`). This replaces the old get-or-create by id.
- The engine is created per bound store, inside an `$effect` keyed on `store` and on liveness.
- A new `store` prop gets a fresh engine, so an element's callbacks only ever reach the store it was created for (R3). `restorePreferences` is dispatched once per bound store.

**Explicit `id` policy: isolate, compatibly.**

- The `id` is only a registry *name*. The player registers its own manager under it, through the internal `_nameAudioManager`.
- **Duplicate id.** If another live player already holds the name:
  - the name moves to the later player, with a `console.warn` that names the id;
  - the earlier player keeps its element, its callbacks and its playback;
  - the earlier player is neither reconfigured nor disposed.
- **Unmount.** Unmounting removes the name only while it still refers to that player's manager (`_unnameAudioManager`, an identity check). One player can never silence or dispose another.
- **Why not reject.** Rejecting would mean throwing on mount, which turns a working page into a crash.
- **Why "last wins".** The name follows the most recently mounted player. That is the right result even if a keyed remount mounts the new player before the old one unmounts.

**Other audio changes.**

- An omitted `id` is no longer registered at all. Before, it was registered under `$props.id()`, which nothing could look up.
- The public `getAudioManager`/`deleteAudioManager` keep their semantics. The README now warns that `getAudioPlayerManager(id, config)` on a mounted player's name redirects that player's callbacks.
- New additive public getter: `AudioManager.disposed`.

**Defect found and fixed.**

- In both players, the old state-to-element `$effect` returned on `if (!audioManager) return;` before it had read any reactive state, because `onMount`, which creates the manager, runs after it. So it never ran again.
- Result: Play, Pause, volume, speed and seek changed the store and nothing else.
- I confirmed this with a probe on HEAD: after clicking Play, `isPlaying` was `true` and `play` had been called 0 times. The new sync `$effect` depends on the engine and the state. The regression test is "%s player drives its element from state".

### VoiceInput ownership (O7, O8, M5–M10)

**Release on unmount.**

- The release runs in an `$effect` teardown keyed on `store`, so it is client-only and does not run on the server.
- It dispatches `deactivateVoiceInput`, but only when the live state holds a device or a pending request (`_audioManagerId !== null || status === 'requesting-permission'`).
- Release goes through the reducer's existing `releaseAudioManager` path, which means:
  - an injected `deleteAudioManager` is honoured;
  - a pending permission request is cancelled, and a late grant is disposed;
  - an app-owned legacy device (`_ownsAudioManager` undefined) is still released through the store's dependencies;
  - the store is left `idle` rather than `recording` against a released device.
- The old code instead called the **built-in** registry's `deleteAudioManager($store._audioManagerId)`. For an injected registry that did nothing, so the device leaked. It also threw once the state was `undefined`.
- **Recorded behaviour change:** unmounting also abandons an in-flight transcription, because deactivation cancels session work. Retiring a slot or destroying the store already did this.

**`onTranscript`.**

- It is now optional. It is read when each transcript arrives, so replacing the callback neither drops nor repeats a transcript.
- It is observed on both paths.
- The conversation panel's history remains component state, as before. It does not survive a remount, and the README says so.

**Business handoff (R5, M9).**

- The README recipe composes the child's `transcriptionCompleted` in the **parent reducer**. Children reduce first, so this happens once per utterance, into `drafts`. Those drafts survive the retirement of the slot.
- `observeChildActions` is not presented as the pattern for business results.

### VideoEmbed

VideoEmbed takes no store and needs no migration. SSR and the plain-props usage were confirmed. The README states that it needs no store.

## Proof rows

| ID | Result | Evidence |
| --- | --- | --- |
| M1 | Two players with one explicit `id` own separate elements; callbacks are not redirected. Unmounting either one leaves the other playing, obeying its store and receiving `timeupdate`. The name belongs to the later player; a warning is emitted once. | `audio-mounted.test.ts` "two players given one explicit id … unmounting the first/second …" (2 cases) |
| M2 | A player bound by hand that outlives its owner: at retirement it renders nothing, and the element is paused with `src` cleared. Later element events dispatch nothing. The sibling keeps playing and keeps receiving. | "a player that outlives its owner releases the element at retirement …" |
| M3 | A replaced owner gets a new element for the new track. The old element's events never reach the replacement. An unkeyed component whose `store` prop changes rebinds. | "a replaced owner gets a fresh element …", "an unkeyed player whose store prop changes …" |
| M4 | `NotAllowedError` gives exactly one `error` action, `isPlaying` is `false` and there is no retry. `AbortError` gives no error. | "a play() rejected with %s reports %i error and does not retry" (2 cases) |
| M5 | Unmount while recording, with the default registry and with an injected registry: exactly one release through the configured owner. The registry entry is gone, the device is cleaned once, the store is idle, there are no later actions, and `destroy()` does not release twice. | `voice-input-ownership.test.ts` "an injected registry releases …", "the built-in registry releases …" |
| M6 | A retired voice slot before component teardown: the component renders nothing and releases once through the injected `deleteAudioManager`. Unmounting afterwards adds no release, no `console.error` and no callback. | "retirement before teardown releases the device once …" |
| M7 | Unmount during a permission prompt with no key held (conversation auto-activation): the late grant is disposed, nothing records and the registry is empty. | "unmounting during the permission prompt disposes a late grant …" |
| M8 | A transcription that resolves after same-slot replacement reaches neither the replacement, nor the parent's `drafts`, nor `onTranscript`. | "a transcription that resolves after replacement …" |
| M9 | The README recipe through `ApplicationRoot`/`FeatureViews`/`FeatureOutlet` with no `onTranscript`: one draft per utterance. "Stop dictating" releases the device through the injected deleter. The drafts survive, and a second session appends. No warnings or errors. | "README recipe: … composes one draft per utterance …" |
| M10 | Two standalone siblings sharing one injected registry: unmounting one mid-recording leaves the other recording. | "retiring one of two siblings mid-recording …" |
| M11 | Node SSR renders all five public components, the managed and retired views, and both recipes. `Audio`, `AudioContext`, `MediaRecorder` and `getUserMedia` are installed as spies and never called. No voice device is created, and `window` is undefined. | `tests/ssr/media-ssr.test.ts` (8) |
| M12 | **Not done:** real-device capture. It remains with the release verification owner (O16). | — |

**Also covered:**

- `onTranscript` still fires exactly once on the standalone path and on the managed path.
- A copy of a view renders and dispatches, and warns exactly once.
- Both README recipes are quoted verbatim (`readme-recipes.test.ts`).
- The managed player recipe plays and releases the element on close.

## Mutation verification

Each mutation was reverted by copying the saved file back.

- **HEAD players**, by swapping in `git show HEAD:` Full and Minimal: 9 of the 13 tests in `audio-mounted` fail. That is every new test; the 4 pre-existing tests pass.
- **`_unnameAudioManager` without its identity check:** 1 fails, the M1 "first" case.
- **Players without release on retirement** (`if (!live) return` disabled): 2 fail, M2 and M3.
- **HEAD `VoiceInput` and its panels:** 8 of 10 fail. The 2 that pass are the compatibility checks:
  - standalone `onTranscript`;
  - the permission test in its first form, which the button's key-hold cancel also satisfied. I then changed it to a prompt with no key held (conversation auto-activation). Against HEAD `VoiceInput`, that test fails.
- **`VoiceInput` without the unmount `deactivateVoiceInput`:** 4 fail (M5 twice, M7, M10).
- **HEAD `FullAudioPlayer` under SSR:** 1 fails, the retired-view arm, with `TypeError … 'seekPosition'`.
- **One word changed in the README's voice recipe:** 1 fails, the verbatim quote.

## Verification (exact results, final bytes)

All commands were run in `packages/media`.

| Command | Result |
| --- | --- |
| baseline `pnpm exec vitest run` before any edit | 18 files, **175/175** passed |
| `pnpm run build` | exit 0 (`src/lib -> dist`, 11 declaration bridges) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` (svelte-check, `--fail-on-warnings`, includes tests, recipes and doc-examples against the built `dist` declarations) | exit 0, **0 errors, 0 warnings** |
| `pnpm test`, attempt 1 | exit 1. Vitest reported `Browser connection was closed while running tests` and executed **no tests**. This was an infrastructure failure while another worker was running Chromium. Nothing was changed before the retry. |
| `pnpm test`, attempt 2 | exit 0. Browser: 20 files, **196/196** passed. Node SSR: 1 file, **8/8** passed. |
| `git diff --check -- packages/media` | clean |
| scan of the suite's console output for `dispatch after destroy`, `[VoiceInput]`, `[*AudioPlayer]` or `state_unsafe` | none |

**How 196 is made up.** Start from 175. The shared-id reproduction was removed, and the other 4 tests in `audio-mounted` stay. Then:

| Added | Tests |
| --- | ---: |
| new cases in `audio-mounted` | 9 |
| `voice-input-ownership` | 10 |
| `readme-recipes` | 3 |

**Core repository guards, run read-only.** The guard files were used as they are, and `git status --porcelain` was the same before and after.

- **All media arms pass:** animation-policy, peer-ranges, published-files, export-surface, doc-examples, intentionally-unused, front-door, skill-examples, satellite-theming, changelog-shape, component-coverage, dist-freshness, dist-import, side-effects, optional-props, typecheck-coverage and check-coverage.
- **The failures are environmental and not from media:**
  - `flat-barrel`;
  - `dist-freshness`;
  - `side-effects`.

  All three fail only because `auth`, `charts`, `chat`, `graphics` and `maps` have no `dist` in this worktree, and `code`'s `dist` is older than the other worker's live source edits.
- **Not run:** `guard-integrity`, because it writes a probe into core's `tests/` directory. Also not run: `scripts/verify-consumer.mjs`, root builds, and the installed-tarball fixture.

## Files

**Source:**

- `src/lib/internal/view-store.ts` (new: `ViewStore`, `observeActions`);
- `src/lib/audio-player/audio-engine.ts` (new);
- `audio-manager.ts` (name/unname helpers, and the `disposed` getter);
- `FullAudioPlayer.svelte`, `MinimalAudioPlayer.svelte`, `PlaylistView.svelte`;
- `voice-input/VoiceInput.svelte` and `components/{VoiceInputButton, VoiceInputPanel, PushToTalkPanel, ConversationModePanel}.svelte`.

**Tests:**

- `audio-mounted.test.ts`: the reproduction becomes a desired-result regression, and 9 cases are added;
- new: `voice-input-ownership.test.ts`, `readme-recipes.test.ts`, `ssr/media-ssr.test.ts`;
- fixtures: `fixtures/{managed-players.ts, managed-voice.ts, PlayerRebind.svelte}`;
- recipes: `recipes/{ManagedVoice, ManagedPlayer}.svelte`.

**Configuration:**

- `vitest.config.ts`:
  - excludes `tests/ssr`;
  - resolves the exact specifier `@composable-svelte/media` to `src/lib/index.ts`, so the mounted recipes test source and never a stale `dist`. svelte-check still resolves the specifier to `dist`.
- `vitest.ssr.config.ts` (new): server compilation of `.svelte` files and rune modules.
- `package.json`: the `test` script also runs the SSR config, as chat's does. Versions and peers are untouched.

**Docs:**

- `README.md`:
  - props table for both players; `showPlaylist` corrected to `showPlaylistInfo`/`showExpandButton`;
  - element-ownership paragraph and the player id policy;
  - `HTMLAudioElement`, not `AudioContext` (O14);
  - `currentTrackIndex: -1` (O14);
  - microphone ownership and unmount semantics;
  - a new "Managed applications" section quoting both recipes.
- `CHANGELOG.md`: `Unreleased` gains Added, Changed and Fixed entries.

**Placement of the recipes.** They are deliberately outside `tests/doc-examples/`. Core's `doc-examples.test.ts` requires that directory to match its `EXPECTED_EXAMPLES` list exactly, and that list is core's file. Their verbatim guard is media-local instead.

## Parent integration items (outside this lane's authority)

1. **A2, peer floor.** `packages/media/package.json` still declares `"@composable-svelte/core": "^0.13.0"`. The new `internal/view-store.js` imports `isManagedChildView` and `observeChildActions` from `@composable-svelte/core/application` at runtime. Against a core without them, the named import fails at bundle time. Raise the floor to the exporting core version once core is bumped; the CHANGELOG already states the requirement.
2. **A1, one copy of core.** Media's installed-tarball fixture is still to do:
   - mount the packed `dist` `VoiceInput` and a player, fed by `FeatureViewProps.store` from core's packed `application` entry;
   - assert the managed path: the transcript reaches the parent, there is no `[VoiceInput]` warning, and the element is released on retirement.
3. **Skill file.** `.claude/skills/composable-svelte-media/SKILL.md` needs updating. It sits outside `packages/media` and is guarded by core's `skill-examples`. At :426 it says `onTranscript` is required, which is now optional. It documents no managed usage, and names `playerStore` props at :99/:102.
4. **Consumer verification.** Run `scripts/verify-consumer.mjs` at integration. The README's `consumer-file` blocks are unchanged.
5. **M12** remains a real-device release gate.
6. **Chat.** Chat loads the media root with `import('@composable-svelte/media')` (`chat/src/lib/streaming-chat/markdown.ts:117`), and uses only `VideoEmbed` and the video extractors, which this migration leaves unchanged.
   - The media root now transitively imports `@composable-svelte/core/application`, through the player and voice components. When media is present, chat therefore needs a core that exports the new names; this is the same peer-floor dependency as item 1.
   - The media SSR suite shows that the application entry imports and renders cleanly in Node.
   - Chat's optional-peer matrix (B3/D1) should run against the migrated media `dist`.

## Resolution of the independent review (follow-up)

- **Worker:** Claude Opus 5.5, the media follow-up worker.
- **Date:** 2026-09-25.
- **Input:** `MEDIA-INDEPENDENT-REVIEW.md` (F1–F8), plus the lead's decision on F3 (the report's preferred option 1).
- **Scope:** `packages/media` and this file only. No core, code, chat, root, version, peer or lockfile change. Nothing committed or published.
- **Supersedes:** two statements earlier in this file.
  - The "Recorded behaviour change" under *VoiceInput ownership*, which said unmounting abandons an in-flight transcription. After F3 it no longer does, as described below.
  - Proof row M10's title. After F7 the test is named honestly, and a managed variant exists.

### F1 and F2: the player registry has provenance

**Where:** `audio-manager.ts` keeps a module-private `WeakSet` of player-owned managers. `_nameAudioManager` adds to it, and it is the only way in.

**Public `deleteAudioPlayerManager(id)`:**

- **On a player's name:** it removes the name and warns. It does **not** dispose the manager. The player keeps playing, and its own `dispose()` (on unmount, retirement or a store change) is still the only disposer. **F1 is fixed.**
- **On a manager the app registered:** it disposes the manager, as before.

**`_nameAudioManager` now reports an outcome, `named | moved | kept`:**

- **`moved`:** another live player held the name. The name moves to the new player with the existing "another mounted player" warning. Same-id player isolation is unchanged, and so is the identity-checked `_unnameAudioManager`.
- **`kept`:** the name is held by a live manager the **app** registered.
  - The app's registration stays: it is not displaced, orphaned, reconfigured or disposed.
  - The player is not named.
  - The engine warns precisely: `id "x" is registered by getAudioPlayerManager(). This player keeps its own audio element and is not registered under that id…`.
  - **F2 is fixed.**
  - The review's suggested wording also named `createAudioPlayerManager`. I dropped it on purpose: that function does not register anything.

**Recorded, in the CHANGELOG and README:**

- An app manager registered under a player's `id` is no longer adopted, which it was at HEAD through get-or-create.
- Its `createAudioElement` is not used for the player.
- Adopting an app-supplied element would need a real prop. None was added.

### F6: refused

- `getAudioPlayerManager(id, config)` on a player-owned name now returns the manager **without** `updateConfig`, and warns once per manager.
- App-owned managers keep their get-or-create and reconfigure behaviour. A test pins this: "a standalone manager keeps its get-or-create, reconfigure and dispose behaviour".
- The JSDoc and the README "Player ids" paragraph were rewritten to match.

### F3: an accepted utterance survives unmount; the lead chose option 1

**Mechanism:** a new internal action, `{ type: '_releaseDevice' }`, in `VoiceInputAction`. `VoiceInput`'s unmount/store-swap teardown now dispatches it instead of `deactivateVoiceInput`, under the same guard as before: a device held, or a permission request pending.

**What the reducer does with it (`reducer.ts`, case `_releaseDevice`):**

- **Nothing accepted.** No push-to-talk stop in flight, and `_pendingTranscriptions` empty. This covers a pending permission prompt, a recording nobody stopped, and idle with a device. The action delegates to `deactivateVoiceInput` exactly, so the full deactivate path is unchanged for these cases.
- **Accepted work exists.** Either a push-to-talk stop is in flight (`status === 'processing'`, `_activeStop` set), or transcriptions are pending.
  - It cancels `VAD_SUBSCRIPTION`, `LEVEL_SUBSCRIPTION`, `voice-input-start` and `MICROPHONE_RESOURCE`. The legacy app-owned device is released through `releaseAudioManager`, as in deactivate.
  - It does **not** bump `_generation`, and does **not** cancel `SESSION_WORK`.
  - State becomes `status: 'processing'`, `mode: null`, `_audioManagerId: null`, `_ownsAudioManager: false`, with the loops' fields cleared.
  - The in-flight stop resolves into `_audioStopped` (the generation, sequence and status guards still hold), then transcribe, then `_transcriptionResult`, then **one** `transcriptionCompleted`. Because `mode` is `null`, the store then goes to `idle`.
- **Conversation mode.** Pending (already sent) segments are kept. The segment still recording is discarded. A conversation stop in flight (`manualSend`/`autoSend`) is cancelled (`Effect.cancel('voice-input-stop')`), because that effect restarts the recorder on the device being released; letting it run would fail the whole session through `_operationFailed`. This is a narrow residual, listed below.

**Why the in-flight push-to-talk stop is safe after release:**

- The real `AudioManager.stopRecording` captures its recorder and its chunk array locally.
- `cleanup()` stops the tracks and nulls the fields, but the pending `onstop` still resolves the blob.

**Generation and effect IDs, reviewed before the change:**

- Every result is gated on `_generation` together with `_pendingTranscriptions` or `_activeStop`. Keeping the generation is what lets the accepted result land.
- A later session (`startPushToTalkRecording` or `activateConversationMode` on a remount) needs a device, finds none, and goes through `requestMicrophonePermission`. That bumps the generation and clears pending work, which is the existing rule that a new session supersedes an unfinished one.

**Ownership:**

- **`onTranscript`** belongs to the component. The observer effect is torn down at unmount, so it does not fire after unmount (asserted).
- **Store and parent** still get the event: store-level `subscribeToActions`, and a parent reducer through a hand-bound managed view (asserted).
- **Owner retirement and `store.destroy()`** still cancel everything, including the accepted transcription (asserted for both).

### F4: documented, no core API

- **README:** a new paragraph, "Unmount before you destroy a standalone store", after the element-ownership paragraph. It covers players and `VoiceInput`, and says why managed views do not need it.
- **CHANGELOG:** a matching line under Changed.

### F5: live-to-live swaps are tested

- **Player:** `PlayerRebind` moves from standalone A (playing, still live) to standalone B.
  - A's element is released.
  - A fresh element is loaded with B's track.
  - `restorePreferences` reaches B once.
  - A's old element events reach neither store, and A receives no actions at all.
  - Play drives only B's element.
- **Voice:** a new fixture, `tests/fixtures/VoiceRebind.svelte`. Two tests:
  1. A has an accepted transcription pending, and is then swapped to B.
     - A's device is released once.
     - B records and transcribes.
     - `onTranscript` fires exactly once, with B's text.
     - A's late transcript reaches A's store once and never reaches the callback.
  2. A is still recording when swapped. A ends `idle`, its device is cleaned once, and nothing is transcribed.

### F7: honest name, and a managed sibling test

- **Renamed:** "unmounting one of two standalone siblings mid-recording leaves the other recording".
- **Added:** "retiring one of two keyed slots that share an injected registry leaves the other recording".
  - It uses `createBoard` in `fixtures/managed-voice.ts`: a `keyedSlot` with `forEach(inputs, voiceInputReducer)`.
  - Retiring `x` mid-recording releases `x` once, through the injected deleter.
  - `y` stays `recording`, with its stream live, its registry entry intact and its state `recording`.
  - Unmounting `x` afterwards adds no release.

### F8

Unchanged, and outside this lane. A1, A2 and the skill file remain parent items 1–3 above, and are release blockers.

### New and updated tests

**`audio-mounted.test.ts`: +5.**

| Test | Guards |
| --- | --- |
| `deleteAudioPlayerManager(id)` on a mounted player removes the name and leaves the player working | F1 |
| a manager the application registered under a player's id stays registered, and the player is not mistaken for another player | F2 |
| `getAudioPlayerManager(id, config)` on a mounted player's name does not redirect its events | F6 |
| a standalone manager keeps its get-or-create, reconfigure and dispose behaviour | standalone compatibility |
| a player moved from one live standalone store to another… | F5 |

The existing M1 case now also asserts that a lookup of a live player's name warns once.

**`voice-input-ownership.test.ts`: +8.**

| Test | Guards |
| --- | --- |
| releases the microphone now, and the store still receives the transcript exactly once | F3 |
| a stop still in flight at unmount is transcribed and delivered once | F3 |
| a conversation keeps its accepted segment and drops the one still recording | F3 |
| destroying the store after unmount cancels the pending transcription | F3 |
| a hand-bound managed view: child unmount delivers to the parent, owner retirement does not | F3 |
| 2 × live-to-live store swap | F5 |
| keyed sibling retirement | F7 |

No existing test was deleted or weakened.

### Mutation verification

Each mutation was applied to one source file and reverted by copying the saved file back. Byte equality was confirmed with `diff` after every batch.

| Mutation | Result |
| --- | --- |
| `VoiceInput` unmount dispatches `deactivateVoiceInput` again | 5 fail: the 4 F3 unmount tests (all except destroy-after-unmount) and the swap-with-pending test |
| `_releaseDevice` ignores an in-flight stop (`stopping = false`) | 1 fails: the in-flight stop test |
| `_releaseDevice` does not cancel `MICROPHONE_RESOURCE` | 5 fail |
| `VoiceInput` release effect reads `store` untracked | 2 fail: both voice swap tests |
| `deleteAudioManager` disposes player-owned managers | 1 fails: F1 |
| `getAudioManager` reconfigures player-owned managers | 2 fail: F6, and the M1 "first" case's lookup assertion |
| `_nameAudioManager` never keeps an app name | 1 fails: F2 |
| `FullAudioPlayer` engine effect reads `store` untracked | 1 fails: the F5 player swap |

The first run of the `getAudioManager` mutation reported `no tests`, from a `BrowserPool` error while other workers were using Chromium. I re-ran it alone, and it gave the result above.

### Verification (exact results, final bytes)

All commands were run in `packages/media` unless noted.

| Command | Result |
| --- | --- |
| `pnpm run build` | exit 0 (`src/lib -> dist`, 11 declaration bridges) |
| `pnpm run typecheck` | exit 0 |
| `pnpm run check` | exit 0, **0 errors, 0 warnings** |
| `pnpm test` | exit 0. Browser (Chromium): 20 files, **209/209** passed. Node SSR: 1 file, **8/8** passed. |
| scan of the `pnpm test` output for `dispatch after destroy`, `[VoiceInput]`, `AudioPlayer]`, `[AudioManager]` or `state_unsafe` | 0 matches. The new warnings are all asserted under `mockImplementation`. |
| `git diff --check -- packages/media` | clean |

**How 209 is made up:** 196 + 5 (audio) + 8 (voice).

**Core repository guards, run read-only from `packages/core` with `vitest.node.config.ts`.** `git status --porcelain -- packages/media packages/core` was identical before and after each run.

- **The 17 guard files:** animation-policy, changelog-shape, check-coverage, component-coverage, dist-import, doc-examples, export-surface, front-door, intentionally-unused, optional-props, peer-ranges, published-files, satellite-theming, skill-examples, typecheck-coverage, dist-freshness and side-effects.
- **Result:** 380 passed and 21 failed. None of the 21 is a media arm:
  - 18 are environmental. `auth`, `charts`, `graphics` and `maps` have no `dist` in this worktree, and `auth`/`maps` subpaths therefore do not resolve. `core`'s `dist` is older than the other workers' live core edits.
  - 3 are timeouts under concurrent load: `check-coverage` › architecture syntax, `doc-examples` › "every one of them compiles", and `typecheck-coverage` › core.
- **Re-run:** I re-ran `doc-examples` and `typecheck-coverage` alone with `--testTimeout=300000`. Result: 2 files, **44/44** passed, porcelain equal. This covers compiling the media README's Svelte blocks after the prose edits.

### Files touched in this follow-up

- **Source:**
  - `src/lib/audio-player/audio-manager.ts` (provenance, `getAudioManager`/`deleteAudioManager` guards, `_NameOutcome`);
  - `src/lib/audio-player/audio-engine.ts` (outcome-specific warnings);
  - `src/lib/voice-input/reducer.ts` (`_releaseDevice`);
  - `src/lib/voice-input/types.ts` (the action);
  - `src/lib/voice-input/VoiceInput.svelte` (dispatch and comment).
- **Tests:**
  - `tests/audio-mounted.test.ts`;
  - `tests/voice-input-ownership.test.ts`;
  - `tests/fixtures/managed-voice.ts` (`createBoard`);
  - `tests/fixtures/VoiceRebind.svelte` (new).
- **Docs:**
  - `README.md` (unmount-before-destroy, player ids, the microphone paragraph);
  - `CHANGELOG.md` (Unreleased › Changed).

### Residuals

1. **Conversation segment in flight at unmount.** A segment whose stop (`manualSend` or `autoSend`) is in flight when `VoiceInput` unmounts is dropped. Its effect restarts the recorder on the device being released. Keeping it would mean moving the restart out of `stopAndSend`, which changes the continuous-recording ordering that `voice-input-conversation-continues` pins. Push-to-talk, the case in the review, has no such gap.
2. **Real devices.** The accepted-stop path depends on a real `MediaRecorder` still firing `onstop` after its tracks are stopped. The fake device and the code reading support this, but it is not proven on a real device. Add it to the M12 real-device gate.
3. **Remount supersedes pending work.** Remounting `VoiceInput` on the same store while the released utterance is still transcribing starts a new session on the next press (or immediately, in conversation mode). That session supersedes the pending transcript, which is the existing new-session rule.
4. **F4 has no runtime guard.** It is documentation only: without a public `Store` liveness signal, the components cannot detect a destroyed standalone store.
5. **F8 (A1, A2, skill file)** remains open with the parent.

### Final review follow-up: pooled devices and owner controls

The read-only [conversation-stop delta review](MEDIA-STOP-DELTA-REVIEW.md)
accepted the stop-in-flight fix and identified one low risk for an injected
factory that reuses a device object across sessions. On successful microphone
acquisition, the reducer now removes that object from `releasedDevices`, giving
the new session a live lease. A browser test reuses one fake device over two
conversation sessions and requires the later send to restart recording.

Two more browser controls exercise the conversation stop with a live hand-bound
owner after view unmount, and with store destruction after view detach. The
first delivers the transcript to the parent once; the second cancels without
restarting or transcribing. The final changed bytes pass `pnpm run build`,
`pnpm run typecheck`, and `pnpm run check` (0 errors, 0 warnings); `pnpm test`
passes **214/214 browser tests** and **8/8 SSR tests**. The real-device
`MediaRecorder.onstop` behavior after stopping tracks mid-flush remains M12.

## Delta: F3 residual 1 closed (conversation stop in flight at unmount)

**The rule, from the lead:** unmounting the UI releases native capture. An utterance the user already accepted still finishes for a store or hand-bound owner that is still live. That includes a conversation `manualSendRequested` or `autoSendTriggered` whose stop is still in flight. Retiring the owner or destroying the store cancels it.

### Change (`src/lib/voice-input/reducer.ts`)

- **`releasedDevices`:** `releaseAudioManager` now records each device it releases in a module `WeakSet`. Every release path goes through it: the microphone resource's dispose, a direct release and an injected `deleteAudioManager`.
- **`stopAndSend`:** after `stopRecording()` settles, the effect restarts the recorder only if `continuing` is set and the device has not been released. It dispatches `_audioStopped` with `continuing` set to whether it actually restarted.
  - **Live conversation:** the device is not released, so the order is unchanged: stop, then restart, then `_audioStopped`. `voice-input-conversation-continues` still passes (4/4).
  - **Released device:** the effect does not restart. `_audioStopped` arrives with `continuing: false`. The reducer takes the existing non-continuing branch: it stays `processing`, transcribes and goes to `idle` on the result, because `mode` is null.
- **`_releaseDevice`:** the `!conversation` exclusion is gone, so an in-flight conversation stop counts as `stopping` and keeps its `_activeStop`. The `Effect.cancel('voice-input-stop')` for conversation is gone too.
- **Unchanged:** no action, state field or public API changed. Owner retirement and `destroy()` still cancel through `SESSION_WORK` and the managed dispatch retirement.
- **README:** one clause in the unmount list ("even while its stop is still settling … the recorder is not restarted").

### Tests (`tests/voice-input-ownership.test.ts`, +2)

- **"a conversation send still in flight at unmount is transcribed once and does not restart the recorder":**
  - **Setup:** a standalone store in conversation mode, with a `manualSendRequested` stop held on a deferred.
  - **Action:** unmount, then resolve the stop.
  - **Checks:** `startRecording` is not called again and the recorder is off. There is exactly one transcription and one `transcriptionCompleted`. The store ends `idle` with `mode: null`. There is no `audioProcessingFailed` and no `console.error`. The device is deleted once.
- **"owner retirement with a conversation send in flight cancels it: no transcript, no restart":** the same setup on the hand-bound managed composer, retired with `stopDictating`. The checks: no restart, no transcription, no draft, and the device is deleted once.

### Mutation checks (the reducer was restored byte-identical after each)

| Mutation | Result |
|---|---|
| `restart = continuing` (drop the released check) | The first new test fails: the restart on a released device throws and becomes `_operationFailed`. |
| Put back `&& mode !== 'conversation'` in `_releaseDevice` | The first new test fails. |
| Remove both `signal?.aborted` checks in `stopAndSend` | The retirement countercase **still passes**. On that path the managed owner's dispatch is retired and the device is released, so the abort checks are redundant. The countercase pins the observable contract, not this code. |

### Gates (`packages/media`)

- **Focused tests:** ownership and conversation-continues, 24/24.
- **Full browser suite:** 20 files, **211/211** (209 + 2).
- **SSR:** **8/8**.
- **`build`, `typecheck` and `check`:** all clean (svelte-check: 0 errors and 0 warnings).

### Residuals after this delta

- **Residual 1 is closed.**
- **Residual 2, the real-device gate, now also covers the conversation path.** Nothing has been verified on a real device. The open question is whether a real `MediaRecorder` still fires `onstop` after `cleanup()` stops its tracks mid-stop.
- **Residuals 3–5 are unchanged.**

**Files:** `packages/media/src/lib/voice-input/reducer.ts`, `packages/media/tests/voice-input-ownership.test.ts` and `packages/media/README.md`. Nothing was committed.
