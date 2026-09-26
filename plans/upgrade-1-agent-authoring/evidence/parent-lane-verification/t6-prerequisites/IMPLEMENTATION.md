# Implementation Report: Pre-Profile Architecture-Checker Prerequisites

## Summary
Autonomously implemented, tested, and verified all four pre-profile architecture-checker prerequisites and resolved all reviewer findings (Blocker B1, Recommendations R1, R2, R3) in `@composable-svelte/architecture` (`candidate` tree), comparing strictly against the baseline at `/private/tmp/companion-checker-profile-preparation/baseline/packages/architecture`.

No commits, publication, version changes, new production profiles, new detector rules, capability grants, policy approvals, or weakened validations were introduced. The production registry retains strictly `starter` as its sole entry, and `policies/starter.json` remains byte-for-byte identical with its embedded SHA-256 pin preserved.

---

## Prerequisite Gaps & Review Resolutions

### 1. Custom Registry Entries & Accessor/Getter Rejection (Gap 1)
- **Problem**: Custom or frozen registry entries could define property getters on the registry itself or on entry fields (`name`, `path`, `sha256`, or extra properties), allowing state to change between validation and read, or executing uninspected code upon property read.
- **Solution**:
  - `getBundledPolicyEntry` inspects own property descriptors directly via `Object.getOwnPropertyDescriptor` without property access.
  - Rejects any accessor descriptor (`get !== undefined || set !== undefined || !('value' in desc)`) on the registry entry property without invoking getters.
  - Validates that `entry` is frozen, and inspects `Reflect.ownKeys(entry)`. For all own keys, verifies descriptors are plain data properties without getters or setters.
  - Reads values directly from descriptor values (`nameDesc.value`, `pathDesc.value`, `shaDesc.value`).
  - In `loadBundledPolicy`, snapshots validated plain data (`entryPath` and `expectedSha256`) once into local constants prior to reading file bytes or validating policy bytes.
  - Preserves reference equality and wrapper compatibility: `resolveBundledPolicySelector('bundled:starter') === BUNDLED_POLICY_REGISTRY.starter` remains strictly true.

### 2. Production Registered Policy Containment & Dynamic Archive Expectations (Gap 2)
- **Problem**: Baseline had a hardcoded archive expectation (`policies/starter.json`) and lacked strict containment checks guaranteeing every production registered policy resolves within the shipped `policies/` directory.
- **Solution**:
  - Exported `POLICIES_DIRECTORY` and exact `isPolicyPathContained(targetPath, policiesDir = POLICIES_DIRECTORY)` helper in `src/bundled-policy.mjs`, correctly accounting for path separators (`rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel)`).
  - Exported `bundledEntry(name, relativePath, sha256, baseUrl = import.meta.url)` enforcing production containment on registration. Tested actual failure path when called with uncontained paths (`../src/policy.mjs`, `../policies`, `../../outside.json`, `/tmp/foo.json`) (resolves R2).
  - Preserved custom test fixtures without production grants: custom test registries (e.g., fixtures in temporary directories) remain fully supported when passed to `loadBundledPolicy` and `getBundledPolicyEntry`.
  - Updated `test/inspect-archive.mjs` to dynamically derive expected archive policies from `BUNDLED_POLICY_REGISTRY` entries (no hardcoded `starter.json` list) and verify containment against the shipped `policies/` directory.
  - Verified that all `.json` files in the shipped `policies/` directory match the registered production policies exactly. Tested extra unregistered policy rejection (`policies/extra.json`) (resolves R1).
  - Tested multi-policy archive inspection (`starter` and `test-alpha` registered and contained), verifying archive pass when both are present, failure when one is missing from archive, and failure when second pin is wrong (resolves R1).

### 3. Archive Inspection Embedded Pin Hashing & CLI Gate Fix (Gap 3, Blocker B1, & Finding F1)
- **Problem**:
  - Baseline `test/inspect-archive.mjs` only checked archive entries against source files on disk, but did not directly hash each archived policy against its embedded pin.
  - Candidate initially used `resolve(process.argv[1]) === fileURLToPath(import.meta.url)`, which failed to match when invoked through a symlinked path (such as `/tmp/...` on macOS, which symlinks to `/private/tmp/...`), causing the gate to silently exit 0 without running assertions (Blocker B1).
  - An initial symlink CLI regression test conditionally checked for a prebuilt archive at a hardcoded relative path (`../scratch/...`), which silently skipped the positive valid-archive check when absent (Finding F1).
- **Solution**:
  - Fixed `isMain()` in `test/inspect-archive.mjs` using `realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))`, matching the robust pattern in `src/check.mjs`. Removed unused `POLICIES_DIRECTORY` import.
  - In `test/inspect-archive.mjs`, every archived policy is directly extracted and hashed with SHA-256 against its registry embedded pin (`entry.sha256`), asserting exact pin match in addition to asserting source byte equality against disk files.
  - In `src/bundled-policy.test.mjs`, the symlinked CLI regression control is fully self-contained: it runs `npm pack --ignore-scripts --quiet` directly into the fixture directory and unconditionally asserts that invocations via symlink (`os.tmpdir()` symlink and `/tmp` alias) exit 0 with `"status": "archive-matches-source"` and match the embedded starter pin. Tested against negative controls (missing args, missing archive, corrupt archive) and proven via mutation M7 (rejects no-op success output) (resolves B1 & F1).

### 4. CLI Output Policy Envelope Identity Metadata (Gap 4 & Recommendation R3)
- **Problem**: CLI JSON output policy envelope did not explicitly identify the selected bundled profile name.
- **Solution**:
  - Added additive field `bundledProfile` to the `result.policy` envelope in `src/check.mjs`:
    - Populated with the selected registry name (e.g. `"starter"`) when `--policy bundled:<name>` is selected.
    - Set to `null` for external policies (`--policy <path>`).
  - Preserved all existing envelope properties: `id`, `version`, `schemaVersion`, `sha256`, `source`, `capabilityGrantCount`, `exceptionCount`.
  - Preserved qualification refusal: bundled policy qualification remains refused with exit code 22 (usage error).
  - Preserved `--policy-sha256` incompatibility: supplying `--policy-sha256` alongside a bundled policy remains a usage error.
  - Enforced in `isQualificationPass` that qualification requires an external policy and `policy.bundledProfile` must be `null`.
  - Added explicit assertion in real passing qualification run in `src/qualification.test.mjs` verifying `result.policy.bundledProfile === null` (resolves R3).

---

## Documentation Updates

Updated `packages/architecture/README.md`:
- Documented `policy.bundledProfile` (`"starter"` for bundled selection, and `null` for external policies) in the output envelope.
- Reinforced the unchanged availability status of companion profiles: `code`, `media`, `chat`, and combined `chat-code-media` remain unselectable, not registered, and not shipped until independently qualified.

---

## Verification Results

1. **Focused Tests**:
   - `node --test src/bundled-policy.test.mjs`: **11 passed, 0 failed**.
     - Covers getter rejection on registry and entry fields (`path`, `sha256`, `name`, extra fields, setter-only, alternating getters) with zero getter invocations.
     - Covers `bundledEntry` throwing on outside/non-contained paths and succeeding on contained path (R2).
     - Covers `isPolicyPathContained` with exact separator boundary.
     - Covers `inspectArchive` with multi-policy registry (`starter` + `test-alpha`), missing registered policy in archive with message match, pin mismatch on second policy, extra unregistered policy on disk (`policies/extra.json`), missing file on disk, and containment failure (R1).
     - Covers `inspect-archive.mjs` CLI execution via symlinked invocation path (no args failure, missing archive failure, corrupt archive failure, and self-contained unconditional valid archive success) (B1 & F1). Proven via mutation M7 to reject no-op success output.
   - `node --test src/check.test.mjs`: **5 passed, 0 failed**.
     - Covers `policy.bundledProfile === 'starter'` for bundled policies.
     - Covers `policy.bundledProfile === null` for external policies.
     - Covers `isQualificationPass` rejecting envelopes with `bundledProfile = 'starter'`.
   - `node --test src/qualification.test.mjs`: **24 passed, 0 failed**.
     - Covers real process qualification asserting `result.policy.bundledProfile === null` (R3).
     - Covers real process analysis-only asserting `analysisResult.policy.bundledProfile === null`.
     - Covers qualification envelope mutation matrix including `policy.bundledProfile = 'starter'`.

2. **Full Test Suite (`npm test`)**:
   - Total files discovered: 77 test files.
   - Total tests executed: **529 passed, 0 failed**, 0 cancelled, 0 skipped.
   - Run duration: ~18.8 seconds.

3. **Package Packing & Archive Inspection**:
   - `npm pack --ignore-scripts --pack-destination candidate/scratch`:
     - Generated `candidate/scratch/composable-svelte-architecture-0.13.0.tgz` (32 files, 93.4 kB).
   - `node /tmp/companion-checker-profile-preparation/candidate/packages/architecture/test/inspect-archive.mjs candidate/scratch/composable-svelte-architecture-0.13.0.tgz`:
     - Tested via `/tmp` symlink path directly.
     - Status: `archive-matches-source`.
     - Archive SHA-256: `a365156505cc0bd53a5025cf681b182593493341818420cc2fc3b994e3437ac6`.
     - Verified `policies/starter.json` archived SHA-256 directly matches pin `389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3` and matches source file bytes.

---

## Changed Files Relative to Baseline

Exactly 7 files changed relative to baseline (no new files, no deletions, no dependency alterations):

| File | Change Summary |
| --- | --- |
| `packages/architecture/README.md` | Documented `policy.bundledProfile` envelope metadata and reiterated unchanged companion profile availability. |
| `packages/architecture/src/bundled-policy.mjs` | Exported `POLICIES_DIRECTORY`, `isPolicyPathContained` (with exact sep boundary), and `bundledEntry` (for production containment guard); added accessor checks rejecting getters/setters without invocation; added production registry path containment; snapshotted validated path/sha256 in `loadBundledPolicy`. |
| `packages/architecture/src/bundled-policy.test.mjs` | Added tests for accessor rejection, zero getter invocation, containment verification with `bundledEntry`, custom fixtures, multi-policy registry inspection, unregistered disk policy rejection, and self-contained symlinked CLI regression controls (unconditionally asserting valid archive success and pin). |
| `packages/architecture/src/check.mjs` | Added `bundledProfile` to `result.policy` envelope (`options.bundledPolicy` when bundled, `null` when external); guarded `isQualificationPass` against non-null `bundledProfile`. |
| `packages/architecture/src/check.test.mjs` | Added assertions for `policy.bundledProfile` in bundled and external checks; added mutation test in verdict envelope tests. |
| `packages/architecture/src/qualification.test.mjs` | Added assertions that real qualification and analysis-only envelopes report `policy.bundledProfile: null`; added mutation to qualification envelope test matrix. |
| `packages/architecture/test/inspect-archive.mjs` | Fixed `isMain` via `realpathSync` to prevent silent no-op when invoked via symlink; dynamically derived archive policy expectations from `BUNDLED_POLICY_REGISTRY`; asserted containment within `policies/`; verified shipped policies match registry; directly hashed archived policies against embedded pin; exported `inspectArchive`. |

`policies/starter.json` was strictly preserved byte-for-byte with embedded SHA `389430147e64045cc17a59db23a3672f3849abf339f9a6e96ae13acde2dcd8b3`. No dependencies were altered.

---

## Limitations

- The production registry intentionally remains restricted to `starter`. Companion profiles (`code`, `media`, `chat`, `chat-code-media`) are not registered or shipped pending independent qualification.
- As by design, bundled policies remain strictly developer feedback tools and cannot be qualified under `--mode qualification`.
- Qualification continues to require an external orchestrator supplying an external policy with an independently verified SHA-256 pin, paired core version, and empty exceptions and capability grants.
