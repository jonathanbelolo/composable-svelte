# Upgrade 1 CLI worker setup

This setup uses the repository's isolated proposal worker:

```sh
python3 plans/framework-remediation-2026-09-18/tools/run-worker.py \
  plans/upgrade-1-agent-authoring/jobs/<job>.json
```

The worker writes a new immutable run directory under
`plans/framework-remediation-2026-09-18/workers/<id>/`. It supplies all source
inline, disables tools and delegation, validates the returned JSON and patch,
checks patch ownership, runs `git apply --check`, records source hashes, and
never applies a proposal. Every `id` must therefore be unique; reruns use a new
suffix rather than overwriting a receipt.

## Verified model configuration

| Role | Provider | Exact model ID | Effort | Timeout | Output policy |
| --- | --- | --- | --- | --- | --- |
| Architecture/design | `claude` | `claude-fable-5-1` | `max` | 3600 s | Request `2147483647`; Claude CLI clamps it to the model maximum |
| Implementation | `gemini` | `gemini-3.8-flash-high` | `high` | 1200 s | Provider/CLI maximum; `agy` exposes no output-token flag and the runner adds no cap |
| Independent review | `claude` | `claude-opus-5` | `max` | 2700 s | Request `2147483647`; Claude CLI clamps it to the model maximum |

These IDs and settings are established by successful receipts:

- Fable: `workers/executor-error-diagnostic-fable-v1/receipt.json` records
  requested and actual model `claude-fable-5-1`, timeout 3600, proposal-ready,
  source unchanged, and a passing patch check.
- Gemini: `workers/def021-navigation-guide-final-review-gemini-v3/receipt.json`
  records requested and actual model `gemini-3.8-flash-high`, timeout 1200,
  proposal-ready, and source unchanged.
- Opus: `workers/executor-managed-helper-joins-opus-v1/receipt.json` records
  requested and actual model `claude-opus-5`, timeout 2700, proposal-ready, and
  source unchanged.

Do not substitute friendly names such as `Fable 5.1`, `Gemini 3.8`, or
`Opus 5`; exact model initialization is part of receipt validation. The output
ceiling is runner-owned metadata, not a job JSON field. Keep
`timeout_seconds` in job JSON as reviewable intent, but do not rely on it as the
launch control: pass the same value with `--timeout` on every invocation. The
coordinator treats a JSON-only timeout as not operationally established.

## Ready-to-run job schemas

Fable is a design partner. The coordinator retains final architecture and scope
decisions. Give Fable frozen source/specification context and no owned files
when the expected result is architecture only:

```json
{
  "id": "upgrade1-design-fable-v1",
  "provider": "claude",
  "model": "claude-fable-5-1",
  "effort": "max",
  "timeout_seconds": 3600,
  "owned_files": [],
  "context_files": [
    "plans/upgrade-1-agent-authoring/context/CONTRACT.md",
    "plans/upgrade-1-agent-authoring/context/current-source.ts"
  ],
  "prompt": "Produce a bounded source-anchored design. Resolve invariants, ownership, failure behavior, compatibility and the minimum complete implementation slices. Return review findings only, with an empty patch. Do not claim tests were run."
}
```

Gemini implements one bounded, disjoint slice. Every file it may add, delete, or
edit must be listed in `owned_files`; those files are also included as context:

```json
{
  "id": "upgrade1-slice-a-gemini-v1",
  "provider": "gemini",
  "model": "gemini-3.8-flash-high",
  "effort": "high",
  "timeout_seconds": 1200,
  "owned_files": [
    "packages/core/src/lib/example.ts",
    "packages/core/tests/example.test.ts"
  ],
  "context_files": [
    "plans/upgrade-1-agent-authoring/context/APPROVED-DESIGN.md",
    "packages/core/src/lib/adjacent-contract.ts"
  ],
  "prompt": "Implement only the approved slice in owned_files. Preserve the stated compatibility and ownership boundaries. Return a complete unified diff and proposed focused validation commands; do not claim execution."
}
```

Opus reviews frozen candidate bytes and durable qualification evidence. It must
have no owned files, so a review cannot modify source:

```json
{
  "id": "upgrade1-slice-a-opus-review-v1",
  "provider": "claude",
  "model": "claude-opus-5",
  "effort": "max",
  "timeout_seconds": 2700,
  "owned_files": [],
  "context_files": [
    "plans/upgrade-1-agent-authoring/evidence/slice-a/MANIFEST.json",
    "plans/upgrade-1-agent-authoring/evidence/slice-a/from-main.patch",
    "plans/upgrade-1-agent-authoring/evidence/slice-a/QUALIFICATION.json",
    "plans/upgrade-1-agent-authoring/evidence/slice-a/MUTATIONS.json"
  ],
  "prompt": "Independently review the frozen slice against its approved design. Return APPROVE, APPROVE WITH FOLLOWUPS, or BLOCK with concrete source/evidence anchors. Do not propose a patch or claim broader closure."
}
```

## Packet constraints

- Keep source paths repository-relative. Absolute paths, `..`, and paths under
  `.git`, `.claude`, `.codex`, or `.agents` are rejected.
- Snapshot mutable inputs into a packet-specific context directory before
  launch. A receipt becomes `stale-proposal` if any supplied live source changes
  while the worker runs.
- Prefer small independent implementation packets, normally under 40 KB of
  inline source where the task permits. Include only the design, owned files,
  adjacent contracts, and fixtures needed to decide the slice.
- Use disjoint `owned_files` for concurrent Gemini jobs. Never give a review job
  ownership merely to make the schema convenient.
- The response contract is one JSON object with `status`, `summary`, `findings`,
  `tests`, `needs_context`, and `patch`. Tests are proposed commands only.
- `proposal-ready` means the response and patch passed transport checks. It is
  not semantic approval and it does not mean tests ran. Locally inspect the
  response, apply it only to an isolated candidate, run focused/type/runtime
  qualification, record causal evidence and restoration, then send frozen bytes
  to Opus.
- Preserve `events.jsonl`, `stderr.txt`, `cli.log` when present, `response.json`,
  `proposal.patch`, `patch-check.txt`, and `receipt.json`. Treat `needs-context`,
  `rejected`, `incomplete`, and `stale-proposal` as non-integratable outcomes.
- Never copy credentials, environment dumps, auth files, or registry tokens into
  a job. The runner inherits the host environment for CLI authentication but
  records only safe execution metadata in its receipt.
- A successful external review does not apply code, authorize publication, or
  replace local source review and maintained test gates.

No Upgrade 1 transfer should be launched until its design packet, owned-file
boundary, and frozen context hashes are ready for review.
