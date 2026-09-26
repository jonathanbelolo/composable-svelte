import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
let server: ViteDevServer;
let Input: any;
let render: typeof import('svelte/server').render;
beforeAll(async () => {
 server = await createServer({ configFile: false, logLevel: 'silent', plugins: [svelte({configFile:false})], server: {middlewareMode:true,hmr:false}, appType:'custom' });
 ({default:Input}=await server.ssrLoadModule('/src/lib/components/ui/input/Input.svelte'));
 ({render}=await server.ssrLoadModule('svelte/server'));
});
afterAll(async()=>{await server?.close();});
it.each([['text','alice','alice'],['number',42,'42'],['number','007','007'],['text','a&"b','a&amp;&quot;b'],['text','','']])('SSR includes %s value %s', (type,value,attribute)=>{
 const html=render(Input,{props:{type,value,name:'field'}}).body;
 expect(html).toContain(`value="${attribute}"`);
});
