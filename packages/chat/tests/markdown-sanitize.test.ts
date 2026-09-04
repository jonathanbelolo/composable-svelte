/**
 * Model output reaches `{@html}` in ChatMessage, so `renderMarkdown` must never
 * return anything executable.
 *
 * Before this was fixed, `marked.parse()` was returned verbatim and marked
 * passes raw HTML straight through, so `@composable-svelte/chat@0.2.4` shipped
 * a live XSS: any model (or anything able to influence one) could execute
 * script in the host page.
 *
 * The second block matters as much as the first. Sanitizing is easy to get
 * *too* aggressive — core's blog-tuned allowlist would have stripped every
 * table, task list and syntax highlight — so the likely regression is silently
 * mangled output, not a missed payload.
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/streaming-chat/markdown';
import { renderSimpleMarkdown } from '../src/lib/streaming-chat/simple-markdown';

describe('renderMarkdown neutralises hostile content', () => {
	it('strips <script> blocks', () => {
		const html = renderMarkdown('Hello <script>alert(1)</script> world');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('alert(1)');
	});

	it('strips inline event handlers', () => {
		const html = renderMarkdown('<img src=x onerror=alert(1)>');
		expect(html.toLowerCase()).not.toContain('onerror');
	});

	it('strips javascript: hrefs', () => {
		const html = renderMarkdown('[click me](javascript:alert(1))');
		expect(html.toLowerCase()).not.toContain('javascript:');
	});

	it('strips iframes and object embeds', () => {
		const html = renderMarkdown('<iframe src="https://evil.test"></iframe><object data="x"></object>');
		expect(html).not.toContain('<iframe');
		expect(html).not.toContain('<object');
	});

	it('strips svg-borne handlers', () => {
		const html = renderMarkdown('<svg><animate onbegin=alert(1) attributeName=x dur=1s>');
		expect(html.toLowerCase()).not.toContain('onbegin');
	});

	it('sanitises while streaming too', () => {
		const html = renderMarkdown('partial <img src=x onerror=alert(1)> text', true);
		expect(html.toLowerCase()).not.toContain('onerror');
	});
});

describe('renderMarkdown preserves legitimate formatting', () => {
	it('keeps GFM tables, including alignment', () => {
		const html = renderMarkdown('| a | b |\n|:--|--:|\n| 1 | 2 |');
		expect(html).toContain('<table');
		expect(html).toContain('<thead');
		expect(html).toContain('<td');
	});

	it('keeps task list checkboxes', () => {
		const html = renderMarkdown('- [x] done\n- [ ] todo');
		expect(html).toContain('<input');
		expect(html).toContain('checked');
	});

	it('keeps strikethrough, bold and italic', () => {
		const html = renderMarkdown('~~gone~~ **bold** _italic_');
		expect(html).toContain('<del>');
		expect(html).toContain('<strong>');
		expect(html).toContain('<em>');
	});

	it('keeps code block language classes', () => {
		const html = renderMarkdown('```js\nconst x = 1;\n```');
		expect(html).toContain('<pre');
		expect(html).toContain('language-javascript');
	});

	it('keeps inline code styling hooks', () => {
		const html = renderMarkdown('use `npm install` here');
		expect(html).toContain('inline-code');
	});

	it('keeps links and images', () => {
		const html = renderMarkdown('[text](https://example.test) and ![alt](/i.png)');
		expect(html).toContain('href="https://example.test"');
		expect(html).toContain('src="/i.png"');
		expect(html).toContain('alt="alt"');
	});

	it('keeps Prism token spans when highlighting is available', () => {
		// Prism loads lazily; when it has not loaded the fallback still emits a
		// <code class="language-*"> block. Either way, class must survive.
		const html = renderMarkdown('```js\nconst x = 1;\n```');
		expect(html).toContain('class=');
	});
});

/**
 * `renderSimpleMarkdown` is a separate module feeding a third `{@html}` site
 * (primitives/SimpleChatMessage.svelte:53). The first attempt at this fix
 * sanitised only `renderMarkdown`, leaving this path live — so it gets the same
 * battery rather than a token case.
 */
describe('renderSimpleMarkdown neutralises hostile content', () => {
	it('strips <script> blocks', () => {
		const html = renderSimpleMarkdown('Hello <script>alert(1)</script> world');
		expect(html).not.toContain('<script');
		expect(html).not.toContain('alert(1)');
	});

	it('strips inline event handlers', () => {
		const html = renderSimpleMarkdown('<img src=x onerror=alert(1)>');
		expect(html.toLowerCase()).not.toContain('onerror');
	});

	it('strips javascript: hrefs', () => {
		const html = renderSimpleMarkdown('[click me](javascript:alert(1))');
		expect(html.toLowerCase()).not.toContain('javascript:');
	});

	it('strips iframes', () => {
		const html = renderSimpleMarkdown('<iframe src="https://evil.test"></iframe>');
		expect(html).not.toContain('<iframe');
	});

	it('sanitises while streaming too', () => {
		const html = renderSimpleMarkdown('partial <img src=x onerror=alert(1)>', true);
		expect(html.toLowerCase()).not.toContain('onerror');
	});

	it('still renders ordinary markdown', () => {
		const html = renderSimpleMarkdown('**bold** and `code` and [l](https://e.test)');
		expect(html).toContain('<strong>');
		expect(html).toContain('inline-code');
		expect(html).toContain('href="https://e.test"');
	});

	it('still renders GFM tables', () => {
		const html = renderSimpleMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
		expect(html).toContain('<table');
	});
});

/**
 * Both modules used to configure the shared `marked` singleton at import time,
 * so whichever loaded last won for both. Each now owns its instance: the full
 * renderer maps `js` through LANGUAGE_MAP to `language-javascript`, the simple
 * one does not map at all and emits `language-js`.
 */
describe('the two renderers do not share global state', () => {
	it('keeps each module on its own renderer', () => {
		const full = renderMarkdown('```js\nconst x = 1;\n```');
		const simple = renderSimpleMarkdown('```js\nconst x = 1;\n```');

		expect(full).toContain('language-javascript');
		expect(simple).toContain('language-js');
		expect(simple).not.toContain('language-javascript');
	});
});
