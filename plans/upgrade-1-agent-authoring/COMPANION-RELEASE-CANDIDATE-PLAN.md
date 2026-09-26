# Coordinated companion release preparation

This is preparation for the existing T6–T8 scope, not a candidate freeze or publication receipt. No new public API work is authorized by this document. Lane3 Auth is complete and parent-integrated through f06b63e64416b14eef05fbce2159165747068584. Archived lanes1/2 remain archived; release qualification owns any concrete targeted corrections.

## Versions and compatibility

Read-only npm registry snapshot is in evidence/companion-release-preparation/registry-snapshot.json. All proposed versions below were unoccupied at that check; recheck at actual freeze/publication.

| Packages | Proposed version | Required dependency change |
| --- | --- | --- |
| core | 0.13.1 | Contains the reviewed additive owner-action seam; retain independently verified Svelte5.20 minimum. |
| architecture checker | 0.13.1 | Qualifies exact new companion identities; preserve existing rule scope and independent qualification requirements. |
| auth, maps, graphics, charts | 0.3.0 | Require core^0.13.1; retain independently verified Svelte5.20 minimum. |
| code, media, chat | 0.5.0 | Require core^0.13.1; Code requires Svelte^5.30.0. Media and Chat alone retain5.20. |
| chat optional peers | — | Code^0.5.0 and Media^0.5.0, still optional. Preserve Prism/PDF optionality. |

Assign versions only after Auth's final reviewed migration is integrated. Update every shipped recipe, peer range, root lockfile and migration reference with the coordinated change, then pack immutable archives. Never publish new bytes over the provisional old version labels. Existing local candidate archive hashes are evidence of implementation qualification, not the final release artifacts.

## Checker profile boundary

Prepare seven separate companion profiles (auth/code/media/chat/maps/graphics/charts) and the required chat-code-media profile. Each includes core and the explicitly named companions only, with exact version identities. The selected newer Svelte qualification pin remains5.55.3; Code-containing minimum checks use5.30.0, other independent minimum checks5.20.0. These are compatibility checkpoints for one implementation. Checker parser dependencies remain separately identified.

Do not register a production profile before its package versions and exact artifact qualification are established. No wildcard approvals, new detector rules, or claims that package opacity proves internal correctness. Current starter is the only available profile. Before a second profile ships, close the existing review notes on immutable entry reads, production policy containment/archive coverage, direct archive-pin verification and selected-profile metadata.

Each bundled profile supplies development feedback. Independent qualification continues to use externally controlled policy bytes/pin and expected core/checker versions, with complete analysis required. Candidate installs must preserve matching registry-shaped package identities and independently verified tarball provenance; file: installs alone do not prove that checker path. Negative controls must demonstrate wrong package/policy pins and incomplete analysis cannot pass.

### Starter compatibility at the coordinated release

The existing starter policy approves the exact core0.13.0 and Svelte5.57.0 identities. Its supported-core range does not override those exact opaque-package pins. Updating the shipped consumer to core0.13.1 without a separately qualified policy change would therefore break its checker command. Preserve starter bytes during prerequisite implementation. At candidate qualification, independently qualify the new core-only starter, review the exact policy/pin change, and update the starter selector and shipped consumer together. Record the prior policy hash in release evidence; do not widen approvals to a range or describe the old starter as qualifying new bytes. The starter's Svelte pin must match its actual installed qualification, independently of companion compatibility checkpoints.

### Shared verifier maintenance

The legacy `scripts/verify-consumer.mjs` packs the live workspace and primarily executes standalone README examples. Retain that useful coverage, but it is not the final immutable-archive qualification receipt. Final qualification must accept a manifest of exact archive paths and SHA-256 values, reject mismatches before installing, and execute each shipped managed recipe in an isolated consumer with its declared dependencies. Audit documentation in shipped recipes and fixtures as well as docs and consumer directories.

The legacy negative control requiring every NodeCanvas use to specify `liftAction` is stale: identity actions now permit omission. Replace it with a positive identity-omission check and a negative incompatible-action mapper check, verified against the installed Code artifact. Do not remove action-type coverage or change the public API merely to satisfy the old control. These verifier changes require implementation and independent review before the final run.

## Final qualification, without a new development campaign

1. Integrate the cumulative reviewed Auth delta once; run appropriate affected and full final checks. Preserve unrelated existing workspace changes.
2. Finalize shipped guidance and version/peer metadata. Check packed references, links, public declarations and exact installed recipes. Preserve standalone compatibility and optional dependency absence.
3. Freeze runtime archives, build their qualified profile data, then freeze the checker archive. Any changed archive requires affected qualification to be rerun.
4. Verify required chat+code+media combination. Add other combinations only for a distinct uncovered risk, not to create another broad demo cohort.
5. Run fresh-context agent authoring using only exact installed public packages/references, normal iteration permitted. Record app/code quality, ownership, factoring and missing guidance; no first-attempt pass requirement.
6. Resolve the existing physical microphone gate honestly. No fake device result substitutes for it.
7. Publish dependencies in order and verify registry bytes/install/guide/checker behavior before latest promotion. The reviewed Core guides also use the existing `next` alias: promote Core0.13.1 to `next` together with `latest` after registry verification, and record both tag receipts. Fresh candidate authors use exact local archives, never the stale registry alias. No published completion claim until that receipt exists.

COMPANION-RELEASE-READINESS.json records pending gates explicitly. Estimates do not impose execution deadlines. No blanket worker timeouts.
