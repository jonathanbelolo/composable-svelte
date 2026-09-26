import { afterEach, expect, it } from 'vitest';
import { acquireDocumentScrollLock, documentScrollLock } from '../src/lib/actions/documentScrollLock.js';
const cleanups: (() => void)[] = [];
let saved = '';
function prepare() { saved = document.body.style.cssText; cleanups.push(() => { document.body.style.cssText = saved; }); }
afterEach(() => { for (const cleanup of cleanups.reverse()) cleanup(); cleanups.length = 0; });
it('keeps the document locked until its last independent owner releases, in either order', () => {
 prepare();
 for (const reverse of [false, true]) {
  document.body.style.setProperty('overflow', 'auto', 'important');
  const a = acquireDocumentScrollLock(document), b = acquireDocumentScrollLock(document);
  cleanups.push(a, b);
  (reverse ? b : a)();
  expect(document.body.style.overflow).toBe('hidden');
  (reverse ? a : b)();
  expect(document.body.style.overflow).toBe('auto');
  expect(document.body.style.getPropertyPriority('overflow')).toBe('important');
 }
});
it('preserves individual overflow longhands and makes repeated cleanup harmless', () => {
 prepare(); document.body.style.removeProperty('overflow'); document.body.style.setProperty('overflow-y', 'scroll', 'important');
 const release = acquireDocumentScrollLock(document); cleanups.push(release);
 release(); release();
 expect(document.body.style.overflowX).toBe('');
 expect(document.body.style.overflowY).toBe('scroll');
 expect(document.body.style.getPropertyPriority('overflow-y')).toBe('important');
});
it('does not overwrite a newer foreign property write during cleanup', () => {
 prepare(); const release = acquireDocumentScrollLock(document); cleanups.push(release);
 document.body.style.setProperty('overflow-y', 'clip'); release();
 expect(document.body.style.overflowY).toBe('clip');
});
it('acquires in the node document, independently from the main document', () => {
 prepare(); const other = document.implementation.createHTMLDocument('other');
 other.body.style.overflow = 'auto';
 const main = acquireDocumentScrollLock(document); cleanups.push(main);
 const action = documentScrollLock(other.body, true); cleanups.push(action.destroy);
 action.update(true); action.destroy(); action.destroy();
 expect(other.body.style.overflow).toBe('auto'); expect(document.body.style.overflow).toBe('hidden');
 main();
});
it('action updates release and reacquire exactly one acquisition', () => {
 prepare(); const before = document.body.style.overflow;
 const action = documentScrollLock(document.body, false); cleanups.push(action.destroy);
 action.update(true); action.update(true); action.update(false);
 expect(document.body.style.overflow).toBe(before);
 action.update(true); expect(document.body.style.overflow).toBe('hidden'); action.destroy();
 action.update(true); expect(document.body.style.overflow).toBe(before);
});
it('adds scrollbar compensation to existing padding and restores its priority', () => {
 prepare(); document.body.style.setProperty('padding-right', '13px', 'important');
 const descriptor = Object.getOwnPropertyDescriptor(window, 'innerWidth')!;
 Object.defineProperty(window, 'innerWidth', {configurable: true, value: document.documentElement.clientWidth + 17});
 cleanups.push(() => Object.defineProperty(window, 'innerWidth', descriptor));
 const gap = 17;
 const release = acquireDocumentScrollLock(document); cleanups.push(release);
 expect(parseFloat(document.body.style.paddingRight)).toBe(13 + gap);
 release(); expect(document.body.style.paddingRight).toBe('13px');
 expect(document.body.style.getPropertyPriority('padding-right')).toBe('important');
});
