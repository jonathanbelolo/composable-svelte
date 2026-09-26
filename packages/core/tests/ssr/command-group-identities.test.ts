import {beforeAll,afterAll,it,expect} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
let server:ViteDevServer;let Fixture:import('svelte').Component;let render:typeof import('svelte/server').render;
beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});({default:Fixture}=await server.ssrLoadModule('/tests/fixtures/CommandGroupIdentities.svelte'));({render}=await server.ssrLoadModule('svelte/server'));});
afterAll(async()=>{await server?.close();});
it('B002-009 renders unique single-ID references and deterministic SSR identities without browser globals',()=>{
 expect(typeof window).toBe('undefined');const first=render(Fixture).body;expect(render(Fixture).body).toBe(first);
 const ids=[...first.matchAll(/ id="([^"]+)"/g)].map(match=>match[1]!);const refs=[...first.matchAll(/ aria-labelledby="([^"]+)"/g)].map(match=>match[1]!);
 expect(ids).toHaveLength(3);expect(new Set(ids).size).toBe(3);expect(refs).toEqual(ids);for(const id of ids)expect(id).not.toMatch(/\s/);
});
