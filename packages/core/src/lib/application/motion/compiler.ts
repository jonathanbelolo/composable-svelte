import {exactKeys,milliseconds,visualCopy} from './data.js';
import {type BuiltinMotionProperty,type MotionProperty,type MotionValue,type NumericDescriptors,type NormalizedValue,validateNumericDescriptors,validateProperty,normalizeMotionValue,interpolation} from './properties.js';
import {type MotionTokens,type TokenOverrides,type Easing,resolveMotionTokens,validateTokens} from './tokens.js';
export interface TargetDefinition<P extends MotionProperty=MotionProperty> {readonly properties:readonly P[];readonly optional?:boolean|undefined}
export type TargetSchema<P extends MotionProperty=MotionProperty>=Readonly<Record<string,TargetDefinition<P>>>;
export type StableState<T extends TargetSchema>={readonly[K in keyof T]:{readonly[P in T[K]['properties'][number]]:MotionValue<P>}};
type Track<T extends TargetSchema,S extends string>={ [K in keyof T & string]:{
 readonly kind:'track';readonly target:K;readonly properties:readonly T[K]['properties'][number][];
 readonly from?:S|undefined;readonly to?:S|undefined;readonly durationMs?:number|undefined;readonly delayMs?:number|undefined;readonly easing?:Easing|undefined;readonly channel?:string|undefined;readonly priority?:number|undefined;
}}[keyof T & string];
export type MotionGraph<T extends TargetSchema,S extends string>=Track<T,S>|{readonly kind:'sequence'|'parallel';readonly steps:readonly MotionGraph<T,S>[]} | {readonly kind:'stagger';readonly steps:readonly MotionGraph<T,S>[];readonly gapMs:number};
export interface MotionDefinition<T extends TargetSchema,S extends string,N extends NumericDescriptors=NumericDescriptors> {readonly targets:T;readonly states:Readonly<Record<S,StableState<T>>>;readonly graph:MotionGraph<T,S>;readonly numericProperties?:N|undefined;readonly tokens?:TokenOverrides|undefined;readonly interruption:'replace'}
const recipes=new WeakSet<object>();
export type MotionRecipe<T extends TargetSchema,S extends string,N extends NumericDescriptors=NumericDescriptors>=Readonly<MotionDefinition<T,S,N>>;
export type StableProjection<T extends TargetSchema>={readonly[K in keyof T]:{readonly[P in T[K]['properties'][number]]:string}};
export interface CompiledProperty<P extends MotionProperty=MotionProperty> {readonly property:P;readonly from:NormalizedValue;readonly to:NormalizedValue;readonly interpolation:ReturnType<typeof interpolation>}
export type CompiledTrack<T extends TargetSchema=TargetSchema>={ [K in keyof T & string]:{readonly target:K;readonly startMs:number;readonly durationMs:number;readonly properties:readonly CompiledProperty<T[K]['properties'][number]>[];readonly easing:Easing;readonly channel:string;readonly priority:number;readonly optional:boolean;readonly available:'pending'|'ready'|'missing'} }[keyof T & string];
export interface CompiledMotion<T extends TargetSchema=TargetSchema> {readonly tracks:readonly CompiledTrack<T>[];readonly durationMs:number;readonly outcome:'playback'|'stable-fallback';readonly missingRequired:readonly (keyof T & string)[];readonly skippedOptional:readonly (keyof T & string)[];readonly tokens:Readonly<MotionTokens&{reduced:boolean}>;readonly stable:StableProjection<T>}
function name(value:unknown,label:string):asserts value is string {if(typeof value!=='string'||!value.length)throw new TypeError(`${label} must be a nonempty name`);}
export function defineMotionRecipe<const T extends TargetSchema<BuiltinMotionProperty|(keyof N & `--${string}`)>,const S extends string,const N extends NumericDescriptors=Record<never,never>>(definition:Omit<MotionDefinition<T,S,N>,'graph'>&{readonly graph:MotionGraph<NoInfer<T>,NoInfer<S>>}):MotionRecipe<T,S,N> {
 const recipe=visualCopy(definition);exactKeys(recipe,['targets','states','graph','numericProperties','tokens','interruption'],'recipe');
 if(recipe.interruption!=='replace')throw new TypeError('Only replace interruption is supported');
 if(recipe.tokens!==undefined)validateTokens(recipe.tokens);
 if(recipe.numericProperties!==undefined&&(recipe.numericProperties===null||typeof recipe.numericProperties!=='object'||Array.isArray(recipe.numericProperties)))throw new TypeError('numeric properties must be a record');
 const numeric=recipe.numericProperties??{};validateNumericDescriptors(numeric);
 const targets=Object.keys(recipe.targets),states=Object.keys(recipe.states);
 if(!targets.length||!states.length)throw new TypeError('Targets and states cannot be empty');
 for(const [target,schema] of Object.entries(recipe.targets)){
  name(target,'target');exactKeys(schema,['properties','optional'],'target');
  if(schema.optional!==undefined&&typeof schema.optional!=='boolean')throw new TypeError('optional must be boolean');
  if(!Array.isArray(schema.properties)||!schema.properties.length||new Set(schema.properties).size!==schema.properties.length)throw new TypeError('Target properties must be unique and nonempty');
  for(const property of schema.properties)validateProperty(property,numeric);
 }
 for(const state of states){
  name(state,'state');const projection=recipe.states[state as S];exactKeys(projection,targets,'stable targets');
  for(const target of targets){const schema=recipe.targets[target]!;const values=projection[target];if(!values)throw new TypeError(`Missing stable target ${target}`);exactKeys(values,schema.properties,'stable properties');for(const property of schema.properties)normalizeMotionValue(property,(values as Readonly<Record<string,unknown>>)[property],numeric);}
 }
 // Validate names, intrinsic timing and collisions before registering a definition.
 compileInternal(recipe,states[0]!,states[0]!,{});
 recipes.add(recipe);return recipe;
}
export function stableProjection<T extends TargetSchema,S extends string>(recipe:MotionRecipe<T,S>,state:NoInfer<S>):StableProjection<T> {
 if(!recipes.has(recipe))throw new TypeError('Expected a defined motion recipe');
 return project(recipe,state);
}
function project<T extends TargetSchema,S extends string>(recipe:MotionRecipe<T,S>,state:string):StableProjection<T> {
 if(!Object.hasOwn(recipe.states,state))throw new TypeError(`Unknown motion state ${state}`);
 const result:Record<string,Readonly<Record<string,string>>>=Object.create(null);
 for(const [target,schema] of Object.entries(recipe.targets)){
  const values:Record<string,string>=Object.create(null);for(const property of schema.properties)values[property]=normalizeMotionValue(property,(recipe.states[state as S][target]! as Readonly<Record<string,unknown>>)[property],recipe.numericProperties??{}).css;result[target]=Object.freeze(values);
 }
 return Object.freeze(result) as unknown as StableProjection<T>;
}
export function serializeStableStyle<T extends TargetSchema,S extends string>(recipe:MotionRecipe<T,S>,state:NoInfer<S>,target:keyof T & string):string {
 const projection=stableProjection(recipe,state)[target];if(!projection)throw new TypeError('Unknown stable target');
 // This is a CSS attribute value, not HTML. Svelte escapes it as an ordinary attribute.
 return Object.entries(projection).map(([property,value])=>`${property}:${value}`).join(';');
}
interface CompileOptions<T extends TargetSchema=TargetSchema> {readonly availableTargets?:readonly (keyof T & string)[]|undefined;readonly theme?:TokenOverrides|undefined;readonly preset?:TokenOverrides|undefined;readonly instance?:TokenOverrides|undefined;readonly reducedMotion?:boolean|undefined}
export function compileMotion<T extends TargetSchema,S extends string>(recipe:MotionRecipe<T,S>,request:{readonly from:NoInfer<S>;readonly to:NoInfer<S>}&CompileOptions<NoInfer<T>>):CompiledMotion<T> {
 if(!recipes.has(recipe))throw new TypeError('Expected a defined motion recipe');
 const data=visualCopy(request);exactKeys(data,['from','to','availableTargets','theme','preset','instance','reducedMotion'],'compile');
 return compileInternal(recipe,data.from,data.to,data);
}
function compileInternal<T extends TargetSchema,S extends string>(recipe:MotionDefinition<T,S>,from:string,to:string,options:CompileOptions<T>):CompiledMotion<T> {
 if(!Object.hasOwn(recipe.states,from)||!Object.hasOwn(recipe.states,to))throw new TypeError('Unknown transition state');
 const tokenOptions={...(options.theme?{theme:options.theme}:{}),preset:{...recipe.tokens,...options.preset},...(options.instance?{instance:options.instance}:{}),...(options.reducedMotion!==undefined?{reducedMotion:options.reducedMotion}:{})};
 const tokens=resolveMotionTokens(tokenOptions);
 // Validate the requested timeline even when playback is disabled/reduced.
 const timingTokens=resolveMotionTokens({...tokenOptions,instance:{...options.instance,disabled:false},reducedMotion:false});
 const available=options.availableTargets===undefined?undefined:new Set(options.availableTargets);
 if(available)for(const target of available)if(!Object.hasOwn(recipe.targets,target))throw new TypeError(`Unknown available target ${target}`);
 const tracks:CompiledTrack[]=[];
 const branches:Array<readonly (readonly[number,number])[]>=[];let branchId=0;const missing=new Set<keyof T & string>(),skipped=new Set<keyof T & string>();
 if(available)for(const [target,schema] of Object.entries(recipe.targets)){if(!available.has(target as keyof T & string))(schema.optional?skipped:missing).add(target as keyof T & string);}
 function visit(graph:MotionGraph<T,S>,start:number,path:readonly (readonly[number,number])[]=[]):number {
  if(graph.kind==='track'){
   exactKeys(graph,['kind','target','properties','from','to','durationMs','delayMs','easing','channel','priority'],'track');
   const schema=recipe.targets[graph.target];if(!schema)throw new TypeError(`Unknown target ${graph.target}`);
   if(!Array.isArray(graph.properties)||!graph.properties.length||new Set(graph.properties).size!==graph.properties.length)throw new TypeError('Track properties must be unique and nonempty');
   const a=graph.from??from,b=graph.to??to;if(!Object.hasOwn(recipe.states,a)||!Object.hasOwn(recipe.states,b))throw new TypeError('Unknown track state');
   const rawDuration=milliseconds(graph.durationMs??timingTokens.durationMs,'track duration');const delay=milliseconds(graph.delayMs??0,'track delay');
   const position=milliseconds(start+delay,'track start');const end=milliseconds(position+rawDuration,'track end');
   const channel=graph.channel??'default';name(channel,'channel');const priority=graph.priority??0;if(!Number.isSafeInteger(priority))throw new TypeError('Priority must be a safe integer');
   const easing=graph.easing??tokens.easing;validateTokens({easing});
   const properties=graph.properties.map((property:MotionProperty)=>{
    if(!schema.properties.includes(property))throw new TypeError(`Undeclared property ${property}`);
    const first=normalizeMotionValue(property,(recipe.states[a as S][graph.target]! as Readonly<Record<string,unknown>>)[property],recipe.numericProperties??{}),last=normalizeMotionValue(property,(recipe.states[b as S][graph.target]! as Readonly<Record<string,unknown>>)[property],recipe.numericProperties??{});
    return Object.freeze({property,from:first,to:last,interpolation:interpolation(first,last)});
   });
   const availability=available===undefined?'pending':available.has(graph.target)?'ready':'missing';
   if(availability==='missing')(schema.optional?skipped:missing).add(graph.target);
   branches.push(path);
   tracks.push(Object.freeze({target:graph.target,startMs:position,durationMs:rawDuration,properties:Object.freeze(properties),easing,channel,priority,optional:schema.optional??false,available:availability}));
   return end;
  }
  if(!['sequence','parallel','stagger'].includes(graph.kind))throw new TypeError('Unknown graph node');
  exactKeys(graph,graph.kind==='stagger'?['kind','steps','gapMs']:['kind','steps'],'composition');
  if(!Array.isArray(graph.steps))throw new TypeError('Composition requires steps');
  const gap=graph.kind==='stagger'?milliseconds(graph.gapMs,'stagger gap'):0;let end=start;const group=branchId++;
  for(let i=0;i<graph.steps.length;i++){
   const offset=graph.kind==='sequence'?end:milliseconds(start+i*gap,'stagger offset');
   end=Math.max(end,visit(graph.steps[i]!,offset,graph.kind==='sequence'?path:[...path,[group,i] as const]));
  }
  return end;
 }
 visit(recipe.graph,0);
 // Reject ambiguous simultaneous writers inside a recipe. Runtime binding claims
 // separately arbitrate between recipes using declared channel/priority.
 for(let i=0;i<tracks.length;i++)for(let j=i+1;j<tracks.length;j++){
  const a=tracks[i]!,b=tracks[j]!;
  const concurrent=branches[i]!.some(([group,branch])=>branches[j]!.some(([otherGroup,otherBranch])=>group===otherGroup&&branch!==otherBranch));
  const overlap=concurrent&&(a.startMs===b.startMs || a.startMs<b.startMs+b.durationMs&&b.startMs<a.startMs+a.durationMs);
  if(a.target===b.target&&overlap&&a.properties.some(p=>b.properties.some(q=>q.property===p.property)))throw new TypeError('Overlapping motion property tracks');
 }
 const reducedInstant=tokens.disabled||tokens.reduced;
 const executableTracks=tracks.filter(track=>track.available!=='missing');
 const executableDuration=executableTracks.reduce((max,track)=>Math.max(max,track.startMs+track.durationMs),0);
 return Object.freeze({tracks:Object.freeze(missing.size||reducedInstant?[]:executableTracks) as unknown as readonly CompiledTrack<T>[],durationMs:missing.size||reducedInstant?0:executableDuration,outcome:missing.size?'stable-fallback':'playback',missingRequired:Object.freeze([...missing]),skippedOptional:Object.freeze([...skipped]),tokens,stable:project(recipe,to)});
}
