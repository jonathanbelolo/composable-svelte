# Fresh-agent runner notes

Initial discovery used installed `agy --help` and `plans/framework-remediation-2026-09-18/tools/run-worker.py`. One later authorized smoke is recorded below; no subsequent inference was run.

## CLI surface established by help

- `agy` is `/Users/jonathanbelolo/.local/bin/agy`.
- Editing modes are `--mode accept-edits` and `--mode plan`; `--sandbox` enables terminal restrictions.
- `--add-dir` expands the workspace and must be omitted. `--dangerously-skip-permissions` must also be omitted.
- `--disable-slash-commands` disables slash-command and skill expansion in print mode.
- Noninteractive execution uses `--print`; output supports `text`, `json`, or `stream-json`; `--log-file` and `--print-timeout` are available. `--json-schema` can constrain the final result, but should not replace the project artifacts.
- Help does not specify the sandbox's filesystem boundary, network policy, MCP/plugin availability, or exact tool inventory. Treat `--sandbox` as a CLI restriction, not proof of OS-level isolation.

## Why the existing worker is unsuitable unchanged

`run-worker.py` prepends private Composable Svelte philosophy, embeds checkout source, runs Gemini in `plan`, requires a patch JSON protocol, uses an empty temporary cwd, and terminates any tool use. That is correct for source proposals but violates the package-only fresh-agent context and prevents the agent from installing, editing, testing and revising a real application.

## Recommended harness

Use a tool-enabled `accept-edits` session inside a freshly materialized external project from `QUALIFICATION-COMMANDS.md`. The project contains only the pinned installed package, its shipped public documents, ordinary app dependencies, and the initial business brief. Do not mount the framework checkout, pass `--add-dir`, load private skills, or inject architectural coaching.

Representative controller invocation:

```sh
agy --model gemini-3.8-flash-high --effort high \
  --mode accept-edits --sandbox --disable-slash-commands \
  --output-format stream-json --log-file "$RUN/evidence/cli.log" \
  --print-timeout 1200s --print "$PUBLIC_BUSINESS_BRIEF"
```

Run with cwd exactly `$RUN/project`, stdin closed, stdout to `events.jsonl`, stderr to `stderr.log`, and a new process group. Do not use `--continue`, `--conversation`, `--project`, `--agent`, remote control, or permission bypass. A fresh invocation supplies a fresh conversation; if the client creates ambient project state, record and inspect it rather than hiding it.

The outer controller must hash the initial tree, record the command/model/runtime, preserve raw streams and logs, enforce timeout by terminating the process group, hash and diff the final tree, and then run immutable acceptance gates itself. The agent must not see held-out tests, checker policy/records, expected outputs, or gate credentials. Apply a held-out change through a second clean turn only if the protocol can preserve the same project while recording that turn separately.

## Isolation and alternative

Tool-enabled isolation is necessary for a realistic construction/modification exercise. A no-tools packet can test documentation comprehension, but having the orchestrator apply returned text or patches would not prove that an unfamiliar agent can build and repair the application. Use no-tools only as a supplementary reading probe.

Because CLI help does not prove that `--sandbox` blocks reads outside cwd or network access, the six-run gate also needs an outer OS/container boundary or a verified sandbox probe before acceptance. Until then, receipts must label isolation as CLI-enforced and must not claim the framework checkout was technically inaccessible merely because it was not supplied.

## Initial controller

[`tools/fresh-run.py`](./tools/fresh-run.py) is a review-only controller for one phase at a time. It has no non-stdlib dependency and has not launched a model. The caller supplies an already external physical project, a public prompt file, immutable gate roots and pinned docs/policy/tests. It hashes rather than copies those inputs, refuses checkout pins and protected symlinks, generates the verified macOS profile, and starts an entirely new `gemini-3.8-flash-medium` / effort `medium` `accept-edits` invocation with no continuation or private prefix. Run `initial` and `change` as separate recorded phases against the same accepted project tree.

The controller preserves raw streams, exact CLI arguments, model initialization and advertised tool inventory, project hashes, invoked tool names, protected-path attempts and gate hashes. Parent-owned events/stderr/receipt/profile paths are denied for both child reads and writes; output reaches them only through parent-owned pipes. The optional CLI log lives in a disposable, explicitly writable runtime and is untrusted. All host writes are denied except the external project, that runtime and `/dev/null`. Project, gate, evidence and runtime ancestor/descendant overlaps are rejected before launch.

Only the actual `agy` file/terminal tool names observed in saved streams are accepted. MCP, browser, remote, subagent, protected-path or unknown activity triggers a live process-group termination and rejects the phase; a complete post-run audit repeats that decision. Exit zero yields only `agent-process-completed`; qualification remains `not-run` until the external controller runs immutable acceptance gates. The current Codex sandbox blocks nested `sandbox-exec`, so any later execution needs the same bounded local authorization used by the recorded isolation probe.

Non-model negative probes confirmed that project/gate and project/evidence overlaps fail before launch, evidence and unrelated host writes receive `Operation not permitted`, and project plus disposable-runtime writes succeed. The event parser recovered the exact model and `run_command` activity from saved `agy` streams. Remaining blockers before a model probe: `agy` may require session/auth/cache writes outside the disposable runtime, and the CLI advertises daemon/MCP/browser tools even though the controller kills their observed invocation. A model/network boundary and daemon inheritance cannot be guaranteed by a profile that must allow `agy` itself to reach the provider; external side effects could begin before an event is observed. Review must decide whether the live refusal plus permission prompts is sufficient for a bounded trial or whether a stronger provider/tool configuration is required.

One authorized minimal model smoke is preserved at `/private/tmp/upgrade1-fresh-smoke/evidence/upgrade1-cli-smoke-v1/initial`. Authentication, model initialization and provider access succeeded with host writes restricted to the project/runtime, so no additional host cache exception was needed. The advertised permission mode was `request-review`; the agent attempted `run_command` for `pwd && ls -la`, the noninteractive session denied it, and no `probe.txt` was created. The raw CLI result still said `SUCCESS` and exit 0 with a denied action, exposing a receipt bug; the controller now records `result.status`/`denied_actions` and rejects any denied action. No second model smoke was run. Tool-enabled fresh construction remains blocked until the CLI can grant only the approved file/terminal tools noninteractively without enabling MCP/browser/remote/subagent tools or a human approval channel.

## Supported permission controls

Installed help and narrowly filtered binary strings establish that `accept-edits` auto-approves file edits but prompts for commands. An embedded headless diagnostic says approval-required tools are auto-denied and settings allow-rules do not apply; it offers only `--dangerously-skip-permissions` to approve every tool. That global bypass is outside this gate. Changelog text says a prior bug that ignored `--mode` in headless runs was fixed, so file-only operation is documented even though it has not received a second runtime smoke.

`--input-format stream-json` is documented as newline-delimited user prompts, one conversation turn per message, paired with stream-json output. Help exposes no control-request/permission-response schema. Internal symbols such as `ApprovalInteraction`, `SetToolPermission`, and `effectiveGrants` do not document a callable stdin protocol, and SDK MCP approval types are not evidence of one. Do not synthesize such a protocol.

The supported unattended fallback is therefore `accept-edits` with native read/write tools only, while the parent controller installs dependencies and runs immutable build/test/checker gates. Terminal execution by the agent remains blocked. `--prompt-interactive` could involve human approval, but it is not an unattended or reproducible fresh-agent gate. A multi-turn stream-json session could feed externally produced diagnostics back to the agent; it cannot approve commands under the documented interface.

A second authorized tiny smoke used that file-only prompt and is preserved at `/private/tmp/upgrade1-fileonly-smoke/evidence/upgrade1-fileonly-smoke-v1/initial`. It failed after trying paths under the user's home, reading two vendor-installed `agy` builtin skill files, attempting shell-history reads, and receiving a denied `read_file` action. It made no project change and created no `probe.txt`; the fake gate, README and public prompt hashes stayed unchanged. The prompt had omitted the absolute project path even though `view_file` requires one, so this is a harness-context failure rather than proof that the agent rejected its cwd. The vendor builtin skills are ambient product context, not private framework coaching, but they still violate a strictly public project-only packet.

For future scored runs the controller now excludes every terminal tool, rejects file-tool paths outside the external project, and denies the observed builtin-skill, shell-history and global user-instruction paths at the macOS profile. A proposed final smoke prompt names its absolute workspace and README paths. Automatic approval review rejected that launch before inference because explicit known-path denies plus post-event rejection are not a complete read boundary. No third smoke or scored run occurred. The profile also does not constrain arbitrary daemon or network side effects. A scored run remains blocked pending a stronger read boundary compatible with CLI authentication/provider startup or explicit user acceptance of the residual exposure.

## Default-deny read design

[`evidence/read-allowlist-probe`](./evidence/read-allowlist-probe/RESULT.md) records a no-inference prototype. It denies all reads and then permits only the exact native executable, public project/runtime, and required public Apple system library/resource roots. Even `agy --help` aborted with exit 134 and no diagnostics, so the profile is safely fail-closed but not operational. It was not installed into the runner.

Filename-only inspection found user-scoped settings and OAuth/account credential files under `~/.gemini`; contents were not read. Because model file tools execute in the same `agy` process, allowing those paths for startup would also expose them to the model. `Security.framework` linkage suggests Keychain capability but does not establish that the CLI can avoid those files. The available binary is native macOS arm64, so it cannot simply run in the available Linux container. The bounded design is blocked on a supported config/auth separation or separately mediated credential path; broad home reads and post-event filtering are not acceptable substitutes.
