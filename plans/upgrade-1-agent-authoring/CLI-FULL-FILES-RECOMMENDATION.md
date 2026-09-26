# Optional `full_files` worker response

Add one backward-compatible response field:

```json
{
  "patch": "",
  "full_files": {
    "packages/core/docs/example.md": "complete UTF-8 postimage\n",
    "packages/core/docs/retired.md": null
  }
}
```

`full_files` is optional. An absent key means **unchanged**, `""` means an
intentional empty file, and `null` means deletion. An absent `full_files` keeps
today's patch path unchanged. When `full_files` is present, require `patch` to be
empty; reject mixed representations rather than guessing precedence. An empty
map is a valid no-change proposal.

Validate before generating a diff:

1. Parse response objects with duplicate-key rejection so a later map entry
   cannot silently replace an earlier one.
2. Run every map key through `safe_path` and require its normalized path to be
   exactly in `owned_files`. Omitted owned paths remain untouched. Reject an
   unowned path, NUL content, non-string/non-null values, deletion of an absent
   preimage, and a string equal to its preimage as unnecessary ambiguity.
3. Read preimages only from the already hashed workspace inputs. Never resolve
   paths supplied in content, follow response-created symlinks, or materialize a
   postimage in the workspace.
4. In the existing isolated patch-check directory, materialize old and proposed
   trees and generate a canonical Git unified diff with correct add/delete,
   empty-file, and no-final-newline metadata. Then run the existing ownership
   validator and `git apply --check` on that generated diff. The generated diff
   becomes `proposal.patch`; downstream qualification remains unchanged.

Preserve provenance. Write the exact provider response text to a new immutable
`response.provider.txt` before JSON decoding and record its SHA-256. Keep
`events.jsonl`, the parsed `response.raw.json`/`response.json`, receipt, source
hashes, and source-unchanged check. Add receipt fields for representation
(`patch` or `full_files`), sorted postimage paths and SHA-256 values, generated
patch SHA-256, and deletion paths. Never rewrite a rejected raw response into a
successful receipt.

Keep the response schema's existing `patch` member so old jobs and models remain
valid. New packet prompts may request `full_files` for small bounded files where
complete postimages are safer than model-authored hunk counts. Review jobs still
use `owned_files: []` and must return neither edits nor full-file entries.

Tests should cover unchanged omission, empty creation, emptying an existing
file, deletion, addition, missing trailing newline, duplicate JSON keys,
unowned/traversal paths, mixed patch/full-files rejection, stale source hashes,
and byte-for-byte deterministic diff generation. This removes transport-level
hunk failures without relaxing ownership, review, or application controls.

Coordinator disposition: defer runner API changes until the active foundations return. Recovered formatting errors are kept separate from implementation validation; no running worker protocol changes are required for this upgrade.
