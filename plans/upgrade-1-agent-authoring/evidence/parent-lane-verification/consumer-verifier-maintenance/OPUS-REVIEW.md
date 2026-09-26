# Opus Review: `candidate/scripts/verify-consumer.mjs` vs baseline

**Verdict: CLEAR TO LAND.** I found no blockers. The non-blocking notes and limitations are listed below.

Reviewer: Claude Opus 5.5, 2026-09-26. The implementation was not edited, and neither was the main repository or `test-env/`. All reviewer work is in `opus-review/` under this scratch root.

## Delta reviewed

`diff -u baseline/scripts/verify-consumer.mjs candidate/scripts/verify-consumer.mjs` matches the diff in IMPLEMENTATION.md exactly: 4 hunks, nothing else touched. `node --check` passes. The delta stays inside the assignment scope:

- `checkDocs`: skips symlinks, recurses into every directory except `node_modules`, and strips fenced blocks before extracting links.
- Two new required-file assertions: `code/recipes/managed/README.md` and `charts/fixtures/installed-consumer/README.md`.
- A new `passes()` helper that mirrors `rejects()`: it asserts the mutation applied, then restores the file in `finally`.
- The stale `missing node action lifting` control is replaced by the omission positive check plus the incompatible-mapper negative control.
- A new positive check that a fenced placeholder link is ignored.

Nothing was weakened:
- The inventory floor (`docs>=34&&links>=20`), the missing-guide control and the placeholder control are unchanged.
- The array-state and all other `rejects` controls are unchanged.
- The typed entry-point floor (48), the Bundler/NodeNext `tsc --strict` runs, the component-props `@ts-expect-error` probes and the Tailwind 3 path are unchanged.
- There are no version bumps, no new dependency and no harness or profile work.

## Requirement 1: NodeCanvas `liftAction` controls

**Provenance.** In `test-env/app/package-lock.json`, the integrity values for `@composable-svelte/core` and `@composable-svelte/code` match `openssl dgst -sha512` of the designated archives byte-for-byte:
- `/private/tmp/companion-qualified-core-230233b9/composable-svelte-core-0.13.0.tgz`, sha256 prefix `230233b99c4f0411`
- `/private/tmp/t5-code/composable-svelte-code-0.4.1.tgz`, sha256 prefix `cec04f1702044e8d`

I copied that app to `opus-review/app` and deleted its `readme-examples`. I then re-extracted the four Code examples from the **installed** `node_modules/@composable-svelte/code/README.md`, using the verifier's own `consumer-file` regex and its exact inventory assertion. The extracted `Canvas.svelte` is byte-identical to the one the implementer used, so the controls run against the shipped README example.

**Declarations.** `dist/node-canvas/NodeCanvas.svelte.d.ts` and `NodeCanvas.d.svelte.ts` carry the same conditional:
`[NodeCanvasAction<N,E>] extends [Action] ? { liftAction?: … } : { liftAction: … }`.
The README store is `createStore<NodeCanvasState, NodeCanvasAction, NodeCanvasDependencies>`, so omitting `liftAction` is legal. The baseline control is genuinely stale.

**Run of the candidate's own code (`opus-review/controls.mjs`).** This script extracts `rejects`, `passes` and `example` verbatim from the candidate script. It also runs the literal control lines from the candidate script and from the baseline script. After every step it checks the Canvas.svelte sha256 in a `finally`.

| Declarations state | Array-state control | Omission `passes` | Incompatible-mapper `rejects` | Baseline stale control |
|---|---|---|---|---|
| Real shipped | OK | OK | OK | FAIL ("invalid consumer unexpectedly passed"), which confirms it is stale |
| Regressed to always-required `liftAction` | OK | **FAIL** (`npm run check` fails) | OK | OK |
| Weakened to `(action: any) => any` | OK | OK | **FAIL** ("unexpectedly passed") | FAIL |

- The two new controls are complementary and each is sensitive to the regression it guards against:
  - The omission check fails if the declarations go back to requiring `liftAction`.
  - The mapper check fails if the mapper typing collapses to `any`, for example if `Action` falls back to its `any` default.
- **Restoration.** Canvas.svelte hashed to the same value after every step, including the step where `passes` threw. I restored the patched declarations afterwards and confirmed them `cmp`-identical to the `test-env` install.
- **Diagnostic under the mapper mutation.** svelte-check reports exactly one error, `Canvas.svelte:25:21 … '(action: NodeCanvasAction<…>) => { wrong: boolean; }' is not assignable to type '(action: NodeCanvasAction<…>) => NodeCanvasAction'`. That matches `/not assignable to type.*NodeCanvasAction/` on a single line, so the control cannot pass on an unrelated failure.
- **Strict coverage.** svelte-check runs with the starter tsconfig, which has `strict: true`, `exactOptionalPropertyTypes: true` and `--fail-on-warnings`. The unmutated example passes clean. The array-state control still proves Canvas.svelte is actually type-checked.

## Requirement 2: shipped Markdown traversal

**Corpus.** I used two sources:
- The exact archives: the designated core and code archives, plus the newest available interim archives for auth, charts, chat, graphics, maps and media.
- Working-tree packs: `rsync` copies of each main-repo package (excluding `node_modules`), packed with `npm pack --ignore-scripts` into `opus-review/wt-packs`. The main repo itself was untouched.

**Inventory (`opus-review/audit.mjs`).** This runs the baseline and candidate `checkDocs` extracted verbatim from each script.

- **Working-tree packs:**
  - Baseline: 76 docs / 294 links.
  - Candidate: **82 docs / 297 links**, all passing, which matches IMPLEMENTATION.md.
  - The 6 new docs are the recipes READMEs (chat, code, media) and the `fixtures/installed-consumer` READMEs (charts, graphics, maps).
- **Interim archives:**
  - The charts and maps archives in `/private/tmp/companion-t5-packages` fail in both baseline and candidate on root-level `INTEGRATION.md` / `API.md` links to `../../plans/phase-1x/…`.
  - This is pre-existing and not caused by the delta. The current working tree has fixed it, so those archives are simply stale.

**Controls and fixtures (`opus-review/docs-controls.mjs`).** These run on a copy of the working-tree packs, which was confirmed `diff -r`-identical to the source afterwards.

| Fixture | Candidate | Baseline |
|---|---|---|
| Hide `docs/consumer.md` | throws "unshipped link" | throws |
| Append `[…](#)` | throws "placeholder" | throws |
| Append a fenced `[…](#)` | passes | throws |
| Fence, **then** a real `[…](#)` after it | **throws** (real link not suppressed) | throws |
| `~~~` fence containing a broken relative link | passes | throws |
| Broken link in `code/recipes/managed/README.md` | **throws** | passes (blind spot) |
| Placeholder in `chat/recipes/managed/README.md` | **throws** | passes |
| Broken link in charts or maps `fixtures/installed-consumer/README.md` | **throws** | passes |
| `recipes/node_modules/dep/README.md` with a broken link | passes (skipped) | passes |
| Symlinked directory plus symlinked `.md` pointing outside the package | passes (skipped) | throws (follows the `.md` symlink) |

**Fence stripping versus CommonMark (`opus-review/compare.mjs`).** This compares against markdown-it 14, installed only in `opus-review/`, over all 82 shipped docs:
- Links suppressed by the new stripping: **0**, out of 582 CommonMark links.
- Raw regex link count equals stripped count (580 each). In the current corpus, no shipped doc has link syntax inside a fence, so the change is preventive and currently changes nothing.
- The 6 links the regex misses are external reference-style or badge links, and the baseline misses them too.

## Non-blocking notes (optional follow-ups; none required to land)

1. **Fence regex edge cases.** Found with `opus-review/edge.mjs`; none occur in the shipped corpus.
   - **Silent suppression.** A real link after the fence would go unchecked in three cases:
     - A closing fence longer than the opener (a ```` ```` ```` line closing a ```` ``` ```` block).
     - A closing fence indented 1–3 spaces.
     - A line that starts with inline triple backticks, e.g. ```` ```js``` text ````.
   - In each case the regex keeps scanning until a later exact closer, and anything in between is dropped.
   - **Loud (fails instead of silently passing).** CRLF fences, list-indented fences (11 exist in core docs today, none containing link syntax) and unclosed fences are not stripped. Their contents would still be checked as links.
   - These are acceptable under the "no parser rewrite" constraint. If you want them hardened: allow `^ {0,3}` indentation and use a closer of `\1[`~]* *` for the matching fence character.
2. **`passes()` failure output.** It uses `stdio:'pipe'` without surfacing stdout. When it fails, the thrown error says only `Command failed: npm run check`, and the svelte-check diagnostics (on stdout) are lost. Consider `encoding:'utf8'` and rethrowing with `error.stdout` for easier triage.
3. **The required branch of the conditional is not covered.** Nothing checks that `liftAction` stays *required* when the store's `Action` does not include `NodeCanvasAction`. This was not requested; it would be a small optional hardening in the same file.
4. **Accuracy of IMPLEMENTATION.md:**
   - The focused harness `test-env/verify-focused.mjs` re-types `checkDocs`, `rejects` and `passes` instead of executing the script's own code. The re-typed code is textually equivalent; I closed that gap by extracting and running the candidate's code verbatim.
   - The report's "82 docs / 297 links across 8 packages" figure is correct for working-tree packs, but its own test-env run only covered core and code (57/272).
   - The report says the baseline "incorrectly" matched code snippets. That is true in principle, but it does not happen in today's corpus.

## Out-of-scope observation for the pending Auth archive

Several interim Auth tarballs ship **61 entries under `package/consumer/node_modules/.vite/`**:
- `/private/tmp/auth-oauth-current/…`
- `/private/tmp/auth-oauth-min/…`
- `/private/tmp/auth-password-delete-candidate/…`
- `/private/tmp/auth-session-refresh-candidate/…`
- `/private/tmp/composable-svelte-auth-0.2.1.tgz`

The other Auth tarballs contain 0. This is a packaging hygiene issue, not a verifier defect. By design the candidate's `node_modules` skip will not flag it, and no other verifier step checks for it. Before the final run, check the final Auth archive with `tar -tzf <auth.tgz> | grep -c node_modules`, which should print 0.

## Commands executed (from the scratch root)

```
diff -u baseline/scripts/verify-consumer.mjs candidate/scripts/verify-consumer.mjs
node --check candidate/scripts/verify-consumer.mjs                          # syntax-ok
node -e '<print lockfile integrity>' ; openssl dgst -sha512 -binary <tgz> | base64   # match
# opus-review/: unpack archives; rsync + npm pack --ignore-scripts working-tree copies
node opus-review/audit.mjs            # baseline 76/294, candidate 82/297 on working-tree packs
node opus-review/compare.mjs wt       # 0 CommonMark links suppressed; fence count 1161 regex vs 1172 cm
node opus-review/edge.mjs             # edge-case matrix (note 1)
node opus-review/extract-examples.mjs # Canvas.svelte from installed README, identical to test-env
node opus-review/controls.mjs real                 # real declarations
node opus-review/controls.mjs required-regression  # after perl patch of both NodeCanvas d.ts
node opus-review/controls.mjs any-weakened         # after perl patch of both NodeCanvas d.ts
npx svelte-check … (mapper mutation)  # 1 error, Canvas.svelte:25:21, matches control regex
node opus-review/docs-controls.mjs ; diff -r opus-review/wt opus-review/dc   # identical after cleanup
```

## Limitations

- Per the assignment, I did not run the full eight-package `verify-consumer.mjs`. That means none of npm pack, the starter, Playwright, SSR, the full `npm test` or the Tailwind 3 path were run end to end with the candidate. The docs traversal was checked over all eight packages, but only in isolation.
- Apart from the designated core and code archives, the corpus is interim archives and working-tree packs, not final archives. The final Auth archive does not exist yet.
- The other Code `rejects` controls (obsolete editor option, wrong effect action) were not re-run by me because the delta does not touch them. The implementer reports them passing.
- The markdown-it comparison is a reference oracle for this review only. It is not added to the verifier.
