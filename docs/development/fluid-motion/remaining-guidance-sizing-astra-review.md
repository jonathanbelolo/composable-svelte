# Guidance provider sizing correction review

Independent GPT-6 Astra, high effort; 2026-09-27. Bounded G2a follow-up under canonical policy v2.10. Prior G1/G3 closures and all unchanged guide gates retained.

Verified immutable inputs before and after review:

- Base `remaining-guidance-correction-snapshot/manifest.json`: `5dd4d2eda835fa1cceae337d4ca8a7d794c84be0bb42f89b6c1bde600762ccb5`, all 70 files match.
- Two-file overlay `remaining-guidance-sizing-snapshot/manifest.json`: `cdaf25dfcb84ce626cf77bbf3899ef6e8bedf9c403da60a13289cab619f6d2bc`, both files match. Corrected `elements.ts`: `3d13acb7ff87d123d329377dae92632f18dbcc0f4529f5fb08403f1288df7813`.

**G2a closed. No new findings in this delta.**

`ClosedBadge.follow()` now synchronizes only its observed component attributes (`label`, `animated`), including removals, and then follows animation times. It leaves framework placement attributes and inline sizing untouched. The provider still follows only a connected source, preserving the final state after retirement.

Independent browser run of the frozen base plus exact overlay passed **12/12** across Chromium, Firefox and WebKit:

- Original independent attribute-state repro, unchanged: 3/3.
- Attribute removal / post-retirement companion: 3/3.
- Original independent sizing probe, byte-identical to the previous failing probe: 3/3. Width remains 240px after the changed-state frame.
- Author sizing companion: 3/3.

Evidence remains in `remaining-guidance-astra-evidence/astra-provider-layout.browser.test.ts` and `sizing-final-result.txt`. The isolated fixture ran at `/private/tmp/remaining-guidance-astra-review/shadow-correction`; no product files or frozen snapshots were edited, no builds/full-workspace gates run.

All G1–G3/G2a findings are now closed for this composite guidance checkpoint. Any later RC4 policy wording and final coherent guide/runtime verification remain separate, as assigned.
