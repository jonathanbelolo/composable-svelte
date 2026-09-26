# Presentation lifecycle root review

Reviewed PRESENTATION-LIFECYCLE-DESIGN-v1.md against existing slot reconciliation,
queue ownership and the generated B editors. The owner/transition/attachment model
and absent-surface analysis are useful design outputs. Public adoption is deferred.

A direct internal slot-clear envelope was not accepted. A parent reducer can own
cross-field invariants involving the child (active ID, reservation count, sibling
constraints). Clearing one field outside that reducer can leave invalid parent
state. Moving all bookkeeping to exit authorization can also break invariants while
the child intentionally remains present during animation. This is a correctness
issue, not merely an implementation detail or a reason to ask the user to approve
unsafe simplification.

The revised design explicitly withdraws direct clearing. A pure parent-removal
transform is a possible experiment, but introduces new policy, failure and typing
surfaces; compare it with a reusable ordinary removal function under the existing
explicit completion workflow. The currently supported workflow stays the default.
No new queue envelope, public intent, automatic slot removal or visual completion
API has been implemented or represented as validated. The bounded author-quality
pilot therefore compares guidance and the separately tested async helper; it does
not claim to evaluate automatic presentation lifecycle or animation removal.

The design task is complete with a documented counterexample, alternatives and
acceptance matrix. Implementation/adoption is deliberately not selected on the
present evidence. Existing behavior and genuine owner authority are preserved.
