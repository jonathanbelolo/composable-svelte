# Public import catalog

Install only the satellite packages you use. Consult each package's npm README
for complete examples and its exported TypeScript declarations for props,
actions and dependency contracts. Deep imports into `dist/` or `src/` are unsupported.

Core's `components/ui` includes buttons, inputs, labels, cards, badges, menus,
selects, dialogs and other UI primitives. Reducer-driven forms, command palettes,
data tables, image galleries and toasts have dedicated entry points. Navigation
components use scoped stores; see [navigation](./navigation/components.md).
The [package overview](../README.md#packages) distinguishes implemented features
from deferred integrations.

| Public import | Package |
|---|---|
| `@composable-svelte/core` | core |
| `@composable-svelte/core/actions` | core |
| `@composable-svelte/core/animation` | core |
| `@composable-svelte/core/api` | core |
| `@composable-svelte/core/components` | core |
| `@composable-svelte/core/components/command` | core |
| `@composable-svelte/core/components/data-table` | core |
| `@composable-svelte/core/components/form` | core |
| `@composable-svelte/core/components/image-gallery` | core |
| `@composable-svelte/core/components/toast` | core |
| `@composable-svelte/core/components/ui` | core |
| `@composable-svelte/core/composition` | core |
| `@composable-svelte/core/dependencies` | core |
| `@composable-svelte/core/i18n` | core |
| `@composable-svelte/core/navigation` | core |
| `@composable-svelte/core/utils` | core |
| `@composable-svelte/core/navigation-components` | core |
| `@composable-svelte/core/routing` | core |
| `@composable-svelte/core/ssr` | core |
| `@composable-svelte/core/ssr/sanitize` | core |
| `@composable-svelte/core/ssr/middleware` | core |
| `@composable-svelte/core/ssr/ssg` | core |
| `@composable-svelte/core/styles` | core |
| `@composable-svelte/core/styles/globals.css` | core |
| `@composable-svelte/core/styles/theme.css` | core |
| `@composable-svelte/core/styles/tailwind.css` | core |
| `@composable-svelte/core/styles/tokens.css` | core |
| `@composable-svelte/core/tailwind-preset` | core |
| `@composable-svelte/core/test` | core |
| `@composable-svelte/core/websocket` | core |
| `@composable-svelte/auth` | auth |
| `@composable-svelte/auth/subject` | auth |
| `@composable-svelte/auth/errors` | auth |
| `@composable-svelte/auth/flows` | auth |
| `@composable-svelte/auth/http` | auth |
| `@composable-svelte/auth/testing` | auth |
| `@composable-svelte/auth/session` | auth |
| `@composable-svelte/auth/components` | auth |
| `@composable-svelte/charts` | charts |
| `@composable-svelte/chat` | chat |
| `@composable-svelte/chat/streaming-chat` | chat |
| `@composable-svelte/chat/streaming-chat/markdown` | chat |
| `@composable-svelte/code` | code |
| `@composable-svelte/code/code-editor` | code |
| `@composable-svelte/code/code-highlight` | code |
| `@composable-svelte/code/node-canvas` | code |
| `@composable-svelte/media` | media |
| `@composable-svelte/media/audio-player` | media |
| `@composable-svelte/media/video-embed` | media |
| `@composable-svelte/media/voice-input` | media |
| `@composable-svelte/graphics` | graphics |
| `@composable-svelte/maps` | maps |
| `@composable-svelte/maps/mapbox` | maps |
