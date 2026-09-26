import { expect, it } from 'vitest';
import { mount, unmount, tick } from 'svelte';
import App from '../src/App.svelte';
it('renders the managed view and dispatches editing through the real outlet', async () => {
  history.replaceState(null, '', '/notes/welcome');
  const target = document.createElement('div'); document.body.append(target);
  const app = mount(App, { target, props: { url: location.href, dependencies: { save: async note => ({ ...note, revision: note.revision + 1 }) } } });
  try {
    await tick(); await new Promise(resolve => setTimeout(resolve, 20)); await tick();
    const edit = [...target.querySelectorAll('button')].find(button => button.textContent === 'Edit note')!;
    expect(edit).toBeTruthy(); edit.click(); await tick();
    const input = document.querySelector('textarea')!; expect(input).toBeTruthy();
    input.value = 'Edited via view'; input.dispatchEvent(new Event('input', { bubbles: true })); await tick();
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 20)); await tick();
    expect(target.textContent).toContain('Edited via view'); expect(document.querySelector('textarea')).toBeNull();
  } finally { await unmount(app); target.remove(); history.replaceState(null, '', '/'); }
});
