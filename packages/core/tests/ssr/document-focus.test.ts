import { beforeAll, afterAll, it, expect } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

let server: ViteDevServer;
let Component: any,render: any;
const compileWarnings:string[]=[];
beforeAll(async()=>{
 const warn=console.warn;console.warn=(...parts:unknown[])=>{compileWarnings.push(parts.map(String).join(' '));};
 try{
  server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});
  ({default:Component}=await server.ssrLoadModule('/tests/test-components/DocumentFocusNested.svelte'));
  ({render}=await server.ssrLoadModule('svelte/server'));
 }finally{console.warn=warn;}
});
afterAll(async()=>{await server?.close();});

it('renders nested open dialogs deterministically without document or browser acquisition',async()=>{
 expect(typeof document).toBe('undefined');
 expect(compileWarnings.filter(message=>!message.startsWith('[baseline-browser-mapping]'))).toEqual([]);
 const first=render(Component).body,second=render(Component).body;
 expect(first).toBe(second);expect(first).toContain('data-inner-first');
 const artifact=new URL('../fixtures/document-focus-ssr.html',import.meta.url);
 expect(first).toBe(readFileSync(artifact,'utf8'));
});
