import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import Probe from './test-components/NavigationBoundaryProbe.svelte';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const fn of cleanup.reverse())await fn();cleanup.length=0;vi.restoreAllMocks();});
function setup(mode:'modal'|'primitive'|'stack',onBack=()=>{}){const target=document.createElement('div');document.body.append(target);const component=mount(Probe,{target,props:{mode,onBack}});flushSync();let live=true;const dispose=async()=>{if(!live)return;live=false;await unmount(component);target.remove();};cleanup.push(dispose);return {component,target,dispose};}
async function outside(target:HTMLElement){target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));await new Promise(resolve=>setTimeout(resolve,5));flushSync();}
function escape(target: EventTarget = document.activeElement ?? document){const e=new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});target.dispatchEvent(e);flushSync();return e;}
describe('public navigation boundary lifetimes',()=>{
 it('public Modal can enable outside dismissal after mounting disabled, and toggle repeatedly',async()=>{const {component,target}=setup('modal');const node=target.querySelector<HTMLElement>('[data-testid=outside]')!;await outside(node);expect(component.dismissals()).toBe(0);component.setDisabled(false);flushSync();await outside(node);expect(component.dismissals()).toBe(1);component.setDisabled(true);flushSync();await outside(node);expect(component.dismissals()).toBe(1);component.setDisabled(false);flushSync();await outside(document.querySelector<HTMLElement>('[data-testid=inside]')!);expect(component.dismissals()).toBe(1);await outside(node);expect(component.dismissals()).toBe(2);});
 // ModalPrimitive updates a retained coordinator handle through replaceDismissal; a same-owner content refresh must not churn the document listener.
 it('same-owner content replacement retains one listener; unmount removes it and cancels its queued callback',async()=>{const add=vi.spyOn(document,'addEventListener');const remove=vi.spyOn(document,'removeEventListener');const {component,target,dispose}=setup('primitive');component.setDisabled(false);flushSync();const pointers=()=>add.mock.calls.filter(call=>call[0]==='pointerdown');expect(pointers()).toHaveLength(1);const listener=pointers()[0]![1];component.replaceContent();flushSync();expect(pointers()).toHaveLength(1);expect(remove.mock.calls.filter(call=>call[0]==='pointerdown'&&call[1]===listener)).toHaveLength(0);const node=target.querySelector<HTMLElement>('[data-testid=outside]')!;await outside(node);expect(component.dismissals()).toBe(1);node.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));await dispose();await new Promise(resolve=>setTimeout(resolve,5));expect(component.dismissals()).toBe(1);expect(remove.mock.calls.filter(call=>call[0]==='pointerdown'&&call[1]===listener)).toHaveLength(1);});
 it('public NavigationStack escape ownership sequence: visible two-screen stack owns/prevents once; store null; stale scoped store state null; hidden destination; one-screen stack; restored two-screen stack; unmount',async()=>{
  const back=vi.fn();
  const {component,target,dispose}=setup('stack',back);
  const node=target.querySelector<HTMLElement>('[data-testid=outside]')!;
  node.focus();

  // visible two-screen stack owns/prevents once
  const e1=escape(node);
  expect(e1.defaultPrevented,'visible two-screen stack owns/prevents once').toBe(true);
  expect(back,'visible two-screen stack owns/prevents once').toHaveBeenCalledTimes(1);

  // store null
  component.setAbsent(true);
  flushSync();
  const e2=escape(node);
  expect(e2.defaultPrevented,'store null').toBe(false);
  expect(back,'store null').toHaveBeenCalledTimes(1);

  // stale scoped store state null
  component.setAbsent(false);
  component.hide();
  flushSync();
  const e3=escape(node);
  expect(e3.defaultPrevented,'stale scoped store state null').toBe(false);
  expect(back,'stale scoped store state null').toHaveBeenCalledTimes(1);

  // hidden destination
  expect(target.querySelector('[role=navigation]'),'hidden destination').toBeNull();
  const e4=escape(node);
  expect(e4.defaultPrevented,'hidden destination').toBe(false);
  expect(back,'hidden destination').toHaveBeenCalledTimes(1);

  // one-screen stack
  component.show();
  component.setScreens([{id:'only'}]);
  flushSync();
  const e5=escape(node);
  expect(e5.defaultPrevented,'one-screen stack').toBe(false);
  expect(back,'one-screen stack').toHaveBeenCalledTimes(1);

  // restored two-screen stack
  component.setScreens([{id:'a'},{id:'b'}]);
  flushSync();
  const e6=escape(node);
  expect(e6.defaultPrevented,'restored two-screen stack').toBe(true);
  expect(back,'restored two-screen stack').toHaveBeenCalledTimes(2);

  // unmount
  await dispose();
  const e7=escape(document);
  expect(e7.defaultPrevented,'unmount').toBe(false);
  expect(back,'unmount').toHaveBeenCalledTimes(2);
 });
});
