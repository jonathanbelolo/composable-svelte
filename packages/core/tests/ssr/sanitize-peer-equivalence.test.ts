import { describe, it, expect } from 'vitest';
import DOMPurify, { type Config } from 'isomorphic-dompurify';
import { sanitizeHTML, defaultSanitizeOptions } from '../../src/lib/ssr/sanitize.js';
const base = { ALLOWED_TAGS: defaultSanitizeOptions.allowedTags, ALLOWED_ATTR: Object.values(defaultSanitizeOptions.allowedAttributes!).flat(), ALLOW_DATA_ATTR: false };
describe('native peer serialization equivalence without data URLs', () => {
 for (const [name, html, config] of [
  ['default data attributes', '<p data-controller="run">x</p>', {}],
  ['explicit data attributes', '<p data-controller="run">x</p>', {ALLOW_DATA_ATTR:true}],
  ['non-html doctype', '<!doctype x-quirks><html><body>x</body></html>', {WHOLE_DOCUMENT:true, ALLOWED_TAGS:['html','head','body','!doctype']}],
  ['uppercase doctype config', '<!doctype html><html><body>x</body></html>', {WHOLE_DOCUMENT:true, ALLOWED_TAGS:['html','head','body','!DOCTYPE']}],
  ['template expression across nodes', '<p>${</p><p>expression}</p>', {SAFE_FOR_TEMPLATES:true}],
  ['shadow root template', '<p>x</p><template shadowrootmode="open"><p>shadow</p></template>', {ADD_TAGS:['template'],ADD_ATTR:['shadowrootmode']}],
  ['shadow import without doctype', '<html><body>x</body></html>', {WHOLE_DOCUMENT:true,ALLOWED_TAGS:['html','head','body','!doctype'],ALLOWED_ATTR:['shadowrootmode']}],
  ['shadow import invalid doctype', '<!doctype x-quirks><html><body>x</body></html>', {WHOLE_DOCUMENT:true,ALLOWED_TAGS:['html','head','body','!doctype'],ALLOWED_ATTR:['shadowrootmode']}],
  ['whole shadow root', '<!doctype html><html><body><template shadowrootmode="open"><p>x</p></template></body></html>', {WHOLE_DOCUMENT:true,ALLOWED_TAGS:['html','head','body','template','p','!doctype'],ALLOWED_ATTR:['shadowrootmode']}],
 ] as [string, string, Config][]) it(name, () => {
  const cfg = {...base,...config};
  expect(sanitizeHTML(html,{...defaultSanitizeOptions,domPurifyConfig:config})).toBe(DOMPurify.sanitize(html,cfg));
 });
 it('retains native fragment return structure', () => {
  const config = {...base,RETURN_DOM_FRAGMENT:true as const};
  const native = DOMPurify.sanitize('<p>x</p>',config);
  const actual = sanitizeHTML('<p>x</p>',{...defaultSanitizeOptions,domPurifyConfig:config}) as unknown as DocumentFragment;
  expect(actual.nodeType).toBe(native.nodeType);expect(actual.firstChild?.textContent).toBe('x');
 });
 it('does not expand a wide child list into function arguments', () => {
  const input='<p>x</p>'.repeat(150000);
  expect(sanitizeHTML(input)).toBe(input);
 }, 30000);
 it('records the actual executing peer version', () => { console.log('EXECUTING_DOMPURIFY_VERSION='+DOMPurify.version); expect(DOMPurify.version).toMatch(/^3\./); if (process.env.EXPECTED_DOMPURIFY_VERSION) expect(DOMPurify.version).toBe(process.env.EXPECTED_DOMPURIFY_VERSION); });
});
