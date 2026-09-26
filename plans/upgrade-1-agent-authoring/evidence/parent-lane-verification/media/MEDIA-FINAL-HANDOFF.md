# Media production candidate

- Baseline: `ffd3ca51`; source patch: [MEDIA-FINAL.production-candidate.patch](MEDIA-FINAL.production-candidate.patch).
- Patch SHA-256: `8f92585f08a4091ca3ee9afdeccd48b2dfc5beaebff0fbc6247ed9ba605a760a`; it reverse-applies to this worktree and applies to a clean `HEAD` index. It contains only `packages/media` (28 changed/new files). No core, code, chat, root, lockfile, version or peer-floor edits are in it.
- Packed tarball: `/private/tmp/companion-media-reviewed/composable-svelte-media-0.4.1.tgz`, SHA-256 `245cd275f8ba1c34e4df2985aa3d1672e111eee83d54bba6f07728683aa5e628`. The published version remains a parent release decision; this local tarball is a review artifact.

## Review disposition

The [independent migration review](MEDIA-INDEPENDENT-REVIEW.md) found public player-registry F1/F2 and accepted-utterance F3. Follow-up implementation fixed those, callback hijack F6, live store swaps, and real managed sibling retirement. A [narrow independent delta review](MEDIA-STOP-DELTA-REVIEW.md) accepted the conversation stop-in-flight fix and identified a pooled injected-device reuse risk. That last source delta clears the released-device marker on successful reacquisition; a mounted browser regression reuses the same fake device over two conversation sessions. Two additional controls cover hand-bound conversation delivery and store destruction while the stop is pending.

## Exact source gate

- `pnpm run build`, `pnpm run typecheck`, `pnpm run check`: pass; svelte-check 0 errors, 0 warnings.
- `pnpm test`: 20 browser files, **214/214** tests; one Node SSR file, **8/8** tests.
- The combined installed fixture at `/private/tmp/combined-packed-final` has one npm lock and one deduplicated core/Svelte. Its lock integrity matches frozen core SHA-256 `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355` and the media tar above; installed `VoiceInput` takes a genuine managed view and routes its transcript through the parent reducer. Browser test passes and installed declaration svelte-check reports 0 errors, 0 warnings. The fixture's current Code tar is a superseded candidate; a complete combined rerun will use the repaired Code tar.
- A standalone [packed media fixture](media-packed-fixture/README.md) was installed with a fresh npm lock at `/private/tmp/media-packed-min` (Svelte **5.20.0**) and `/private/tmp/media-packed-current` (**5.55.3**). Each lockfile's core and media SHA-512 integrity matches the exact tarballs above. Both report svelte-check **0 errors, 0 warnings**, pass Vite client build (686/718 modules), pass the installed managed `VoiceInput` parent-transcript browser test **1/1**, and pass a Vite SSR build plus Node render (**1102/1095 bytes**). The test uses the packed `@composable-svelte/core/application` and media root exports, with no source alias. Vite emitted virtual CSS load notices during browser transforms, but the tests and production builds exited 0.

## Remaining release gates

The parent owns the final version and core peer floor, then repacking and release qualification. The real-device M12 check remains open: a real `MediaRecorder` must deliver `dataavailable` and `onstop` after tracks are stopped while a stop is pending, in push-to-talk and conversation modes. The fake recorder tests establish reducer ordering and cancellation but cannot establish browser/hardware behavior. Re-run the same installed matrix on final versioned tarballs. Update the media skill's standalone-only and required-`onTranscript` guidance in the parent documentation lane.
