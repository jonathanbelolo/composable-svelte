# T6 — Named bundled-policy registry

Date: 2026-09-25. Worktree only; not committed, not published. Implemented by Opus 5.5 after the
Gemini 3.8 Flash attempt stopped on a server connection timeout. An independent Opus review follows.

## Scope

`packages/architecture` only: generalise `--policy bundled:starter` into a fixed, named registry with a
SHA-256 embedded per profile. The production registry holds **only** `starter`. No companion profile is
registered, shipped or frozen. No new detector rules, capability grants, wildcard package approvals or
changes to package identity/provenance validation. `policies/starter.json` is byte-identical (not in
`git status`; its SHA-256 is asserted equal to `389430147e64…d8b3` by test).

## Inherited partial edit

The timed-out attempt had modified `src/bundled-policy.mjs` only (null-prototype frozen registry,
`expectedSha256` parameter, `loadBundledPolicy`). `check.mjs` still hard-coded `bundled:starter`. Kept the
shape; corrected:

- the name check was a blacklist (prototype names, `/`, `\`, `..`); replaced by an allowlist slug
  `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`, so no selector can spell a path, a prototype member or an empty name;
- entries are now accepted only if the registry and the entry are frozen, the entry is own, `entry.name`
  equals the key, `path` is absolute and `sha256` is 64 lowercase hex;
- a malformed expected pin now fails `policy-pin-invalid` instead of being compared;
- the unknown-name error no longer echoes the caller-supplied name; code `bundled-policy-unknown`;
- the unused `BUNDLED_POLICIES` alias was dropped.

## Implementation

`src/bundled-policy.mjs`
- `BUNDLED_POLICY_REGISTRY` — frozen, null-prototype; one frozen entry `{name, path, sha256}` for `starter`.
- `isBundledPolicySelector(arg)` — true for any string starting `bundled:`.
- `getBundledPolicyEntry(name, registry?)`, `resolveBundledPolicySelector(arg, registry?)` — own,
  frozen, well-formed entries only; otherwise `null`.
- `loadBundledPolicy(name, {today, registry?})` — read → pin check → strict UTF-8 JSON → `validatePolicy`
  (schema, catalog, supported core, rules, grants, exceptions, opaque packages). The `registry` option
  exists for tests; it is not reachable from the CLI and the package `exports` is `{}`.
- Kept for compatibility: `BUNDLED_STARTER_SHA256`, `loadBundledStarterPolicy()`,
  `validateBundledPolicyBytes(bytes, {today})` (default pin is still the starter's).

`src/check.mjs`
- Any `bundled:` argument resolves through the production registry; an unresolvable one is a usage error
  (`unknown bundled policy`) and never falls back to an external path, even when a file of that relative
  name exists in the working directory.
- Unchanged: `--policy-sha256` with a bundled policy is a usage error; bundled qualification is refused;
  external policies require `--policy-sha256` (64 lowercase hex) and go through `loadPolicy` with its
  outside-the-project and duplicate-key checks.
- The result envelope is unchanged (`policy.source: 'bundled'`, `policy.id`, `policy.sha256`); the
  selected name is not added to the envelope. Narrowest choice: the id and pin already identify the
  profile, and `isQualificationPass` shape rules were not touched.

`README.md` — registry semantics; separate `code`, `media`, `chat` and combined chat+code+media profiles
described as intended but **not selectable** until independently qualified. Starter instructions unchanged.

## Tests

`src/bundled-policy.test.mjs` (+4 tests)
- production registry is exactly `['starter']`, null-prototype, frozen, pin equals the on-disk bytes,
  entry mutation throws; `code`/`media`/`chat`/`chat-code-media`/`combined` are unknown;
  `loadBundledPolicy('starter')` deep-equals `loadBundledStarterPolicy()`;
- a **test-only** temporary two-entry registry (`test-alpha`, `test-beta`, distinct bytes and pins)
  selects each by name; neither registry leaks into the other;
- swapped pin and on-disk tamper fail `policy-pin-mismatch` with `policy: null` (tampered bytes are not
  JSON, proving the pin precedes the parse); pinned junk fails `policy-parse-error`; pinned
  catalog/core-invalid bytes fail validation; malformed expected pins fail `policy-pin-invalid`;
- hostile names (case, whitespace, `/`, `\`, NUL, `..`, `.`, relative/absolute paths, `__proto__`,
  `constructor`, `toString`, …), inherited entries, mutable registries/entries, name mismatch, relative
  path and malformed pin all resolve to `null`.

`src/check.test.mjs` (+2 tests)
- 16 `bundled:` selectors (unknown, empty, traversal, prototype, case, nested prefix, the four intended
  companion names), with and without `--policy-sha256`, all exit `usage` with `result: null` and
  `unknown bundled policy`, while real policy files named `bundled:evil.json` and `bundled:/starter`
  exist in the cwd; starter with a pin and starter qualification still refused;
- an external byte-identical copy of the starter is reported `source: 'external'`; unpinned → usage;
  wrong pin → `policy-pin-mismatch`; uppercase pin → usage; external qualification is not refused on usage
  grounds and `isQualificationPass` without independent expectations is `false`.

### Outcomes

- `npm test` in `packages/architecture` (`node test/run.mjs`, 52 files): **525 tests, 525 pass, 0 fail**.
- Mutation: disabling the pin comparison and the own-property check together → **3 tests fail**
  (`altered bytes fail hash…`, `each name is bound to its own pin…`, `selector resolves own…`); reverted.
- Direct `node --test <file>` invocation was not permitted by the session's tool policy; focused tests
  were exercised through the full suite run above. `test:installed` and `check:archive` were not run.

## Remaining qualification gates (before any companion profile is registered)

1. Author each profile (`code`, `media`, `chat`, combined) as its own JSON under `policies/`, with no
   capability grants, no exceptions and exact (non-wildcard) opaque-package identities and pins.
2. Independent review and qualification of each profile against real packed fixtures
   (`*-packed-fixture/`), including detector coverage for the companion packages' public surfaces.
3. Freeze bytes, record SHA-256, add one registry entry per profile, and add per-profile tests pinning
   bytes and hash; update `package.json` `files`/archive inspection if needed.
4. Decide separately whether the result envelope should carry the bundled profile name.
5. Bundled qualification remains refused regardless; qualification still requires an externally
   controlled policy and pin.

## Independent review and final verification

A separate read-only Opus 5.5 high review (`/private/tmp/t6-opus-independent-review.jsonl`)
found **no blockers** and independently ran the two focused files: 12/12 passed.
The worker's earlier tool-policy limit on direct `node --test` was specific to
its coding session; this lane also ran the focused command successfully. The
worker ran the complete suite twice: 52 files, 525/525 each time. This lane
packed an archive and ran `test/inspect-archive.mjs`: archive-matches-source,
32 files. SHA-256 of the pre-versioned archive at
`/private/tmp/t6-architecture-pack/composable-svelte-architecture-0.13.0.tgz`
is `1f7a9059f2204dc313896bea9a4f0506be04c73e94c6edf02d7269aa3ef2f7a1`.
A fresh physical installed fixture at `/private/tmp/t6-arch-installed` using
frozen Core SHA `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355`
passed `test/installed-bin-smoke.mjs`: analysis selected bundled-starter with
its embedded pin, and bundled qualification exited 22. Receipt:
`/private/tmp/t6-installed-bin-receipt.json`.

The independent review left four **low, nonblocking future-profile gates**:
(1) the test-only injected registry seam accepts frozen getters whose values
could change between validation and read; production's sole entry uses plain
values, but future entries should require stable data properties; (2) before
registering another profile, constrain production entry paths to shipped
`policies/` files and enumerate them in archive inspection; (3) assert the
archive's policy bytes directly against each registry SHA-256; (4) decide how
to record the selected bundled profile name in the output before a second
entry is selectable. No source change was made after the independent review.
