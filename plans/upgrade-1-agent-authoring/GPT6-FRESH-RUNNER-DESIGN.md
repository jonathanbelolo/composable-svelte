# GPT-6 fresh-agent controller replacement

Status: the corrected file-only broker/controller is independently reviewed, passed an actual installed-client smoke, and is applied (receipt `evidence/controller-policy-repair-local-v2/APPLIED.json`, SHA-256 `653806ce5ed02064955c02c63e712cc36b4e53749fff2c4b403293350f2db8cf`). Four rooted file tools carry authority; two native discovery methods are accepted only as validated empty results. Safely rooted missing reads return `not_found`. The first six-run cohort remains rejected under its original policy; no results are retroactively accepted. Replacement shared-root freeze and separate launch authorization are still required. Historical failed native profiles, the original implementation evidence, and the failed correction smoke remain preserved below and in their receipts.

## Preserve the qualification protocol

The new `tools/fresh-gpt6.py` preserves the qualification protocol; `tools/fresh-claude.py` is unchanged. Retain the physical external consumer project, pinned installed package and toolchain, disjoint immutable gates/evidence/public prompt, pre/post hashes, symlink and hardlink rejection, append-only phase directories, timeout/process-group cleanup, and external verdict ownership.

Keep the phases `initial`, `change`, `initial-repair`, and `change-repair`. Maximum repairs remain **one total across the run**, not one per phase. The original failure and first attempt remain immutable. A change requires the externally accepted initial receipt and matching project hash; a repair requires the externally owned diagnostic verdict bound to run, phase, project, and base receipt. Never let the agent run, read, select, or alter the held-out gates. Public business briefs and held-out change requests remain the only task instructions, apart from the public packaged contract discovered within the consumer project. Process completion is not qualification.

Also reject a phase chain whose prior receipt used another model/provider or a different pinned controller/isolation configuration; replacing Fable does not authorize mixing model histories inside one fresh-agent run.

## Verified local CLI and model

Binary: `/Applications/ChatGPT.app/Contents/Resources/codex`.
Version checked: `codex-cli 0.154.0-alpha.6.2`.

The local `codex debug models --bundled` catalog contains `gpt-6-astra` and supports `max` reasoning. Use exactly:

- model: `gpt-6-astra`
- config: `model_reasoning_effort="max"`
- fresh, independent `exec` invocation for every retained phase; no resume/fork/worktree/extra directory
- `--ignore-user-config --ignore-rules --ephemeral --json --skip-git-repo-check --color never`
- `-C <physical-consumer-project>` and the public prompt on stdin
- `approval_policy="never"`, so denied operations cannot expand the boundary
- no invented output-token setting or provider-specific Claude token environment override

The catalog is local capability evidence, not proof of account availability or an immutable model snapshot. Receipts bind the actual client binary, restricted catalog, controller, broker, and Python executable hashes. A captured request verifies the configured model and effort before each phase. The CLI JSONL schema does not separately attest the response model; receipts state that limitation instead of inventing response metadata. The corrected unscored smoke now verifies real transport and the listed tool behaviors; it does not qualify an application or authorize a cohort.

The existing `--ignore-user-config` help explicitly retains normal auth through CODEX_HOME. Keep that transport outside model-visible tooling. Do not copy auth files into the consumer, print their contents, or substitute a temporary credential store. Ignore user/project execution rules only via the documented flag; managed requirements must remain active.

## Native-tool profile candidate and actual failed tests

Official OpenAI documentation describes deny-by-default filesystem profiles, narrow path exceptions, network denial, and macOS Seatbelt enforcement. It also distinguishes command-network restrictions from hosted web, connectors, MCP, and model/authentication transport. Consequently those other tool surfaces require separate controls; denying shell networking is insufficient by itself. Source: [OpenAI permissions documentation](https://learn.chatgpt.com/docs/permissions), fetched 2026-09-22.

The intended profile is consumer-only read/write, read-only package/toolchain pins, and no access to siblings, checkout, home, gates, or public network. The documented starting shape is:

```toml
default_permissions = "qualification"

[permissions.qualification]
extends = ":workspace"

[permissions.qualification.filesystem]
":root" = "deny"
":minimal" = "read"
":tmpdir" = "deny"
":slash_tmp" = "deny"

[permissions.qualification.filesystem.":workspace_roots"]
"." = "write"
"node_modules" = "read"
"package.json" = "read"
"pnpm-lock.yaml" = "read"

[permissions.qualification.network]
enabled = false
```

This is a **failed candidate**, not an approved launch configuration. The probe used its own synthetic immutable file instead of an installed package. Root/consumer directories were physical directories under `/private/tmp`; the outside/gate files were harmless synthetic sentinels. Known harmless checkout and home documentation paths were used for expected-denial checks, with contents suppressed.

Probe artifacts: `/private/tmp/gpt6-fresh-isolation-7f6bvb8d/RESULT.json`, plus exact command arrays, stdout/stderr, hashes, and every attempt receipt in that directory.

| Probe | Observed result |
| --- | --- |
| Per-key CLI overrides containing quoted path segments | Rejected before command execution: `FilesystemPermissionToml` parse error. Preserve as syntax failure, not an isolation result. |
| Single inline TOML permissions table, extends `:workspace` | Local read/write succeeded; immutable pin and `.codex` writes incorrectly succeeded; sibling/gate/symlink reads incorrectly succeeded. Checkout/home docs were denied. |
| Explicit profile without inheritance | Same failed filesystem boundaries. Loopback and external TEST-NET socket connections were denied with `Operation not permitted`. |
| Direct absolute path rules and explicit `/tmp`/`/private/tmp` deny | Same failed filesystem boundaries; both socket connections denied. |
| Built-in `:read-only` control | Consumer write correctly denied. The control deliberately does not promise outside-read isolation. |

Protected synthetic file hashes changed in the failed custom profiles, confirming actual writes rather than a mislabeled status message. The first profile's Perl network check could not load a sandbox-denied runtime library and was **not** network evidence; later profiles used `/usr/bin/nc` and recorded explicit EPERM responses. No credential or real held-out gate data was placed in these fixtures.

The initial attempt to start nested Seatbelt inside the current command sandbox failed with `sandbox_apply: Operation not permitted`. Subsequent probes used normal reviewed command escalation solely to allow the inner Codex sandbox to start, retained `--include-managed-config`, and never used a permission-bypass flag. No automatic approval rejection occurred.

These observations do not establish why the installed build fails the split policy. They are enough to reject it for this qualification boundary. Do not remove managed requirements, enable broad workspace/temp access, relocate secrets until the negative tests happen to pass, or substitute a post-hoc transcript filter for pre-access enforcement.

## Implemented bounded alternative

`tools/fresh-file-broker.py` provides four stdio MCP methods: `read_file`, `list_files`, `write_file`, and `edit_file`. Only project-relative paths inside one canonical physical consumer root are available. The broker resolves aliases and then opens each canonical component relative to a held directory descriptor with `O_NOFOLLOW`. It rejects escapes, reserved private-control paths, hard-linked files, special files, and resource reads/template execution/prompt routes. The two discovery methods `resources/list` and `resources/templates/list` return only empty arrays; they never expose a resource or grant file authority. There is no execution, network, rename, deletion, symlink-creation, arbitrary resource, or other app capability.

Installed `node_modules`, the consumer manifest, and existing lockfiles are automatically pinned. Any other public harness/control file inside the consumer must be passed through `--pin`; sealed gates and controller/evidence files remain outside and cannot be read through the broker. Writes reject pinned descendants and ancestors, require a matching prior hash for existing files, use an exclusive same-directory temporary file and atomic replacement, and revalidate root/parent identity before committing. Edits require a unique exact target. Reads and writes are bounded to 4 MiB; listing is paginated. A missing `read_file` path returns only `{outcome:"not_found", path:<canonical project-relative path>}` after validating line bounds, containment and the anchored read, then rechecking root identity and path resolution. It fabricates neither content nor a hash. Other I/O failures and boundary violations still fail; absence does not authorize traversal or immutable writes.

This boundary assumes the parent exclusively owns the consumer while the serialized broker runs: no other process concurrently renames its ancestors or mutates pinned files. The broker exposes no means for the model to create such a process. Causal tests cover parent/root replacement and destination symlink races; this is not a general sandbox for hostile concurrent OS processes. The MCP server itself is trusted controller code running outside the inner Codex command sandbox, with normal host privileges; all model-requested access must pass its checks. The native `read-only` sandbox remains a second layer, not the source of file isolation. Authentication/client transport remains trusted, with credentials unavailable through any model tool.

`tools/fresh-gpt6.py` uses `--ignore-user-config --ignore-rules --ephemeral --json --skip-git-repo-check --strict-config`, native read-only sandbox, approval policy never, host/project instruction discovery disabled, web disabled, and all native execution/app/browser/agent features disabled. Feature flags alone were insufficient: the bundled model metadata continued advertising patch/code-mode/agent tools. A pinned catalog copy retains the GPT-6 model and normal base instructions while changing only these capability fields:

```json
{
  "apply_patch_tool_type": null,
  "multi_agent_version": null,
  "tool_mode": null,
  "node_repl_disabled": true,
  "experimental_supported_tools": [],
  "supports_search_tool": false
}
```

The configured `model_catalog_json` surface is documented in the [official configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference); the effects above were tested against the actual installed CLI request, not assumed from field names. The complete command arrays are retained with the evidence.

Before every phase, the controller starts the same client/catalog/broker configuration against a localhost no-auth Responses stub. It captures only the model, effort, tool names, and presence/absence of an authorization header; it does not retain prompt/header contents. The endpoint always rejects before inference. Any difference from this exact registry fails closed:

```text
functions.list_mcp_resource_templates
functions.list_mcp_resources
functions.read_mcp_resource
functions.request_user_input
mcp__consumer_files.edit_file
mcp__consumer_files.list_files
mcp__consumer_files.read_file
mcp__consumer_files.write_file
```

Only native `codex.list_mcp_resources` and `codex.list_mcp_resource_templates` calls with exact model arguments `{}` are permitted in addition to the four file tools. The controller requires paired start/completion events and the exact corresponding empty result (`resources:[]` or `resourceTemplates:[]`); nonempty, malformed, unpaired, failed or unfinished discovery is rejected. The sole broker accepts absent/empty discovery params or exactly `{_meta:{progressToken:<nonnegative integer>}}`, matching the observed pinned-client transport. Boolean, fractional, string or negative tokens, cursors and extra metadata are rejected. This progress token has no routing effect. `read_mcp_resource` and `request_user_input` remain advertised residual primitives but are not permitted authoring tools; resource reads and question calls remain rejected. No shell, exec, patch, browser, hosted search, image, app, code-mode, or delegation tool was advertised. Protocol audits remain secondary to registry and broker enforcement; the correction adds no read/write/execution/network authority.

The controller retains raw events/stderr, timeout and process-group cleanup, immutable input hashes, external acceptance/repair verdicts, and the shared one-total-repair limit. A required external boundary verdict must match the exact controller/broker/client/catalog/Python hash binding before launch. Phase chains cannot mix models or controller configurations. There is no invented output-token cap: the receipt states client/provider default, while a wall-clock timeout is enforced. The parent runs all validation/build/browser gates; the model cannot execute them.

## Historical implementation and smoke preparation

The original implementation evidence is preserved in `evidence/fresh-gpt6-boundary-v1/`. Its `RESULT.json` holds historical source and registry binding hashes; `real-client-registry/` holds the real-client/no-inference capture. Historical failed native profiles remain under `native-profile-failures/`. The mock endpoint is never an authentication or successful inference claim.

The original 13 broker controls verified ordinary read/list/create/edit, line-bound validation (including zero/boolean), immutable pin ancestors, absolute/parent/symlink escapes, internal aliases to pins, hardlinks and FIFO, root/parent replacement, destination symlink replacement, stale hashes and ambiguous edits, private paths, unknown tools, and rejected MCP resources. The 8 controller controls use a clearly labeled synthetic executable: retained initial/change/repair receipts, one total repair, external change verdict, boundary mismatch before launch, model/config mixing, unexpected native tools, exact configured command, and rejected receipt retention after post-run manifest/hardlink scan failures. The latter two harden an existing initialized exception path; no reproduced unbound-variable defect is claimed.

The prepared unscored smoke lives at `/private/tmp/gpt6-file-broker-smoke-s7ymxjpq`. Its consumer has **only a partial public docs/declarations extraction**, not a complete installation or runnable application, from packed artifact SHA-256 `e2e7a9f5c6bc2cd141d46060edb03bcf78e9b28d3972a7a7544c3e22160a50fe`. No reference app, held-out gate, checkout implementation source, or prior run is copied. The prompt asks the model to discover/read one public API and write a short cited `summary.md`. The external gate is a harmless synthetic sentinel. `PREPARED.json` records every extracted file hash, exact command, and binding; `command.json`/`command.sh.txt` provide the launch command. `boundary-verdict.draft.json` deliberately has a nonauthorizing decision; the required `boundary-verdict.json` does not exist.

That original preparation required parent review, an external verdict and one unscored launch to verify real auth, broker calls/writes and completion handling; it is historical and is not the current launch instruction. An unexpected event remains a failure to inspect, not a reason to silently loosen the allowed set. No scored cohort is launched or qualified by these controls. Scored projects still require a complete physical public-package installation, their independent fresh instructions, and the existing external acceptance gates.


## Current reviewed correction and replacement freeze

The original accepted registry already contained the native discovery helpers, while its invocation audit and broker rejected them. All six initial authors encountered the shared policy defect; the original cohort is rejected and retained as diagnostic evidence. A normal absent declaration read was also conflated with a boundary denial. See `evidence/cohort-controller-policy-independent-review-v1/REVIEW.json`. The first correction smoke additionally revealed the pinned client's progress metadata; its failed receipt and wire probe remain preserved. Neither mismatch was fixed by relabeling an old result.

The operative controller SHA-256 is `24ffb8050a51b0ec1e51aa818300e7a81c20a85d65425214daae2d9461a9f4de`; broker SHA-256 is `c20476c14213320e848a86b1c659e03963a79220a6442999eb1e56cbecf26f18`. Independent review `evidence/controller-policy-independent-review-v2/REVIEW.json` is pinned by `03359119d95fba1c5f9e2c40110f873ae193086ca276732b464039cb113660e6`. Applied verification records 34 owner controls and six independent controls. The actual-client corrected smoke receipt `evidence/controller-policy-repair-local-v2/smoke-receipt.json`, SHA-256 `64cb2d7cdb3c5547f025f74b4ce5109619779f3b1e4286bb685a72e7951e7c6d`, completed both empty discoveries, a safely rooted missing read, and normal read/write/read with unchanged pins/gates.

Only new shared-root metadata and a new exact boundary verdict may bind these sources for a replacement cohort. Keep the prompts, four-phase invariant gates, one-total-repair rule, fresh per-run isolation, immutable archives and external verdict ownership. The generic scoring template stays `ready:false`; concrete phase maps become executable only after their candidate-specific source/adaptation review. Shared freeze, materialization, initial authoring authorization, per-candidate qualification and withheld-change authorization remain distinct. No archive refresh, smoke, or controller completion alone permits an acceptance or six-run qualification claim.
