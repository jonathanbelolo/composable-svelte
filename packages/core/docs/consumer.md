# Consuming Composable Svelte

> The architecture checker is completely optional and its use is discouraged. Its effectiveness on real agent-authored applications is untested as a reliability claim; it is not a reliable way to assess architectural correctness. It can miss violations and reject valid code. Agents must not treat a passing result, including `qualification: "passed"`, as architectural approval or a completion criterion. Follow the application contract, review the source, and test behavior and ownership directly. The checker has implementation tests, but those do not establish its practical reliability.

Read the [application authoring contract](./application-contract.md) first. It
defines the required managed application path, responsibility boundaries and
how to report unsupported requirements.

For core 0.14, start with `npm install @composable-svelte/core@0.14.0 svelte`.
The checker is not required. Do not install it as part of the recommended setup.
Read the [agent patterns](./agent-patterns.md), [executable examples](./examples/agent-patterns/README.md),
and [owned-work testing guide](./testing-owned-work.md) before implementation.
Read the [release scope](./prerelease.md) for migration and companion-package compatibility. Choose additional packages
from the [package catalog](../README.md#packages); each README describes its
components, adapters and limitations. All guides in this directory and the
[starter](../consumer/README.md) ship in the npm tarball.

## Tested application setup

Use the starter for a working baseline: Node 20.19+ or 22.12+, Svelte 5.57,
TypeScript 5.9, Vite 7.3, Svelte Vite plugin 6.2, Vitest 4.0 and Tailwind 4.
Core itself supports Node >=20. The application's build tools impose the stricter
Node minimum. Motion is a direct dependency; do not install an old Motion peer.
The starter pins the toolchain, and its checks run against release tarballs.

Use TypeScript `moduleResolution: "bundler"`, `strict: true`, and
`skipLibCheck: true`. Some upstream animation/flow declarations require newer
DOM/library types; strict checking of all third-party declaration files is not
part of this supported baseline. Your application code remains strictly checked.
Run `svelte-check` as well as tests: `tsc` alone does not check Svelte components.

## Application animation

Use `useMotion` or `useMotionGroup` from `@composable-svelte/core/application/motion`
inside a managed application. The [motion guide](./application-motion.md) includes
compiled single-target and grouped examples, reduced-motion behavior and cleanup.
See the [release limits](./prerelease.md) for presentation animation bridges.

For motion across a route change or a whole-layout change within a page (0.14.0), use
[fluid layout motion](./fluid-motion.md): `useStagedRoute` with `defineChoreography` plans,
`useLayoutChoreography`, `useParticipant`, `<Presence>` and `<MotionPlane />`. It is opt-in by import.

## State, dependencies and lifecycle

Define state and a discriminated action union. Annotate reducers with
`Reducer<State, Action, Dependencies>` to preserve tuple and action inference.
Reducers return a new state and an `Effect`; inject clocks, HTTP functions and
other external work through dependencies. Handle failures by dispatching an
explicit action. Use `createTestStore` from `@composable-svelte/core/test`,
assert every emitted action with `receive`, and finish each test with `finish()`.
See [testing](./core-concepts/testing.md) and [effects](./core-concepts/effects.md).

A managed child composition, including a package feature such as
`createAuthFeature().composition`, nests under a parent whose dependencies extend
its own. The application injects one dependency object and each child reads only
what it declares. A parent that lacks a service a child requires is rejected at
`.with` or `.forEach`, and a store or Root over the composed parent requires the
whole extended object.

```ts
import { Effect, type PresentationAction, type Reducer } from '@composable-svelte/core';
import { ManagedIntegrationBuilder, optionalSlot } from '@composable-svelte/core/application';

interface ClockDependencies { now(): number }
interface AppDependencies extends ClockDependencies {
  fetchRows(signal?: AbortSignal): Promise<readonly number[]>;
}

type Stamp = { at: number };
type StampAction = { type: 'stamp' };
type Panel = { stamp: Stamp | null };
type PanelAction = { type: 'stamp'; action: PresentationAction<StampAction> };
type State = { panel: Panel | null };
type Action = { type: 'panel'; action: PresentationAction<PanelAction> };

const stamp: Reducer<Stamp, StampAction, ClockDependencies> = (_state, _action, deps) => [{ at: deps.now() }, Effect.none()];
const panelCore: Reducer<Panel, PanelAction, ClockDependencies> = (state) => [state, Effect.none()];
const panel = new ManagedIntegrationBuilder(panelCore)
  .with(optionalSlot<Panel, PanelAction>()('stamp'), stamp)
  .build();

// The application also injects fetchRows; the panel composition reads only now().
const appCore: Reducer<State, Action, AppDependencies> = (state) => [state, Effect.none()];
export const composition = new ManagedIntegrationBuilder(appCore)
  .with(optionalSlot<State, Action>()('panel'), panel)
  .build();
```

For managed application assembly, use `defineApplication`, `ApplicationRoot`, and
`ApplicationHost` from `@composable-svelte/core/application`. The Root creates and
destroys the instance; the Host attaches services and can be temporarily removed.
Its typed snippet supplies the app, and descendant scripts can use
`useApplication(definition)` to read that same instance. See
[application ownership](./application-ownership.md) and the
[complete routing example](./application-routing.md). No caller cleanup hook is
required on this path. Composed features render through `defineViews`,
`FeatureViews` and `FeatureOutlet`; see [application views](./application-views.md)
for typed render props and the framework-supplied `surface` action.

When using lower-level `createStore` directly, create stores per component or
request and destroy them when their owner ends.
A module-level singleton (as in the short browser-only README demonstration)
must never hold per-user state in SSR. Read `store.state` reactively in Svelte;
copying it to an ordinary local variable captures a snapshot. Scope child stores
and lift child actions rather than duplicating parent state.

## Rendered lifetime tests

The bundled starter includes a [browser lifetime fixture](../consumer/README.md#testing-rendered-application-lifetime)
using the actual application, production CSS, and ordinary Vite compilation.
Its generic snippet harness removes and remounts the entire application containing
the Root. Keep App props and injected dependencies in the app-specific fixture
entry. Adapt its real-service interruption test when changing your domain; do not
replace the application with mocked stores or expose private runtime handles.
The fixture builds separately and is excluded from production output. See
[testing](./core-concepts/testing.md#testing-time-based-effects) for the boundary
between injected business time and browser animation time.

## Styling

The [README styling recipes](../README.md#styling--theming) support Tailwind 3
and 4. The starter includes the Tailwind 4 Vite plugin and stylesheet imports.
For Tailwind 3 use Vite with PostCSS and `tailwindcss` + `autoprefixer`, the
published preset/contentGlob, and the globals stylesheet. Run CSS through Vite's
resolver; the standalone Tailwind CLI does not resolve package-export CSS
imports by itself. Toggle `.dark` on the document root for dark mode.

## Server and integration boundaries

Keep browser engines (maps, WebGL, editor and media devices) on the client.
Use per-request stores and the [SSR guide](./ssr/server-rendering.md) for hydration.
The starter checks basic server rendering and browser interaction; it is not a
full SvelteKit template. The HTTP, WebSocket and storage adapters are optional.
Your application supplies authorization policies, persistence, credentials,
transcription and backend routes. Auth's published `docs/http-contract.md`
describes the default adapter; use custom dependencies for a different protocol.
Compatibility with a particular backend must be verified against that contract.

## Instructions for an application-building agent

Use the [agent entry guide](./agent-entry.md) for a ready-to-paste instruction.
The starter's `AGENTS.md` points agents to the installed contract; use the
[gap report](./gap-report.md) for unsupported requirements.

Give the agent the npm package name, exact version and the task. Ask it to read
the installed `docs/application-contract.md` first, then this guide, the relevant
managed application guides, `docs/components.md` and exported `.d.ts`
declarations. Read satellite READMEs only within the release's compatibility
limits. Copy the bundled managed `consumer/` starter for a minimal route-free
application; use the ownership, views and routing examples when adding features.
Use public export paths only, and run check, test and build before considering
an integration complete. No library checkout, private skills or contributor
instructions are needed. Don't assume every upstream engine feature has a
Composable Svelte wrapper: consult the package's documented limits and report
capability gaps instead of silently implementing application-owned orchestration.
Review architectural compliance separately from passing functional tests.
