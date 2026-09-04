/**
 * Static Site Generation (SSG) utilities.
 *
 * This module provides tools for generating static HTML files at build time,
 * supporting both full-site and selective page generation.
 *
 * @example Basic SSG
 * ```typescript
 * import { generateStaticSite } from '@composable-svelte/core/ssr/ssg';
 * import App from './App.svelte';
 * import { appReducer } from './reducer';
 *
 * await generateStaticSite(App, {
 *   routes: [
 *     { path: '/' },
 *     { path: '/about' }
 *   ],
 *   outDir: './dist',
 *   baseURL: 'https://example.com'
 * }, {
 *   reducer: appReducer,
 *   dependencies: {}
 * });
 * ```
 *
 * @example Dynamic Routes
 * ```typescript
 * const posts = await loadPosts();
 *
 * await generateStaticSite(App, {
 *   routes: [
 *     { path: '/' },
 *     {
 *       path: '/posts/:id',
 *       paths: posts.map(p => `/posts/${p.id}`),
 *       getServerProps: async (path) => {
 *         const id = parseInt(path.split('/').pop()!);
 *         return await loadPost(id);
 *       }
 *     }
 *   ],
 *   outDir: './dist'
 * }, {
 *   reducer: appReducer
 * });
 * ```
 *
 * @module ssr/ssg
 */

import { renderToHTML, type RenderOptions } from './render.js';
import type { Store, Reducer } from '../types.js';
import { createStore } from '../store.svelte.js';

// Node.js modules - only used in Node environment (build-time SSG)
// These are only called during build, never in browser
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';

/**
 * Svelte component type (compatible with Svelte 5).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SvelteComponent = any;

/**
 * Configuration for a single SSG route.
 */
export interface SSGRoute {
  /**
   * Path pattern for the route.
   * Examples: '/', '/about', '/posts/:id'
   */
  path: string;

  /**
   * For dynamic routes, provide the actual paths to generate.
   * Can be an array of paths or a function that returns paths.
   *
   * Example for `/posts/:id`:
   * ```typescript
   * paths: ['/posts/1', '/posts/2', '/posts/3']
   * // or
   * paths: async () => {
   *   const posts = await loadPosts();
   *   return posts.map(p => `/posts/${p.id}`);
   * }
   * ```
   */
  paths?: string[] | (() => Promise<string[]>);

  /**
   * Optional function to load data for this route.
   * Called for each path during generation.
   *
   * @param path - The actual path being generated (e.g., '/posts/1')
   * @returns Data to include in initial state
   */
  getServerProps?: (path: string) => Promise<unknown>;
}

/**
 * Configuration for static site generation.
 */
export interface SSGConfig {
  /**
   * Routes to pre-render.
   * Each route can be static or dynamic.
   */
  routes: SSGRoute[];

  /**
   * Output directory for generated HTML files.
   * Default: './dist'
   */
  outDir?: string;

  /**
   * Base URL for the site (used for canonical links).
   * Example: 'https://example.com'
   */
  baseURL?: string;

  /**
   * Whether to generate a 404 page.
   * Default: true
   */
  generate404?: boolean;

  /**
   * Custom 404 page state.
   * If provided, a 404.html will be generated with this state.
   */
  notFoundState?: unknown;

  /**
   * Callback called before generating each page.
   * Useful for logging progress.
   */
  onPageGenerated?: (path: string, outPath: string) => void;
}

/**
 * Result of static site generation.
 */
export interface SSGResult {
  /**
   * Number of pages successfully generated.
   */
  pagesGenerated: number;

  /**
   * List of generated file paths (relative to outDir).
   */
  generatedFiles: string[];

  /**
   * Any errors that occurred during generation.
   */
  errors: Array<{ path: string; error: Error }>;

  /**
   * Total time taken (in milliseconds).
   */
  duration: number;
}

/**
 * Options for SSG generation.
 */
export interface SSGGenerateOptions<State, Action, Dependencies> {
  /**
   * The reducer for the application.
   */
  reducer: Reducer<State, Action, Dependencies>;

  /**
   * Dependencies to inject into the store (typically empty for SSG).
   */
  dependencies?: Dependencies;

  /**
   * Rendering options (title, scripts, etc.).
   */
  renderOptions?: RenderOptions;

  /**
   * Function to compute initial state for a given path.
   * Called before getServerProps.
   *
   * @param path - The path being generated
   * @returns Initial state for this path
   */
  getInitialState?: (path: string) => Promise<State> | State;
}

/**
 * Generate static HTML files for all configured routes.
 *
 * This is the main entry point for static site generation.
 *
 * @template State - Application state type
 * @template Action - Action type
 * @template Dependencies - Dependencies type
 *
 * @param Component - Svelte component to render
 * @param config - SSG configuration
 * @param options - Generation options (reducer, dependencies, etc.)
 * @returns Result with generated files and statistics
 *
 * @example
 * ```typescript
 * const result = await generateStaticSite(App, {
 *   routes: [
 *     { path: '/' },
 *     { path: '/about' },
 *     {
 *       path: '/posts/:id',
 *       paths: ['/posts/1', '/posts/2'],
 *       getServerProps: async (path) => ({
 *         post: await loadPost(path)
 *       })
 *     }
 *   ],
 *   outDir: './dist',
 *   baseURL: 'https://example.com'
 * }, {
 *   reducer: appReducer,
 *   dependencies: {},
 *   getInitialState: () => ({ posts: [], selectedPost: null })
 * });
 *
 * console.log(`Generated ${result.pagesGenerated} pages`);
 * ```
 */
export async function generateStaticSite<State, Action, Dependencies>(
  Component: SvelteComponent,
  config: SSGConfig,
  options: SSGGenerateOptions<State, Action, Dependencies>
): Promise<SSGResult> {
  const startTime = Date.now();
  const outDir = config.outDir ?? './dist';
  const generatedFiles: string[] = [];
  const errors: Array<{ path: string; error: Error }> = [];
  const generate404 = config.generate404 !== false;

  // Ensure output directory exists
  await mkdir(outDir, { recursive: true });

  // Generate pages for each route
  for (const route of config.routes) {
    // Resolve paths for this route
    const paths = await resolvePaths(route);

    // Generate each path
    for (const path of paths) {
      // One file per target: `/a` and `/a/` were rendered and counted twice,
      // and a data path of `/404` was overwritten by the 404 page generated
      // after the loop (SS11). The 404 step owns 404.html.
      const target = pathToFilePath(path);
      if (target !== null && generatedFiles.includes(target)) continue;
      if (target === '404.html' && generate404) continue;
      try {
        // Get initial state for this path
        let initialState: State;
        if (options.getInitialState) {
          initialState = await options.getInitialState(path);
        } else {
          // @ts-expect-error - Allow empty initial state if not provided
          initialState = {};
        }

        // Load additional data if route has getServerProps
        let serverProps: Record<string, unknown> = {};
        if (route.getServerProps) {
          serverProps = (await route.getServerProps(path)) as Record<string, unknown>;
        }

        // Merge server props into initial state
        const mergedState = {
          ...initialState,
          ...serverProps
        } as State;

        // Generate the page
        const outPath = await generateStaticPage(Component, path, {
          initialState: mergedState,
          reducer: options.reducer,
          ...(options.dependencies !== undefined && { dependencies: options.dependencies }),
          renderOptions: {
            ...options.renderOptions,
            // Override canonical URL if baseURL is provided
            ...(config.baseURL && {
              head: `${options.renderOptions?.head || ''}\n<link rel="canonical" href="${config.baseURL}${path}">`
            })
          },
          outDir
        });

        generatedFiles.push(outPath);

        // Notify callback
        if (config.onPageGenerated) {
          config.onPageGenerated(path, outPath);
        }
      } catch (error) {
        errors.push({
          path,
          error: error instanceof Error ? error : new Error(String(error))
        });
        console.error(`[SSG] Error generating ${path}:`, error);
      }
    }
  }

  // Generate 404 page if requested
  if (generate404) {
    try {
      const notFoundState = config.notFoundState ?? (await options.getInitialState?.('/404')) ?? {};
      const outPath = await generateStaticPage(Component, '/404', {
        initialState: notFoundState as State,
        reducer: options.reducer,
        ...(options.dependencies !== undefined && { dependencies: options.dependencies }),
        ...(options.renderOptions !== undefined && { renderOptions: options.renderOptions }),
        outDir
      });
      generatedFiles.push(outPath);
    } catch (error) {
      // In the result, like every other page's failure — it was only logged.
      errors.push({
        path: '/404',
        error: error instanceof Error ? error : new Error(String(error))
      });
      console.error('[SSG] Error generating 404 page:', error);
    }
  }

  const duration = Date.now() - startTime;

  return {
    pagesGenerated: generatedFiles.length,
    generatedFiles,
    errors,
    duration
  };
}

/**
 * Generate a single static HTML page.
 *
 * This is useful if you want to generate individual pages
 * outside of the full site generation flow.
 *
 * @template State - Application state type
 * @template Action - Action type
 * @template Dependencies - Dependencies type
 *
 * @param Component - Svelte component to render
 * @param path - URL path for this page (e.g., '/posts/1')
 * @param options - Generation options
 * @returns Path to generated file (relative to outDir)
 *
 * @example
 * ```typescript
 * const outPath = await generateStaticPage(App, '/posts/1', {
 *   initialState: { post: await loadPost(1) },
 *   reducer: appReducer,
 *   dependencies: {},
 *   outDir: './dist'
 * });
 * ```
 */
export async function generateStaticPage<State, Action, Dependencies>(
  Component: SvelteComponent,
  path: string,
  options: {
    initialState: State;
    reducer: Reducer<State, Action, Dependencies>;
    dependencies?: Dependencies;
    renderOptions?: RenderOptions;
    outDir: string;
  }
): Promise<string> {
  if (!Component) {
    throw new TypeError('generateStaticPage: Component is required');
  }

  if (!path) {
    throw new TypeError('generateStaticPage: path is required');
  }

  // Create store with initial state
  const store = createStore({
    initialState: options.initialState,
    reducer: options.reducer,
    dependencies: options.dependencies ?? ({} as Dependencies)
  });

  // Determine output file path — before rendering, so a refused path costs
  // nothing and cannot reach the disk.
  const filePath = pathToFilePath(path);
  if (filePath === null) {
    throw new SSGPathError(path);
  }
  const fullPath = join(options.outDir, filePath);
  // A second guard on the resolved target, in case a segment slipped past
  // the first: the write must land under outDir.
  const outRoot = resolve(options.outDir);
  if (!resolve(fullPath).startsWith(outRoot + sep)) {
    throw new SSGPathError(path);
  }

  // Render to HTML
  const html = renderToHTML(Component, { store }, options.renderOptions);

  // Ensure directory exists
  const dir = dirname(fullPath);
  await mkdir(dir, { recursive: true });

  // Write HTML file
  await writeFile(fullPath, html, 'utf-8');

  return filePath;
}

/**
 * A path `generateStaticPage` refused to write: it would land outside
 * `outDir`, or could not be decoded. In `generateStaticSite` it is one entry
 * of `result.errors`; on its own it is thrown.
 */
export class SSGPathError extends Error {
  override readonly name = 'SSGPathError';
  readonly code = 'SSG_PATH_REFUSED';
  constructor(readonly path: string) {
    super(`generateStaticPage: refused to write ${JSON.stringify(path)} — it would leave outDir`);
  }
}

/**
 * Resolve paths for a route.
 * Handles both static paths and dynamic path generation.
 *
 * @param route - Route configuration
 * @returns Array of paths to generate
 */
async function resolvePaths(route: SSGRoute): Promise<string[]> {
  // If paths are provided, use them
  if (route.paths) {
    if (typeof route.paths === 'function') {
      return await route.paths();
    }
    return route.paths;
  }

  // Otherwise, use the path itself (static route)
  return [route.path];
}

/**
 * Convert a URL path to a file path, or refuse it.
 *
 * Examples:
 * - '/' → 'index.html'
 * - '/about', '/about/' → 'about/index.html'
 * - '/posts/1' → 'posts/1/index.html'
 * - '/404' → '404.html'
 * - '/../x', '/%2e%2e/x', a null byte, a malformed escape → null
 *
 * The first form stripped one slash and joined, and `join` normalises `..`:
 * a data-derived path of `/../../etc/x` wrote outside `outDir` at build time
 * (AUDIT-2026-09-03-FINDINGS SS1). Segments are checked after percent-decoding
 * and with backslashes as separators, and `..` and `.` are refused rather
 * than resolved — the caller meant a page, not a parent directory.
 *
 * @param path - URL path
 * @returns File path relative to output directory, or null if refused
 */
function pathToFilePath(path: string): string | null {
  if (path.includes('\0')) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;

  const segments = decoded.split(/[\/\\]+/).filter((segment) => segment !== '');
  if (segments.some((segment) => segment === '..' || segment === '.')) return null;

  // Handle root
  if (segments.length === 0) {
    return 'index.html';
  }

  // Handle 404
  if (segments.length === 1 && segments[0] === '404') {
    return '404.html';
  }

  // Handle other paths - add /index.html
  return `${segments.join('/')}/index.html`;
}
