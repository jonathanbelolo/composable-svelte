import { expect, it, vi } from 'vitest';
import { hydrate, unmount, tick, flushSync } from 'svelte';
import Fixture from './fixtures/AlertSSRComposition.svelte';
import html from './fixtures/alert-composition-ssr.html?raw';
it('hydrates actual SSR slots without replacing nodes, then updates associations without resetting the footer', async () => {
 const target = document.createElement('div'); target.innerHTML = html; document.body.append(target);
 const original = target.querySelector('[role="alertdialog"]')!;
 const titleId = original.getAttribute('aria-labelledby')!; const descriptionId = original.getAttribute('aria-describedby')!;
 const title = document.getElementById(titleId); const description = document.getElementById(descriptionId); const footer = original.querySelector<HTMLButtonElement>('[data-footer]')!;
 const warn = vi.spyOn(console, 'warn'); const onTitleInit = vi.fn();
 const component = hydrate(Fixture, { target, props: { onTitleInit }, recover: false });
 try {
  await tick(); expect(document.querySelector('[role="alertdialog"]')).toBe(original);
  expect(document.getElementById(titleId)).toBe(title); expect(document.getElementById(descriptionId)).toBe(description); expect(onTitleInit).toHaveBeenCalledTimes(1);
  expect(warn.mock.calls.flat().join(' ')).not.toMatch(/hydration/i);
  footer.click(); flushSync(); expect(footer.textContent).toBe('Count 1');
  component.setParts(false, true); flushSync();
  expect(original.hasAttribute('aria-labelledby')).toBe(false); expect(original.getAttribute('aria-label')).toBe('Fallback');
  expect(document.getElementById(descriptionId)).toBe(description);
  component.setParts(false, false); flushSync(); expect(original.hasAttribute('aria-describedby')).toBe(false);
  component.setParts(true, true); flushSync();
  expect(original.getAttribute('aria-labelledby')).toBe(titleId); expect(original.getAttribute('aria-describedby')).toBe(descriptionId);
  expect(document.getElementById(titleId)).not.toBeNull(); expect(document.getElementById(descriptionId)).not.toBeNull();
  expect(original.querySelector('[data-footer]')).toBe(footer); expect(footer.textContent).toBe('Count 1'); expect(onTitleInit).toHaveBeenCalledTimes(2);
 } finally { await unmount(component); target.remove(); warn.mockRestore(); }
});
