// Bounded identity/zone-backed detectors. Activation and qualification belong to
// the orchestrator only after their independent controls pass.
import ts from 'typescript';
import {classifyPrimitive} from '../primitive-catalog.mjs';
import {derivedRune} from '../svelte-runes.mjs';
const RULES={routing:'routing/no-manual-browser-authority',presentation:'presentation/no-subscription-orchestration',reducers:'reducers/pure-decisions',resources:'resources/no-unowned-infrastructure',motion:'motion/no-competing-playback'};
const DOCS={routing:'application-routing.md',presentation:'application-ownership.md',reducers:'application-contract.md',resources:'managed-execution.md',motion:'application-motion.md'};
const MUTATORS=new Set(['push','pop','shift','unshift','splice','sort','reverse','fill','copyWithin','set','delete','clear','add']);
// These identities denote callables; obtaining them does not execute I/O.
// Resource objects and projected values still retain the existing read checks.
const CALLABLE_RESOURCES=new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','Worker','SharedWorker','BroadcastChannel','Notification','setTimeout','setInterval','requestIdleCallback','navigator.sendBeacon']);
const LOCATIONS=new Set(['href','hash','pathname','search','host','hostname','port','protocol','location']);

export function evaluateSemanticRules({context,flow,zones}) {
 const {domain,authority}=flow;const findings=[],errors=[],limitations=[];const seen=new Set();
 const descriptions=value=>[...value].map(a=>domain.describe(a));
 const has=(value,kind,ids)=>descriptions(value).some(d=>d.kind===kind&&(!ids||ids.includes(d.id)));
 function emit(family,detector,node,message,zone) {
  const info=context.info(node);if(!info)return;
  const attributions=zone?zones.attributions(node).get(zone):null;
  const entries=attributions?.length?attributions:[{entryPath:info.module.path,chain:[]}];
  for(const entry of entries) {
   const key=JSON.stringify([family,detector,info.module.path,context.span(node).start.offset,entry.entryPath,entry.chain]);if(seen.has(key))continue;seen.add(key);
   findings.push({rule:RULES[family],detector,path:info.module.path,span:context.span(node),message,documentation:DOCS[family],...entry});
  }
 }
 function error(node,construct,message) {
  const info=context.info(node);if(!info)return;const key=JSON.stringify(['error',info.id,construct]);if(seen.has(key))return;seen.add(key);
  errors.push({code:'unsupported-construct',construct,path:info.module.path,span:context.span(node),message});
 }
 function literal(value) {return descriptions(value).filter(d=>d.kind==='literal').map(d=>JSON.parse(d.id));}
 function deep(value,seenAtoms=new Set()) {
  let result=domain.empty();
  for(const atom of value){if(seenAtoms.has(atom))continue;seenAtoms.add(atom);result=domain.join(result,new Set([atom]));if(domain.describe(atom).kind==='heap')result=domain.join(result,deep(authority.member(new Set([atom]),'*'),seenAtoms));}
  return result;
 }
 function browserMethods(value) {
  const result=[];
  function visit(atom,seenAtoms=new Set()) {
   if(seenAtoms.has(atom))return;seenAtoms.add(atom);const parts=authority.methodParts(atom);if(!parts)return;
   if(['call','apply','bind'].includes(parts[1])){visit(parts[0],seenAtoms);return;}
   const receiver=domain.describe(parts[0]);if(receiver.kind==='authority')result.push({receiver:receiver.id,method:parts[1]});
  }
  for(const atom of value)visit(atom);return result;
 }
 function memberTarget(target) {
  if(ts.isPropertyAccessExpression(target))return {value:flow.value(target.expression),key:target.name.text};
  if(ts.isElementAccessExpression(target))return {value:flow.value(target.expression),key:ts.isStringLiteralLike(target.argumentExpression)||ts.isNumericLiteral(target.argumentExpression)?target.argumentExpression.text:'*'};
  if(ts.isIdentifier(target)&&!context.symbols.bindingOf(target)&&target.text==='location')return {value:authority.authority('location'),key:'location'};
  return null;
 }
 function storeRead(node) {
  let yes=false;
  function visit(n){if(yes||ts.isFunctionLike(n))return;if(ts.isExpression(n)&&has(flow.value(n),'authority',['app','store','view','legacy-view'])){yes=true;return;}ts.forEachChild(n,visit);}
  visit(node);return yes;
 }
 function runeCall(node,names) {
  if(!ts.isCallExpression(node))return false;let name=node.expression;while(ts.isPropertyAccessExpression(name))name=name.expression;
  return ts.isIdentifier(name)&&!context.symbols.bindingOf(name)&&names.includes(name.text);
 }
 function inLifecycle(node) {
  if(zones.inLifecycle(node))return true;
  for(let parent=node.parent;parent;parent=parent.parent)if(runeCall(parent,['$effect','$derived']))return true;
  return false;
 }
 const localState=new Set();
 for(const b of context.symbols.bindings)if(b.initializers.some(i=>runeCall(i.node,['$state'])))localState.add(b);
 function stateTarget(node) {while(ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node))node=node.expression;return ts.isIdentifier(node)&&localState.has(context.symbols.bindingOf(node));}
 for(const record of context.nodes) {
  const node=record.node;if(!record.runtime)continue;
  const membership=zones.attributions(node);
  if(context.isReference(node)||ts.isPropertyAccessExpression(node)||ts.isElementAccessExpression(node)) {
   const value=flow.value(node);const primitives=classifyPrimitive(value,{domain,authority});
   if(primitives.some(p=>p.kind==='frame'))emit('motion','frame-scheduler',node,'Use managed motion instead of owning a frame scheduler.');
   for(const zone of ['decision','effect'])if(membership.has(zone)) {
    if(primitives.some(p=>['resource','browser','clock','random','frame','web-animation'].includes(p.kind)))emit('reducers',zone==='decision'?'impure-primitive':'effect-body-primitive',node,'Use pure decisions and injected services for external work.',zone);
    if(zone==='decision'&&has(value,'authority',['app','store','view','legacy-view']))emit('reducers','store-authority-in-reducer',node,'Reducers receive state, actions and dependencies rather than live store authority.',zone);
   }
   if(primitives.some(p=>p.kind==='resource'&&!CALLABLE_RESOURCES.has(p.name)))for(const zone of ['view','module'])if(membership.has(zone))emit('resources',zone==='view'?'view-io':'module-load-io',node,'Defer external work through an injected service and a managed effect.',zone);
   if(has(value,'unknown-member'))error(node,'unknown-authority-member','This authority member exceeds the supported static projection; use an explicit supported member.');
  }
  if(runeCall(node,['$state'])&&node.arguments[0]&&storeRead(node.arguments[0]))emit('presentation','state-mirror',node,'Render derived store projections instead of copying them into local reactive state.');
  if(ts.isDeleteExpression(node))checkAssignment(node,node.expression,null);
 }
 function checkAssignment(node,target,rhs) {
  const member=memberTarget(target);const membership=zones.attributions(node);
  if(member) {
   if(has(member.value,'authority',['location'])||has(member.value,'authority',['window','document'])&&LOCATIONS.has(member.key))emit('routing','location-write',node,'Dispatch navigation intent through the application routing contract.');
   if(has(member.value,'authority',['window'])&&['onpopstate','onhashchange'].includes(member.key))emit('routing','traversal-listener',node,'Let the managed routing bridge own browser traversal.');
   if(has(member.value,'state')&&membership.has('decision'))emit('reducers','state-mutation',node,'Return new state without mutating existing state descendants.','decision');
   if(member.key==='*'&&has(deep(rhs??domain.empty()),'authority'))error(node,'authority-stored-in-nonliteral-property','Store authority only in statically inspectable properties.');
  }
  if(inLifecycle(node)&&stateTarget(target)&&rhs&&has(deep(rhs),'authority',['app','store','view','legacy-view']))emit('presentation','lifecycle-mirror',node,'Use derived store projections rather than lifecycle state synchronization.');
  if(inLifecycle(node)&&stateTarget(target)&&ts.isBinaryExpression(node)&&storeRead(node.right))emit('presentation','lifecycle-mirror',node,'Use derived store projections rather than lifecycle state synchronization.');
 }
 for(const assignment of flow.assignments.values())for(const target of assignment.targets??[assignment.target])checkAssignment(assignment.node,target,assignment.value);
 for(const original of flow.calls.values()) for(const invocation of original.invocations?.length?original.invocations:[original]) {
  const call={...original,...invocation,receiver:invocation.receiver??original.receiver};
  const {node,args,callee}=call;const membership=zones.attributions(node);const primitives=classifyPrimitive(callee,{domain,authority});
  // Normalized invocation records include the actual target of call/apply and
  // invoked bound functions. A bind record itself only constructs a callable.
  const invokedResources=new Set([...callee].filter(atom=>!authority.methodParts(atom)));
  if(classifyPrimitive(invokedResources,{domain,authority}).some(p=>p.kind==='resource'&&CALLABLE_RESOURCES.has(p.name)))for(const zone of ['view','module'])if(membership.has(zone))emit('resources',zone==='view'?'view-io':'module-load-io',node,'Defer external work through an injected service and a managed effect.',zone);
  const methods=browserMethods(callee);const first=args[0]?.value??domain.empty();
  if(primitives.some(p=>p.kind==='web-animation'))emit('motion','web-animations',node,'Bind a managed motion recipe rather than starting competing playback.');
  if(primitives.some(p=>p.kind==='code-string'))error(node,'code-from-string','Code constructed from strings cannot be inspected.');
  if(primitives.some(p=>p.kind==='reflection')&&args.some(a=>has(deep(a.value),'authority')||has(a.value,'global')||has(deep(a.value),'state')))error(node,'reflection','Reflective authority or state access is outside the supported analysis.');
  if(has(callee,'global',['Proxy'])&&args.some(a=>has(deep(a.value),'authority')))error(node,'proxy-of-authority','Proxy-wrapped authority cannot be inspected.');
  if(has(callee,'global',['setTimeout','setInterval'])&&literal(first).some(v=>typeof v==='string'))error(node,'code-from-string','String timer callbacks cannot be inspected.');
  if(call.construct&&has(callee,'global',['Date'])&&args.length===0)for(const zone of ['decision','effect'])if(membership.has(zone))emit('reducers',zone==='decision'?'impure-primitive':'effect-body-primitive',node,'Inject the clock through dependencies.',zone);
  for(const {receiver,method}of methods) {
   if(receiver==='history'&&['pushState','replaceState','back','forward','go'].includes(method)||receiver==='navigation'&&['navigate','back','forward','traverseTo','reload'].includes(method))emit('routing','history-write',node,'Dispatch navigation intent through the application routing contract.');
   if(receiver==='location'&&['assign','replace','reload'].includes(method))emit('routing','location-write',node,'Dispatch navigation intent through the application routing contract.');
   if(method==='addEventListener') {
    const event=literal(first);if(event.some(v=>['popstate','hashchange',...(receiver==='navigation'?['navigate','currententrychange','navigatesuccess','navigateerror']:[])].includes(v)))emit('routing','traversal-listener',node,'Let the managed routing bridge own browser traversal.');
    else if(!event.length&&['window','navigation'].includes(receiver))error(node,'dynamic-traversal-event','Use a literal event name for browser traversal authorities.');
   }
   if(['store','view','app'].includes(receiver)&&['subscribe','subscribeToActions'].includes(method)&&membership.has('view'))emit('presentation','view-subscribe',node,'Use framework views and subscription effects rather than view-owned store orchestration.','view');
  }
  if(has(callee,'dispatch')&&(inLifecycle(node)||membership.has('module')))emit('presentation','lifecycle-dispatch',node,'Dispatch from user intent or managed startup, not reactive/lifecycle orchestration.');
  if(call.receiver&&has(call.receiver,'state')&&MUTATORS.has(call.method)&&membership.has('decision'))emit('reducers','state-mutation',node,'Return new state without mutating existing state descendants.','decision');
  if(has(callee,'global',['Object.assign'])) {
   if(has(first,'state')&&membership.has('decision'))emit('reducers','state-mutation',node,'Assign into a fresh container instead of existing state.','decision');
   if(has(first,'authority',['location']))emit('routing','location-write',node,'Dispatch navigation intent through the application routing contract.');
  }
  if(has(callee,'global',['Object.setPrototypeOf','Object.defineProperty','Object.defineProperties','Reflect.set','Reflect.deleteProperty','Reflect.defineProperty','Reflect.setPrototypeOf'])&&has(first,'state')&&membership.has('decision'))emit('reducers','state-mutation',node,'Return fresh state rather than changing existing state properties or its prototype.','decision');
  // Bound callbacks resolve through callable targets, not direct function IDs.
  const inspectable=v=>Boolean(v?.size>0)&&[...v].every(atom=>{
   const d=domain.describe(atom);
   if(d.kind==='function')return Boolean(context.functions.get(d.id)?.body);
   if(d.kind!=='bound-function')return false;
   const targets=flow.callableTargets(new Set([atom]));
   return Boolean(targets?.size>0)&&[...targets].every(t=>{const td=domain.describe(t);return td.kind==='function'&&Boolean(context.functions.get(td.id)?.body);});
  });
  const derived=derivedRune(node,context);
  const derivedKnown=derived?.form==='value'||Boolean(derived?.form==='by'&&inspectable(args[0]?.value));
  const known=derivedKnown||descriptions(callee).some(d=>['class','bound-function','method','array-method','dispatch','import','promise-then'].includes(d.kind)||(d.kind==='function'&&Boolean(context.functions.get(d.id)?.body))||(d.kind==='snippet'&&context.renderCalls?.has(node)))||[...callee].some(a=>authority.anchor(a));
  const inspected=has(callee,'global',['String','Boolean','JSON.stringify'])||descriptions(callee).some(d=>d.kind==='global'&&d.id.startsWith('console.'));
  if(!known&&!inspected) {
   for(const arg of args) {
    const value=deep(arg.value);
    if(has(value,'authority',['app','store','view','legacy-view','views']))error(node,'store-authority-to-opaque-callee','Keep store/view authority within the managed application boundary.');
    if(has(value,'authority',['window','history','location','navigation']))emit('routing','authority-escape',node,'Do not pass browser routing authority to an uninspected implementation.');
    if(has(value,'namespace'))error(node,'namespace-escape','Pass an explicitly selected module member instead of an opaque namespace.');
   }
   if(membership.has('decision'))limitations.push({code:'opaque-decision-call',path:context.info(node).module.path,span:context.span(node),message:'The purity of this unresolved call requires independent source review.'});
  }
 }
 const sort=items=>items.sort((a,b)=>a.path.localeCompare(b.path)||a.span.start.offset-b.span.start.offset||(a.detector??a.construct??a.code).localeCompare(b.detector??b.construct??b.code));
 return {findings:sort(findings),errors:sort(errors),limitations:sort(limitations)};
}
