import type {ChildView} from '../src/lib/navigation/managed-integration.js';
import type {TargetRegistry} from '../src/lib/application/renderer/target-registry.js';
import {targetFor} from '../src/lib/application/renderer/target-registry.js';
import {slot,type Child,type ChildAction} from './fixtures/Host0bModel.js';
declare const registry:TargetRegistry;
declare const view:ChildView<Child,ChildAction>;
declare const wrong:ChildView<{title:string},{type:'rename'}>;
declare const node:HTMLElement;
const target=targetFor(slot,['opacity']);
const handle=registry.register(view,target,node,{opacity:'0.3'});
handle.lease('opacity').write('0.5');
// @ts-expect-error undeclared property cannot obtain authority
handle.lease('transform');
// @ts-expect-error missing required stable projection
registry.register(view,target,node,{});
// @ts-expect-error incompatible child schema cannot bind this target
registry.register(wrong,target,node,{opacity:'0.3'});
// @ts-expect-error arbitrary style channels are not supported by this bounded writer
targetFor(slot,['left']);
// @ts-expect-error handles do not expose raw elements
handle.element;
