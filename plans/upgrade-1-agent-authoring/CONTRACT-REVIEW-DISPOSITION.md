# Application contract review disposition

## Recovery integrity

The original worker receipt is correctly retained as rejected: exit `0`, actual
model `claude-opus-5`, source unchanged, with JSON parsing failing because the
CLI result contained only the second continuation. The event stream contains
two assistant text blocks from that exact model, 18,061 and 11,723 bytes. Their
direct concatenation parses as one JSON response. The recovered file is a
pretty-printed serialization rather than byte-for-byte raw concatenation, but
its parsed value is identical; both canonicalize to SHA-256
`a50430264aeca0f791b4643b25c3bb314c93d0164c9eba3155ce5c9d50f749d1`.
The recovered artifact SHA-256 is
`3183c86bf494352c00b9c327194481c720505c482e722ec883d74bf66c336d52`.
No review text or finding changed.

## Finding disposition

**F01 — accept; documentation blocker for the next packaged contract.**
`useMotion` and `useMotionGroup` expose stable style and attachment handles, not
completion. A supported completion source does exist on current presentation
components: `Modal` and its primitive expose `onPresentationComplete` and
`onDismissalComplete`, and the primitive calls them after real playback or
content-loss settlement. Add a dedicated `application-presentation.md` with a
complete managed example: a genuine `PresentationView`, deferred slot policy,
`PresentationState`, primitive completion callback, and a distinct completion
action dispatched through the captured view. Explain reduced motion,
interruption, removal, and Host retirement: a retired captured dispatch is
dropped; applications must not invent a timer to keep an owner alive. Mark
`animation/animated-navigation.md` as legacy timing guidance and cross-link the
current bridge. Do not link the new contract directly to that conflicting guide
until it is labeled. Fix `navigation/components.md:132-139`, whose bare
`dispatch(...)` callbacks leave owner binding ambiguous.

**F02 — accept.** Split acceptance evidence explicitly. TestStore proves reducer
and effect decisions; Root/Host attachment, genuine view binding, focus,
surface capture, motion, reduced motion, and teardown require component/browser
evidence. Extend the no-fabrication rule to fixtures. For composed tests require
the composition reducer *and* execution configuration. Add deferred-exit
controls: same owner through repeated requests, captured completion, retirement,
stale completion after replacement, second dismiss not completion, and explicit
parent removal. These are requirements for affected features, not mandatory
boilerplate for every application.

**F03 — accept the wording issue; reject a new runtime restriction.** Root
projection dispatch is intentionally valid for parent business intent. The
contract already forbids reconstructing child dismissal with an unscoped parent
dispatch. Make the boundary concrete: parent actions may remove/replace a
child; child dismissal and visual completion use the captured
`PresentationView`. Do not claim every wrapped root action is runtime-rejected,
and do not add a blanket dispatch checker based on the speculative successor
scenario.

**F04 — accept.** The new presentation bridge must name exact public imports and
bound the compatibility exception. Classify `./animation` and
`PresentationState` as legacy explicit lifecycle support, not a custom driver or
managed-motion completion surface. Replace the open-ended “documented extension
point” language with “an explicitly documented public extension point whose
contract states ownership and cleanup”; absence of one is a capability gap.
Remove future managed-extension intent from normative requirements.

**F05 — accept.** Document `PresentationFeatureViewProps` for optional and
destination declarations so close controls need no cast. List `FeatureViews` /
`FeatureOutlet` and typed `scopeTo(app.store, slot)` as public managed binding
paths. Remove `resolveView` from user guidance because it is internal. Clearly
separate the typed slot overload, which can return a genuine
`PresentationView`, from the legacy fluent raw-store scope, which cannot mint
dismissal authority.

**F06 — accept as classification, not removal.** The raw managed-store
`FeatureViews` path is a compatibility/low-level integration for a caller that
already owns and retires the managed root. It has no Host presentation registry
or capture and is not the recommended application path. State those limits in
`application-views.md`; keep Root/Host as the normative starter.

**F07 — accept a narrow clarification; reject the speculative double-exit
claim.** State that `surface` registers capture eligibility only. It does not
choose or run an automatic animation, and omitting it is valid. No supplied
evidence establishes that deferred completion produces a second exit, so do not
document or redesign around that hypothesis.

**F08 — accept.** Assign the actual boundary: framework overlay components own
their documented focus trap/restoration and dismissal coordination; custom
markup remains responsible for its own accessibility behavior. Replace the
blanket “focus coordinator or presentation timer” prohibition with a ban on
duplicating a selected framework component’s coordinator or replacing its
completion callback with guessed timing. Report missing completion as a gap.

**F10 — accept.** Keep application-facing dismissal tests behavioral. Move raw
private-request invisibility and non-presenting-lift rejection into a clearly
labeled framework qualification section; applications should not mirror private
request mechanics.

**F11 — accept.** Hoist application/view definitions into module context or a
separate importable model in complete examples, and fix the routing example’s
misplaced import. This preserves exact definition identity for descendants.

**F12 — accept as a small implementation followup.** Change the stale
`useApplication` constructor diagnostic in `instance.svelte.ts` to identify an
instance created by `ApplicationRoot`. This is wording only and belongs in a
separate source patch with its existing diagnostic test.

**F13 — partially accept.** Document the primary supported surfaces and the
status of `nestedSlot`/`keyedSlot` where composition examples need them. State
that stable-style and numeric descriptor helpers support declared recipes and
do not create a driver API. Reject a requirement to narrate every public export
in the entry contract; declarations plus focused reference docs are sufficient.

F09 is superseded by the coordinated managed-starter documentation update and
must be checked against the next frozen candidate rather than repaired from this
older snapshot. F14 is confirming evidence. F15 explains the original packet’s
limits; the additional implementation reads above resolve the actionable parts
without expanding Upgrade 1 into new motion or ownership APIs.
