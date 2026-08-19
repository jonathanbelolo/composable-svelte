/**
 * Sanitisation for rendered chat markdown.
 *
 * Model output is untrusted and reaches `{@html}` in all three message
 * components, so raw `<script>`, `<img onerror=…>` and `javascript:` hrefs would
 * otherwise execute in the host page. `marked` does not sanitise — it passes raw
 * HTML straight through — so every render path in this package must funnel
 * through here.
 *
 * Shared by `markdown.ts` and `simple-markdown.ts`. Those two modules are
 * near-duplicates, and keeping one allowlist is what stops the next fix from
 * landing on only one of them, which is exactly how the first attempt at this
 * left `renderSimpleMarkdown` still vulnerable.
 *
 * @packageDocumentation
 */

import DOMPurify from 'isomorphic-dompurify';

/**
 * Tags the markdown pipelines in this package legitimately produce.
 *
 * Derived by rendering GFM through their marked configuration and reading the
 * output: tables, task lists and `<del>` come from `gfm: true`, `<br>` from
 * `breaks: true`, and `<span class="token …">` from Prism highlighting.
 * `renderSimpleMarkdown` emits a subset of this (no Prism), so one list covers
 * both.
 *
 * Core's `defaultSanitizeOptions` (`@composable-svelte/core/ssr/sanitize`) is
 * deliberately not reused — it is tuned for blog posts and allows none of
 * `del`, `span`, `table`, `input`, nor the `class` attribute, so sanitizing with
 * it would silently strip every table, task list and code highlight.
 */
export const ALLOWED_TAGS = [
	'p', 'br', 'hr', 'span', 'div',
	'strong', 'em', 'del', 's', 'u', 'sup', 'sub',
	'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
	'ul', 'ol', 'li', 'input',
	'blockquote', 'code', 'pre',
	'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
	'a', 'img'
];

/**
 * Attributes kept alongside those tags.
 *
 * `class` carries `language-*`, `inline-code` and Prism's token classes, so
 * dropping it would remove all syntax highlighting. DOMPurify applies
 * ALLOWED_ATTR globally rather than per tag; that is safe because event
 * handlers and `javascript:` URLs are stripped regardless of this list.
 * `target` is deliberately absent, so no link can open a tab it could then
 * reach back through.
 */
export const ALLOWED_ATTR = [
	'class', 'align',
	'href', 'title', 'rel',
	'src', 'alt', 'width', 'height',
	'type', 'checked', 'disabled'
];

/**
 * Strip anything executable from rendered markdown.
 *
 * Runs on both the server and the client — the message components call the
 * render functions from `$derived`, so they execute during SSR too. That is why
 * this package depends on `isomorphic-dompurify` rather than plain `dompurify`,
 * which in Node reports `isSupported: false` and has no `sanitize` function at
 * all.
 */
export function sanitizeRenderedMarkdown(html: string): string {
	return DOMPurify.sanitize(html, {
		ALLOWED_TAGS,
		ALLOWED_ATTR
	}) as unknown as string;
}
