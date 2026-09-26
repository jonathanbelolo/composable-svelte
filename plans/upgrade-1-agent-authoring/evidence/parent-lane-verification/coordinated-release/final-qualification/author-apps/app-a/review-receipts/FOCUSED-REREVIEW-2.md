# Focused independent re-review 2: post-review nits and dependency hygiene

- Reviewer: an independent general-purpose subagent with fresh context (claude-opus-5-5).
- Constraints: read-only, no network, no npm install, no Playwright.
- Date: 2026-09-26, completed about 15:17 local time.
- Result: **no blocking issues**. The subagent ran `npm ls --all` (exit 0), vitest (14/14) and svelte-check (0/0). It also ran the modified transcript test 8 more times in isolation; all passed.

## Identity of the reviewed inputs (sha256)

| File | sha256 |
| --- | --- |
| `review-receipts/post-rereview-1-nits.diff` | `3d4e2609e2cba0c59af839dc4d5f6bee5528a2bc92913922986584da49a99047` |
| `review-receipts/dep-hygiene/package.json.diff` | `e86dda07e596373ba319c376d0642470b28142801640c31fd107c6ba79877c75` |
| `review-receipts/dep-hygiene/package-lock.json.diff` | `f7dc0f03a049a4856f495ec896f0378d86672455dd141724050378e5c2101993` |
| `src/model.ts` | `1d8487ee14f5b67f45f88bed1e899378097899540186c720d39b6678feffd567` |
| `tests/component.test.ts` | `43286a45f396a58850f9a35bfb4fb1026880627f24232657d536b83583891172` |
| `package.json` | `9988d5a44a05bd06f8220aafb310771a692f6c113890a36d619bf7c7d7a23a31` |
| `package-lock.json` | `258d875b64a839afc02534bbb7b061e575eced65b0cb1db69465a3640f1c6d03` |

## Edits made after this review

- `PUBLIC-REFERENCE-GAPS.md`: the stale sentence "jsdom is also not a declared devDependency" (nit 1) now says this was the state at review time and points to the fix. This is documentation only; no code or test changed after this review.
- Nit 2 (the now-empty `node_modules/@polka/` and `node_modules/@napi-rs/` folders) was left as is. It is cosmetic, and I did not modify `node_modules` by hand.

## Exact result returned by the subagent

```
No blocking issues. Both the test edit and the dependency cleanup do what they were meant to. I found two nits, and neither needs action to accept the changes. I edited no files.

**1. Nit edits (`review-receipts/post-rereview-1-nits.diff`)**
- **`src/model.ts:197-198`, comment only: sound.** The guard at `src/model.ts:201-205` removes duplicates by `reply.id`, so the added note about unique ids is accurate. The fake `generateId` (`src/dependencies.ts:130`) is a counter, so ids are unique.
- **`tests/component.test.ts:247-250`, control assertion: sound. It makes the control stronger, and flakiness is not a practical concern.**
  - The old `waitFor` could wait up to about 2.5 s (100 × 25 ms). It proved the transcript eventually arrives, but not that the fixed `settle(50)` in `recordThenMaybeReplace` (line 242) is long enough.
  - Both cases now run the same code after `resolveTranscript!(...)`: `settle(50)` then `flushSync()`. The only difference is the conv-2 switch, which finishes before the transcript is resolved (lines 232-240).
  - So a passing control proves that 50 ms is enough for delivery. That means the replacement case's `transcripts-count === '0'` (line 255) can't pass just because the wait was too short.
  - Delivery goes through promises only, with no timers: `await deps.transcribeAudio` in media's `dist/voice-input/reducer.js:197`, then an `Effect.run` dispatch at line 281. 50 ms is ample. I ran the test 8 more times in isolation and it passed every time, taking about 324 ms in the full run.

**2. Dependency hygiene**
- **Receipts match the actual files.** I rebuilt both diffs from the `.before` copies and they matched exactly. The sha256 values match `after-hashes.txt`.
- **No remaining users of the removed package.** Nothing outside `node_modules`/`review-receipts` imports or configures `@vitest/browser` or `@vitest/browser-playwright`; the only mentions are in the `.md` notes. `vitest.config.ts` uses `environment: 'jsdom'`.
- **package.json:** the four `file:/private/tmp/composable-final-authoring/artifacts-a/*.tgz` specs have the same values; npm only sorted the keys. `jsdom` is pinned exactly at `"28.1.0"`, and no other version changed.
- **Lock root** matches package.json for both dependencies and devDependencies.
- **Lock diff is removals only**, plus the root devDependency swap. Exactly 9 entries went: `@vitest/browser`, `@vitest/browser-playwright`, `@polka/url`, `mrmime`, `pixelmatch`, `pngjs`, `sirv`, `totalist`, `ws`. Nothing was added.
  - The only remaining reference to any of them is vitest's optional peer on `@vitest/browser-playwright` (`peerDependenciesMeta optional: true`), which is fine.
  - `ws` was dev-only, and jsdom 28.1.0 does not depend on it.
- **The four @composable-svelte lock entries are unchanged**: `resolved: file:../artifacts-a/...`, with the same integrity (chat `sha512-2NRg…`, code `sha512-P5Kw…`, core `sha512-b+Il…`, media `sha512-p1xY…`).
- **"added 50 packages" means no downloads.** I checked independently:
  - 50 lock entries are not on disk, and all 50 are `optional` and gated by os, cpu or libc for other platforms (this machine is darwin/arm64).
  - The same entries were already in the old lock, since the diff adds nothing.
  - `newly-materialized.txt` is empty. The existing darwin-arm64 rollup and esbuild folders are dated 14:10, before the 15:12 install.
  - The install ran with `--offline`.

**3. Commands**
- `npm ls --all >/dev/null` → exit 0. `jsdom@28.1.0` is now a direct dependency and deduplicated under isomorphic-dompurify and vitest.
- `npx vitest run` → 2 files, **14/14 passed**.
- `npx svelte-check --tsconfig ./tsconfig.json --fail-on-warnings` → 0 errors, 0 warnings, exit 0.

**Nits (non-blocking)**
- `PUBLIC-REFERENCE-GAPS.md:45` still says "jsdom is also not a declared devDependency". That is now out of date: `HANDOFF.md:95` and `ITERATION-LOG.md:106-107` already reflect the change. Updating it, or marking it as a snapshot from before the fix, would help.
- `node_modules/@polka/` and `node_modules/@napi-rs/` are now empty folders (their timestamps changed at 15:12). This is cosmetic and harmless.
```
