import {beforeAll,afterAll,it,expect} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {readFileSync,writeFileSync} from 'node:fs';
let server:ViteDevServer;let Fixture:import('svelte').Component;let render:typeof import('svelte/server').render;
beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});({default:Fixture}=await server.ssrLoadModule('/tests/test-components/TabsInstances.svelte'));({render}=await server.ssrLoadModule('svelte/server'));});
afterAll(async()=>{await server?.close();});
it('renders stable per-instance linked tab identities across server requests',()=>{
 expect(typeof window).toBe('undefined');
 const html=render(Fixture).body;expect(render(Fixture).body).toBe(html);
 const ids=[...html.matchAll(/ id="([^"]+)"/g)].map(match=>match[1]);
 expect(ids).toHaveLength(8);expect(new Set(ids).size).toBe(8);
 const fixture=new URL('../fixtures/tabs-identities-ssr.html',import.meta.url);
 if(process.env.UPDATE_TABS_SSR_FIXTURE==='1')writeFileSync(fixture,html);
 expect(readFileSync(fixture,'utf8')).toBe(html);
});
