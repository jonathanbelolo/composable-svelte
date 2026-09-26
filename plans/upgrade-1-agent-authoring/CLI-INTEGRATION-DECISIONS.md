# CLI integration decisions

These decisions refine the accepted Fable design; no evaluator completion is implied.

- Keep explicit `--mode analysis-only|qualification`. Once evaluators exist, both modes run them; `analysis-only` means developer feedback without an independent qualification claim. It must still exit nonzero for violations and incomplete analysis.
- Add exactly `--policy bundled:starter` for the shipped route-free starter policy. Resolve it from package-owned bytes and verify the embedded SHA. It supports only the pinned starter roots and package identities; it is not an automatic approval of arbitrary dependencies.
- Bundled policy does not require caller `--policy-sha256`; reject a supplied pin instead of implying external authority. Bundled policy with qualification mode is a usage error. Report policy.source=bundled, qualification=not-requested.
- File-based policy remains externally located, requires caller-provided SHA, and reports policy.source=external. Keep existing path, realpath and pin protections. Exact expected core version remains explicit in both modes.
- Qualification rejects nonempty exceptions/grants; developer feedback may preserve externally reviewed exceptions as listed excepted findings. Unsupported analysis errors cannot be excepted. Bundled guidance cannot qualify itself.
- `isQualificationPass` must check schema/catalog, qualification mode, external source and expected externally supplied policy hash, all required evaluators present, complete analysis, zero errors/violations, and exit0. A trusted outer controller must own the checker executable and input/materialization; a project-authored result object is not evidence by itself.
- Enforce exact TypeScript5.9.3 and Svelte5.57.0 parser versions. Package them in development tooling only. Unexpected versions fail before qualification; report observed versions.
- Diagnostics and graph stay deterministically sorted and project-relative. Keep all delegated package-materialization and bounded semantic limitations explicit. No source ASTs or absolute temp paths in public result.
- Canonical implementation moves once to packages/architecture/src only after foundation/evaluator review. Compatibility entrypoints under scripts/consumer-architecture preserve existing internal invocations. Published files contain source, policies, bin, README and license, no mission/audit packets.

The file-only fresh-agent environment is separate from this CLI design: the outer controller installs packages and executes checks; native file tools let the agent read installed public docs and implement the application. This restriction and its diagnostics/repair protocol must be recorded in results.
