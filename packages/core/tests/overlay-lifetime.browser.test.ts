import{afterEach,it,expect,vi}from'vitest';
import{mount,unmount,flushSync}from'svelte';
import OverlayLifetime from'./fixtures/OverlayLifetime.svelte';
import{animateBackdropIn}from'../src/lib/animation/animate';
const dispose:Array<()=>void>=[];afterEach(async()=>{for(const f of dispose.splice(0))f();});
async function setup(kind:'modal'|'sheet'|'drawer'|'alert'){
 const completed=vi.fn();const target=document.createElement('div');document.body.append(target);const component=mount(OverlayLifetime,{target,props:{kind,onComplete:completed}});flushSync();dispose.push(()=>{void unmount(component);target.remove();});await vi.waitFor(()=>expect(document.querySelector('[data-lifetime-backdrop]')?.getAnimations().length).toBeGreaterThan(0));return{component,completed,content:document.querySelector<HTMLElement>('[data-lifetime-content]')!,backdrop:document.querySelector<HTMLElement>('[data-lifetime-backdrop]')!};
}
async function completionBoundary(){const element=document.createElement('div');document.body.append(element);try{await animateBackdropIn(element);}finally{element.remove();}await Promise.resolve();}
it.each(['modal','sheet','drawer','alert'] as const)('%s cancels native playback and suppresses completion after unmount',async kind=>{
 const{component,completed,content,backdrop}=await setup(kind);const animations=[...content.getAnimations(),...backdrop.getAnimations()];expect(animations.length).toBeGreaterThan(0);animations.forEach(animation=>animation.pause());component.hide();flushSync();expect.soft(animations.every(animation=>animation.playState==='idle')).toBe(true);
 animations.forEach(animation=>animation.finish());await completionBoundary();expect(completed).not.toHaveBeenCalled();
});
it.each(['modal','sheet','drawer','alert'] as const)('%s completes the replacement owner and survives a spring-config rerender',async kind=>{
 const{component,completed,backdrop}=await setup(kind);backdrop.getAnimations().forEach(animation=>animation.pause());component.replace('second');flushSync();component.updateConfig();flushSync();await vi.waitFor(()=>expect(completed).toHaveBeenCalledTimes(1),{timeout:2000});expect(completed).toHaveBeenCalledWith('presented:second');component.dismiss();flushSync();await vi.waitFor(()=>expect(completed).toHaveBeenCalledWith('dismissed:first'),{timeout:2000});expect(completed).toHaveBeenCalledTimes(2);
});
