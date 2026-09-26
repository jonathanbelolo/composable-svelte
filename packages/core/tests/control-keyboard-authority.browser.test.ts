import {afterEach, expect, it, vi} from 'vitest';
import {flushSync, mount, unmount} from 'svelte';
import Select from '../src/lib/components/ui/select/Select.svelte';
import Combobox from '../src/lib/components/ui/combobox/Combobox.svelte';

const releases:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const release of releases.splice(0).reverse())await release();});
const options=[{value:'a',label:'Alpha'},{value:'b',label:'Beta'}];
function key(node:EventTarget,key:string){const event=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});node.dispatchEvent(event);flushSync();return event;}
function setup(kind:'select'|'combobox',doc=document){
 const target=doc.createElement('div');doc.body.append(target);const changed=vi.fn();
 const app=kind==='select'?mount(Select,{target,props:{options,searchable:true,onchange:changed}}):mount(Combobox,{target,props:{options,onchange:changed}});
 releases.push(async()=>{await unmount(app);target.remove();});flushSync();
 return {target,changed};
}
it('Select opening key is not processed twice and unrelated keys do not navigate it',()=>{
 const {target,changed}=setup('select');const trigger=target.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;
 trigger.focus();key(trigger,'ArrowDown');expect(trigger.getAttribute('aria-expanded')).toBe('true');
 const items=target.querySelectorAll<HTMLElement>('[role=option]');expect(items).toHaveLength(2);expect(items[0]!.classList.contains('bg-accent')).toBe(false);
 const foreign=key(document.body,'ArrowDown');key(window,'Enter');expect(foreign.defaultPrevented).toBe(false);expect(changed).not.toHaveBeenCalled();expect(items[0]!.classList.contains('bg-accent')).toBe(false);
 const input=target.querySelector('input')!;key(input,'ArrowDown');expect(items[0]!.classList.contains('bg-accent')).toBe(true);
 key(input,'ArrowDown');expect(items[1]!.classList.contains('bg-accent')).toBe(true);key(input,'Enter');expect(changed).toHaveBeenCalledWith('b');expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
it('Select Escape restores the trigger from its searchable popup',()=>{
 const {target}=setup('select');const trigger=target.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;trigger.click();flushSync();
 const input=target.querySelector('input')!;expect(document.activeElement).toBe(input);key(input,'Escape');expect(document.activeElement).toBe(trigger);expect(trigger.getAttribute('aria-expanded')).toBe('false');
});
it('Select inside an iframe responds only to its own keyboard events',()=>{
 const frame=document.createElement('iframe');document.body.append(frame);releases.push(async()=>{frame.remove();});const doc=frame.contentDocument!;
 const {target,changed}=setup('select',doc);const trigger=target.querySelector<HTMLButtonElement>('[aria-haspopup=listbox]')!;trigger.click();flushSync();
 const items=target.querySelectorAll<HTMLElement>('[role=option]');key(window,'ArrowDown');expect(items[0]!.classList.contains('bg-accent')).toBe(false);
 const input=target.querySelector('input')!;key(input,'ArrowDown');expect(items[0]!.classList.contains('bg-accent')).toBe(true);key(input,'Enter');expect(changed).toHaveBeenCalledWith('a');
});
it.each(['input','option'] as const)('Combobox Escape from %s retains input focus and permits keyboard reopening',async focused=>{
 const {target}=setup('combobox');const input=target.querySelector('input')!;input.focus();flushSync();expect(target.querySelector('[role=listbox]')).not.toBeNull();
 const origin=focused==='input'?input:target.querySelector<HTMLButtonElement>('[role=option]')!;origin.focus();expect(document.activeElement).toBe(origin);
 key(origin,'Escape');expect(document.activeElement).toBe(input);
 await vi.waitFor(()=>expect(target.querySelector('[role=listbox]')).toBeNull());expect(document.activeElement).toBe(input);
 key(input,'ArrowDown');expect(target.querySelector('[role=listbox]')).not.toBeNull();expect(document.activeElement).toBe(input);
});
