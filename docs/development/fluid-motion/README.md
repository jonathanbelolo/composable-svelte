# Fluid layout motion: acceptance and reproduction

The feature is accepted by Main and the Opus co-lead and committed in
`68b31d38c01b6441e5d94c063570e65b3d924bb9`. It is **unreleased**; use this branch
until the next package releases include it. This work does not publish packages.
Start with the
[public authoring guide](../../../packages/core/docs/fluid-motion.md) and the
[runnable reference](../../../examples/fluid-motion-reference/README.md).
The [final acceptance record](final-acceptance.md),
[outcome concurrence](co-lead-final-outcome.md), and
[acceptance packet](remaining-coverage-final-handoff.md) preserve the scope,
qualifications, measurements and reviewer decisions.

The accepted working-tree candidate is identified by
[the 277-file manifest](remaining-coverage-product-manifest.json), based on
`d472aa0848d8afffee35ab721d3a63ea6418121f`. The manifest predates the feature commit
and the separately requested documentation audit; later documentation changes do
not rewrite this historical identity. Required design inputs are retained under
[`specs/frontend`](../../../specs/frontend/fluid-layout-motion-design.md).

## Material performance limits

Cold preparation of 1501 elements measured about 330–351ms of work, with observed
longest frame gaps of 34–76.6ms. The tested reference's destination GPU Scene mount
measured about 150–157ms on the main thread. These measurements have a particular
machine/browser/rendering configuration; they are not a universal smooth-frame-rate
promise. See the acceptance packet and graphics package's performance notes.

## Reproduce the focused checks

Install the workspace's lockfile dependencies with pnpm and install the Playwright
browsers required by the browser suites. From the repository root:

```sh
pnpm --filter @composable-svelte/core build
pnpm --filter @composable-svelte/graphics build
pnpm --filter @composable-svelte/media build
pnpm --dir packages/core exec vitest run --config vitest.fluid-motion.config.ts
pnpm --dir examples/fluid-motion-reference check
pnpm --dir examples/fluid-motion-reference typecheck
pnpm --dir examples/fluid-motion-reference test
pnpm --dir examples/fluid-motion-reference build
sh docs/development/fluid-motion/guidance-example-check/link.sh
pnpm --dir docs/development/fluid-motion/guidance-example-check exec vitest run
pnpm --dir docs/development/fluid-motion/guidance-example-check exec vitest run --config vitest.browser.config.mjs
node docs/development/fluid-motion/guidance-example-check/render.mjs --check
sh docs/development/fluid-motion/shadow-coverage-check/link.sh
pnpm --dir docs/development/fluid-motion/shadow-coverage-check exec vitest run --config vitest.browser.config.mjs
```

The public reference tests generate their evidence below `reference-evidence/rich-representation/`.
The retained final review reports document narrower independent controls and actual
results; rerunning these commands does not recreate historical measurements exactly.
Real WebGPU qualification needs an actual suitable adapter; a headless browser
returning no adapter does not qualify the hardware path.

## Evidence retention

Source, executable fixtures, imported design inputs, acceptance identity and compact
final review reports are durable repository records. References in those historical
reports to task IDs, `*-snapshot/` trees, raw logs, screenshots, local temporary paths
or prior intermediate reports identify the original local audit evidence. Those
bulky/transient artifacts remain in the original worktree and are intentionally not
committed. No provider transcripts, caches or credentials are part of the feature
commit. Historical statements about pre-commit authorization describe that time;
the user subsequently authorized the feature commit, documentation audit and push.
