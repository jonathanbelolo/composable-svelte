import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {createServer,type ViteDevServer} from 'vite';
import {svelte} from '@sveltejs/vite-plugin-svelte';
let server:ViteDevServer;let Fixture:import('svelte').Component<{kind:string;requests:(name:string)=>void;initialTop:boolean;initialNavigation:boolean}>;let render:typeof import('svelte/server').render;
beforeAll(async()=>{server=await createServer({configFile:false,logLevel:'silent',plugins:[svelte({configFile:false})],server:{middlewareMode:true,hmr:false},appType:'custom'});({default:Fixture}=await server.ssrLoadModule('/tests/fixtures/DismissalLayers.svelte'));({render}=await server.ssrLoadModule('svelte/server'));});
afterAll(async()=>{await server?.close();});
it.each(['modal','sheet','drawer','alert','popover'])('SSR %s plus inline navigation needs no document authority',kind=>{
 expect(typeof document).toBe('undefined');const requests=vi.fn();const html=render(Fixture,{props:{kind,requests,initialTop:true,initialNavigation:true}}).body;expect(html).toContain('data-child');expect(html).toContain('Sidebar');expect(requests).not.toHaveBeenCalled();
});
