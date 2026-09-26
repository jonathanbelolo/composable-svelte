// Framework positions are identified by public import identity, never helper names.
// This pass seeds potential authority and decision/effect entry points; it does not
// certify ownership or activate any architecture rule.
import ts from 'typescript';
import {lookupAnchor} from './anchors.mjs';
import {derivedRune} from './svelte-runes.mjs';

export function createFrameworkSeeds(context) {
 const reducers=new Map(),decisions=new Map(),effects=new Map(),wiring=new Map(),lifecycle=new Map();
 const barriers=new Map();
 let api;
 const record=(map,node,value)=>{
  const prev=map.get(node);map.set(node,{node,value:prev?api.domain.join(prev.value,value):value});
 };
 function leaves(value,seen=new Set()) {
  let out=api.domain.empty();
  for(const atom of value) {
   if(seen.has(atom))continue;seen.add(atom);
   const info=api.domain.describe(atom);
   if(info.kind==='function'||info.kind==='bound-function'||info.kind==='class'||info.kind==='snippet')out=api.domain.join(out,new Set([atom]));
   else if(info.kind==='heap')out=api.domain.join(out,leaves(api.authority.member(new Set([atom]),'*'),seen));
  }
  return out;
 }
 function barrier(node,value,map) {
  record(map,node,leaves(value));record(barriers,node,leaves(value));
 }
 function reducer(node,value) {
  barrier(node,value,reducers);
  for(const atom of leaves(value)) {
   const info=api.domain.describe(atom);if(info.kind!=='function')continue;
   const fn=context.functions.get(info.id);const parameter=fn?.parameters[0];if(!parameter)continue;
   const state=api.domain.atom('state',fn.id);
   for(const binding of context.symbols.bindings) for(const declaration of binding.declarations) {
    if(declaration.node!==parameter)continue;
    let seed=state;
    if(declaration.rest) {
     seed=api.domain.allocate(`reducer-rest:${binding.id}`,{array:ts.isArrayBindingPattern(parameter.name)||Boolean(parameter.dotDotDotToken)});
     api.domain.spread(seed,state,{array:ts.isArrayBindingPattern(parameter.name)||Boolean(parameter.dotDotDotToken)});
    }
    api.seedBinding(binding,seed);
   }
  }
 }
 const path=(value,keys)=>keys.reduce((v,key)=>api.authority.member(v,key),value);
 function onInvocation(call,flowApi) {
  api=flowApi;
  const {node,args}=call;
  let result=api.domain.empty();
  const arg=(i)=>args[i]?.value??api.domain.empty();
  const argNode=(i)=>args[i]?.node??node;
  for(const atom of call.callee) {
   const info=api.domain.describe(atom);
   const anchor=api.authority.anchor(atom);
   const external=api.authority.externalParts(atom);
   if(info.kind==='authority'&&info.id==='dismiss-dependency')result=api.domain.join(result,api.authority.authority('effect'));
   if(external?.specifier==='svelte'&&external.imported==='tick'&&external.path.length===0)result=api.domain.join(result,api.domain.atom('tick-promise','svelte.tick'));
   if(info.kind==='tick-then')for(const argument of args)record(lifecycle,argument.node,leaves(argument.value));
   if(anchor) {
    for(const index of anchor.deferredArguments??[])barrier(argNode(index),arg(index),effects);
    for(const index of anchor.cleanupFromArguments??[]) {
     const cleanup=api.invokeLocal(arg(index),[{node:null,value:api.domain.atom('dispatch','subscription'),spread:false}],argNode(index));
     const heapCleanup=new Set([...cleanup].filter(atom=>api.domain.describe(atom).kind==='heap'));
     const thenable=api.callableTargets(api.authority.member(heapCleanup,'then')).size>0;
     if(thenable||[...cleanup].some(atom=>api.domain.describe(atom).kind==='async-result'))api.reportUnsupported(argNode(index),'subscription-async-cleanup','Subscription setup must return cleanup synchronously; Promise-returning setup has asynchronous failure/retirement behavior requiring review.');
     const direct=new Set([...cleanup].filter(atom=>['function','bound-function'].includes(api.domain.describe(atom).kind)));
     api.invokeLocal(direct,[],argNode(index));
     barrier(argNode(index),direct,effects);
    }
    if(anchor.result)result=api.domain.join(result,api.authority.authority(anchor.result));
    if(anchor.kind==='view-scope'&&anchor.overloads) {
     const overload=anchor.overloads.find(o=>o.arity===args.length);
     if(overload)result=api.domain.join(result,api.authority.authority(overload.result));
    }
    if(anchor.kind==='managed-dismiss-factory')barrier(argNode(anchor.cleanupArgument),arg(anchor.cleanupArgument),effects);
    for(const index of anchor.reducerArguments??[])reducer(argNode(index),arg(index));
    for(const index of anchor.decisionArguments??[])barrier(argNode(index),arg(index),decisions);
    if(anchor.kind==='store-factory') {
     reducer(argNode(anchor.optionsArgument),path(arg(anchor.optionsArgument),anchor.optionsReducerPath));
     barrier(argNode(anchor.optionsArgument),path(arg(anchor.optionsArgument),anchor.dependenciesPath),wiring);
    }
    if(anchor.kind==='application-factory') for(const keys of anchor.decisionPaths??[]) {
     barrier(argNode(anchor.optionsArgument),path(arg(anchor.optionsArgument),keys),decisions);
    }
    if(anchor.kind==='reducer-map')reducer(argNode(anchor.argument),arg(anchor.argument));
    if(anchor.kind==='reducer-config') {
     for(const key of anchor.reducerProperties)reducer(argNode(anchor.argument),path(arg(anchor.argument),[key]));
     for(const key of anchor.decisionProperties)barrier(argNode(anchor.argument),path(arg(anchor.argument),[key]),decisions);
    }
    if(anchor.kind==='lifecycle')for(const argument of args)record(lifecycle,argument.node,leaves(argument.value));
   }
   const method=api.authority.methodParts(atom);
   if(method) {
    const receiver=api.domain.describe(method[0]);
    if(receiver.kind==='authority'&&receiver.id==='builder') {
     if(method[1]==='with'||method[1]==='forEach') {
      reducer(argNode(1),arg(1));
      for(const index of [1,2]) for(const key of ['replaceOn','onCreate','startup'])barrier(argNode(index),path(arg(index),[key]),decisions);
      result=api.domain.join(result,api.authority.authority('builder'));
     } else if(method[1]==='build') result=api.domain.join(result,api.authority.authority('composition'));
    }
    if(receiver.kind==='authority'&&receiver.id==='composition'&&method[1]==='bind')result=api.domain.join(result,api.authority.authority('view'));
    if(receiver.kind==='authority'&&receiver.id==='scope-builder') {
     const transition=lookupAnchor('@composable-svelte/core/application','scopeTo').methods[method[1]];
     if(transition)result=api.domain.join(result,api.authority.authority(transition.result));
    }
   }
  }
  // Runes are compiler identities only when the binding is lexically free.
  const callee=node.expression;
  let rune=callee;
  while(rune&&ts.isPropertyAccessExpression(rune))rune=rune.expression;
  if(rune&&ts.isIdentifier(rune)&&!context.symbols.bindingOf(rune)&&['$effect','$derived'].includes(rune.text)) {
   for(const argument of args)record(lifecycle,argument.node,leaves(argument.value));
  }
  const derived=derivedRune(node,context);
  if(derived) {
   if(derived.form==='value')result=api.domain.join(result,arg(0));
   else if(derived.form==='by') {
    const direct=new Set([...arg(0)].filter(atom=>['function','bound-function'].includes(api.domain.describe(atom).kind)));
    result=api.domain.join(result,api.invokeLocal(direct,[],argNode(0)));
   }
  }
  return result;
 }
 function onInvoke(call,flowApi) {
  if(!flowApi.isActiveNode(call.node))return flowApi.domain.empty();
  const invocations=call.invocations?.length?call.invocations:[call];
  return flowApi.domain.join(...invocations.map(invocation=>onInvocation({...call,...invocation},flowApi)));
 }
 function onProperty({receiver,key},flowApi) {
  api=flowApi;
  return key==='then'&&[...receiver].some(a=>api.domain.describe(a).kind==='tick-promise') ? api.domain.atom('tick-then','svelte.tick.then') : api.domain.empty();
 }
 function addReducer(node,value,flowApi) {if(flowApi)api=flowApi;if(!api)throw new TypeError('Framework seeds need a flow API');reducer(node,value);}
 return {onInvoke,onProperty,addReducer,reducers,decisions,effects,wiring,lifecycle,barriers};
}
