# Changelog

All notable changes to `@composable-svelte/chat` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
