# Application authoring instructions

> The architecture checker is completely optional and its use is discouraged. Its effectiveness on real agent-authored applications is untested as a reliability claim; it is not a reliable way to assess architectural correctness. It can miss violations and reject valid code. Agents must not treat a passing result, including `qualification: "passed"`, as architectural approval or a completion criterion. Follow the application contract, review the source, and test behavior and ownership directly. The checker has implementation tests, but those do not establish its practical reliability.

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
