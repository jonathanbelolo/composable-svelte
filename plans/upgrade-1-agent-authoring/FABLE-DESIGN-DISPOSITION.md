# Fable design disposition

Source: `plans/framework-remediation-2026-09-18/workers/upgrade1-fable-design-v1-host/{receipt.json,response.json}`. Fable 5.1 completed with exit 0 and an empty patch. The receipt is `stale-proposal` only because `packages/core/consumer/src/App.svelte` was migrated to Root/Host and the starter sentence in `application-contract.md` changed during review. The checker substrate, motion/routing/view guides, specification and plan inputs did not drift. Treat the checker and qualification design as applicable; revalidate starter-specific details against current files.

## Accepted architecture direction

1. **Separate checker tooling.** Package the checker outside core's browser/runtime surface, paired explicitly to the core prerelease. This avoids installing pinned TypeScript/Svelte parsers for ordinary runtime consumers. The package name, workspace location and whether this counts as prohibited companion expansion remain coordinator decisions; Fable's proposed `@composable-svelte/architecture` is a placeholder, not accepted naming.
2. **Build on the existing graph and policy substrate.** Preserve its resolver, fail-closed analysis and external policy pinning. Add an in-memory AST/symbol layer with lexical scopes, import/export/re-export resolution, alias/shadow handling and Svelte template scope resolution. Do not serialize ASTs in results or inspect opaque package code beyond trusted manifests.
3. **Bounded semantic analysis.** Use a finite, flow-insensitive and path-insensitive taint lattice plus function-level zones: decision/reducer, effect body, view, module top level, injection wiring and service. Local/cross-module helper reachability determines zones; directory names grant no authority. Report zone counts so an apparently clean scan cannot hide failure to recognize the application.
4. **Qualification completeness.** Unsupported semantic constructs are analysis errors, never silent skips or ordinary violations. `qualification: passed` requires every active evaluator to finish over the reachable graph, `violationsComplete: true`, no analysis errors and no violations. Results must be deterministic, relative-path-only and carry rule/detector, span, entry path, helper chain, replacement and installed-doc anchor.
5. **External versus developer authority.** Keep qualification policy outside the generated project. A bundled policy may provide developer feedback, but it cannot satisfy the fresh-agent gate. The orchestrator must require the expected external policy hash. Inline suppression is rejected; fresh-agent policies have no exceptions or grants.
6. **Managed starter scope.** Fable independently supports the already-landed direction: Root/Host, the existing counter reducer/effect/dependency behavior, event dispatch from markup, existing theme/toolchain/SSR/browser coverage, and no `createStore`, `onDestroy` or manual destroy in `App.svelte`. Its exact proposed props/initialization are stale and must not overwrite the current migration.
7. **Six-run evidence remains bounded.** Three runs per reduced scenario retain clean installed packages, held-out changes, one diagnostics-only repair, outside functional/build/checker gates and preserved failures. Current fixed-target `useMotion`/`useMotionGroup` evidence does not close AAM-15; shared-layout/reorder motion, automatic defaults, custom drivers and preference supersession remain residual.

## Blocking risks before implementation acceptance

- **Prerelease parsing:** current policy, CLI pairing and registry-spec grammar accept only plain `x.y.z`, so they cannot qualify `0.13.0-next.x`. Implement SemVer prerelease precedence and exact declaration shapes before any checker claim.
- **No symbol/evaluator layer:** current graph discards the semantic information needed for alias, helper, barrel and shadowing controls. Activating rules before the B1 substrate would create cosmetic enforcement.
- **Policy usability:** explicit policies inside the project are rejected. A safe developer command needs a checker-owned bundled policy while orchestrated qualification continues to require an external hash.
- **Motion contract gap:** do not activate a competing-playback rule until public docs explicitly disposition Svelte transitions/animate/motion, Web Animations, requestAnimationFrame loops and View Transitions, while preserving permitted CSS and ordinary DOM use.
- **Fresh-run testability:** briefs need product-neutral URLs, test IDs, injected gateway semantics, entry roots and pinned dependencies. Each scenario and change needs a sealed rehearsal that passes the exact hidden gates before agent failures are interpretable.
- **Checker friction:** deliberate conservative errors around computed authority, store escape and dynamic constructs may produce real false positives. Replacement-bearing diagnostics, conforming neighbours, preserved outputs and independent review are required; observed false positives trigger checker repair, not agent coaching.

## Proposed packet interfaces and ownership

| Packet | Owner | Interface / acceptance |
| --- | --- | --- |
| A — starter | Gemini; Opus review | Current `packages/core/consumer/**`; reconcile with the migration already present. External tarball check/test/build/SSR/browser plus checker controls. |
| B1 — substrate | Gemini | `graph.mjs`, `policy.mjs`, new symbol/taint/zone modules and focused tests. Deliver prerelease SemVer, AST retention, scopes, import/export resolution, bounded dataflow, zones and fail-closed constructs. Land before B2. |
| B2 — rules/CLI | Gemini; Opus adversarial review | Five proposed evaluators: manual browser routing authority, presentation orchestration, pure decisions, unowned infrastructure and competing playback. Each detector needs an exact violation, conforming neighbour, alias/helper path and unsupported control. Deterministic result schema and genuine pass predicate. |
| B3 — packaging | Gemini; GPT-6 boundary decision | Move the reviewed checker into a tooling package only after B2. Pack/install/bin/files-list/parser-pin and core-version-pairing evidence. Bundled policy is feedback only. |
| C — contract/docs | Gemini; Opus review | Reconcile contract, motion, prerelease and consumer docs; add agent entry and gap template. Checker rules may activate only after their normative contract language exists. |
| D — qualification assets | Sol | External policy/hash, briefs, held-out changes/tests, sealed rehearsals, integrity controls, run ledger and evidence joins. Freeze after rule catalog and CLI stabilize. |

Order: B1 → B2 → B3. A and C may proceed in parallel with disjoint ownership. D may draft early but freezes only after B2. Coordinator alone integrates; Opus reviews A, B2 and C.

## Root decisions still required

1. Confirm a new separately published tooling package, its name and whether that packaging fits Upgrade 1's no-companion-expansion boundary. A core-bundled CLI was rejected for runtime dependency weight, but that trade-off is architectural policy, not a Fable fact.
2. Confirm all five rules for the first release. The pure-decision/resource/motion rules substantially enlarge B1/B2; a smaller honest catalog may be safer, but no active rule may ship without symbol-aware controls and contract text.
3. Decide bundled-policy behavior and schema-v2 compatibility. Fable proposes rejecting nonempty capability grants and allowing exceptions only for externally reviewed consumer projects.
4. Resolve scenario wording. Placement's accepted bounded scenarios use fixed-target group/status motion; Fable additionally proposes explicit unsupported-gap dispositions for shared travel and reorder motion. Gap reporting is useful evidence but must never count as capability delivery or full `SPEC-195` closure.
5. Revalidate Fable's starter initialization/test details against the migrated `App.svelte`, current `application.ts`, contract sentence and public TestStore API. Do not reapply its stale starter sketch.

## Evidence anchors

Use `BASELINE.md`, `QUALIFICATION-SCOPE.md`, `QUALIFICATION-COMMANDS.md` and `FRESH-RUNNER-NOTES.md` for the already-reconciled release boundary and harness. Checker baseline is `evidence/checker-substrate-baseline.log` (30/30). The authoritative Fable response supplies detector-level details under `U1-D02`–`U1-D12`, packaging/starter/docs under `U1-D13`–`U1-D15`, qualification controls under `U1-D16`–`U1-D17`, and packet order under `U1-P01`. Its suggested test commands are proposals only; Fable ran no tests.
