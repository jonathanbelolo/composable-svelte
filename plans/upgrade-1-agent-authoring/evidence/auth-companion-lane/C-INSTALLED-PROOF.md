# Installed managed auth consumer: first accepted slice

Status: local candidate proof, not published package qualification. The runnable source is `packages/auth/consumer/`. It imports only public core/auth package paths, uses `defineApplication`/`ApplicationRoot`/`ApplicationHost`, embeds one auth composition in two optional parent slots, declares nested login/MFA views with `defineViews`, and renders the existing forms using genuine views from content snippets. Its parent reads accepted and refused handoff pulses on auth-routed actions. `src/Props.svelte` typechecks real installed `ComponentProps`, including a spread-injected illegal session store.

## Exact candidate bytes

| Package | Local version label | SHA256 |
| --- | --- | --- |
| Core | 0.13.0 | `230233b99c4f04117f302d3bb6a408ba3d13a347ee9694919c318a4a0a354355` |
| Auth | 0.2.1 | `f5739de38020dcf3b48abd2223a29a8c0a63e2d50b59bd7d7f28edbda7cd4798` |

The clean auth-only fixtures are `/private/tmp/auth-only-min` (Svelte 5.20.0) and `/private/tmp/auth-only-current` (Svelte 5.55.3). Each was copied from the consumer source, given the exact candidate tarballs through `file:` package dependencies, and installed with npm. `package-lock.json` integrity matches both tarballs, neither installed core nor auth package is a symlink, and `npm ls` shows one deduplicated Svelte/core identity. No workspace package alias resolves the imports.

The auth tarball includes `consumer/` through its `files` allowlist. Both installed package extracts contain the same 13 source/guide files as the repo consumer; no `node_modules` or build output is packed. The example can be copied from the installed package itself to start a new consumer check.

## Matrix receipt

| Pin | Installed `ComponentProps` / svelte-check | Client build | Browser | SSR |
| --- | --- | --- | --- | --- |
| Svelte 5.20.0 | 0 errors, 0 warnings | 814 modules, pass | nested views, two siblings, accepted/refused login handoff, reset/remove/restore: pass | two request roots with different auth state, no markup leak: pass |
| Svelte 5.55.3 | 0 errors, 0 warnings | 846 modules, pass | same: pass | same: pass |

The browser uses `createMockAuthDeps` plus a controlled pending `fetchLogout` in its refused-handoff page. It confirms accepted login retires only that child, right sibling remains live, and a login result while logout is pending yields `refused:login` and retires the finished flow. SSR creates a separate `ApplicationRoot` for each render; no temporary login work starts during rendering. The backend HTTP fixture and wider auth capability rows remain separate gates. These version labels identify local tarball candidates, not published registry bytes.

The Svelte 5.20.0 installed build caught and caused correction of the original `{@const}` under `{#key}` syntax; source-local Svelte 5.43.3 checks alone had missed it. The final matrix above ran after that correction and after repinning the frozen core candidate.
