import {expect,it,vi} from 'vitest';
import {createRemovedContentDismissal} from '../src/lib/navigation-components/primitives/presentationCompletion.js';

const pair={status:'dismissing',content:{id:1}};
const presentingPair={status:'presenting',content:pair.content};
const presentedPair={status:'presented',content:pair.content};
const microtask=()=>Promise.resolve();

it('H16a helper never settles content that was not bound under the dismissing pair',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();
 seam.contentLost(pair,null,complete);await microtask();expect(complete).not.toHaveBeenCalled();
});

it('H16a helper cancels a pending removed-content settlement on replacement or teardown',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();seam.contentBound(pair);
 const cancel=seam.contentLost(pair,null,complete);expect(cancel).toBeTypeOf('function');cancel?.();
 await microtask();expect(complete).not.toHaveBeenCalled();
});

it('H16a helper refuses a changed presentation pair',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();seam.contentBound(pair);
 seam.contentLost({status:'dismissing',content:{id:2}},null,complete);await microtask();expect(complete).not.toHaveBeenCalled();
});

it('H16a helper settles the witnessed live pair once and respects its completed marker',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();seam.contentBound(pair);
 let completed:{status:string;content:unknown}|null=null;
 seam.contentLost(pair,completed,value=>{completed=value;complete(value);});await microtask();
 expect(complete).toHaveBeenCalledTimes(1);expect(completed).toEqual(pair);
 seam.contentLost(pair,completed,complete);await microtask();expect(complete).toHaveBeenCalledTimes(1);
});

it('H16a helper transfers a bound-content witness forward from presenting to dismissing once and never completes presenting',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();
 seam.contentBound(presentingPair);
 let completed:{status:string;content:unknown}|null=null;
 seam.contentLost(pair,completed,value=>{completed=value;complete(value);});
 await microtask();
 expect(complete).toHaveBeenCalledTimes(1);
 expect(completed).toEqual(pair);
 expect(complete).toHaveBeenCalledWith(pair);
 seam.contentLost(pair,completed,complete);
 seam.contentLost(presentingPair,completed,complete);
 await microtask();
 expect(complete).toHaveBeenCalledTimes(1);
});

it('H16a helper rejects reverse dismissing-to-presenting transition across independent seams',async()=>{
 const complete=vi.fn(),presenting=createRemovedContentDismissal(),dismissing=createRemovedContentDismissal();
 dismissing.contentBound(pair);dismissing.contentLost(presentingPair,null,complete);
 presenting.contentLost(pair,null,complete);
 await microtask();expect(complete).not.toHaveBeenCalled();
});

it('H16a helper refuses forward witness transfer when content differs',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();
 seam.contentBound(presentingPair);
 seam.contentLost({status:'dismissing',content:{id:2}},null,complete);
 await microtask();expect(complete).not.toHaveBeenCalled();
});

it('H16a helper settles a presenting pair once and respects its completed marker',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();seam.contentBound(presentingPair);
 let completed:{status:string;content:unknown}|null=null;
 seam.contentLost(presentingPair,completed,value=>{completed=value;complete(value);});await microtask();
 expect(complete).toHaveBeenCalledTimes(1);expect(completed).toEqual(presentingPair);
 seam.contentLost(presentingPair,completed,complete);await microtask();expect(complete).toHaveBeenCalledTimes(1);
});

it('H16a helper transfers witness from presented to dismissing but refuses nontransitional settlement',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();
 seam.contentBound(presentedPair);
 seam.contentLost(presentedPair,null,complete);
 seam.contentLost(presentingPair,null,complete);
 await microtask();expect(complete).not.toHaveBeenCalled();
 // Invalid settlement retired the prior witness. A new observation is required.
 seam.contentBound(presentedPair);
 seam.contentLost(pair,null,complete);
 await microtask();
 expect(complete).toHaveBeenCalledTimes(1);
 expect(complete).toHaveBeenCalledWith(pair);
});

it('H16a helper rejects a live presented-to-presenting transition and retires it until a new observation',async()=>{
 const seam=createRemovedContentDismissal(),complete=vi.fn();
 seam.contentBound(presentedPair);
 seam.contentLost(presentingPair,null,complete);
 await microtask();expect(complete).not.toHaveBeenCalled();
 // Rejection must retire the witness; a later forward transition cannot reuse it.
 seam.contentLost(pair,null,complete);
 await microtask();expect(complete).not.toHaveBeenCalled();
 seam.contentBound(presentedPair);
 seam.contentLost(pair,null,complete);
 await microtask();expect(complete).toHaveBeenCalledTimes(1);expect(complete).toHaveBeenCalledWith(pair);
});
