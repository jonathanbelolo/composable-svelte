import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync } from 'node:fs';
let server: ViteDevServer; let Fixture: import('svelte').Component<any>; let render: typeof import('svelte/server').render;
beforeAll(async () => {
 server = await createServer({ configFile: false, logLevel: 'silent', plugins: [svelte({ configFile: false })], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
 ({ default: Fixture } = await server.ssrLoadModule('/tests/fixtures/AlertSSRComposition.svelte'));
 ({ render } = await server.ssrLoadModule('svelte/server'));
});
afterAll(async () => { await server?.close(); });
function reference(html: string, attribute: string) { return html.match(new RegExp(attribute + '="([^"]+)"'))?.[1]; }
it('renders custom title once with immediate server title and description associations', () => {
 expect(typeof window).toBe('undefined'); let calls = 0;
 const html = render(Fixture, { props: { onTitleInit: () => calls++ } }).body;
 expect(calls).toBe(1); expect(html).toContain('data-title-content');
 for (const attribute of ['aria-labelledby','aria-describedby']) { const id = reference(html, attribute); expect(id).toBeTruthy(); expect(html).toContain('id="' + id + '"'); }
 const fixture = new URL('../fixtures/alert-composition-ssr.html', import.meta.url);
 if (process.env.UPDATE_ALERT_SSR_FIXTURE === '1') writeFileSync(fixture, html);
 expect(readFileSync(fixture, 'utf8')).toBe(html);
});
it.each([[false,false],[true,false],[false,true],[true,true]])('independent title=%s description=%s have exact server references', (title, description) => {
 const html = render(Fixture, { props: { initialTitle: title, initialDescription: description, titleKind: 'string' } }).body;
 expect(Boolean(reference(html,'aria-labelledby'))).toBe(title); expect(Boolean(reference(html,'aria-describedby'))).toBe(description);
 if (!title) expect(html).toContain('aria-label="Fallback"');
});
it('empty string titles use the fallback and sibling dialogs have distinct associated IDs', () => {
 const empty = render(Fixture, { props: { titleKind: 'empty' } }).body;
 expect(reference(empty,'aria-labelledby')).toBeUndefined(); expect(empty).toContain('aria-label="Fallback"');
 const html = render(Fixture, { props: { titleKind: 'string', two: true } }).body;
 const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(match => match[1]!);
 const refs = [...html.matchAll(/ aria-(?:labelledby|describedby)="([^"]+)"/g)].map(match => match[1]!);
 expect(ids).toHaveLength(4); expect(new Set(ids).size).toBe(4); expect(refs).toHaveLength(4);
 for (const id of refs) expect(ids).toContain(id);
});

it('renders a description snippet once and omits an empty description', () => {
 const html = render(Fixture, { props: { titleKind: 'string', descriptionKind: 'snippet' } }).body;
 expect(html.match(/data-description-content/g)).toHaveLength(1);
 const id = reference(html, 'aria-describedby'); expect(id).toBeTruthy(); expect(html).toContain('id="' + id + '"');
 const empty = render(Fixture, { props: { descriptionKind: 'empty' } }).body;
 expect(reference(empty, 'aria-describedby')).toBeUndefined();
});
