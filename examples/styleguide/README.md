# Composable Svelte Styleguide

This workspace example renders the component catalog and its interactive demos. It is intended for developing and reviewing the repository components in one place.

## Managed navigation demos

The styleguide includes managed examples for Alert, AlertDialog, AudioPlayer expanded modal, Drawer, Modal, NavigationStack, Popover, Sheet, Sidebar, and Tabs. They use `ApplicationRoot`, `ApplicationHost`, `ManagedIntegrationBuilder`, typed slots, and `scopeTo` rather than fabricated stores or raw dismissal functions.

The eight animated overlay and navigation demos use deferred dismissal. A dismiss request moves the existing presentation to its exit state while its managed child remains live. The component presentation and dismissal callbacks send distinct child actions through the exact captured view; only that owner may complete its transition. Explicit `PresentationState` remains an interim consumer-side animation bridge. The framework does not supply default overlay animation state.

AudioPlayer keeps its media-package store and manages only the expanded modal presentation. Tabs renders through the read/dispatch `ChildView` surface and does not invoke dismissal.

This example is part of the monorepo. Several catalog demos import companion workspace packages, so it is not a standalone `@composable-svelte/core` consumer or evidence that those companion packages are ready for an independent prerelease.

## Commands

Run these from `examples/styleguide` after installing the repository workspace dependencies:

```bash
pnpm dev
pnpm build
pnpm test
pnpm check
pnpm typecheck
```

`pnpm test` runs the configured Vitest suite. `pnpm check` runs Svelte diagnostics with warnings treated as failures, and `pnpm typecheck` runs TypeScript without emitting files.
