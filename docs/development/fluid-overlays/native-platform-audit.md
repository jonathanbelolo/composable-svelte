# Native platform witnesses for U5

Independent bounded read-only product audit, 2026-09-27 20:44–20:50 UTC. Baseline HEAD `2e07f650c1421c25f6b29d2db9c0cc885ea891ed`, branch `codex/fluid-overlay-orchestration`. Other workers' edits were not inspected or modified. This is platform evidence for Main/designer disposition, not an architectural proposal or approval of the revision.

Plain browser DOM only, Playwright 1.56.1 desktop/headless: Chromium **141.0.7390.37**, Firefox **142.0.1**, WebKit **26.0**. Final witnesses use a 900 × 700 viewport. Paint order is sampled from actual screenshots at (40,40), separately from hit testing. Input witnesses use trusted browser keyboard/pointer input; pointerdown, pointerup and click are recorded as `isTrusted: true`.

## Observed comparisons

All-three-engine statements below mean these installed builds and fixtures only.

| Situation | Observed result |
| --- | --- |
| Dialog open, then sibling manual decorative popover | Plane paints above dialog; focused dialog button stays focused. |
| A second modal dialog opens after that plane | Second modal paints above plane. Closing it exposes plane again and restores focus to earlier dialog button. |
| A further manual popover opens after both | Further popover paints above plane; hiding it exposes plane. |
| Plane opens before modal dialog | Modal paints above plane. Hiding/showing the same plane moves it above modal; focus remains on modal button. Removing plane reveals modal and preserves that focus. |
| Auto popover is already open when decorative manual popover opens | Auto popover remains open and its focused input remains focused. The later decorative plane nevertheless paints above it. Opening a plane does not preserve the earlier auto popover's visual precedence. |
| Auto popover hides/reopens after plane | Auto popover then paints above plane. |
| New native modal opens after that auto popover | Modal paints above both; the earlier auto popover becomes closed in all three builds. The manual plane remains a separate lifetime. |
| Manual plane shows/hides while auto popover is open | Initial control probe confirms auto remains open and focus is unchanged at each show/hide checkpoint, on page and within modal. Later input assertions in that exploratory suite were superseded as explained below. |

These facts establish insertion order and demonstrate that opening/hiding native surfaces can change other surfaces' native state. They do not establish an arbitrary ability to insert a decoration between already-open native layers.

## Input, focus and dismissal

The direct-browser matrix has 18 configurations: each engine tests page/no-plane, page/sibling-manual, and modal with no plane, sibling-manual, in-dialog-manual, or ordinary in-dialog decoration.

- In all 18, showing decoration preserves the open auto popover and focused input. A real click on the outside button closes the auto popover, focuses that button, and leaves the manual plane open. The modal remains open where present. Three trusted pointer events reached the expected button in each configuration.
- Escape closes the auto popover in every configuration. **Chromium and Firefox keep its containing modal open; WebKit closes both auto popover and parent modal.** The difference also occurs with **no decoration**. Thus it is not evidence that the manual candidate causes the difference. It is an observed native behavior relevant to any coordinator that promises only the topmost dismissal per Escape.
- An additional 12-configuration lifecycle matrix compares no plane, sibling manual, in-dialog manual and ordinary in-dialog decoration for each engine. Tab moves between explicitly tabbable real modal buttons and Shift+Tab moves back in all configurations. Escape closes the modal and restores the pre-modal opener in all configurations. The decoration never receives focus.
- Initial WebKit Tab checks used buttons without explicit `tabindex` and moved focus to the body. Explicit `tabindex=0` produced the recorded matching result with and without decoration; do not interpret the initial result as decoration stealing focus. These witnesses do not test a complete application focus trap.

## Lifetime and in-surface comparison

The lifecycle matrix samples paint after native Escape closes the dialog:

| Placement | Open-dialog pixel | Plane state after dialog closes | Pixel after dialog closes |
| --- | --- | --- | --- |
| No decoration | Red dialog | None | White page |
| Sibling manual popover | Blue plane | Still `:popover-open` | **Blue plane remains painted** |
| Manual popover physically inside dialog | Blue plane | Still `:popover-open` | White page; closed ancestor hides its paint |
| Ordinary inert decoration physically inside dialog | Blue plane | No popover state | White page; closed ancestor hides its paint |

Explicitly removing decoration produces white page and preserves opener focus in all 12 configurations. A sibling manual plane therefore needs explicit teardown when its semantic native surface closes. Moving a manual plane inside the dialog hides paint at parent close but does **not** itself clear the child's native popover state. Ordinary in-surface decoration follows the ancestor's visibility without a separate native popover lifetime. A later modal also paints above the ordinary in-dialog plane (exploratory witness).

These are alternatives with different observed lifetime properties. No conclusion is made here about which can support every cross-layer flight, clipping boundary or disappearing owner.

## W-L1 flat slot witness

Reproduced in all three engines with actual screenshot pixels and hit testing: append body siblings in this order: backdrop1 `z-index:50`, full red content1 `z-index:51`, full blue backdrop2 `z-index:50`, small green content2 `z-index:51`. At (40,40), outside content2, the result is **red content1**, not blue backdrop2. At (540,440), content2 is hit as expected. A later sibling's z50 backdrop cannot cover an earlier z51 content sibling merely through DOM order. This establishes the concrete objection to flat repeated z50/z51 slots; it does not prescribe the replacement container design.

## Reproduction and retained evidence

All files are under `docs/development/fluid-overlays/native-platform-evidence/`:

- `layer-order.browser.test.ts`, `vitest.config.mjs`, `layer-order.log`: three scenarios × three engines, **9/9 passed**, 1.91 seconds runner. From `packages/core`, run `pnpm exec vitest run --config ../../docs/development/fluid-overlays/native-platform-evidence/vitest.config.mjs`.
- `input.mjs`, `input.json`: direct Playwright input matrix, 18 recorded configurations. From repository root, run `node docs/development/fluid-overlays/native-platform-evidence/input.mjs`. JSON was checked for all 18 expected states, three trusted pointer events per outside click, and browser-specific modal Escape outcomes.
- `lifecycle.mjs`, `lifecycle.json`: direct Playwright assertions and samples for 12 lifecycle configurations plus three auto-popover ordering sequences. Run `node docs/development/fluid-overlays/native-platform-evidence/lifecycle.mjs`.
- `initial-probe.browser.txt`, `control-probe.browser.txt`, `control-probe.log`: retained exploratory witnesses and negative-control history. These are not a passing acceptance suite.

The standalone scripts import the exact installed Playwright runtime via this worktree's absolute pnpm path; adjust that path when reproducing in another checkout.

The first Vitest outside-click assertions failed both with and without decoration. Controls showed **zero pointer events reaching the document**, so those assertions did not exercise outside dismissal and were discarded. Direct Playwright clicks at an explicit viewport resolved the evidence gap and recorded trusted events. No native outside-dismissal defect is claimed from the failed exploratory run. The WebKit Escape difference persisted in the direct no-plane control and is retained as a real observation. Close-event delivery is asynchronous in Chromium, so its immediate event array is not evidence of a missing eventual `close` event.

## Limits

No application primitive, route transaction, accessibility tree/screen reader, mobile device, pinch zoom, browser Back, reduced-motion orchestration or owner-epoch system is exercised here. No test grants the decoration business authority. Full integration still needs the actual coordinator's guards, dismissal ordering, focus/scroll lock behavior and epoch teardown checks. The platform witnesses neither justify global top-layer refusal nor qualify a universal manual-popover solution.
