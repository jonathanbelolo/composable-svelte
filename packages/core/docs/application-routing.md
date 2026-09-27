# Application-owned route decisions

`defineApplication` describes pure browser SPA routing decisions. `ApplicationRoot` owns the instance; its typed snippet exposes the application to content. `ApplicationHost` owns the browser connection, traversal reconciliation, startup ordering, and cleanup. All cleanup stays inside the framework.

```svelte
<script lang="ts">
import { Effect, type Reducer } from '@composable-svelte/core';
import { defineApplication } from '@composable-svelte/core/application';

type Page = 'overview' | 'details';
interface State { page: Page; loaded: boolean }
type Action = { type: 'navigate'; page: Page } | { type: 'start' };

const reducer: Reducer<State, Action, undefined> = (state, action) => {
  if (action.type === 'navigate') {
    return [{ page: action.page, loaded: false }, Effect.none()];
  }
  return [{ ...state, loaded: true }, Effect.none()];
};

const application = defineApplication(reducer, {
  initialState: (page: Page): State => ({ page, loaded: false }),
  startup: state => state.loaded ? undefined : { type: 'start' },
  routing: {
    fragment: 'native',
    serialize: state => state.page === 'overview' ? '/' : '/details',
    request: url => {
      if (url !== '/' && url !== '/details') return undefined;
      return {
        action: { type: 'navigate', page: url === '/' ? 'overview' : 'details' },
        expectedURL: url
      };
    }
  }
});

  import { ApplicationHost, ApplicationRoot } from '@composable-svelte/core/application';

  let { snapshot, url }: { snapshot: State; url: string } = $props();

</script>

<ApplicationRoot definition={application} options={{
  dependencies: undefined,
  initial: { state: snapshot, url }
}}>
 {#snippet children(app)}
  <ApplicationHost {app}>
  <h1>{app.store.state.page}</h1>
  <button onclick={() => app.store.dispatch({ type: 'navigate', page: 'details' })}>
    Details
  </button>
  </ApplicationHost>
 {/snippet}
</ApplicationRoot>
```

For a fresh client instance, `initial: { input: 'overview', url }` runs the pure initial-state factory. For SSR, inject the request URL and its matching server snapshot; never read a browser global while constructing the definition or server instance. Routed definitions require `options.initial.url`. Route-free definitions reject it. `useApplication(definition)` is available to descendant components as a typed lookup of this existing root; it does not construct another instance.

## Decisions and ordering

`serialize` returns a canonical root-relative path, query, and optionally fragment. `request` receives the same form and returns an action plus the canonical `expectedURL`, or `undefined` to reject an unsupported URL. The action goes through the normal reducer exactly once. A business veto leaves its accepted route unchanged; a redirect supplies the redirected canonical URL as `expectedURL`. The framework compares the committed route with that expectation. No application history listeners or subscription effects are needed.

The injected initial URL may also be an absolute HTTP(S) request URL; normalization removes its origin and resolves path segments. If it matches the mounted browser URL, the framework trusts the supplied server snapshot, including a preloaded canonical redirect. If it differs, browser reconciliation finishes before the startup decision reads state. SSR performs neither reconciliation nor startup effects. Equivalent normalized URLs do not dispatch an extra route action.

Choose `fragment: 'native'` when anchors belong to the browser: fragment-only traversal does not become a business action, and state writes retain the current fragment. Choose `'route'` when the fragment is part of your route serialization and request decisions. This choice is required.

Accepted application route changes push by default. An optional pure `writePolicy(previous, next)` can choose `'replace'`. Rejected or unchanged routes do not create an entry. Browser traversal is reconciled without echoing it as an application push. Known entries with trustworthy native keys can be restored exactly after a veto; unknown, pruned, or keyless entries use the documented rebase policy and produce a diagnostic.

## Lifetime and errors

One application owns the browser history connection at a time. A second live routed root fails attachment. Temporary Host removal releases the connection; reattachment reconciles the current browser URL against the retained state without replaying completed startup. Removing ApplicationRoot destroys its instance, including immediate unmount before deferred mount effects. Retained handles cannot resurrect it. Removing only ApplicationHost preserves the root for later attachment.

Invalid initial configuration, request decisions, serialization, metadata, or startup fail attachment and retire the exact application claim. A queued failure receives the same cleanup even after the original mount callback has returned. Failures in another root do not destroy an already attached application. Post-attachment write failures are reported; an accepted business state change is not rolled back by pretending that its reducer never ran.

Root and Host each release the lifetime they own on immediate unmount, including before deferred Svelte mount effects run, and when rendering their content fails. SSR retires request-owned instances after rendering. Framework lifetime management adds no visual wrapper or element around the application content.

## Staged routing and fluid motion

By default, a route change is one immediate turn: the reducer runs, history is written, and the view changes. That remains the behaviour for every application that does not declare `routing.staging`.

A routed application can opt in to staged navigation by adding `staging` (`policy`, `commit`, `routeSlot`, and optional `routeKey`, `onUnavailable`, `budgets`) inside `routing`. Components then call `useStagedRoute(application).request(intent, { motion })`. The request is bound to the calling feature's owner, and the domain `commit` action is dispatched once at the choreography's cue.

Separately, `routing.scroll` opts in to framework scroll restoration for route commits. Scroll containers are elements marked `data-composable-scroll="<key>"`.

The complete, compiled example, the request results and transaction outcomes, and the qualified limits are in [Fluid Layout Motion & Staged Routing](./fluid-motion.md).

## Current supported boundary

This API supports one browser SPA writer and a request-injected SSR snapshot. Its default history metadata codec preserves plain record fields and accepts `null`; it refuses other structured history state before claiming an entry. It does not silently wrap or discard another integration's state.

Opt-in staged navigation (`routing.staging`) and scroll restoration (`routing.scroll`) are described in [fluid-motion.md](./fluid-motion.md); without them, browser scroll restoration behaves as before. SvelteKit navigation coordination, a public memory router, framework link interception, nested route outlets, and alternative metadata codecs are separate capabilities. They are not implied by this browser attachment API. Do not run another history-writing router alongside it or replace framework-owned routing with application timers or listeners.
