# Independent Review: architecture-checker pre-profile prerequisites

Reviewer: Claude Opus 5.5, 2026-09-26
Scope: `candidate/packages/architecture` compared with `baseline/packages/architecture`. I read the code directly and did not rely on `IMPLEMENTATION.md` to decide what was correct.

## Verdict: NOT CLEAR TO LAND. One small blocker (B1).

All four prerequisites are implemented correctly in the runtime code. The one blocker is a fail-open regression in the archive-inspection release gate (`test/inspect-archive.mjs`), and it is a one-line fix. Once B1 is fixed, and ideally R1 and R2 as well, I expect this to be clear to land without another full review. A focused re-check of the B1 fix is enough.

## How I verified

- **Delta.** `diff -rq` (excluding `node_modules`) finds exactly 7 changed files, the same 7 listed in IMPLEMENTATION.md: `README.md`, `src/bundled-policy.mjs`, `src/bundled-policy.test.mjs`, `src/check.mjs`, `src/check.test.mjs`, `src/qualification.test.mjs`, `test/inspect-archive.mjs`. There are no new or deleted files. `package.json`, `bin/`, `CHANGELOG.md`, `LICENSE` and `policies/` are unchanged.
- **Starter bytes.** `cmp` shows `baseline/.../policies/starter.json` and `candidate/.../policies/starter.json` are byte-identical. `policies/` contains only `starter.json`. `BUNDLED_STARTER_SHA256` is still `389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3`, which matches `baseline-sha256.json`.
- **Registry membership.** `BUNDLED_POLICY_REGISTRY` still contains only `starter` (`src/bundled-policy.mjs:30-32`).
- **Execution limits.** In this review session, running `node`, `tar` and `shasum` was denied by permission policy, and I did not try to work around that. I could not re-run tests, `npm pack` or `inspect-archive` myself. Instead I checked the implementer's transcript (`gemini.jsonl`):
  - `npm test` completed with `tests 528 / pass 528 / fail 0 / cancelled 0 / skipped 0` (step 146).
  - After that run, the only file written was `IMPLEMENTATION.md`. So the full run covered the final code.
  - `npm pack --ignore-scripts` and `node test/inspect-archive.mjs <tgz>` then ran and reported `archive-matches-source`.
  - The archived sizes of `bundled-policy.mjs` (5888 B), `check.mjs` (23787 B) and `README.md` (5615 B) match the candidate files on disk.
  - The archived hashes of `package.json`, `LICENSE`, `CHANGELOG.md`, `bin/…mjs` and `policies/starter.json` match `baseline-sha256.json`.
- **Note.** The implementer's final chat message says "I have launched `npm test` … and will wait". The transcript shows that run did complete with the counts above, so the 528/528 claim is supported.

---

## Blocker

### B1: `inspect-archive.mjs` can exit 0 without inspecting anything (fail-open release gate)

`test/inspect-archive.mjs:87`:
```js
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) { ... }
```
In the baseline, the script's top level always either ran the assertions or failed with "Provide the npm-generated architecture archive path." The candidate wraps that in a main-module check.

The problem is how Node fills in the two sides of that comparison:
- `process.argv[1]` is only passed through `path.resolve`. Symlinks are not resolved.
- The ESM main entry's `import.meta.url` is realpath'd, unless `--preserve-symlinks-main` is set.

So if the script is invoked through a symlinked absolute path, the comparison is false. The script then exits 0 with no output, having skipped:
- the archive listing check
- the byte-equality check
- the new embedded-pin check
- the missing-argument assertion

A concrete case: on macOS `/tmp` is a symlink to `/private/tmp`, so this invocation silently no-ops:
```
node /tmp/companion-checker-profile-preparation/candidate/packages/architecture/test/inspect-archive.mjs x.tgz
```
The same happens with a symlinked checkout or workspace directory. Relative invocation, such as `npm run check:archive` from the package directory, still works because `getcwd()` returns the physical path. That is why the implementer's run passed.

This is a weakening of the archive gate compared with the baseline: any caller that relies on the exit status can get a pass with no inspection.

**Fix (any one of these):**
- **Preferred:** move `inspectArchive` into a module with no side effects, for example `test/inspect-archive-lib.mjs`. Keep `test/inspect-archive.mjs` as an unconditional CLI wrapper (assert argv, call, print) as in the baseline, and have `bundled-policy.test.mjs` import the library module.
- Compare realpaths instead: `realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))`.
- Fail closed: if the script is not detected as main but `process.argv[2]` names a `.tgz`, throw.

**Verify with:** `node /tmp/<symlinked path>/test/inspect-archive.mjs <tgz>` must print `archive-matches-source`, and running it with no argument must exit non-zero.

---

## Recommended before landing (not individually blocking)

### R1: The dynamic archive expectation is not tested in a way that catches a regression

Every `inspectArchive` fixture in `bundled-policy.test.mjs` registers only `starter`. If `inspectArchive` went back to a hardcoded `'policies/starter.json'` list, every test would still pass. Prerequisite (2) asks for "no hardcoded starter-only file list" and for tests that catch real failures. Please add:
- A fixture registry with two contained policies, e.g. `starter` plus `test-alpha` under `<root>/policies/`. It should pass when both are archived, and fail when only one is archived or the second pin is wrong.
- A fixture with an extra unregistered `policies/extra.json` on disk (and in the archive). It should fail the "Shipped policies directory must match production registered policies exactly" assertion. That assertion is correct but currently untested.
- A message matcher on case 3 ("missing registered policy in archive"). Today it uses a bare `assert.throws(...)`, which passes on any throw.

### R2: The runtime production-containment guards have no test that exercises the failure path

`bundledEntry` throws at module load for a non-contained production path (`src/bundled-policy.mjs:22`). `getBundledPolicyEntry` re-checks when `registry === BUNDLED_POLICY_REGISTRY` (`:76`). No test exercises either rejection.

In "production registered policy containment and path checks", `mockProductionRegistry` is built but never used. The last assertion only confirms the real starter entry is accepted, so deleting both guards would leave every test green. The `isPolicyPathContained` unit cases and the `inspectArchive` containment case are good, but they test the helper and the release gate, not the runtime guard. Suggestions:
- Remove the dead fixture.
- Make the guard testable without adding a production grant, for example by exporting an internal `createBundledEntry(name, relativePath, sha256, baseUrl)` used by `bundledEntry`. Then assert that it throws for `'../src/policy.mjs'`, `'../policies'` and absolute outside paths.

### R3: Nothing asserts that a real qualification run reports `bundledProfile: null`

The README now says "qualified envelopes always report `policy.bundledProfile: null`". The only `null` assertion is on an `analysis-only` external run (`check.test.mjs:107`). Add `assert.equal(result.policy.bundledProfile, null)` to the real passing qualification run in `qualification.test.mjs` (around line 127).

---

## Findings by prerequisite

### (1) Accessor rejection and snapshot: correct

- The registry slot is read with `Object.getOwnPropertyDescriptor`. Accessor and setter-only descriptors are rejected before the value is touched, so no getter is invoked.
- The entry must be frozen. `name`, `path` and `sha256` must be own data properties, and every other own key (including symbols, via `Reflect.ownKeys`) must be a data property too.
- Values are taken from `desc.value`. On a frozen object, every own data property is non-writable and non-configurable, so the returned `entry` cannot change between validation and read.
- The same holds for a Proxy wrapping a frozen target: the Proxy `[[GetOwnProperty]]`/`[[Get]]` invariants force it to report the target's values.
- The extra local snapshot in `loadBundledPolicy` is redundant but harmless.
- Public wrapper compatibility is kept: `resolveBundledPolicySelector('bundled:starter') === BUNDLED_POLICY_REGISTRY.starter` is asserted.
- Tests cover getters on:
  - the registry slot
  - `path`, `sha256` and `name`
  - an extra property
  - a setter-only property
  - an alternating getter

  Each case asserts zero invocations and checks `getBundledPolicyEntry`, `resolveBundledPolicySelector` and `loadBundledPolicy`. These tests would catch a regression.
- Unknown, prototype and traversal selectors are still refused. `BUNDLED_NAME` and the own-descriptor lookup are unchanged in effect, and the existing tests still pass.

### (2) Production containment and archive expectations: correct in code; tests are weak (R1, R2)

- `isPolicyPathContained` is lexical and rejects the directory itself, `..` escapes, relative paths and non-strings.
- The production registry is checked at construction and again on lookup. Custom registries pointing outside the directory are still allowed for fixtures, and this is tested. Custom registries have no path to the CLI, which always uses the production registry, so no production grant is created.
- `package.json` `files` ships the whole `policies/` directory, so any newly registered policy is packed.
- `inspectArchive` builds the expected entries from the registry and cross-checks them against the `.json` files in `policies/`, so unregistered companion policies cannot be shipped.

### (3) Direct embedded-pin verification: correct

- Every registered policy extracted from the archive is hashed against `entry.sha256`, in addition to the byte-equality check against source.
- The pin comes from the source-tree registry. The archived `src/bundled-policy.mjs` is byte-checked against that same source in the same run, so the pin is transitively the archived module's embedded pin.
- Case 5 (bytes equal to source, pin wrong) exercises this check and would catch a regression.

### (4) `bundledProfile` envelope: correct, with no weakening of qualification

- `bundledProfile` is `options.bundledPolicy` for bundled selection. That value comes from the validated entry name, which must equal the selector. It is `null` for external policies.
- `id`, `version`, `schemaVersion`, `sha256`, `source` and the counts are all unchanged. `parseArguments` is unchanged, so these all still hold:
  - bundled + `--policy-sha256` is a usage error
  - bundled + qualification is a usage error
  - an external policy requires a pin
  - the pin is checked before parsing
- `isQualificationPass` now also rejects any non-null `bundledProfile`. It still requires `source === 'external'`, so this is strictly additive. Envelopes without the field are still accepted; this matches the baseline, since the checker version is unchanged. Optionally, tighten this to require an own `null`.
- The mutation matrices in `check.test.mjs` and `qualification.test.mjs` include `bundledProfile = 'starter'`.
- The README describes the field accurately and leaves companion-profile availability unchanged: `code`, `media`, `chat` and `chat-code-media` are still unregistered and unshipped.

---

## Nits (optional)

- `test/inspect-archive.mjs:7` imports `POLICIES_DIRECTORY` but never uses it.
- `isPolicyPathContained` uses `rel.startsWith('..')`, which also rejects a contained file named like `..foo.json`. This is conservative. `rel === '..' || rel.startsWith('..' + sep)` is exact.
- `getBundledPolicyEntry` checks `name`, `path` and `sha256` explicitly and then checks them again in the `Reflect.ownKeys` loop. One loop plus three `desc.value` reads would be enough.
- `inspectArchive` lists only top-level `policies/*.json`. A future registered policy in a subdirectory would fail closed, but would need this updated.

## Remaining limitations (acceptable for this change)

- Containment is lexical, not realpath-based. A symlinked `policies/x.json` is not caught at runtime. `npm pack` does not follow symlinks, so the archive gate would fail closed.
- Custom (non-production) registries that are Proxies can still run trap code during validation. They cannot change the validated values, but a throwing trap propagates as an exception rather than a `bundled-policy-unknown` failure. This is not reachable from the CLI.
- A misregistered production path fails at module import with a thrown `Error`, not a usage error. This is fail-closed and only reachable through a developer error.
- `bundledProfile` is output metadata only. As the README says, a JSON envelope is not authenticated evidence, and qualification still depends on an external policy and pin.
- I could not independently re-run tests or packing here because execution was denied. The test and archive results above come from the implementer's recorded transcript, cross-checked against file sizes and the baseline hash manifest.
