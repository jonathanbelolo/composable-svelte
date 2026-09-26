# Architecture tooling packaging plan

This plan starts only after the schema, semantic interface, five evaluators and CLI result contract stabilize. It does not move canonical sources or claim checker qualification.

## Package shape

Create workspace package `packages/architecture` following the existing `packages/*` pnpm convention:

- `package.json`: `@composable-svelte/architecture@0.13.0-next.1`, ESM, public access, Node `^20.19.0 || >=22.12.0`, and bin `composable-svelte-architecture` → `bin/composable-svelte-architecture.mjs`.
- Runtime dependencies owned by this tooling package, pinned exactly: `typescript: 5.9.3` and `svelte: 5.57.0`. Do not depend on core and do not place either parser in core dependencies. The root workspace currently resolves Svelte `5.43.3`; it is not an acceptable checker runtime. The physical pinned fixture at `/private/tmp/upgrade1-checker-pinned-v1` resolves TypeScript `5.9.3`, Svelte `5.57.0`, and has passed 69 tests.
- Published files: `bin/`, `src/`, `policies/`, `README.md`, `LICENSE`, and `package.json`. No browser export or bundler entry.
- Package scripts: focused Node tests, archive inspection, and an installed-bin smoke. Root scripts may delegate with `pnpm --filter @composable-svelte/architecture ...`; do not add this package to the runtime-package import verifier's `PKGS` list.

`bin/composable-svelte-architecture.mjs` should contain only the Node shebang, argument forwarding to `runCheck`, stdout/stderr emission and exit-code assignment. Keep policy and engine code importable for tests under `src/` without publishing an unsupported library API.

## One canonical move after stabilization

Move, preserving history where practical:

| Current | Candidate package |
|---|---|
| `scripts/consumer-architecture/check.mjs` | `packages/architecture/src/check.mjs` |
| `graph.mjs`, `policy.mjs`, `version.mjs`, `bundled-policy.mjs` | corresponding `src/` files |
| accepted `semantics.mjs`, `symbols.mjs`, rule evaluators | `src/semantics/` and `src/rules/` |
| `policies/starter.json` | `packages/architecture/policies/starter.json` |
| all checker `*.test.mjs` and fixtures | matching package test locations |
| internal `README.md` | replace with public `packages/architecture/README.md` |

Update the bundled-policy URL for the top-level `policies/` directory and regenerate its embedded SHA from exact published bytes. Move tests with their sources. Retire duplicate implementations; retain only thin root compatibility launchers if an existing repository command still needs them.

## Starter and public commands

Update `packages/core/consumer/package.json` with exact dev dependency `@composable-svelte/architecture: 0.13.0-next.1` and:

```json
"check:architecture": "composable-svelte-architecture --mode analysis-only --project . --policy bundled:starter --expected-core-version 0.13.0-next.1"
```

Document that this bundled command is developer feedback and cannot qualify a release. Add it to the starter README after type checking and before build. In the architecture package README and core authoring contract, document the independently controlled qualification form:

```sh
composable-svelte-architecture --mode qualification --project "$PROJECT" \
  --policy "$POLICY" --policy-sha256 "$POLICY_SHA256" \
  --expected-core-version 0.13.0-next.1 --records-root "$RECORDS" --today YYYY-MM-DD
```

The external orchestrator owns that command, policy, pin, date, records and verdict. Generated projects may invoke the bundled analysis command but cannot supply qualification gates.

## Candidate archive gates

1. Run the complete 69-test pinned baseline plus every stabilized semantic/rule test using the package's own exact dependencies. Require each detector's violation, conforming neighbour, alias/helper/re-export, unsupported-form and bypass controls.
2. Build two immutable archives with scripts disabled: core and architecture. Record `npm pack --json`, SHA-256, file list, modes, package manifests and lock inputs. Assert the architecture archive contains the bin, all engine modules, exact policy bytes and public README; reject checkout-only imports or omitted files.
3. Install both archives physically with `npm ci --ignore-scripts` in a fresh external starter. Reject workspace/link/portal resolution and symlinked package roots. From the installed architecture package, assert TypeScript `5.9.3` and Svelte `5.57.0`; assert the result envelope reports those versions and checker `0.13.0-next.1`.
4. Execute the installed bin, not repository source. Require bundled analysis success on the installed starter. Require negative exits for bundled qualification, missing/wrong policy pin, wrong core version, malformed prerelease, unsupported syntax, missing evaluator and incomplete graph.
5. Run externally pinned qualification and require schema/catalog v2, exact core/checker pairing, complete graph and violations, zero unavailable evaluators, zero violations/excepted findings/analysis errors, and `qualification: passed`. Validate with independently pinned `isQualificationPass` inputs.
6. Run the starter's strict Svelte check, unit tests, build, SSR and browser gates, then `check:architecture`. Verify core's runtime dependency tree and browser outputs contain no architecture package, TypeScript parser or checker modules.
7. Audit installed docs and commands from extracted archives only. Preserve archive hashes, installed realpaths/integrities, parser resolution, policy SHA, command lines, stdout/stderr and cleanup in separate package and qualification receipts.

Do not publish or move the canonical source while rule semantics are still changing. Package-name and bin decisions are already recorded in `CHECKER-DECISIONS.md`; this plan adds only the mechanical implementation and archive gates.
