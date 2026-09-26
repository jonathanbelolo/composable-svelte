import {it,expect} from 'vitest';
import {hydrate,tick,unmount} from 'svelte';
import {userEvent} from 'vitest/browser';
import Fixture from './test-components/TabsInstances.svelte';
import html from './fixtures/tabs-identities-ssr.html?raw';
it('adopts server tab nodes and keeps second-instance native focus isolated',async()=>{
 const target=document.createElement('div');target.innerHTML=html;document.body.append(target);
 const before=[...target.querySelectorAll<HTMLElement>('[id]')];const ids=before.map(node=>node.id);
 const app=hydrate(Fixture,{target});
 try{
  await tick();expect([...target.querySelectorAll('[id]')]).toEqual(before);expect(before.map(node=>node.id)).toEqual(ids);
  const first=target.querySelector<HTMLElement>('[data-instance="first"] [role="tab"]')!;
  const second=[...target.querySelectorAll<HTMLElement>('[data-instance="second"] [role="tab"]')];
  second[0]!.focus();await userEvent.keyboard('{ArrowRight}');await expect.poll(()=>document.activeElement).toBe(second[1]);
  expect(first.getAttribute('aria-selected')).toBe('true');expect(second[1]!.getAttribute('aria-selected')).toBe('true');
 }finally{await unmount(app);target.remove();}
});
