import { afterEach, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { enrollLayer, type DismissalIdentity, type LayerHandle } from '../src/lib/actions/dismissalCoordinator.js';

const cleanup:Array<()=>void>=[];
afterEach(async()=>{for(const release of cleanup.splice(0).reverse())release();await tick();});
function node(html='<button>Inside</button>'){const value=document.createElement('section');value.innerHTML=html;document.body.append(value);cleanup.push(()=>value.remove());return value;}
function enroll(options:Parameters<typeof enrollLayer>[0]):LayerHandle{const handle=enrollLayer(options);cleanup.push(()=>handle.release(false));return handle;}
function pointer(target:EventTarget){target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,composed:true}));}
const settle=()=>new Promise(resolve=>setTimeout(resolve,20));
function tokens(){const parent:DismissalIdentity=Object.freeze({parent:undefined});return{parent,child:()=>Object.freeze({parent}) as DismissalIdentity};}

it('R10-06 a retired linked passive focus descendant no longer shields its pointer-owning ancestor',async()=>{
 const ancestry=tokens(),parent=node(),child=node(),dismissed=vi.fn();
 enroll({node:parent,ancestry:ancestry.parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});
 const passive=enroll({node:child,ancestry:ancestry.child(),focus:{node:child,modal:false,contain:false,autoFocus:false}});
 await tick();pointer(child.firstElementChild!);await settle();expect(dismissed).not.toHaveBeenCalled();
 passive.setFocusActive(false);pointer(child.firstElementChild!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});

it('R10-06 a stale linked passive descendant shields again only after refresh',async()=>{
 const ancestry=tokens(),parent=node(),child=node(),dismissed=vi.fn();let identity=1;
 enroll({node:parent,ancestry:ancestry.parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});
 const passive=enroll({node:child,ancestry:ancestry.child(),identity:()=>identity,focus:{node:child,modal:false,contain:false,autoFocus:false}});
 await tick();identity=2;pointer(child.firstElementChild!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
 passive.refresh();await tick();pointer(child.firstElementChild!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});

it('R10-07 a linked disabled bare node without focus does not become a regional shield',async()=>{
 const ancestry=tokens(),parent=node(),bare=node(),dismissed=vi.fn();
 enroll({node:parent,ancestry:ancestry.parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});
 enroll({node:bare,ancestry:ancestry.child(),onPointerOutside:vi.fn(),pointerEnabled:()=>false});
 await tick();pointer(bare.firstElementChild!);await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});

it('R10-07 delivery retry yields when a healthy linked sibling contains the captured target',async()=>{
 const ancestry=tokens(),parent=node(),armed=node(),sibling=node(),parentDismissed=vi.fn(),armedDismissed=vi.fn(),reported=vi.spyOn(console,'error').mockImplementation(()=>{});let fault=false;
 cleanup.push(()=>reported.mockRestore());
 enroll({node:parent,priority:1,ancestry:ancestry.parent,onPointerOutside:parentDismissed,focus:{node:parent,modal:true}});
 enroll({node:sibling,priority:1,ancestry:ancestry.child(),focus:{node:sibling,modal:false,contain:false,autoFocus:false}});
 enroll({node:armed,priority:2,ancestry:ancestry.child(),onPointerOutside:armedDismissed,identity:()=>{if(fault)throw new Error('armed');return 1;},focus:{node:armed,modal:false,contain:false,autoFocus:false}});
 await tick();pointer(sibling.firstElementChild!);fault=true;await settle();
 expect(armedDismissed).not.toHaveBeenCalled();expect(parentDismissed).not.toHaveBeenCalled();expect(reported).toHaveBeenCalledTimes(1);
});

it('R10-07 a linked focus node inside open shadow is recognized from the composed path',async()=>{
 const ancestry=tokens(),parent=node(),host=document.createElement('div'),shadow=host.attachShadow({mode:'open'}),focusNode=document.createElement('section'),target=document.createElement('button'),dismissed=vi.fn();
 focusNode.append(target);shadow.append(focusNode);document.body.append(host);cleanup.push(()=>host.remove());
 enroll({node:parent,ancestry:ancestry.parent,onPointerOutside:dismissed,focus:{node:parent,modal:true}});
 enroll({node:host,ancestry:ancestry.child(),focus:{node:focusNode,modal:false,contain:false,autoFocus:false}});
 await tick();pointer(target);await settle();expect(dismissed).not.toHaveBeenCalled();
});

it('R10-RD1 token-bearing owner reads its linked focus member but not unrelated focus identities',async()=>{
 const ancestry=tokens(),owner=node(),linked=node(),unlinked=node(),plain=node(),dismissed=vi.fn();
 const linkedIdentity=vi.fn(()=>1),unlinkedIdentity=vi.fn(()=>1),plainIdentity=vi.fn(()=>1);
 enroll({node:owner,ancestry:ancestry.parent,onPointerOutside:dismissed,focus:{node:owner,modal:true}});
 enroll({node:linked,ancestry:ancestry.child(),identity:linkedIdentity,focus:{node:linked,modal:false,contain:false,autoFocus:false}});
 enroll({node:unlinked,identity:unlinkedIdentity,focus:{node:unlinked,modal:false,contain:false,autoFocus:false}});
 enroll({node:plain,identity:plainIdentity});
 await tick();linkedIdentity.mockClear();unlinkedIdentity.mockClear();plainIdentity.mockClear();
 pointer(document.body);
 expect(linkedIdentity).toHaveBeenCalledTimes(1);
 expect(unlinkedIdentity).not.toHaveBeenCalled();
 expect(plainIdentity).not.toHaveBeenCalled();
 await settle();expect(dismissed).toHaveBeenCalledTimes(1);
});

it('R10-RD1 a delivery phase memoized armed fault retains retry fall-through',async()=>{
 const passiveNode=node(),triggerNode=node(),healthyNode=node(),armedNode=node();
 const reported=vi.spyOn(console,'error').mockImplementation(()=>{});cleanup.push(()=>reported.mockRestore());
 let delivery=false,fault=false,retired=false,reportsAtDismissal=0;
 const healthyDismissed=vi.fn(()=>{reportsAtDismissal=reported.mock.calls.length;});
 const passive=enroll({node:passiveNode,focus:{node:passiveNode,modal:false,contain:false,autoFocus:false}});
 enroll({node:triggerNode,priority:0,onPointerOutside:vi.fn(),pointerEnabled:()=>{
  if(delivery&&!retired){retired=true;passive.setFocusActive(false);}return true;
 }});
 enroll({node:healthyNode,priority:1,onPointerOutside:healthyDismissed});
 enroll({node:armedNode,priority:3,onPointerOutside:vi.fn(),identity:()=>{if(fault)throw new Error('armed');return 1;},focus:{node:armedNode,modal:true,autoFocus:false}});
 await tick();pointer(document.body);delivery=true;fault=true;await settle();
 expect(healthyDismissed).toHaveBeenCalledTimes(1);
 expect(reportsAtDismissal).toBe(1);
});
