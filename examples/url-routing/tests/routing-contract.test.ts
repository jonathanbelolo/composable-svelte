import {afterEach,expect,it} from 'vitest';
import {mount,unmount,flushSync,tick} from 'svelte';
import App from '../src/App.svelte';
let cleanup:Array<()=>void|Promise<void>>=[];
afterEach(async()=>{for(const release of cleanup.splice(0).reverse())await release();});
function start(path:string){
 history.replaceState(null,'',path);
 const target=document.createElement('div');document.body.append(target);
 const app=mount(App,{target,props:{url:location.href}});flushSync();
 cleanup.push(async()=>{await unmount(app);target.remove();});return target;
}
it('Back reaches the root entry without a routing echo and Forward reaches the item',async()=>{
 const target=start('/');
 target.querySelector<HTMLButtonElement>('.item-card')!.click();flushSync();await tick();
 expect(location.pathname).toBe('/inventory/item/1');
 const back=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));
 history.back();await back;flushSync();await tick();
 expect(location.pathname).toBe('/');
 const forward=new Promise<void>(resolve=>window.addEventListener('popstate',()=>resolve(),{once:true}));
 history.forward();await forward;flushSync();await tick();
 expect(location.pathname).toBe('/inventory/item/1');
 expect(target.querySelector('.modal')).not.toBeNull();
});
it('unknown item deep link has explicit recovery content',()=>{
 const target=start('/inventory/item/missing');
 expect(target.textContent).toContain('Item not found');
 const recover=[...target.querySelectorAll('button')].find(b=>b.textContent==='Back to inventory');
 expect(recover).toBeDefined();recover!.click();flushSync();
 expect(location.pathname).toBe('/inventory');
 expect(target.textContent).not.toContain('Item not found');
});
it('item buttons contain phrasing content and retain native button activation',()=>{
 const target=start('/inventory');const button=target.querySelector<HTMLButtonElement>('.item-card')!;
 expect(button.querySelector('div,h1,h2,h3,h4,h5,h6')).toBeNull();
 expect(button.tagName).toBe('BUTTON');expect(button.textContent).toContain('Laptop');
 button.click();flushSync();expect(location.pathname).toBe('/inventory/item/1');
});
it('releases route ownership when the application is removed and can mount a new independent root',async()=>{
 const first=start('/inventory/item/1');
 expect(first.textContent).toContain('Laptop');
 for(const release of cleanup.splice(0).reverse())await release();
 const second=start('/inventory/item/2');
 expect(second.textContent).toContain('Office Chair');
 const close=second.querySelector<HTMLButtonElement>('.close-button');
 expect(close).not.toBeNull();close!.click();flushSync();
 expect(location.pathname).toBe('/inventory');
});

it('recovers from a same-origin leading-double-slash deep link without a mount error',()=>{
 const target=start(`${location.origin}//missing`);
 expect(target.textContent).toContain('Page not found');
 expect(location.pathname).toBe('/not-found');
});
