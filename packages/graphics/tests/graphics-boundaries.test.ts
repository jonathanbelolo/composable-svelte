import {it,expect,vi,afterEach} from 'vitest';
import {mount,unmount,flushSync} from 'svelte';
import {NullEngine} from '@babylonjs/core';
import {createStore} from '@composable-svelte/core';
import {BabylonAdapter} from '../src/adapters/babylon-adapter.js';
import {graphicsReducer} from '../src/core/reducer.js';
import {createInitialGraphicsState} from '../src/core/initial-state.js';
import SceneDimensions from './fixtures/SceneDimensions.svelte';
import {PositionTracker} from '../src/lib/overlay/position-tracker.js';
import {createOverlay} from '../src/lib/overlay/webgl-overlay.js';
import {DeviceCapabilities} from '../src/lib/utils/device-capabilities.js';
import {ShaderCompiler,type CompiledProgram} from '../src/lib/shaders/shader-compiler.js';
import {ShaderProgramManager} from '../src/lib/shaders/shader-program-manager.js';
import {RenderPipeline} from '../src/lib/shaders/render-pipeline.js';
import {createFakeGL,installFakeGL,installFakeObservers} from './helpers/fake-gl.js';
const undo:Array<()=>void>=[];
afterEach(()=>{for(const f of undo.splice(0).reverse())f();vi.restoreAllMocks();vi.useRealTimers();document.body.innerHTML='';});
it('public resize recomputes orthographic projection after canvas aspect changes',()=>{
 const engine=new NullEngine({renderWidth:800,renderHeight:600,textureSize:512,deterministicLockstep:false,lockstepMaxSteps:1});
 const adapter=new BabylonAdapter();const scene=adapter.attachEngine(engine);undo.push(()=>adapter.dispose());
 adapter.updateCamera({type:'orthographic',position:[0,0,10],lookAt:[0,0,0],orthoSize:5});
 expect(scene.activeCamera!.orthoRight).toBeCloseTo(20/3);engine.getRenderWidth=()=>1200;adapter.resize();expect(scene.activeCamera!.orthoRight).toBe(10);
});
it('Scene reacts to numeric and CSS dimension changes',async()=>{
 vi.spyOn(BabylonAdapter.prototype,'initialize').mockImplementation(()=>new Promise(()=>{}));
 const store=createStore({initialState:createInitialGraphicsState(),reducer:graphicsReducer,dependencies:{}});
 const target=document.createElement('div');document.body.append(target);const component=mount(SceneDimensions,{target,props:{store}});
 try{flushSync();const box=target.querySelector<HTMLElement>('.scene-container')!;expect(box.style.width).toBe('100px');flushSync(()=>component.resize());expect(box.style.width).toBe('75%');expect(box.style.height).toBe('450px');}
 finally{await unmount(component);store.destroy();}
});
it.each(['scroll','resize'])('tracks bounds after captured %s and removes listeners on destroy',kind=>{
 undo.push(installFakeObservers());vi.useFakeTimers();const tracker=new PositionTracker();undo.push(()=>tracker.destroy());
 const parent=document.createElement('div'),child=document.createElement('div');parent.append(child);document.body.append(parent);
 let x=0;child.getBoundingClientRect=()=>({left:x,top:0,width:20,height:30} as DOMRect);
 const changed=vi.fn();tracker.onPositionUpdate(changed);tracker.track('child',child);changed.mockClear();x=50;
 (kind==='scroll'?parent:window).dispatchEvent(new Event(kind,{bubbles:false}));vi.advanceTimersByTime(30);
 expect(changed).toHaveBeenLastCalledWith('child',expect.objectContaining({x:50}));tracker.destroy();changed.mockClear();
 (kind==='scroll'?parent:window).dispatchEvent(new Event(kind));vi.advanceTimersByTime(30);expect(changed).not.toHaveBeenCalled();
});
it('getContext rejects a lost context and recovers after restoration',()=>{
 const fake=createFakeGL();undo.push(installFakeGL(fake),installFakeObservers());const overlay=createOverlay({});if(!('destroy'in overlay))throw Error('setup');undo.push(()=>overlay.destroy());
 expect(overlay.getContext()).toBe(fake.getContext(overlay.getCanvas()));fake.getContext(overlay.getCanvas()).getExtension('WEBGL_lose_context')!.loseContext();expect(overlay.getContext()).toBeNull();fake.getContext(overlay.getCanvas()).getExtension('WEBGL_lose_context')!.restoreContext();expect(overlay.getContext()).toBe(fake.getContext(overlay.getCanvas()));
});
it('releases the temporary WebGL2 capability probe',()=>{
 const fake=createFakeGL();const loseContext=vi.fn();vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation((()=>({getExtension:()=>({loseContext})})) as never);
 expect(new DeviceCapabilities(fake.context).supportsWebGL2).toBe(true);expect(loseContext).toHaveBeenCalledTimes(1);
});
it('resets bounded geometry before a subsequent fullscreen draw',()=>{
 const fake=createFakeGL();const pipeline=new RenderPipeline(fake.context,new ShaderProgramManager(fake.context));undo.push(()=>pipeline.destroy());
 const buffer=fake.argsFor('bindBuffer')[0]![1];const original=Array.from(fake.bufferContents(buffer)!);
 const program={program:{},attributes:new Map(),uniforms:new Map()} as unknown as CompiledProgram;
 pipeline.render(program,{} as WebGLTexture,{bounds:{x:5,y:5,width:10,height:10},canvasWidth:100,canvasHeight:100});expect(Array.from(fake.bufferContents(buffer)!)).not.toEqual(original);
 pipeline.render(program,{} as WebGLTexture);expect(Array.from(fake.bufferContents(buffer)!)).toEqual(original);
});
it('injects missing precision before validation and passes it to GL',()=>{
 const fake=createFakeGL();const compiler=new ShaderCompiler(fake.context);const result=compiler.compileShader('void main() { gl_FragColor = vec4(1.0); }',fake.context.FRAGMENT_SHADER);
 expect(result.error).toBeUndefined();expect(result.shader).toBeTruthy();expect(fake.argsFor('shaderSource')[0]![1]).toContain('precision mediump float;');
 if(result.shader)fake.context.deleteShader(result.shader);
});
it('rebuilds resource managers against the context returned after restoration',()=>{
 const first=createFakeGL();undo.push(installFakeGL(first),installFakeObservers());const overlay=createOverlay({});if(!('destroy'in overlay))throw Error('setup');undo.push(()=>overlay.destroy());
 const canvas=first.canvas!;const extension=first.getContext(canvas).getExtension('WEBGL_lose_context')!;extension.loseContext();
 const next=createFakeGL();undo.push(installFakeGL(next));extension.restoreContext();
 expect(overlay.getContext()).toBe(next.getContext(canvas));expect(next.live('buffer')).toBe(2);expect(first.live('buffer')).toBe(0);
});
