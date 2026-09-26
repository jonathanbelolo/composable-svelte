# Final Immutable Archive Qualification Receipt

**Timestamp**: 2026-09-26T14:32:40.306Z
**Overall Verdict**: **RECIPES_PASSED** (PASSED)
**Full Qualification Claimed**: `false`
**Svelte Checkpoint**: `newer`

> [!WARNING] **Incomplete Qualification Notice**:
> - Narrow phase: architecture qualification and negative controls were not executed
**Manifest Schema**: `composable-svelte/release-archives-manifest/v1`
**Manifest Path**: `/private/tmp/companion-runtime-release/archives-r6/MANIFEST.json`

## 1. Candidate Archives Preflight Verification

| Package | Version | SHA-256 | Files | Size (bytes) | Status |
| --- | --- | --- | --- | --- | --- |
| `@composable-svelte/core` | `0.13.1` | `729ca89f1850e56b...` | 1258 | 995838 | PASSED |
| `@composable-svelte/auth` | `0.3.0` | `dbb2611bb01616e4...` | 404 | 327285 | PASSED |
| `@composable-svelte/maps` | `0.3.0` | `3730a67a93be13a6...` | 64 | 43389 | PASSED |
| `@composable-svelte/graphics` | `0.3.0` | `366f918ae042bd51...` | 133 | 140481 | PASSED |
| `@composable-svelte/charts` | `0.3.0` | `c36b7a06e5a29325...` | 53 | 58892 | PASSED |
| `@composable-svelte/code` | `0.5.0` | `f85b945232c460ed...` | 69 | 66774 | PASSED |
| `@composable-svelte/media` | `0.5.0` | `c0bfa6528fb6cd3d...` | 101 | 80479 | PASSED |
| `@composable-svelte/chat` | `0.5.0` | `fe21f00f75385205...` | 157 | 144162 | PASSED |

## 2. Candidate Transport & Identity Verification

- **Transport Type**: `local-candidate-tarball`
- **Identity Honest Statement**: Materialized candidate packages directly from immutable archives with exact SHA-256 validation; public package.json dependencies use registry-shaped identities; no registry provenance fabricated.
- **Registry Provenance Claimed**: false
- **Archive Freezing**: Candidate archives copied to isolated staging cache before extraction/install to eliminate TOCTOU races
- **Installed File Verification**: Every candidate package verified post-install byte-for-byte against immutable archives
- **Verified Candidate Packages Inventory**: 18 candidate package installations verified byte-for-byte

## 3. Shipped Managed Recipes

| Recipe | Checkpoint | Svelte Pin | Svelte Verified | Status | Commands | Candidate Packages Verified |
| --- | --- | --- | --- | --- | --- | --- |
| `auth-consumer` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 5 | 2 |
| `charts-fixture` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 6 | 2 |
| `graphics-fixture` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 6 | 2 |
| `maps-fixture` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 5 | 2 |
| `chat-managed` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 2 | 2 |
| `code-managed` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 5 | 2 |
| `media-managed` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 2 | 2 |
| `chat-code-media` | `newer` | `5.55.3` | `5.55.3` | **PASSED** | 4 | 4 |

## 4. Architecture Qualification & Negative Controls

- *Architecture qualification: not run (checker archive or policy omitted)*

### Negative Controls

| Negative Control | Expected Rejection | Actual Outcome | Status |
| --- | --- | --- | --- |

## 5. Review Obligations & Limits

> [!IMPORTANT]
> Passing automated qualification proves bounded conformance to active detector families.
> Manual architectural review remains mandatory (`manualReviewRequired: true`).
> Fabrication of registry provenance is strictly prohibited; candidate transport is accurately recorded.
