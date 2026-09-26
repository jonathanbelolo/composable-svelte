import {it,expect,vi,afterEach} from 'vitest';
import {render} from 'vitest-browser-svelte';
import {createRawSnippet,flushSync,tick} from 'svelte';
const playback=vi.hoisted(()=>({controls:[] as Array<{stop:ReturnType<typeof vi.fn>;resolve:()=>void}>}));
vi.mock('motion',()=>({animate:vi.fn(()=>{let resolve!:()=>void;const finished=new Promise<void>(r=>{resolve=r;});const stop=vi.fn();playback.controls.push({stop,resolve});return {finished,stop};})}));
import DropdownMenu from '../src/lib/components/ui/dropdown-menu/DropdownMenu.svelte';
import {animateDropdownIn,animateDropdownOut} from '../src/lib/animation/animate.js';
afterEach(()=>{playback.controls.length=0;vi.restoreAllMocks();});
const children=createRawSnippet(()=>({render:()=>'<span>Open</span>'}));
it('abort stops and settles playback even if Motion finished never settles',async()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:false} as MediaQueryList);
 const target=document.createElement('div');const controller=new AbortController();const done=animateDropdownIn(target,controller.signal);
 expect(playback.controls).toHaveLength(1);controller.abort();await done;expect(playback.controls[0]!.stop).toHaveBeenCalledTimes(1);
});
it('reduced motion acquires no playback and writes stable endpoints',async()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:true} as MediaQueryList);const target=document.createElement('div');
 await animateDropdownIn(target);expect(target.style.opacity).toBe('1');await animateDropdownOut(target);expect(target.style.opacity).toBe('0');expect(playback.controls).toHaveLength(0);
});
it('reopening invalidates exit and unmount stops only its current playback',async()=>{
 vi.spyOn(window,'matchMedia').mockReturnValue({matches:false} as MediaQueryList);
 const view=render(DropdownMenu,{items:[{id:'a',label:'Alpha'}],children});const trigger=view.container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
 flushSync(()=>trigger.click());expect(playback.controls).toHaveLength(1);playback.controls[0]!.resolve();await tick();flushSync();
 flushSync(()=>trigger.click());const exit=playback.controls[1]!;flushSync(()=>trigger.click());expect(exit.stop).toHaveBeenCalledTimes(1);
 exit.resolve();await tick();flushSync();expect(trigger.getAttribute('aria-expanded')).toBe('true');
 const entry=playback.controls[2]!;view.unmount();expect(entry.stop).toHaveBeenCalledTimes(1);entry.resolve();await tick();
});
