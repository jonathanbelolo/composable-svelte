/**
 * Server-side rendering helpers.
 *
 * Wraps Svelte's render() function and provides utilities for
 * building complete HTML with hydration scripts.
 */

// @ts-ignore - svelte/server is available at runtime but not in types during dev
import { render as svelteRender } from 'svelte/server';
import { serializeStore } from './serialize.js';
import type { Store } from '../types.js';

/**
 * Svelte component type (compatible with Svelte 5).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SvelteComponent = any;

/**
 * Props object that can be passed to a Svelte component.
 */
type ComponentProps = Record<string, unknown>;

/**
 * Result from Svelte's render() function.
 */
interface RenderResult {
  /** Rendered HTML body */
  body: string;
  /** Rendered HTML head (title, meta tags, etc.) */
  head: string;
}

/**
 * Options for renderToHTML.
 */
export interface RenderOptions {
  /**
   * Title for the HTML document.
   * Default: 'Composable Svelte App'
   */
  title?: string;

  /**
   * Additional HTML to inject in <head>.
   * Example: '<link rel="stylesheet" href="/app.css">'
   */
  head?: string;

  /**
   * Path to the client JavaScript bundle.
   * This script will hydrate the app on the client.
   * Default: '/app.js'
   */
  clientScript?: string;

  /**
   * Additional scripts to inject before closing </body>.
   * Example: '<script src="/analytics.js"></script>'
   */
  bodyScripts?: string;
}

/**
 * Renders a Svelte component to HTML string for SSR.
 *
 * This function:
 * 1. Renders the component using Svelte's server render()
 * 2. Serializes store state to JSON
 * 3. Builds complete HTML document with hydration script
 *
 * @template Props - Component props type
 *
 * @param Component - Svelte component to render
 * @param props - Props to pass to the component (should include store)
 * @param options - Rendering options (title, scripts, etc.)
 * @returns Complete HTML string ready to send to client
 *
 * @example
 * ```typescript
 * // Server request handler
 * import { renderToHTML } from '@composable-svelte/core/ssr';
 * import App from './App.svelte';
 *
 * app.get('/', async (req, res) => {
 *   // 1. Load data
 *   const data = await loadDashboardData(req.user);
 *
 *   // 2. Create store with pre-populated data
 *   const store = createStore({
 *     initialState: data,
 *     reducer: appReducer,
 *     dependencies: {}  // Empty on server
 *   });
 *
 *   // 3. Render to HTML
 *   const html = renderToHTML(App, { store }, {
 *     title: 'Dashboard',
 *     head: '<link rel="stylesheet" href="/app.css">',
 *     clientScript: '/client.js'
 *   });
 *
 *   res.setHeader('Content-Type', 'text/html');
 *   res.send(html);
 * });
 * ```
 */
export function renderToHTML<Props extends ComponentProps>(
  Component: SvelteComponent,
  props: Props,
  options: RenderOptions = {}
): string {
  if (!Component) {
    throw new TypeError('renderToHTML: Component is required');
  }

  // Render component to HTML
  const result: RenderResult = svelteRender(Component, { props });

  // Extract store from props if present
  let stateJSON = '{}';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((props as any).store) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stateJSON = serializeStore((props as any).store as Store<any, any>);
    } catch (error) {
      console.error('[Composable Svelte] Failed to serialize store:', error);
      // Continue with empty state rather than crashing
    }
  }

  // Build complete HTML
  const title = options.title ?? 'Composable Svelte App';
  const clientScript = options.clientScript ?? '/app.js';
  const additionalHead = options.head ?? '';
  const additionalBodyScripts = options.bodyScripts ?? '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  ${result.head}
  ${additionalHead}
</head>
<body>
  ${result.body}
  <script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">
${stateJSON}
  </script>
  <script type="module" src="${escapeHtml(clientScript)}"></script>
  ${additionalBodyScripts}
</body>
</html>`;
}

/**
 * Renders component to HTML without building full document.
 *
 * Use this if you want to embed the component in a custom HTML structure.
 *
 * @template Props - Component props type
 *
 * @param Component - Svelte component to render
 * @param props - Props to pass to the component
 * @returns Object with body and head HTML
 *
 * @example
 * ```typescript
 * const { body, head } = renderComponent(App, { store });
 *
 * // Build custom HTML
 * const html = `
 *   <!DOCTYPE html>
 *   <html>
 *     <head>${head}</head>
 *     <body>${body}</body>
 *   </html>
 * `;
 * ```
 */
export function renderComponent<Props extends ComponentProps>(
  Component: SvelteComponent,
  props: Props
): RenderResult {
  if (!Component) {
    throw new TypeError('renderComponent: Component is required');
  }

  return svelteRender(Component, { props });
}

/**
 * Builds the hydration script tag with serialized state.
 *
 * Use this if you're building custom HTML and need just the state script.
 *
 * @template State - State type
 * @template Action - Action type
 *
 * @param store - Store to serialize
 * @returns HTML script tag with serialized state
 *
 * @example
 * ```typescript
 * const stateScript = buildHydrationScript(store);
 *
 * const html = `
 *   <div id="app">${renderedHTML}</div>
 *   ${stateScript}
 *   <script src="/app.js"></script>
 * `;
 * ```
 */
export function buildHydrationScript<State, Action>(
  store: Store<State, Action>
): string {
  const stateJSON = serializeStore(store);

  return `<script id="__COMPOSABLE_SVELTE_STATE__" type="application/json">
${stateJSON}
</script>`;
}

/**
 * Escapes HTML special characters to prevent XSS.
 *
 * @param str - String to escape
 * @returns Escaped string safe for HTML
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
