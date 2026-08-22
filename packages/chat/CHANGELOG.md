# Changelog

All notable changes to `@composable-svelte/chat` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
- Roughly ten unused `CleanupTracker` members and several write-only timestamps.

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

The package has **zero** CSS lifecycle animations, down from 19 recorded
violations. Everything that appears, disappears, expands or collapses uses a
Motion One helper from `@composable-svelte/core/animation`, so the store can
sequence on it and a test can observe it. The attachment preview and the reaction
picker carry a real `PresentationState` and animate both halves.

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
