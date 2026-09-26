# Application authoring instructions

Before building or changing this application, read the installed
`node_modules/@composable-svelte/core/docs/application-contract.md`, then
`docs/consumer.md` in the same package and the guides relevant to the task.
Read `docs/agent-patterns.md`, `docs/examples/agent-patterns/README.md`, and
`docs/testing-owned-work.md` in that installed package before implementation and
testing. Use the executable examples as the reference for factoring while keeping
ownership and acceptance decisions explicit.

The contract is the authoritative architecture policy; this file is its entry
point, not a separate set of architecture rules. Match guidance to the exact
installed version and use public exports.

Use `docs/gap-report.md` when the installed capabilities cannot express a
requirement. Continue independent supported work. Do not invent framework APIs,
silently replace framework-owned behavior, or weaken acceptance checks to pass.
Verify architecture separately from functional behavior, as the contract requires.
