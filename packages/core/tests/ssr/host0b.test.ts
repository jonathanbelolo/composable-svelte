import {beforeAll,afterAll,it,expect} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {writeFileSync} from 'node:fs';
let server:ViteDevServer;
let Fixture:import('svelte').Component;
let render:typeof import('svelte/server').render;
beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});({default:Fixture}=await server.ssrLoadModule('/tests/fixtures/Host0bFixture.svelte'));({render}=await server.ssrLoadModule('svelte/server'));});
afterAll(async()=>{await server?.close();});
it('renders isolated requests with stable non-default projection and no DOM access',()=>{
 const keys=['window','document','requestAnimationFrame','matchMedia'] as const;
 const original=keys.map(key=>Object.getOwnPropertyDescriptor(globalThis,key));
 try{
  for(const key of keys)Object.defineProperty(globalThis,key,{configurable:true,get(){throw new Error(`Forbidden SSR ${key}`);}});
  const first=render(Fixture).body,second=render(Fixture).body;
  expect(first).toBe(second);expect(first).toContain('opacity: 0.3');
  writeFileSync('tests/fixtures/host0b-ssr.html',first);
 }finally{keys.forEach((key,i)=>{const descriptor=original[i];if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key);});}
});
it('successful borrowed-root SSR releases its host claim and permits repeated rendering',async()=>{
 const {default:Borrowed}=await server.ssrLoadModule('/tests/fixtures/Host0bBorrowed.svelte');const {definition}=await server.ssrLoadModule('/tests/fixtures/Host0bModel.ts');const {createStore}=await server.ssrLoadModule('/src/lib/store.svelte.ts');const {rendererOwner}=await server.ssrLoadModule('/src/lib/application/renderer/owner.ts');
 const store=createStore({initialState:{child:{opacity:'0.3'}},...definition});const owner=rendererOwner(store,definition.execution);
 try{render(Borrowed,{props:{owner}}).body;expect(store._runtime.resourceScope.size).toBe(0);render(Borrowed,{props:{owner}}).body;expect(store._runtime.resourceScope.size).toBe(0);}finally{store.destroy();}
});
it('failed borrowed-root SSR releases the host claim before retry',async()=>{
 const {default:Borrowed}=await server.ssrLoadModule('/tests/fixtures/Host0bBorrowed.svelte');const {definition}=await server.ssrLoadModule('/tests/fixtures/Host0bModel.ts');const {createStore}=await server.ssrLoadModule('/src/lib/store.svelte.ts');const {rendererOwner}=await server.ssrLoadModule('/src/lib/application/renderer/owner.ts');
 const store=createStore({initialState:{child:{opacity:'0.3'}},...definition});const owner=rendererOwner(store,definition.execution);
 try{expect(()=>render(Borrowed,{props:{owner,fail:true}}).body).toThrow('child setup failed');expect(store._runtime.resourceScope.size).toBe(0);render(Borrowed,{props:{owner}}).body;}finally{store.destroy();}
});
