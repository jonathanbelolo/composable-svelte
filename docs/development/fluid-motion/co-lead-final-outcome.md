# Co-lead final outcome concurrence (Opus)

- **Model and effort:** Claude Opus 5.5 (`claude-opus-5-5`), high effort, retained co-lead context.
- **Assignment:** `opus-final-outcome-assignment.md` (17:00 UTC).
- **Times:** started 17:00:10Z, identity verified 17:00:23Z, written 17:01:04Z (54 s), inside the 300 s bound.
- **Scope:** a closing outcome assessment only. No code review restart, no tests or builds, and no edits other than this file.

## Exact candidate

| Item | Value |
|---|---|
| Product manifest | `remaining-coverage-product-manifest.json`, SHA-256 **`ad3bdf04a2d7392ff3d93ae696d4b2c3a7f47ddc9181d39c11774cfc25b98102`** |
| Manifest entries | 277 |
| Base | **`d472aa0848d8afffee35ab721d3a63ea6418121f`** (= `HEAD`) |
| Branch | `codex/fluid-layout-motion` |
| Core snapshot | `ce2284649c74fcb3…`, build 16:47:05Z |

**Cheap verification (17:00:23Z):**
- the manifest file hashes to `ad3bdf04…98102`;
- all **277/277** entries hash identically on disk, with 0 missing and 0 differing;
- `git rev-parse HEAD` = the stated base.

The broader 1,771 core and 177 graphics identity check is Sol's (`remaining-acceptance-identity-check.json`); I did not repeat it.

## Evidence used (existing, not re-run)

- `remaining-coverage-final-handoff.md`.
- `remaining-core-final-astra-review.md`: independent, 27 checks; RC2/RC4 closed; frozen `ce228464…`.
- `remaining-guidance-final-astra-review.md`: approved; no findings in its delta.
- `remaining-reference-integration-report.md`: final run 42/42 browser + 3/3 SSR.
- My own core reports:
  - `representation-implementation-report.md`;
  - `remaining-core-coverage-report.md`;
  - `remaining-core-review-corrections-report.md`.
- My original `co-lead-acceptance.md` §4 vision comparison, and the design intent it cites (`specs/frontend/fluid-layout-motion-design.md`).

## Alignment with the original vision

**Earlier gap:** in `co-lead-acceptance.md` I concluded the vision was realized for semantics, protocol and timeline, but only partially for expressive visuals across arbitrary layouts.

**The remaining-coverage work closes most of that visual gap on ordinary content, with independent evidence:**
- **Rich HTML and SVG paint:**
  - clip chains, including multiple rotated clippers composed exactly;
  - backdrop-filter and blend, faithful across the business commit against a live destination reference, with paint order preserved;
  - lists and counters, `@counter-style`, and quotes;
  - pruning of unslotted content.
- **Live media:**
  - qualified MediaStream and unencrypted MSE continuity;
  - WebGL and real WebGPU retained paint.
- **Commit semantics unchanged:** the choreography stays a decoration of a synchronous, owned commit. Unrepresentable content settles its participant faithfully (S4) instead of animating a blank or wrong copy. That matches the original principle that visuals never gain authority over business state.

**Qualifications are stated as policy or observability boundaries, not hidden:**
- deterministic participant settle for predefined Armenian outside 1–9999;
- conservative settle for protected media, with no claim that EME makes copying universally impossible;
- nonserializable closed roots, with completeness reported as unverified;
- the narrow iframe capability exception;
- fractional-x antialiasing, accepted with identical geometry and no rounding of origin or trajectory.

## Material limits that must stay prominent

1. **Cold large preparation.** A 1501-element participant costs about **330–351 ms** of preparation work, chunked, with an observed longest frame gap of **34–76.6 ms**. The business commit is correspondingly later, since preparation defaults are calibrated to 600 ms.
   - This is admitted, responsive-enough chunked work, **not** smooth 60 fps during preparation.
   - Much larger participants will exceed the budget and settle without motion.
2. **Destination GPU Scene mount.** There is one **~150–157 ms** main-thread task per destination `Scene` mount in the reference study, so the frame rate is visibly interrupted at that point.
3. **No universal frame-rate claim.** Measurements come from one machine and three engines. Chromium's fractional-x glyph rasterization differs from in-flow text (qualified, not pixel-identical).

## Verdict

**CONCUR.** I have no concrete outcome disagreement with Main's architectural acceptance of the exact candidate above.

This concurrence depends on the limits above staying prominent in the final acceptance and in user-facing documentation.

It does not authorize a commit, push, merge, publication or archive. The worktree must be preserved until durable integration.
