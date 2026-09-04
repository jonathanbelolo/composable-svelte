# Phase 1 — state, 3 September 2026

**Phase 1 of the production-readiness plan is complete. Nothing has been
published, tagged, or version-bumped, and that constraint still stands.**

Measured at `753e61c` on branch `phase-1-feature-surface`, working tree clean.
Every number below names the command that produced it. Nothing is estimated —
this register recorded eight wrong counts before its numbers stopped being kept
by hand, and the discipline is the point.

---

## The gate

All six steps, run at `753e61c`:

| Step | Result |
|---|---|
| `pnpm -r build` | exit 0 |
| `pnpm -r typecheck` | exit 0, 0 `error TS` |
| `pnpm -r --workspace-concurrency=1 test` | exit 0 — **4,641 passed**, 3 skipped, 0 failed |
| `pnpm -r check` | exit 0 — 20 workspaces, 0 errors 0 warnings |
| `pnpm --filter @composable-svelte/example-auth-server test:e2e` | 6 Playwright passed |
| `pnpm verify:package` | 53 entry points resolve, 3 deep paths refused |

4,441 of those tests are in the eight packages and 200 in the examples. The 3
skips are in `core`'s `test-store.test.ts` and predate this work — the baseline
at the start of the phase was 4,480 passed with the same 3 skips.

**Run the whole gate before each commit, not the touched package.** Two commits
in this phase went in red — `bf04ef9`, which introduced a bare optional that
tripped the `optional-props` ratchet, and `fd4af4e` after it — because `auth`'s
suite does not contain `core`'s repo guards. Worse, `pnpm -r test` *aborts at
core*, so nothing after it ran either and the blast radius was the whole
remaining suite, not one ratchet.

(Both this file and `dd0d5bd`'s message first said *four*. Measured with
`git log -S "expires_at?: string;"`, which bounds the window to two.)

## Repository

- 21 guard files in `packages/core/tests/repo/`, all 21 registered in
  `vitest.node.config.ts` (`ls … | wc -l` against `grep -c`)
- 20 workspaces declare a `check` script
- `packages/auth`: 19 flow directories, 25 components
- All eight package versions **unchanged** against `main`; 0 tags at `HEAD`

## Size

`git diff main..753e61c --shortstat`: **262 files, +19,065 / −1,912**, over
23 commits, 4 of them marked breaking (`!`).

The hash rather than `HEAD`, so the command still reproduces the number once
this file is itself committed.

Concentrated in `packages/auth` (71 files), `packages/core` (69) and
`examples/auth-server` (47).

---

## What landed

**Step 0 — the tree split.** An uncommitted tree spanning four unrelated pieces
of work — 115 entries in `git status --porcelain`, which is **161 files** once
untracked directories are expanded (`git diff --name-only main 4bbaf5f`) —
committed as four coherent commits (`6d71e42`…`4bbaf5f`) with the gate green
first. One stray screenshot was deleted rather than committed. `vitest.node.config.ts` was edited twice so each new guard
landed in the same commit as the fix it guards.

**1.0 — the hydration-script XSS** (`87e20d7`). `renderToHTML` *and*
`buildHydrationScript` embedded serialized state raw inside a `<script>` tag, so
a state value containing `</script>` closed it early — stored XSS through any
user-influenced field. Two sites, not one, and `renderToHTML` is the more
travelled path. The obvious fix is wrong: `escapeHtml` was already in that file,
but a script element's contents are not entity-decoded, so `&lt;` would reach
`JSON.parse` literally. It escapes `<` as `\u003C`, which survives `JSON.parse`
and closes `</script`, `<script` and `<!--` in one rule. Both sites
mutation-verified independently.

**1.1 — form errors keyed by path** (`01bdd65`, breaking). Zod issues were
routed by `issue.path[0]`, so a nested error landed on the parent and could name
a field the user cannot see. `FormState.fields` is now
`Partial<Record<FieldPath<T>, FieldState>>`. Both validation paths also
disagreed about *which* message to show — per-field took the first issue,
whole-form the last — and both now take the first.

Three things that were nearly got wrong, recorded because they will be
re-derived: `FieldPath<T>` must be declared `… & string` or it is not provably a
string inside a generic body; `any` satisfies both branches of a conditional
type, and `Form.svelte` infers its `T` from a Zod schema whose values arrive as
`any`, so before that was handled *every* top-level field name was rejected;
and the type cap and the runtime walk disagreed by one because recursion stopped
at `never` while `Prev[1]` is `0`.

**1.2 — the five documented-but-missing APIs.** Four built, one declined, each
with the documents that said otherwise updated in the same commit.

| API | Outcome |
|---|---|
| `createMockStorage` | Built (`3ecf212`). The decline said "no caller"; there were two, unmeasured. |
| `Clock.live` / `Storage.live` | **Declined** (`e660864`), reasons recorded in weight order. |
| WebSocket queue inspection | Narrowed to `stats.messagesQueued` (`436f38f`). No `.queue` handle. |
| `serializeState` serializers | Built (`ecf3214`). The narrowed doc claimed `Date`/`Map` *throw*; they do not. |
| `createParserConfig` | Built (`30fc7a5`), purely additive. |

**1.3 — the account lifecycle.** Core's `AlertDialog` plus the hardcoded-label
fix across `Alert`/`Modal`/`Sheet`/`Drawer`; auth's five dependency members,
four flows, four components; the reference backend's session-lifetime model and
five endpoints; both reference apps wired; and the documents that still said
none of it existed.

The sharpest constraint in it: the server's `refresh(session)` set
`authenticatedAt`, the **sudo-mode** window. With a session-refresh endpoint
landing one file away, that name was a trap — a lifetime extension that also set
it would hold sudo open forever and six sensitive endpoints would stop demanding
proof. Renamed to `proveCredential` in its own commit (`fa0620f`), before the
feature.

Re-introducing the confusion — one line, `session.authenticatedAt = now`, inside
`extendIdleWindow` — fails **six** tests: the two pins written for it, and four
pre-existing `reauthentication_required` arms that simply stop demanding proof.
That second group is the point. It was five when first measured at `70926e6`
and became six when review 2 added the email-change and deletion arms; a number
that was right when taken and quoted later is the commonest way this register
has gone wrong.

---

## Two adversarial reviews, ten defects

Both reviews were of my own work, and both found real defects. They are worth
recording as a pair because **five of the ten are one species**: a property
asserted in prose — a commit message, a test name, a guard's own docstring —
that the code or the test did not establish. Those are R1.4, R1.5, R2.2, R2.3
and R2.4 below.

The other five are ordinary: one process failure, two code defects, a guard
whose regex was simply wrong, and a field written and never read. Worth
separating, because the two kinds are caught by different things — the first
kind survives a green suite by construction.

**Review 1** (`dd0d5bd`), of the 15 commits before it:

1. The gate had been red for four commits (a bare optional tripping the
   `optional-props` ratchet), unnoticed because only per-package suites were run
2. `AlertDialog` pointed `aria-describedby` at a description that need not
   exist — the mirror of the case it was written to prevent
3. A `front-door` denial regex fired on a *true* sentence, which would have
   pressured an author into deleting accurate documentation
4. Five appends produced three `### Added` under one `[Unreleased]` — the defect
   `changelog-shape.test.ts` exists to catch, one level down, in the hole the
   guard left by checking only `##`
5. A JSDoc `@example` taught the very vulnerability 1.0 had just fixed, and
   `svelte-package` copies JSDoc into `dist/*.d.ts`

**Review 2** (`753e61c`), of 1.3:

1. A wrong-kind token was **consumed before being checked** — posting a
   verification link to the email-change confirm endpoint destroyed it, then
   answered 410
2. The single-use test for that endpoint **could not fail**: re-confirming fails
   whether or not the token was spent, because the pending record is gone either
   way
3. "One clock, not two" was true only of the *read* side — five sites still
   wrote `expiresAt` with `Date.now()` while `expiring()` read the injected
   clock, so an MFA challenge survived twenty minutes of injected time against a
   ten-minute TTL
4. Two component tests asserted nothing; one ended in `expect(true).toBe(true)`,
   the other passed no snippet to the test named for the snippet seam
5. `Session.startedAt` was written and never read

**On what caught what**, since the two kinds fail differently. Mutation testing
caught R2.2 — the single-use test that passed whether or not the token was
spent. The two vacuous component tests (R2.4) were caught by *reading* them;
mutation then verified the replacements. Mutation also caught two more vacuous
guards earlier in the phase, outside either review: `createParserConfig`'s
ordering test paired two patterns that do not overlap, so reversing the map
changed nothing, and three of four "is a leaf" arms would have passed without
the guard they named.

The rest were found by reading code against its own claims. Both reviews also
found stale counts in documents that the same session's work had invalidated.

Two process rules earned the hard way: run the *whole* gate before each commit,
and use per-file backups when mutating — a `cp -r`/`rm -rf` pair destroyed
`packages/core/src/lib/navigation-components/` once, recovered from git plus a
rewrite of the nine untracked files.

---

## Open, and deliberately not fixed

Both recorded in `README.md` rather than left to be re-found.

- **`parseDestination` strips a leading slash when there is no `basePath`**
  (`README.md:455`). Patterns written the obvious way then silently never match.
  `examples/ssr-server` had already worked around it with a comment.
  `createParserConfig` normalises so the *new* API is not born with the trap;
  fixing `parseDestination` itself is breaking for anyone who has already
  adapted, so it wants a decision rather than a quiet change.
- **`examples/product-gallery` compares a `$state` proxy with `===`**
  (`README.md:441`). Pre-existing, unrelated to this phase, and passing only
  because nothing asserts on the misbehaving comparison.

## Known limits of the verification

Stated so nobody reads "green" as wider than it is.

- The two new panels in `examples/auth-server/app` are covered by the Playwright
  suite *mounting* them, not by unit tests in that example. Component-level
  assertions live in `packages/auth`.
- `doc-typecheck.test.ts` still reads only fences that name `@composable-svelte`
  — 277 of 1,435 TypeScript fences. Every doc edit in this phase added an import
  line, which is why three previously-invisible fences became checked and
  immediately surfaced a wrong import path.
- `flat-barrel.test.ts > read real export sets` is load-sensitive: it fails
  under a full node-config run and passes in isolation, reproducibly. Not
  investigated.
- `satellite-theming.test.ts` does not scan `auth` or `core`, so auth's
  "scoped CSS, never Tailwind" rule is enforced by review, not by a guard.

---

## What is next

Phases 2–6 of the approved plan, unchanged:

- **2 — make every claim true.** Changelog hygiene, re-measure the breaking
  changes per package, write the 0.x decision down, `engines` on all eight,
  normalise `prepublishOnly`, describe `maps` honestly.
- **3 — prove it installs.** Largely done ahead of schedule:
  `scripts/verify-package.mjs` exists and passes. What remains is the
  `nodenext` typecheck of a scratch consumer and rendering one component per
  package in a trivial Vite app.
- **4 — the gates.** Bundle budget, accessibility automation (there is none
  today), SSR coverage for the five packages without it, CI hardening.
- **5 — documentation.** The styleguide README is still a copy of
  product-gallery's; `docs/api/reference.md` still says "Version: 1.0.0".
- **6 — release machinery, built and left unfired.**

**Nothing is released until the owner says so.** Phase 6 leaves the button
installed and unpressed.
