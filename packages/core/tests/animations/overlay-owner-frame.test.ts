import{afterEach,it,expect,vi}from'vitest';
const playback=vi.hoisted(()=>({finished:Promise.resolve(),stop:vi.fn()}));
vi.mock('motion',()=>({animate:()=>playback}));
import{animateModalIn,animateModalOut,animateAlertIn,animateAlertOut,animateBackdropIn,animateBackdropOut}from'../../src/lib/animation/animate';
type Run=(e:HTMLElement,s:AbortSignal)=>Promise<void>;
const runs:Array<[string,Run]>=[['modal-in',(e,s)=>animateModalIn(e,undefined,s)],['modal-out',(e,s)=>animateModalOut(e,undefined,s)],['alert-in',(e,s)=>animateAlertIn(e,undefined,s)],['alert-out',(e,s)=>animateAlertOut(e,undefined,s)],['backdrop-in',animateBackdropIn],['backdrop-out',animateBackdropOut]];
afterEach(()=>{vi.unstubAllGlobals();vi.clearAllMocks();});
it.each(runs)('%s abort owns the final frame after playback has already completed',async(_name,run)=>{
 const frames=new Map<number,FrameRequestCallback>();let next=0;const cancel=vi.fn((id:number)=>frames.delete(id));vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next;});vi.stubGlobal('cancelAnimationFrame',cancel);
 const owner=new AbortController();let done=false;const promise=run(document.createElement('div'),owner.signal).then(()=>{done=true;});for(let i=0;i<10&&frames.size===0;i++)await Promise.resolve();expect(frames.size).toBe(1);expect(done).toBe(false);owner.abort();for(let i=0;i<10&&!done;i++)await Promise.resolve();expect(done).toBe(true);expect(cancel).toHaveBeenCalledWith(1);expect(frames.size).toBe(0);expect(playback.stop).not.toHaveBeenCalled();await promise;
});
