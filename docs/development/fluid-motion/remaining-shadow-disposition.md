# Sol shadow implementation disposition — 2026-09-27 15:35 UTC

Based on guide1b61's remaining-shadow-interface-needs.md and Main's requested truthful participation. Core91 owns implementation; guide1b61 owns fixtures/docs.

Proceed with demonstrated defects: avoid painting genuinely unrendered/unslotted content; truthful closed-shadow reasons; faithful settlement for unresolved suspected/declared opaque content instead of a blank projection. The generic default must not claim faithful captured pixels. Suspected custom elements may conservatively settle; a minimal documented light-DOM capability declaration lets known light-only custom elements retain normal projection and avoid false native capture. This is Sol's scoped implementation choice, not a user-required attribute spelling. Core chooses a consistent minimal attribute/API and publishes it before guide work.

Registered component provider is the existing live path and is already qualified. Serializable closed roots may use static reconstruction only where it actually preserves root/style/geometry; Firefox discrepancy must be resolved or accurately settled/qualified, not marked passed. Native route snapshot remains static and explicit opt-in.

Do not call absence of child rects universal proof of a closed root: verify against ordinary hidden/content-visibility/empty/zero-size text/layout cases, or classify conservatively as ambiguity. Avoid new arbitrary platform mutation or monkey-patching. Unrendered-element pruning must not erase display:contents descendants or real pseudo content.

Built-in hosts with undeclared nonserializable closed roots and no observable light-DOM signal are an actual introspection boundary. Sol sends that precise residual to Main with evidence; continue all independent repairs now. No broad design restart.

## Main disposition received 2026-09-27 15:35 UTC

Main accepts the narrow public-API introspection boundary: an undeclared, nonserializable closed root on an otherwise indistinguishable built-in host cannot be automatically detected or faithfully projected with tested public APIs. Require an explicit scoped provider or actually qualified serializable path; document undeclared opaque content outside automatic fidelity guarantees. No patching or false detection claim. Fix detectable host-box/unslotted errors and qualify serializable paths.

Main adds: conservative settlement must not indiscriminately disable ordinary custom elements whose light DOM can be faithfully rendered. Declarations express actual representation facts, not app-authored transition lifecycle machinery. Independent review must cover declaration/detection/fallback. This qualifies Sol's earlier blanket-suspected wording: preserve known faithful light-DOM rendering, keep uncertain inference distinct from confirmed/declarable opacity, and identify a genuine indistinguishability conflict if observable evidence cannot make that distinction. Do not silently broaden Main's accepted residual or blanket-skip custom tags.

## Main final refinement received 2026-09-27 15:41 UTC

The accepted observability boundary also applies to the demonstrated indistinguishable custom-element pair. Preserve ordinary observable light-DOM projection by default for ambiguous elements. Report completeness unverified (Main suggests `representationCompletenessUnverified`), NOT that a closed root was detected. No projection-success claim proves closed-root fidelity. Minimal scoped light-DOM-complete / opaque facts are approved; explicit opaque uses a qualified provider/native path or truthful settle, explicit light-DOM-complete is an author assertion about content (not security permission). Registered live and serializable static paths are separate; Firefox142 incomplete serialization must settle/report. Tests must cover ordinary lightDOM, declared opaque, absent-declaration ambiguous pair, malformed/incomplete serialization, real pixels. No further same-boundary disposition required.
