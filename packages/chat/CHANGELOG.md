# Changelog

All notable changes to `@composable-svelte/chat` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-09-26

### Changed

- Requires `@composable-svelte/core` `^0.13.1`, Svelte `^5.20.0`, and optional peers `@composable-svelte/code` `^0.5.0` and `@composable-svelte/media` `^0.5.0`. Installing the optional `code` peer requires Svelte `^5.30.0`, so an application that enables it needs Svelte 5.30 or newer.
- **Managed views.** `MinimalStreamingChat`, `StandardStreamingChat`, `FullStreamingChat`, `ChatMessageWithActions`, `ActionButtons` and the four collaborative hooks accept a managed `ChildView` from `@composable-svelte/core/application` (`FeatureViewProps.store`, `composition.bind`, typed `scopeTo`) as well as a standalone `Store`. The `store` prop type widens to `Store<S, A> | ChildView<S, A>`; the action union is unchanged and no prop was added or removed. Chat imports only types from `@composable-svelte/core/application`; the `^0.13.1` core floor comes from the coordinated release, not from a new runtime import. See the README's "Managed applications", which quotes a tested recipe.
- A retired managed view renders nothing: every variant and store-taking primitive reads the state as possibly `undefined`. Previously a retired view threw on the first `$store.…` read, including `FullStreamingChat`'s unmount cleanup.
- An unkeyed variant whose `store` prop changes clears its unsent draft, so text typed into one conversation is never sent to another. Files still being read when the store changes are added to the store they were picked in, or revoked if that owner has retired.
- Under a managed view the collaborative hooks release their listeners and timers when the owner retires, without a call to the returned teardown; calling it afterwards is harmless. Standalone stores are unchanged: the teardown remains the only release.
- Tracked listeners now use a wrapper so `once`, abort and early disposal release tracking entries. Remove them with the disposer returned by `addEventListener` or with tracker disposal; native `target.removeEventListener` with the original callback no longer removes the wrapper. Tracked listeners retire before general cleanup callbacks.
- `resourceCount` counts live tracked listeners; once-fired, aborted and explicitly disposed listeners no longer remain counted. Completed typing timers no longer retain cleanup closures per keystroke.

### Added

- `scripts/verify-optional-peers.mjs` (repository only, not published): installs the packed package with none of `prismjs`, `@composable-svelte/code`, `@composable-svelte/media` or `pdfjs-dist`, and checks plain Node imports, `tsc` with `skipLibCheck: false`, SSR (dev server and production bundle), a Vite build and the build in Chromium, with no page error and no console warning or error; then installs `prismjs` and checks that it is picked up. A deliberate mutation of the installed `markdown.js` proves the console checks catch a stub taken for Prism.
- `CleanupTracker.clearInterval` releases a tracked interval independently. `addEventListener` returns a tracked disposer for early removal while preserving its typed browser overloads.

### Fixed

- Retire replaced chat streams and ignore stale callbacks. The latest send, edit, or regeneration owns the reply slot; earlier attachment uploads may finish metadata, but cannot start an obsolete reply. `streamSuperseded` reports the retired operation.
- Stop preserves partial content, cancels only the active operation's upload, and preserves unchanged message identities. Natural completion does not abort the completed transport.
- **Syntax highlighting on the server.** With the optional `prismjs` peer installed, a Node or SSR render (where `prismjs`, which is CommonJS, is loaded as a `default` export) highlighted nothing and logged "Failed to highlight code block" for every block. Bundled browser builds were unaffected. Found by the new packed-install check.
- `FullStreamingChat` revokes its pending attachments' blob URLs when a managed owner retires, from the last list it saw, instead of reading the retired store at unmount.
- `FullStreamingChat` tracks pending blob URLs per conversation. Changing an unkeyed chat's `store`, whether to another live store or to an already-retired view, no longer revokes the previous conversation's URLs while that conversation still holds them. They are revoked when the previous owner retires, or when the component unmounts. Previously the chat either revoked them at once or, after a live-to-live change, forgot them.
- **No per-block warning without `prismjs` in production builds.** A production Vite build (client or `--ssr`) resolves an absent optional peer to a stub `{}`. That stub was taken for Prism, so every fenced code block warned "Failed to highlight code block", once per render and so on every chunk of a streaming reply. Only a module with Prism's `highlight` and `languages` is used now. Node's CommonJS `default` interop is kept. `getVideoEmbedComponent()` now returns `null`, as documented, rather than `undefined` when media is absent in such a build.
- `useTypingEmitter`'s `start` and `update` do nothing once the emitter is released, whether by its teardown or by the owner retiring. They previously armed a timer and warned "[CleanupTracker] Setting timeout after dispose" on each keystroke.
- Once and aborted event listeners release their tracking entries immediately; listener disposal retains the original capture option.
- Post-disposal timer registrations leave no active timer. Cleanup errors are contained so remaining cleanup continues, including cleanup registered during disposal.

## [0.4.1] - 2026-09-18

### Fixed

- Correct public repository and documentation links for external consumers.
- Complete the quickstart UTF-8 streaming adapter, including HTTP errors and cancellation.
- Verify packaged README examples in an isolated npm consumer before release.


## [0.4.0] - 2026-09-18

### Fixed

- **My own presence was dropped until the server said I existed.**
  `state.users` is filled only by inbound frames, so between
  `connectToConversation` and the first `user_joined` you are not in your own
  user map — and `updatePresence` guarded its whole body on finding you there.
  It did nothing for that entire window, and `usePresenceTracking` dispatches
  only on *change*, so the transition was never retried and the room could see
  you as `away` indefinitely. The state now carries `currentPresence`, written
  whether or not the server has acknowledged you. The "announce presence when
  the socket opens" behaviour, added in the same pass this fixes, read the same
  empty map and so had never once fired.
- **Stop did nothing while an attachment was uploading.** `stopGeneration`
  returned early unless an abort controller existed, and that controller only
  arrives after the upload resolves. So Stop was a no-op during the upload: it
  continued, the stream started afterwards, and a reply arrived for a message the
  user had cancelled — with the attachment left at `uploadStatus: 'uploading'`,
  which renders a progress bar that can never move.
- **Upload progress was discarded on the edit and regenerate paths.** Only
  `sendMessage` marked attachments `'uploading'`, and the progress writer only
  updates attachments already in that state, so every report from a retried
  upload was dispatched and thrown away. All three paths now mark through one
  helper that shares `streamFor`'s predicate.

### Changed

- Requires `@composable-svelte/code` and `@composable-svelte/media` `^0.4.0`, matching this coordinated release.

- Requires `@composable-svelte/core` `^0.12.0` (peer range): core 0.12.0 is a minor release with breaking changes to the navigation DSL's action shape, the API client's dedup/cache, the WebSocket config, `renderToHTML` and `TestStore`; see core's changelog.
- **Components follow core's theme.** Every colour the theme should own now
  reads `hsl(var(--token, <the colour it was>))`, so an app that does not import
  core's stylesheet is unchanged and one that does now restyles these components
  when it overrides `--primary`, `--background` and the rest.

  **The dark mode was not real.** It hooked `:global(.dark)` — core's own
  dark-mode class — and then hardcoded its own palette, so changing
  `--background` left it on `#1a1a1a`. Those 68 rules held nothing but colours
  and are gone; core redefines every token under `.dark`, so the light rules now
  handle dark mode themselves.

  Deliberately unchanged: neutral scrims and shadows, syntax-highlighting
  palettes, and colours in categories core has no token for — success green,
  info blue, decorative gradients and error tints.

- **`CollaborativeStreamingChatState` gains `currentPresence`.** Additive, and
  `createInitialCollaborativeState()` supplies it; only code that builds the
  state object by hand is affected.
- **`Message.attachments` now says `| undefined`.** Under
  `exactOptionalPropertyTypes` a bare `T?` cannot receive a computed value that
  may be absent, which is what the upload marking ran into. Widening only — every
  existing assignment still typechecks.

- **BREAKING (types): every optional prop now accepts `undefined`.** Under
  `exactOptionalPropertyTypes` a prop read from `$props()` is `T | undefined`
  and cannot land on a bare `T?`, so these components could not be wrapped by a
  consumer forwarding its own props. See `@composable-svelte/core`'s entry for
  the full account; 87 optional props here are affected.

### Added

- **`headingLevel` on `AttachmentPreviewModal`, `FileAttachment` and
  `PresenceList`**, each defaulting to the level it already rendered. The level
  belongs to the page; a fixed `<h3>` jumps a consumer's outline and they cannot
  fix it from outside.

## [0.3.0] - 2026-08-22

A hardening pass with one rule: nothing a consumer can pass, configure, click or
import may produce no effect. The package lost about a third of its surface and
gained the behaviour the rest of it was already advertising.

### Removed

- **`WebSocketManager`.** It had no constructor anywhere in the repo, and its
  `{ type, seq, payload }` envelope did not match the top-level fields the
  collaborative reducer reads — so a consumer who built one got frames the
  reducer ignored. Supply a `connectWebSocket` dependency instead; the store
  owns the cleanup it returns.
- **The optimistic-sync subsystem.** `pendingActions` and `offlineQueue` were
  provably always empty and six actions had no dispatcher.
- **`UserPermissions`.** Declared, exported, never enforced anywhere.
- **The CRDT shell, and the `yjs` dependency with it.** `yjs` was a hard runtime
  dependency used in one file; nothing read `ydoc`, and the only `Y.applyUpdate`
  was commented out. A server sending `sync_update` frames now gets a console
  warning instead of silence.
- **`StreamingChatState.contextMenu` and its actions.** No dispatcher; the
  shipped `ContextMenu` keeps its own local `isOpen`.
- **The two legacy near-duplicate components** — `streaming-chat/StreamingChat.svelte`
  and `streaming-chat/ChatMessage.svelte` — and their barrel exports. Use the
  variants and `primitives/ChatMessage.svelte`. A single fix had already had to
  land in both copies once.
- **`ImagePreview`'s `class:loaded`**, with the last rule that used it.
- Four unused `CleanupTracker` methods, and several write-only timestamps.

### Changed — breaking

- **`streamMessage` takes a trailing optional `attachments` parameter.**
  Attachments used to reach the rendered bubble and stop there: the transport was
  called with the message text alone, so the backend and the model never saw the
  file. Additive under TypeScript's fewer-parameters rule, so a four-parameter
  implementation still compiles.
- **`MessageReaction` is `{ emoji, count, reactedByMe? }`.** `removeReaction` had
  no dispatcher anywhere, so a count could only ever go up. One bit rather than
  the list of who reacted — a popular message would otherwise ship thousands of
  ids to render "👍 12" — and it is why nothing here needs a current-user
  identity.
- **`StreamingChatState` gained `lastAppendedId`, `attachmentPreview` and
  `reactionPicker`.** Use `createInitialStreamingChatState()` rather than
  building the object yourself.
- **`getActiveUsers`, `getTypingUsers` and `getCursorPositions` take
  `Map<string, CollaborativeUser>`**, not `Map<string, any>`. Typing them
  properly immediately exposed that `getActiveUsers` wrote `avatar: undefined`
  against a declared `avatar?: string` — different things under
  `exactOptionalPropertyTypes`, and the `any` is what kept `tsc` from seeing it.
  The key is now absent rather than present-and-undefined.
- **The `@composable-svelte/core` peer range is `^0.11.0`**, not an accumulated
  `||` list. Each core release used to append a minor, which moves the ceiling
  and never the floor: this package imported `animateFadeIn` (core 0.11.0) while
  still declaring 0.4.1 acceptable, and a consumer resolving 0.9.0 satisfied the
  range and got a hard ESM error.

### Fixed

- **Presence was unreadable, not merely mis-sized.** `size` mapped to Tailwind
  classes in a package with no Tailwind and no content glob that reaches it.
  `.presence-dot` declared a 2px opaque white border and no dimensions, so every
  status rendered as the same 4px white ring — the colour painted underneath the
  border. Avatars with a photo collapsed to 0×0 entirely.
- **The socket outlived everything.** `connectWebSocket`'s cleanup was assigned
  to a local and dropped, under a comment saying it "would need to be tracked in
  state"; `disconnectFromConversation` was an empty effect claiming a manager
  handled it. It is a store-owned subscription now: disconnect runs the cleanup,
  reconnect runs it before opening the next socket, and destroying the store runs
  it too.
- **`useTypingEmitter` leaked a tracker entry per keystroke**, registering timers
  through `CleanupTracker` and cancelling them with the global `clearTimeout`.
- **The attachment pipeline was dead end to end.** The store layer was bypassed
  by a component-local array, so attachments were lost across restore and
  hydration; `uploadFile` had no call site, so a consumer who supplied one still
  got blob URLs that die on reload; and nothing reached the transport. Uploads
  now happen on send, and a failed upload keeps the local URL and sends anyway.
- **`StandardStreamingChat` and `MinimalStreamingChat` silently dropped
  `userLabel` and `assistantLabel`**, which the README told consumers to pass.
  `Message.senderName` was honoured by one message renderer of three.
- **Auto-scroll latched off mid-response.** `scroll-behavior: smooth` fires a
  scroll event per animation frame, and the listener that decides "has the user
  scrolled away?" could not tell those from a real one. Replaced with
  `createScrollFollower`.
- **Live cursors never showed the collaborator's name.** Five independent
  reasons, the decisive one being that neither `.cursor-marker` rule set
  `animation-fill-mode`: once the 3s keyframe finished it contributed nothing and
  the label went dark permanently. The flag is always visible now — hover is
  unavailable by design, because the overlay floats over a live text input and
  must not take pointer events. Also fixed: carets drifted when the field
  scrolled sideways, and sat one border-width off the character they named.
- **A rejected `video.play()` removed the entire player permanently.** It set
  the same `error` flag as a failed load, which nothing ever resets, and the
  whole control bar renders behind it.
- **Swapping `attachment` on `ImagePreview` re-faded the outgoing image and
  never the incoming one**, because the load state was set at construction and
  never reset. `AttachmentPreviewModal` reuses one instance rather than keying.
- Opening a second reaction picker used to stack two full-viewport backdrops and
  leave the first unclosable. One picker slot for the conversation now makes
  one-at-a-time an invariant of the reducer.

### Animation

The package has **zero** CSS lifecycle animations, down from 47 across 21 files
when this pass began. Everything that appears, disappears, expands or collapses uses a
Motion One helper from `@composable-svelte/core/animation`, so the store can
sequence on it and a test can observe it. The attachment preview and the reaction
picker carry a real `PresentationState` and animate both halves.

### Removed — a second pass

An acceptance sweep against the same rule found more, after 0.3.0's notes above
were first written:

- **`CollaborativeDependencies.generateId` and `generateUserColor`.** Both were
  resolved at the top of the reducer and referenced nowhere else: nothing there
  mints an id or a colour, because `userJoined` is handed a complete user.
- **`createFileDataURL` and `hasMarkdownSyntax`** — no callers anywhere, in
  source, tests or examples.
- **`AttachmentGallery`'s `layout`/`maxColumns` are live rather than removed**:
  both call sites hard-coded `list`, so the grid was unreachable. More than one
  image now lays out as a grid.

### Fixed — a second pass

- **Editing a message duplicated it**, and so did regenerating a reply. Both
  rebuilt the list keeping the user's message and then dispatched `sendMessage`,
  which appends one unconditionally. Neither action had a test.
- **Every PDF opened blank.** `renderPage` ran before the `<canvas>` existed and
  returned at its own guard, and nothing re-triggered it; the page appeared only
  after the reader pressed a control.
- **Upload progress could not reach the state.** The progress action only wrote
  to an attachment already marked `'uploading'`, and nothing ever marked one — so
  every value `onProgress` produced was discarded. Attachments are marked before
  the message is appended, and the gallery renders a `role="progressbar"` and an
  upload-failure notice, which is the first UI this feature has had.
- **Escape could not close the reaction picker**: the handler sat on an element
  nothing focused, while the control that opens it keeps focus.
- **`usePresenceTracking` and `useHeartbeat` transmitted nothing.** Both
  dispatched actions whose reducer cases returned no effect. A change to your own
  presence, and your own heartbeat, now go out over the socket.
- **A failed video stayed failed** across an attachment swap, and a rejected
  `play()` is now a transient notice rather than either a permanent dead-end or
  silence.
- **`ImagePreview` left an enabled, empty, focusable fullscreen button** behind
  its error card, and its wrapper button matched no CSS rule at all — so every
  image rendered inside default browser button chrome.
- **`ActionButtons` was invisible and clickable**, and revealed on `:hover` only,
  so a keyboard user could never see it.
- **`CleanupTracker.resourceCount` reported `0`** for a tracker holding live
  timers — wrong in the reassuring direction, for a getter whose only use is
  checking that nothing leaked.
- **```yml** resolved to a Prism language that was never loaded. ```rb resolved
  to `ruby`, which `@composable-svelte/code` does not support at all, so that
  alias is removed rather than fixed. The preload list is derived from the alias
  map now, so the two cannot drift again.
- **`TypingIndicator`** required `id` and `color` and read neither, and
  duplicated `formatTypingIndicator` with different punctuation.

### Changed — a second pass

- **`@composable-svelte/chat/streaming-chat` resolves.** It was documented in
  three places and the wildcard export turned it into a file that has never
  existed.
- **`createAttachmentFromFile` is exported** — the one helper needed to build a
  `MessageAttachment` for the documented `addAttachment` action.
- **`formatTypingIndicator` no longer appends "…"**, because the indicator that
  renders it draws animated dots.
- **The optional peers on `code` and `media` are `^0.2.0`**, not an accumulated
  `||` list.

### Changed — breaking, third pass

- **`usePresenceTracking(store)` and `useHeartbeat(store)` no longer take a user
  id.** The store already knows who you are, from `connectToConversation`; the
  parameter was one a consumer could get wrong and that changed nothing.
- **`updatePresence` and `sendHeartbeat` are the outbound actions.**
  `userPresenceChanged` and `heartbeatReceived` are now inbound only. Splitting
  them is the only way to stop a loop: a server that fans out to the whole room
  sends your own frame back to you, carrying your own id, so the
  `userId === currentUserId` test the first version relied on could not tell an
  echo from something you had just done. Measured: one echo produced a second
  outgoing frame. `startTyping` / `userStartedTyping` had the right shape all
  along.
- **`@composable-svelte/code` and `@composable-svelte/media` now declare their
  directory subpaths** — `code/code-editor`, `media/video-embed` and four others.
  All six had `index.js` in `dist` and no exports entry, so the wildcard turned
  them into sibling files that never existed. Found by the guard written for
  chat's identical defect.

### Fixed — third pass

- **The upload progress bar was laid out beside the attachment**, not above it:
  `.gallery-item` is a flex container that defaulted to a row, so an image
  shrank to half width for the duration of every upload.
- **Editing a message could not retry a failed upload.** The duplication fix
  streamed directly, which also skipped the upload path — so an attachment that
  failed the first time was resent as a URL only the sender can open. Editing
  while an upload was still in flight was worse: the upload landed afterwards
  and started a second stream carrying the pre-edit text. Both go through one
  upload-aware path now, cancellable by id.
- **A restored session could show a progress bar frozen forever** at whatever
  percentage it had reached, since an upload from a previous session is not in
  flight.
- **`ImagePreview`'s error latch** — pinned by a test rather than fixed here: it
  had already been dealt with in the same commit that added the reset, and the
  claim that it was fixed in this pass was wrong.
- **`playbackNotice` outlived its video**, painting a complaint about the
  previous source over the new one.
- **Presence and heartbeat frames were sent over closed sockets**, forever:
  `useHeartbeat` is a 30-second interval and `disconnectFromConversation`
  deliberately keeps `currentUserId`.
- **`useHeartbeat` dispatched a presence change on every tick**, overwriting the
  `lastSeen` it had just written and claiming activity on a timer — which is what
  `usePresenceTracking` decides by watching real input.

### Known gaps

- **The two overlays do not honour `prefers-reduced-motion`.** The attachment
  preview and the reaction picker animate through `animateBackdropIn`/`Out` and
  `animatePopoverIn`/`Out`, none of which consult the preference — 28 of core's
  31 helpers still do not. Message entry, the image and video fades, and the
  scroll follower all do. This package had no reduced-motion support before this
  release either, so nothing regressed; it is recorded because the gap is now the
  only accessibility debt left here.
- **`CursorOverlay` measures a single line.** A `<textarea>` whose content wraps
  gets every caret placed on the first line. Pass an `<input>`.
