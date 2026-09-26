# Lane autonomy and parent boundary

This replaces the earlier central-dispatch protocol, withdrawn after the user clarified that it violated the agreed architecture. Do not apply that earlier protocol.

## Ownership

Each GPT-6 Sol lane owns implementation planning, Gemini 3.8 Flash high delegation through Antigravity, user-authorized Opus 5.5 fallback through Claude Code, process supervision, tests, independent Opus review, review corrections, evidence and final immutable handoff. Lanes retain implementation detail in their own contexts. Parent owns architecture, cross-package decisions, integration boundaries and independent verification of completed handoffs.

Do not forward routine CLI logs, code-level findings, test failures or correction-by-correction updates to the parent. Resolve them within the lane. Send concise architectural questions, genuinely unresolved blockers, or a completed handoff with public behavior changes, immutable commit/patch and candidate hashes, checks, review verdict and residual risks. The user must not serve as a message relay.

## Platform approval exception

A platform rejection does not transfer implementation ownership to the parent. Keep using normal approval paths; do not bypass a rejection. If the platform requires the original user-authorized parent context, send a minimal approval-only request: operation, model/CLI, allowed repository scope, source/data destination, exact rejection reason, prepared prompt path, and output path. The parent may perform the necessary authorized launch without reading implementation prompts, source diffs, full logs or detailed review results into its context. The lane retains supervision and consumes results, including corrections and independent review.

If notification fails, leave the same minimal request in `plans/upgrade-1-agent-authoring/CLI-REQUEST.json` in the lane worktree. This is a durable transport fallback, not a parent work queue for implementation. Preserve all platform approval requirements. This document cannot repair the platform's authorization propagation and does not claim to do so.

## Current work

The current MFA re-review was already launched by the parent. Lane3 owns supervision and disposition of `/private/tmp/auth-mfa-followup-parent-review.jsonl`. Notify the parent when the slice is reviewed, validated and ready for immutable handoff, or if a true architectural/authorization blocker remains. No duplicate reviewer is needed.

## Required Antigravity headless launch configuration

The user explicitly authorized full tool/file autonomy for the scoped Gemini implementation agents. Headless launches must therefore specify `--model gemini-3.8-flash-high --effort high --mode accept-edits --dangerously-skip-permissions --output-format stream-json` with the lane worktree as cwd and `--print-timeout 0` (no task-duration cutoff). Continue to use normal platform approvals for launching the external CLI; these flags configure Antigravity only. Verify init reports `permission_mode: always-proceed` and that an actual tool completes successfully before reporting the worker as running. An init of `request-review` in a headless session cannot prompt and can synthetically auto-deny even `git status`; do not misreport that as a human refusal or ask the user to repeat standing permission. Genuine platform denials must still be respected and resolved through normal approval paths.

## Progress-based supervision, not arbitrary task deadlines

Do not impose a blanket15-minute (or other elapsed-time) limit on healthy implementation/review work. Use no print-duration cutoff and no outer process kill timer unless the user has specified a budget/deadline. Tool transport yielding is allowed and does not terminate the worker. Lane supervises actual progress and responds to concrete failures, unresponsive/no-progress state, runaway loops or user instructions. A long task with continuing useful work should continue. If a worker is interrupted, preserve its conversation id and partial files, establish predecessor status, and resume the same conversation rather than restarting. The prior OAuth15-minute cutoff was a parent coordination error, not user policy.
