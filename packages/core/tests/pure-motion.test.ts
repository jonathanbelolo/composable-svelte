import {it,expect,vi} from 'vitest';
import {defineMotionRecipe,compileMotion,stableProjection,serializeStableStyle} from '../src/lib/application/motion/compiler';
import {exactKeys} from '../src/lib/application/motion/data';
import {normalizeMotionValue,interpolation} from '../src/lib/application/motion/properties';
import {resolveMotionTokens} from '../src/lib/application/motion/tokens';
const definition={targets:{panel:{properties:['opacity','width','color']},label:{properties:['opacity'],optional:true}},states:{closed:{panel:{opacity:0,width:0,color:'#fff'},label:{opacity:0}},open:{panel:{opacity:1,width:{value:50,unit:'%'},color:'#000'},label:{opacity:1}}},graph:{kind:'sequence',steps:[{kind:'track',target:'panel',properties:['opacity'],durationMs:20},{kind:'track',target:'label',properties:['opacity'],durationMs:30} ]},interruption:'replace'} as const;
it('compiles literal states and named group targets into deterministic offsets',()=>{
 const recipe=defineMotionRecipe(definition);const plan=compileMotion(recipe,{from:'closed',to:'open'});
 expect(plan.durationMs).toBe(50);expect(plan.tracks.map(t=>[t.target,t.startMs,t.durationMs,t.available])).toEqual([['panel',0,20,'pending'],['label',20,30,'pending']]);
 expect(plan.stable.panel).toEqual({opacity:'1',width:'50%',color:'rgba(0, 0, 0, 1)'});expect(Object.isFrozen(plan.tracks[0]!.properties)).toBe(true);
});

it('F1 transform rejects !important, comments, quotes and unmatched delimiters while admitting bounded nested functions',()=>{
 for(const bad of ['translateX(0) !important','scale(1) /*','scale(1) */','scale(1) /* comment */','scale(1) "','scale(1) \'','scale(','scale(1))','translate3d(0,0,0) [','rotate(0deg)]']){
  expect(()=>normalizeMotionValue('transform',bad)).toThrow('Transform must be a bounded CSS value');
 }
 expect(normalizeMotionValue('transform','translateX(calc(100% / 2))').css).toBe('translateX(calc(100% / 2))');
 expect(normalizeMotionValue('transform','rotate(calc(360deg / 3))').css).toBe('rotate(calc(360deg / 3))');

 const base='translateX(calc((100% / 2))) ';
 const validBoundary=base+' '.repeat(4096-base.length);
 expect(validBoundary.length).toBe(4096);
 expect(normalizeMotionValue('transform',validBoundary).css).toBe(validBoundary);
 const invalidBoundary=validBoundary+' ';
 expect(invalidBoundary.length).toBe(4097);
 expect(()=>normalizeMotionValue('transform',invalidBoundary)).toThrow('Transform must be a bounded CSS value');

 for(const badTransform of ['scale(','translate3d(0,0,0) [','scale(1))','rotate(0deg)]']){
  expect(()=>defineMotionRecipe({
   targets:{panel:{properties:['transform','opacity']}},
   states:{closed:{panel:{transform:badTransform,opacity:0}},open:{panel:{transform:'scale(1)',opacity:1}}},
   graph:{kind:'track',target:'panel',properties:['transform','opacity'],durationMs:20},
   interruption:'replace'
  })).toThrow('Transform must be a bounded CSS value');
 }
 const validTransformRecipe=defineMotionRecipe({
  targets:{panel:{properties:['transform','opacity']}},
  states:{closed:{panel:{transform:'translateX(calc((100% / 2)))',opacity:0}},open:{panel:{transform:'rotate(calc(360deg / 3))',opacity:1}}},
  graph:{kind:'track',target:'panel',properties:['transform','opacity'],durationMs:20},
  interruption:'replace'
 });
 expect(serializeStableStyle(validTransformRecipe,'closed','panel')).toBe('transform:translateX(calc((100% / 2)));opacity:0');
 expect(serializeStableStyle(validTransformRecipe,'open','panel')).toBe('transform:rotate(calc(360deg / 3));opacity:1');
});

it('F2 eliminates phantom trailing optional duration while preserving middle gaps',()=>{
 const trailingRecipe=defineMotionRecipe(definition);
 const trailingPlan=compileMotion(trailingRecipe,{from:'closed',to:'open',availableTargets:['panel']});
 expect(trailingPlan.tracks.map(t=>[t.target,t.startMs,t.durationMs])).toEqual([['panel',0,20]]);
 expect(trailingPlan.durationMs).toBe(20);
 expect(trailingPlan.skippedOptional).toEqual(['label']);

 const allOptionalRecipe=defineMotionRecipe({targets:{label:{properties:['opacity'],optional:true}},states:{closed:{label:{opacity:0}},open:{label:{opacity:1}}},graph:{kind:'track',target:'label',properties:['opacity'],durationMs:30},interruption:'replace'});
 const allOptPlan=compileMotion(allOptionalRecipe,{from:'closed',to:'open',availableTargets:[]});
 expect(allOptPlan.tracks).toEqual([]);
 expect(allOptPlan.durationMs).toBe(0);
 expect(allOptPlan.outcome).toBe('playback');
 expect(allOptPlan.skippedOptional).toEqual(['label']);

 const middleRecipe=defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[definition.graph.steps[0],definition.graph.steps[1],definition.graph.steps[0]]}});
 const middlePlan=compileMotion(middleRecipe,{from:'closed',to:'open',availableTargets:['panel']});
 expect(middlePlan.tracks.map(t=>[t.target,t.startMs,t.durationMs])).toEqual([['panel',0,20],['panel',50,20]]);
 expect(middlePlan.durationMs).toBe(70);
});

it('F6 and F7 reject non-record tokens and numeric bags while preserving undefined',()=>{
 for(const bad of [[],null,0,false,'bad']){
  expect(()=>defineMotionRecipe({...definition,tokens:bad} as any)).toThrow();
  expect(()=>defineMotionRecipe({...definition,numericProperties:bad} as any)).toThrow();
  expect(()=>resolveMotionTokens({theme:bad} as any)).toThrow();
 }
 expect(()=>defineMotionRecipe({...definition,numericProperties:{'--val':null} as any})).toThrow('numeric descriptor');
 expect(()=>exactKeys(null,['a'],'custom label')).toThrow('custom label must be a record');
 expect(()=>exactKeys([] as any,['a'],'custom label')).toThrow('custom label must be a record');
 expect(defineMotionRecipe({...definition,tokens:{durationMs:100}}).tokens?.durationMs).toBe(100);
});

it('F8 distinguishes index-key shape from density on motion arrays',()=>{
 const nonIndexSteps=[definition.graph.steps[0]];(nonIndexSteps as any).note='extra';
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'sequence',steps:nonIndexSteps}})).toThrow('Motion arrays contain indices only');
 const sparseSteps:any[]=[];sparseSteps.length=2;sparseSteps[0]=definition.graph.steps[0];
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'sequence',steps:sparseSteps}})).toThrow('Motion arrays must be dense');
});

it('F10 reports absent optional schema targets even with no graph track visiting them',()=>{
 const recipe=defineMotionRecipe({...definition,graph:definition.graph.steps[0]});
 const plan=compileMotion(recipe,{from:'closed',to:'open',availableTargets:['panel']});
 expect(plan.skippedOptional).toEqual(['label']);
 expect(plan.missingRequired).toEqual([]);
 expect(plan.outcome).toBe('playback');
});
it('optional missing tracks preserve subsequent offsets; required missing yields fallback',()=>{
 const recipe=defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[definition.graph.steps[1],definition.graph.steps[0]]}});
 const plan=compileMotion(recipe,{from:'closed',to:'open',availableTargets:['panel']});expect(plan.tracks[0]!.startMs).toBe(30);expect(plan.durationMs).toBe(50);expect(plan.skippedOptional).toEqual(['label']);expect(plan.outcome).toBe('playback');
 expect(compileMotion(recipe,{from:'closed',to:'open',availableTargets:[]}).outcome).toBe('stable-fallback');
});
it('parallel and stagger share one normalized timeline',()=>{
 const recipe=defineMotionRecipe({...definition,graph:{kind:'stagger',gapMs:15,steps:[definition.graph.steps[0],definition.graph.steps[1]]}});
 expect(compileMotion(recipe,{from:'closed',to:'open'}).tracks.map(t=>t.startMs)).toEqual([0,15]);expect(compileMotion(recipe,{from:'closed',to:'open'}).durationMs).toBe(45);
});
it('rejects property conflicts but allows sequential reuse including instant tracks',()=>{
 const track={kind:'track',target:'panel',properties:['opacity'],durationMs:0} as const;
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'parallel',steps:[track,track]}})).toThrow('Overlapping');
 const recipe=defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[track,track]}});expect(compileMotion(recipe,{from:'closed',to:'open'}).tracks).toHaveLength(2);
});
it('rejects aggregate timing overflow before reduced motion could hide it',()=>{
 const track={...definition.graph.steps[0],durationMs:2_147_483_647};
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[track,track]}})).toThrow('timer range');
 expect(()=>defineMotionRecipe({...definition,graph:{...definition.graph.steps[0],durationMs:-1}})).toThrow();
});
it('copies and freezes input without invoking getters or ambient clocks',()=>{
 const now=vi.spyOn(Date,'now').mockImplementation(()=>{throw Error('clock read');});
 try{const recipe=defineMotionRecipe(definition);expect(Object.isFrozen(recipe.states.open.panel)).toBe(true);expect(stableProjection(recipe,'open').panel!.opacity).toBe('1');}finally{now.mockRestore();}
 let reads=0;const malicious={...definition,get tokens(){reads++;return{};}};expect(()=>defineMotionRecipe(malicious)).toThrow('accessors');expect(reads).toBe(0);
 const cyclic:any={kind:'parallel',steps:[]};cyclic.steps.push(cyclic);expect(()=>defineMotionRecipe({...definition,graph:cyclic})).toThrow('Cyclic');
});
it('stable SSR projection does not depend on OS reduction or playback overrides',()=>{
 const recipe=defineMotionRecipe(definition);const normal=compileMotion(recipe,{from:'closed',to:'open'}),reduced=compileMotion(recipe,{from:'closed',to:'open',reducedMotion:true,instance:{durationMs:999}});
 expect(reduced.durationMs).toBe(0);expect(reduced.stable).toEqual(normal.stable);expect(serializeStableStyle(recipe,'open','panel')).toBe('opacity:1;width:50%;color:rgba(0, 0, 0, 1)');
});
it('token precedence applies OS policy last and validates unknown options',()=>{
 expect(resolveMotionTokens({theme:{durationMs:10},preset:{durationMs:20},instance:{durationMs:30}}).durationMs).toBe(30);
 expect(resolveMotionTokens({instance:{durationMs:500,amplitude:8},reducedMotion:true})).toMatchObject({durationMs:0,amplitude:0});
 expect(()=>resolveMotionTokens({instance:{durationMs:Infinity}})).toThrow();
});
it('normalizes explicit colors, units and numeric custom channels honestly',()=>{
 const color=normalizeMotionValue('color','#f008');expect(color.values).toEqual([255,0,0,136/255]);
 const a=normalizeMotionValue('width',10),b=normalizeMotionValue('width',{value:2,unit:'rem'});expect(interpolation(a,b)).toMatchObject({native:true,ticker:false});
 expect(normalizeMotionValue('--progress',3,{'--progress':{unit:'number',interpolation:'number'}})).toMatchObject({css:'3',native:'stable-fallback',ticker:'interpolate'});
 expect(()=>normalizeMotionValue('--progress',3)).toThrow('Unsupported');expect(()=>normalizeMotionValue('opacity',2)).toThrow();
});
it('definition snapshots survive later caller mutation',()=>{
 const input=structuredClone(definition);const recipe=defineMotionRecipe(input);
 (input.states.open.panel as {opacity:number}).opacity=.25;
 expect(stableProjection(recipe,'open').panel!.opacity).toBe('1');
 expect(()=>{(recipe.states.open.panel as {opacity:number}).opacity=.5;}).toThrow();
});
it.each([NaN,Infinity,-1,2_147_483_648])('rejects invalid duration %s at construction',durationMs=>{
 expect(()=>defineMotionRecipe({...definition,graph:{...definition.graph.steps[0],durationMs}})).toThrow();
});
it('rejects unknown runtime references and undeclared properties before compilation',()=>{
 for(const graph of [{...definition.graph.steps[0],target:'missing'},{...definition.graph.steps[0],to:'missing'},{...definition.graph.steps[0],properties:['transform']}]) {
  expect(()=>defineMotionRecipe({...definition,graph} as any)).toThrow();
 }
 expect(()=>defineMotionRecipe({...definition,graph:{...definition.graph.steps[0],surprise:1}} as any)).toThrow('unsupported');
});
it('aggregate stagger offsets are validated, including omitted optional targets',()=>{
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'stagger',gapMs:2_147_483_647,steps:[definition.graph.steps[0],definition.graph.steps[1]]}})).toThrow();
});
it('valid sequential intermediate states preserve explicit track state references',()=>{
 const recipe=defineMotionRecipe({...definition,states:{...definition.states,half:{panel:{opacity:.5,width:10,color:'#888'},label:{opacity:.5}}},graph:{kind:'sequence',steps:[{...definition.graph.steps[0],to:'half'},{...definition.graph.steps[0],from:'half'}]}});
 const plan=compileMotion(recipe,{from:'closed',to:'open'});expect(plan.tracks.map(t=>[t.properties[0]!.from.css,t.properties[0]!.to.css])).toEqual([['0','0.5'],['0.5','1']]);
});
it('channels and priorities cannot make within-recipe conflicts silently succeed',()=>{
 expect(()=>defineMotionRecipe({...definition,graph:{kind:'parallel',steps:[{...definition.graph.steps[0],channel:'layout',priority:1},{...definition.graph.steps[0],channel:'hover',priority:100}]}})).toThrow('Overlapping');
 const recipe=defineMotionRecipe({...definition,graph:{...definition.graph.steps[0],channel:'layout',priority:9}});expect(compileMotion(recipe,{from:'closed',to:'open'}).tracks[0]).toMatchObject({channel:'layout',priority:9});
});
it('does not confuse touching intervals with overlapping property ownership',()=>{
 const recipe=defineMotionRecipe({...definition,graph:{kind:'parallel',steps:[definition.graph.steps[0],{...definition.graph.steps[0],delayMs:20}]}});expect(compileMotion(recipe,{from:'closed',to:'open'}).tracks).toHaveLength(2);
});
it('explicit numeric custom schema does not infer interpolation from arbitrary strings',()=>{
 expect(()=>normalizeMotionValue('--progress','0.5',{'--progress':{unit:'number',interpolation:'number'}})).toThrow();
 expect(()=>normalizeMotionValue('width',{value:-2,unit:'px'})).toThrow();expect(()=>normalizeMotionValue('color',{r:300,g:0,b:0})).toThrow();
 expect(interpolation(normalizeMotionValue('transform','scale(1)'),normalizeMotionValue('transform','scale(2)'))).toEqual({native:true,ticker:false,fallback:'stable'});
 expect(()=>normalizeMotionValue('transform','none;opacity:0')).toThrow();
});
it('rejects sparse graph arrays and non-data containers without executing accessors',()=>{
 const steps:any[]=[];steps.length=2;steps[0]=definition.graph.steps[0];expect(()=>defineMotionRecipe({...definition,graph:{kind:'sequence',steps}})).toThrow('dense');
 expect(()=>defineMotionRecipe({...definition,tokens:new Date()} as any)).toThrow('plain');
});
it('required target failure never exposes a partial executable graph',()=>{
 const recipe=defineMotionRecipe(definition);const plan=compileMotion(recipe,{from:'closed',to:'open',availableTargets:['label']});expect(plan.outcome).toBe('stable-fallback');expect(plan.tracks).toEqual([]);expect(plan.missingRequired).toEqual(['panel']);expect(plan.stable.panel!.opacity).toBe('1');
});
it('rejects unknown availability and unsupported finite reduction modes',()=>{
 const recipe=defineMotionRecipe(definition);expect(()=>compileMotion(recipe,{from:'closed',to:'open',availableTargets:['alien']} as any)).toThrow();expect(()=>resolveMotionTokens({instance:{reduction:'fade'}} as any)).toThrow();
});

it('OS reduction and disable cannot hide aggregate token-derived overflow',()=>{
 const recipe=defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[{kind:'track',target:'panel',properties:['opacity']},{kind:'track',target:'label',properties:['opacity']}]}});
 for(const instance of [{durationMs:2_147_483_647},{durationMs:2_147_483_647,disabled:true}])expect(()=>compileMotion(recipe,{from:'closed',to:'open',instance,reducedMotion:true})).toThrow('timer range');
});

it('immediate required-target fallback has no phantom playback wait',()=>{
 const plan=compileMotion(defineMotionRecipe(definition),{from:'closed',to:'open',availableTargets:[]});expect(plan.durationMs).toBe(0);
});
it('direct normalization rejects accessors and symbols without executing them',()=>{
 const getter=vi.fn(()=>1);const value={g:0,b:0,get r(){return getter()}};
 expect(()=>normalizeMotionValue('color',value)).toThrow();expect(getter).not.toHaveBeenCalled();
 expect(()=>normalizeMotionValue('color',{r:0,g:0,b:0,[Symbol('hidden')]:1})).toThrow();
});
it('normalizes explicit custom length units and negative-zero timing',()=>{
 expect(normalizeMotionValue('--offset',2,{'--offset':{unit:'px',interpolation:'number'}}).kind).toBe('length');
 const plan=compileMotion(defineMotionRecipe({...definition,graph:{kind:'track',target:'panel',properties:['opacity'],durationMs:-0}}),{from:'closed',to:'open'});expect(Object.is(plan.tracks[0]!.durationMs,-0)).toBe(false);
});

it('optional object undefined is omitted while required data remains checked',()=>{
 expect(normalizeMotionValue('color',{r:0,g:0,b:0,a:undefined}).css).toBe('rgba(0, 0, 0, 1)');
 expect(()=>normalizeMotionValue('width',{value:undefined,unit:'px'})).toThrow();
 const recipe=defineMotionRecipe({...definition,tokens:undefined});expect(compileMotion(recipe,{from:'closed',to:'open',theme:undefined}).durationMs).toBe(50);
});

it('empty compositions are deterministic no-op plans with stable projection',()=>{
 for(const kind of ['sequence','parallel'] as const){const plan=compileMotion(defineMotionRecipe({...definition,graph:{kind,steps:[]}}),{from:'closed',to:'open'});expect(plan.tracks).toEqual([]);expect(plan.durationMs).toBe(0);expect(plan.stable.panel!.opacity).toBe('1');}
});

it('instant reduction and disabled policy expose stable projection without executable writers',()=>{
 const recipe=defineMotionRecipe({...definition,graph:{kind:'sequence',steps:[definition.graph.steps[0],definition.graph.steps[0]]}});
 for(const policy of [{reducedMotion:true},{instance:{disabled:true}}]){const plan=compileMotion(recipe,{from:'closed',to:'open',...policy});expect(plan.tracks).toEqual([]);expect(plan.durationMs).toBe(0);expect(plan.stable.panel!.opacity).toBe('1');}
});
it('required stable targets are checked even when no track visits them',()=>{
 const recipe=defineMotionRecipe({...definition,targets:{...definition.targets,label:{properties:['opacity']}},graph:definition.graph.steps[0]});
 const plan=compileMotion(recipe,{from:'closed',to:'open',availableTargets:['panel']});expect(plan.outcome).toBe('stable-fallback');expect(plan.missingRequired).toEqual(['label']);expect(plan.tracks).toEqual([]);expect(plan.durationMs).toBe(0);
});
