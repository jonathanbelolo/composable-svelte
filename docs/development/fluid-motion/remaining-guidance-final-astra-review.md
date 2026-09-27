# Final guidance wording and harness delta review

Independent GPT-6 Astra, high effort; 2026-09-27. Bounded final delta under canonical policy v2.10. All G1–G3/G2a and reference R1 closures are retained; no broad runtime retest or product edit.

**Approved. No findings in this delta.**

## Frozen identity

- `remaining-guidance-final-snapshot/manifest.json`: `421038d878587d78870564a08706d5a8666f6ad2d3d66a756ca6b4cd54e6f029`; all nine files match before and after review.
- Owning core `remaining-core-final-snapshot/manifest.json`: `ce2284649c74fcb3e2c7958448ffa548f897a4a32fa930652f5920670d45eb1a`; all 521 listed files match.
- Prior approved provider-sizing overlay and original guidance base remain the composite inputs; this nine-file delta does not replace or reopen their evidence.

## Reviewed claims and evidence

The final guide and template implement both decisions in `remaining-final-main-disposition.md`: predefined lower/upper Armenian outside 1–9999 deterministically settles the **containing participant across engines**, including engines that may render the value correctly. It is described as a qualification boundary, not an inherent failure. In-range and custom overrides remain distinct. The exact diagnostic agrees with final `counters.ts:116–123`; authored-rule lookup precedes the predefined switch at lines 104–106. No width-equality or UA inference is claimed. Fractional-text wording classifies the measured difference as antialiasing with preserved layout, records its quantitative limits, and does not constrain placement to integer origins or promise universal zero pixel error.

The fixture-only optimizer change retains exclusion of `@composable-svelte/core` and includes only its dependencies plus `svelte/server` at startup. Inspected optimizer metadata has resolved entries for all five requested dependencies and no bundled core entry. The metadata is retained at `remaining-guidance-astra-evidence/final-optimizer-metadata.json`, SHA-256 `b8b7d6e7897af9d7eed7e67377d44b6a1282a0ceddceb857e7ea0235c272a5fe`. This verifies effective dependency resolution, not merely config spelling; the product build is unchanged.

The frozen replacement log `shadow-coverage-check/evidence/full-run-after-optimizeDeps-fix.log` has SHA-256 `296d53cba3da88780da854a99f372025833149b6bfacbbf66f6e52ab25ed613f`. It contains one run header, 24 passing test-file entries and **54/54 tests**, with **18 per engine** (Chromium, Firefox, WebKit). There are no failed-resolution, optimizer-reload, lifecycle-error, assertion-failure or unhandled-error markers. The frozen report explicitly withdraws the earlier combined 44/54 plus targeted 18/18 claim and replaces it with this single full run. Its stable final-core digest is recorded before and after that run; no mixed-candidate result is used for closure.

The guide's `visual.ts`, plan tests and staged tests are byte-identical to the earlier reviewed correction snapshot. Retain the reported final-dist guide checks: type/Svelte checks 0/0, node 13/13, Chromium 6/6 and render match. These were not redundantly rerun in this narrow review. The report links the final coherent identity separately from historical checkpoints.

This closes the assigned final guidance/documentation-harness delta. Overall feature acceptance remains with Main, using the independently approved final core and coherent reference evidence.
