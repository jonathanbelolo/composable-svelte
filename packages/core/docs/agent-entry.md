# Starting an application-building agent

Give the agent the business request and an exact core version. Install that
version and use the [managed starter](../consumer/README.md); its `AGENTS.md`
points back to the installed contract. No framework checkout or private skills
are required.

Suggested instruction:

> Read the installed `node_modules/@composable-svelte/core/docs/application-contract.md`
> before coding, then the consumer guide and the task-relevant guides it links
> to. Use the installed version's public APIs. Map the requested behavior to
> supported capabilities; report gaps using `docs/gap-report.md` rather than
> silently replacing framework machinery. Implement the business request and
> verify both behavior and architectural compliance. Report remaining gaps and
> the checks actually run.

For automated generation, the orchestrator must control package materialization,
policy, scan entry points and acceptance tests outside the generated project's
authority. A project-owned npm script or editable `AGENTS.md` is guidance, not an
independent acceptance gate. Preserve initial failures and repair attempts when
measuring agent reliability.

## Default executable patterns

After the contract, use [recommended agent patterns](./agent-patterns.md) and the
[packaged examples](./examples/agent-patterns/README.md) for async requests, editors,
routing and collection identity. Each maps framework guarantees to the business
decisions and executable tests that must remain. Start with these existing APIs
before inventing a local wrapper or resource abstraction.
