# @composable-svelte/architecture

> The architecture checker is completely optional and its use is discouraged. Its effectiveness on real agent-authored applications is untested as a reliability claim; it is not a reliable way to assess architectural correctness. It can miss violations and reject valid code. Agents must not treat a passing result, including `qualification: "passed"`, as architectural approval or a completion criterion. Follow the application contract, review the source, and test behavior and ownership directly. The checker has implementation tests, but those do not establish its practical reliability.

Development tooling for applications using Composable Svelte. Keep it in
`devDependencies`; do not import it into application code or browser bundles.

The bundled starter policy (`bundled-starter` 0.13.1) approves exactly
`@composable-svelte/core` `0.13.1` and `svelte` `5.57.0` as opaque packages. Its
supported core range (`>=0.13.1 <0.14.0-0`) is the pairing bound, not an approval:
any other installed core, even inside that range, is rejected until a checker
release ships a newly reviewed pin. Externally pinned policies may also target the earlier `0.13.0-next.1` API within
the checker's known range (`>=0.13.0-next.1 <0.14.0-0`); this does not imply that
a prerelease version is available on npm. Each check still requires the exact
installed core version. The checker owns exact
TypeScript 5.9.3 and Svelte 5.57.0 parser dependencies and requires Node
`^20.19.0 || >=22.12.0`.

## Application authors

Start with the application contract and consumer instructions shipped in the core
package. Applications supply content, presentation, business decisions and injected
services. Use the framework's public composition, routing, presentation and motion
APIs to manage their lifetimes.

For developer feedback from the managed starter:

```sh
composable-svelte-architecture --mode analysis-only --project . \
  --policy bundled:starter --expected-core-version 0.13.1
```

The bundled policy starts at `src/main.ts` and follows reachable local modules. It
does not scan unrelated files. Other entry points require an explicitly reviewed
policy. Analysis-only output always reports `qualification: "not-evaluated"`.

`bundled:<name>` selects from a fixed registry of named policies shipped with the
checker, each with its own embedded SHA-256 that is verified before the bytes are
parsed. Any `--policy` value that begins with `bundled:` is a registry selector,
never a file path; an unregistered name is a usage error, as is `--policy-sha256`
alongside a bundled policy. The output policy envelope identifies the selected
registry name via `policy.bundledProfile` (for example `"chat"`), with
`policy.id` `bundled-<name>`; external policies report `null`.

The registry contains exactly these profiles. Each approves only the listed
packages, at exactly these versions, as opaque dependencies:

| Selector | Opaque approvals |
| --- | --- |
| `bundled:starter` | core `0.13.1`, svelte `5.57.0` |
| `bundled:chat` | core `0.13.1`, `@composable-svelte/chat` `0.5.0`, svelte `5.55.3` |
| `bundled:code` | core `0.13.1`, `@composable-svelte/code` `0.5.0`, svelte `5.55.3` |
| `bundled:media` | core `0.13.1`, `@composable-svelte/media` `0.5.0`, svelte `5.55.3` |
| `bundled:chat-code-media` | core `0.13.1`, chat, code and media `0.5.0`, svelte `5.55.3` |
| `bundled:maps` | core `0.13.1`, `@composable-svelte/maps` `0.3.0`, svelte `5.55.3` |
| `bundled:graphics` | core `0.13.1`, `@composable-svelte/graphics` `0.3.0`, svelte `5.55.3` |
| `bundled:charts` | core `0.13.1`, `@composable-svelte/charts` `0.3.0`, svelte `5.55.3` |
| `bundled:auth` | core `0.13.1`, `@composable-svelte/auth` `0.3.0`, svelte `5.55.3` |

Every profile keeps the starter's `src/main.ts` root, rules, inactive-rule reasons,
limitations and zero exceptions or capability grants; the Svelte pins are the
application's, separate from the checker's own parser dependencies. Opacity means
the checker never reads a companion's code: it verifies the package's identity and
installation, not its internal correctness. The `media` profiles do not prove
physical microphone behavior; that still needs a real-device check.

There is no Auth+Charts, other unlisted combination, or all-packages profile, and
none is planned. An application that imports a companion its profile does not name
is rejected. For those applications, use an externally reviewed policy with an
independently verified SHA-256.

The installed-consumer fixtures shipped with maps, graphics and charts pass their
application to tests through an `onApp` prop. Store authority leaving the managed
boundary that way is reported as unsupported, so those fixtures do not qualify as
shipped. Their profiles were qualified on the same fixtures with only that test hook
removed.

Read the JSON result on stdout and the concise summary on stderr. Fix reported
violations and unsupported constructs; hiding code behind an adapter, an opaque
dependency or a cast does not make it conform to the application contract. Report a
framework capability gap when the supported APIs cannot express the requirement.

## Automated checks and limits

Five bounded families have active detectors:

- Manual browser routing authority.
- Subscription-driven presentation orchestration.
- Impure reducer decisions and state mutation.
- Unowned infrastructure and resource work.
- Competing animation playback.

The result identifies the exact detector catalog, analysis errors and source-review
limitations. Unsupported or incomplete analysis cannot qualify. A clean result
proves only those detectors over the declared reachable graph. It does not prove
all application behavior, authentic presentation authority, least-authority
boundaries, lifetime correctness, or the behavior of opaque dependencies and
unresolved callbacks. Fabricated-view and least-authority rules remain staged;
they are not automated enforcement claims.

Some JavaScript forms are analyzed only in a narrow shape and reported as
unsupported otherwise:

- An object-literal getter may only return a local binding that is not a Svelte
  rune (`get items() { return items; }`). Getters with other bodies, setters and
  class accessors are unsupported.
- `new Promise(executor)` is supported with one local, synchronous executor. Its
  resolve and reject functions must stay in local variables and may only be called
  directly or passed to local functions; passing them to a template, component, DOM
  handler or package is unsupported. Resolved and rejected values, and values thrown
  by `throw` statements reachable while the executor runs, must be plain data.
  Exceptions raised by implicitly invoked code, such as a `toString` method during
  string conversion, are not traced; as elsewhere in the checker, values reaching a
  `catch` binding are not modeled.
- `Promise.all`, `Promise.race`, `Promise.allSettled`, `Promise.any`,
  `Promise.withResolvers`, `.then`/`.catch`/`.finally` on created promises, and async
  executors are unsupported. Await independent requests one after another instead.
- TypeScript instantiation expressions such as `reducer<Row>` are analyzed as the
  underlying value.
- Default values in template binding patterns are unsupported: snippet parameters
  (`{#snippet row(item = fallback)}`), `{#each}` destructuring (`{#each rows as {x = 1}}`),
  `{@const}` destructuring and `{:then}`/`{:catch}` destructuring. They are reported as `template-binding-default`.
  Pass the value explicitly or apply the default in script. The same patterns without
  defaults are supported.
- Computed keys in the same template binding patterns (`{#each rows as {[key]: value}}`)
  are unsupported and reported as `template-binding-computed-key`. Use a literal key or
  destructure in script.
- Values bound by `{#each}` items, `{@const}` and `{:then}` are analyzed like the script
  bindings `for (const item of items)`, `const x = value` and `const x = await promise`.
  Values bound by `{:catch}` are not modeled, like values reaching a script `catch` binding.

Independent source review and functional tests remain required. The result always
includes `manualReviewRequired: true` and the bounded qualification scope. Preserve
all reported limitations in the final review evidence.

## Independently controlled qualification

An external orchestrator must own the executable, physical dependency installation,
policy, scan roots, policy hash, evaluation date, records and verdict. A generated
application must not be able to change these gates.

```sh
composable-svelte-architecture --mode qualification --project "$PROJECT" \
  --policy "$POLICY" --policy-sha256 "$POLICY_SHA256" \
  --expected-core-version 0.13.1 --records-root "$RECORDS" \
  --today YYYY-MM-DD
```

Use an external policy with an independently verified SHA-256. Bundled policy
qualification is refused (and qualified envelopes always report `policy.bundledProfile: null`).
Qualification requires complete, converged analysis, all five active evaluators, and zero
violations, analysis errors, exceptions or capability grants. Pinned records do not
authorize exceptions or prove their contents.

Verify both the real process exit status and the complete result envelope. A JSON
object claiming success is not authenticated evidence. Package manifests and archive
hashes alone do not prove the contents of an installed dependency directory; the
orchestrator must verify materialization separately.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | The requested bounded analysis completed without violations or errors. |
| `20` | Architectural violations were found. |
| `21` | Policy, pairing, graph or semantic analysis errors prevent acceptance. |
| `22` | Invocation, parser compatibility or internal execution failed. |

For qualification, require `qualification: "passed"` as well as exit `0`; an
analysis-only success is not a qualification result. This package exposes a CLI,
not a supported application runtime API.

The source test suite belongs to the repository and is deliberately excluded from
the published archive. Contributors run it with `npm test` in the repository;
installed clients use the CLI and the separately controlled installed-bin gates.
