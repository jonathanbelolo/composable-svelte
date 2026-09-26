// Execution-zone propagation. Merely storing a closure does not execute it.
// Framework barriers redirect deferred bodies; eager argument calls retain the caller zone.
import ts from 'typescript';
import {propagateZones} from './zone-graph.mjs';

export function buildExecutionZones(context,flow,framework,{wiringSites=[],callbackSites=[],lifecycleSites=[],storedCallSites=[]}={}) {
 const {domain,authority}=flow;
 const nodes=new Set(),edges=[],seeds=[],edgeKeys=new Set();
 const roots=new Map(),functionEntries=new Map();
 const rootId=(module,kind)=>`root:${module.path}:${kind==='module'?'module':'view'}`;
 for(const module of context.modules) for(const unit of module.units) {
  const id=rootId(module,unit.kind);nodes.add(id);roots.set(unit,id);
  if(unit.kind==='binding')continue;
  if(context.snippetFor?.(unit))continue;
  seeds.push({node:id,zone:unit.kind==='module'?'module':'view',entryPath:module.path});
  if(module.kind==='svelte'&&unit.kind==='module')seeds.push({node:id,zone:'view',entryPath:module.path});
 }
 for(const fn of context.functions.values()){nodes.add(fn.id);functionEntries.set(fn.id,fn);}
 for(const snippet of context.snippets?.values()??[]){nodes.add(snippet.id);functionEntries.set(snippet.id,snippet);}
 for(const cls of context.classes.values())nodes.add(`class-init:${cls.id}`);
 function owner(node,occurrence=false) {
  const info=context.info(node);if(!info)return null;
  let fn=info.function;
  if(occurrence&&fn?.node===node)fn=fn.parent;
  if(fn)return fn.id;
  if(info.snippet)return info.snippet.id;
  // Instance field initializers run at construction. Static field work runs in its module.
  for(let p=node;p&&p!==info.unit.sourceFile;p=p.parent)if(ts.isPropertyDeclaration(p)&&info.class) {
   if(!p.modifiers?.some(m=>m.kind===ts.SyntaxKind.StaticKeyword))return `class-init:${info.class.id}`;
  }
  return roots.get(info.unit);
 }
 function functions(value,seen=new Set()) {
  const result=new Set();
  for(const atom of value) {
   if(seen.has(atom))continue;seen.add(atom);
   const item=domain.describe(atom);
   if(['function','snippet'].includes(item.kind)&&nodes.has(item.id))result.add(item.id);
   else if(item.kind==='bound-function')for(const target of flow.callableTargets(new Set([atom]))) {const resolved=domain.describe(target);if(nodes.has(resolved.id))result.add(resolved.id);}
   else if(item.kind==='heap')for(const id of functions(authority.member(new Set([atom]),'*'),seen))result.add(id);
  }
  return result;
 }
 function edge(from,to) {
  if(!from||!to||!nodes.has(from)||!nodes.has(to))return;
  const key=JSON.stringify([from,to]);if(edgeKeys.has(key))return;edgeKeys.add(key);edges.push({from,to});
 }
 function seedValues(records,zone) {
  for(const record of records)for(const id of functions(record.value)) {
   const entryPath=context.info(record.node)?.module.path??functionEntries.get(id)?.module.path;
   if(entryPath)seeds.push({node:id,zone,entryPath});
  }
 }
 seedValues(framework.reducers.values(),'decision');seedValues(framework.decisions.values(),'decision');
 seedValues(framework.effects.values(),'effect');seedValues(framework.wiring.values(),'wiring');seedValues(wiringSites,'wiring');
 const storedCalls=new Map(storedCallSites.map(site=>[site.node,site.value]));
 const barrierSites=[...framework.barriers.values(),...wiringSites];
 function isInside(node,ancestor) {
  for(let p=node;p;p=p.parent)if(p===ancestor)return true;
  return false;
 }
 function barrierTargets(node) {
  const result=new Set();
  for(const site of barrierSites)if(isInside(node,site.node))for(const id of functions(site.value))result.add(id);
  return result;
 }
 function callFunctions(call) {
  const ids=functions(call.resolvedCallee??call.callee);
  for(const atom of call.resolvedCallee??call.callee) {
   const d=domain.describe(atom);
   if(d.kind==='class'&&context.classes.has(d.id)) {
    ids.add(`class-init:${d.id}`);
    for(const member of context.classes.get(d.id).node.members)if(ts.isConstructorDeclaration(member)) {
     const f=context.info(member)?.function;if(f)ids.add(f.id);
    }
   }
  }
  return ids;
 }
 for(const call of flow.calls.values()) {
  if(!flow.isActiveNode(call.node))continue;
  const caller=owner(call.node);const targets=callFunctions(call);
  for(const target of targets)edge(caller,target);
  // Locally inspected callees transfer callbacks through their parameters; only
  // their uses establish execution. Opaque receivers conservatively may execute callbacks.
  const storesViewDeclarations=[...(call.resolvedCallee??call.callee)].some(atom=>authority.anchor(atom)?.kind==='view-definitions'||domain.describe(atom).kind==='promise-factory');
  if(targets.size===0&&!storesViewDeclarations) for(const arg of call.args) {
   const blocked=barrierTargets(arg.node);
   for(const id of functions(storedCalls.get(call.node)??domain.empty()))blocked.add(id);
   for(const id of functions(arg.value))if(!blocked.has(id))edge(caller,id);
  }
 }
 // References and function expressions create values, not execution. Calls above
 // and explicit framework/template callback sites below establish execution.
 for(const site of callbackSites)for(const id of functions(site.value))edge(owner(site.node,true),id);
 // Lifecycle is an independent marker, not a deferred-work exemption.
 const lifecycleSeeds=[];
 for(const site of [...framework.lifecycle.values(),...lifecycleSites])for(const id of functions(site.value)) {
  const entryPath=context.info(site.node)?.module.path??functionEntries.get(id)?.module.path;
  edge(owner(site.node,true),id);
  lifecycleSeeds.push({node:id,zone:'view',entryPath});
 }
 const values=propagateZones({nodes:[...nodes],edges,seeds});
 const lifecycle=propagateZones({nodes:[...nodes],edges,seeds:lifecycleSeeds});
 function attributions(node) {return flow.isActiveNode(node)?values.get(owner(node))??new Map():new Map();}
 function inLifecycle(node) {return lifecycle.has(owner(node));}
 const zoneCounts={decision:0,effect:0,view:0,module:0,wiring:0,service:0};
 for(const fn of context.functions.values()) {
  const zones=values.get(fn.id);
  if(!zones?.size)zoneCounts.service++;
  else for(const zone of zones.keys())zoneCounts[zone]++;
 }
 return {nodes:[...nodes],edges,seeds,values,owner,attributions,inLifecycle,zoneCounts};
}
