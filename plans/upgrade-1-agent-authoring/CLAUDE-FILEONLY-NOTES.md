# Claude Code file-only fallback

Read-only investigation used installed Claude Code `2.1.278` help and Anthropic's current permissions documentation. No model ran and no environment or user configuration changed.

## Supported boundary

The installed CLI's `--restricted` mode removes command/code tools and WebFetch unless explicitly named, ignores user/project/local settings, confines file tools to the working directories, refuses permission bypass, and can exclude all MCP servers with `--strict-mcp-config`. `--safe-mode` separately disables `CLAUDE.md`, skills, plugins, hooks, MCP, custom agents and other customizations while preserving auth and normal permissions.

Anthropic documents that `dontAsk` denies every operation that would otherwise prompt; allow rules are evaluated before that denial. `permissions.blockReadsOutsideWorkingDirectories` makes file tools refuse fenced paths in every permission mode. Read/Edit path rules are enforced by Claude Code before access, resolve symlink and target, and use `Edit` rules for both Edit and Write. Absolute CLI rules require `//`; `/path` is cwd-relative. These are native tool checks, not post-event auditing.

## Candidate invocation

Run with cwd exactly the physical public external project and no `--add-dir`:

```sh
claude --print --model "$PINNED_FABLE_MODEL" --effort high \
  --restricted --safe-mode --disable-slash-commands --no-chrome \
  --strict-mcp-config --mcp-config '{}' \
  --tools Read,Write,Edit \
  --allowedTools 'Read(/**)' 'Edit(/**)' \
  --disallowedTools Bash WebFetch WebSearch Agent NotebookEdit 'mcp__*' \
  --permission-mode dontAsk --permission-prompts none \
  --settings '{"permissions":{"blockReadsOutsideWorkingDirectories":true,"disableBypassPermissionsMode":"disable"}}' \
  --no-session-persistence --output-format stream-json \
  "$PUBLIC_PROMPT"
```

`Read(/**)` and `Edit(/**)` are anchored to the primary working directory for CLI rules. `Edit` is the documented path rule for both Edit and Write; a path-scoped `Write(...)` rule is accepted but ignored, so it must not be used. `--tools` limits what the model sees, the bare-name deny rules remove defense-in-depth tools, and `dontAsk` rejects anything not pre-approved. Do not pass `--add-dir`, `--continue`, `--resume`, an agent, plugin, permission handler, or bypass flag.

Resolve `PINNED_FABLE_MODEL` to the catalog-verified exact Fable 5.1 identifier before launch and record the model reported by the stream; do not silently rely on a moving alias for scored evidence.

An empty `--setting-sources` value is not needed: restricted mode explicitly ignores user/project/local settings. `--settings` adds the isolated read fence and bypass disable; managed policy settings still apply by design and cannot be suppressed by a session flag. Preserve startup warnings and reject the run if it exposes any tool beyond Read, Write and Edit or reports custom hooks/MCP activity.

## Assessment

For the built-in file tools, this is a materially stronger public-workspace boundary than the `agy` harness: enforcement occurs before access and symlinks cannot escape. With Bash, subprocess, browser, MCP and subagents unavailable, the documentation's warning that arbitrary subprocesses can bypass path rules does not apply to the exposed surface.

The remaining boundary is product-level rather than an OS sandbox: Claude Code itself still performs authentication/network activity, and managed organizational policy remains active. A tiny unscored smoke should confirm the advertised tool inventory, project-only read refusal and exact write before any scored run. If review does not accept that native boundary, use a no-tools JSON request/response broker whose parent process validates and serves project-relative reads and applies edits; do not return to the `agy` post-hoc filter.

## Boundary smoke result

The one authorized unscored smoke passed with exact model `claude-fable-5-1`, effort `medium`, and a 300-second ceiling. Durable evidence is in [`evidence/claude-fileonly-smoke-v1`](./evidence/claude-fileonly-smoke-v1/RESULT.json). Init advertised exactly `Edit`, `Read`, and `Write` under `dontAsk`. Native pre-access checks denied both the direct outside sentinel and an in-project symlink resolving to it. The local README read succeeded and `probe.txt` contained exactly `CLAUDE_FILE_ONLY_SMOKE_OK\n`. Exit was zero; stderr was empty; prompt, README, sentinel and symlink target hashes were unchanged. The result records the two expected boundary denials separately from local operations.

This establishes the narrow file-tool harness behavior only. It does not score application authoring or cover Claude Code authentication/network activity, managed policy, or arbitrary daemon behavior. No broader runner or scored agent was launched.

## Review-only controller

[`tools/fresh-claude.py`](./tools/fresh-claude.py) implements the validated boundary for later review. The caller supplies an external physical project, separate public prompt, external gates/evidence, and every immutable pin. It records and rechecks all pin, gate and prompt identities; pins inside the project receive native `Edit` deny rules. It also rejects escaping symlinks, model/tool/customization drift, denials, unknown tools, malformed or unsuccessful results, and input drift. The original `CLAUDE_CODE_MAX_OUTPUT_TOKENS` value is recorded and the child receives `2147483647`, which the CLI clamps to the model maximum; qualification effort is explicitly `high` or `max`.

Process completion never awards qualification. The external parent runs the held-out gates; the generated project cannot supply or alter those commands. One diagnostic-guided repair is available across the whole run as a new `initial-repair` or `change-repair` evidence directory. It requires an externally owned verdict whose run ID, phase and base-receipt hash match the retained base phase and that identifies the functional, type, architecture or protocol diagnostics. The repair never overwrites the base evidence and may follow a process-completed phase that failed external gates. No controller inference has run.

Official references: <https://code.claude.com/docs/en/permissions> and <https://docs.anthropic.com/en/docs/claude-code/cli-usage>.
