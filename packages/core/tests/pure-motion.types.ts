import {defineMotionRecipe,compileMotion,stableProjection,serializeStableStyle} from '../src/lib/application/motion/compiler.js';
const recipe=defineMotionRecipe({targets:{icon:{properties:['opacity']}},states:{off:{icon:{opacity:0}},on:{icon:{opacity:1}}},graph:{kind:'track',target:'icon',properties:['opacity']},interruption:'replace'});
compileMotion(recipe,{from:'off',to:'on'});
// @ts-expect-error unknown state must not widen inferred names
compileMotion(recipe,{from:'off',to:'unknown'});
// @ts-expect-error exact state keys remain named
stableProjection(recipe,'unknown');
defineMotionRecipe({targets:{icon:{properties:['opacity']}},states:{on:{icon:{opacity:1}}},graph:{kind:'track',target:'icon',
// @ts-expect-error undeclared property
properties:['transform']},interruption:'replace'});
defineMotionRecipe({targets:{icon:{properties:['opacity']}},states:{on:{icon:{opacity:1}}},graph:{kind:'track',
// @ts-expect-error unknown target
 target:'missing',properties:['opacity']},interruption:'replace'});

// @ts-expect-error unknown available target
compileMotion(recipe,{from:'off',to:'on',availableTargets:['missing']});
const projection=stableProjection(recipe,'on');
// @ts-expect-error unknown projection target
projection.missing;
// @ts-expect-error undeclared projection property
projection.icon.transform;

// @ts-expect-error serializer state cannot widen recipe state names
serializeStableStyle(recipe,'unknown','icon');
// @ts-expect-error serializer target cannot widen recipe targets
serializeStableStyle(recipe,'on','missing');

const compiled=compileMotion(recipe,{from:'off',to:'on'});
const literalTargets: readonly 'icon'[]=compiled.missingRequired;
const literalOptional: readonly 'icon'[]=compiled.skippedOptional;
// @ts-expect-error missingRequired cannot collapse to never
const missingNever: readonly never[] = compiled.missingRequired;
// @ts-expect-error skippedOptional cannot collapse to never
const skippedNever: readonly never[] = compiled.skippedOptional;
// @ts-expect-error compiled projection retains exact targets
compiled.stable.missing;
// @ts-expect-error compiled projection retains exact properties
compiled.stable.icon!.transform;

const track = compiled.tracks[0]!;
const trackTarget: 'icon' = track.target;
const trackProp: 'opacity' = track.properties[0]!.property;
// @ts-expect-error track target cannot collapse to never
const trackTargetNever: never = track.target;
// @ts-expect-error track property cannot collapse to never
const trackPropNever: never = track.properties[0]!.property;
// @ts-expect-error unknown track target assignment must fail
const badTrackTarget: 'missing' = track.target;
// @ts-expect-error unknown track property assignment must fail
const badTrackProp: 'transform' = track.properties[0]!.property;

const multiRecipe = defineMotionRecipe({
 targets: {
  panel: { properties: ['opacity', 'width'] },
  label: { properties: ['color'], optional: true }
 },
 states: {
  open: { panel: { opacity: 1, width: 100 }, label: { color: '#000' } },
  closed: { panel: { opacity: 0, width: 0 }, label: { color: '#fff' } }
 },
 graph: {
  kind: 'sequence',
  steps: [
   { kind: 'track', target: 'panel', properties: ['opacity', 'width'] },
   { kind: 'track', target: 'label', properties: ['color'] }
  ]
 },
 interruption: 'replace'
});
const multiCompiled = compileMotion(multiRecipe, { from: 'closed', to: 'open' });
const multiTrack = multiCompiled.tracks[0]!;
const multiTarget: 'panel' | 'label' = multiTrack.target;
// @ts-expect-error multi-target cannot collapse to never
const multiTargetNever: never = multiTrack.target;
// @ts-expect-error unknown target assignment must fail
const badMultiTarget: 'missing' = multiTrack.target;

if (multiTrack.target === 'label') {
 const labelProp: 'color' = multiTrack.properties[0]!.property;
 // @ts-expect-error correlated property narrowing rejects panel properties on label
 const badLabelProp: 'width' = multiTrack.properties[0]!.property;
 // @ts-expect-error narrowed property cannot collapse to never
 const labelPropNever: never = multiTrack.properties[0]!.property;
}
if (multiTrack.target === 'panel') {
 const panelProp: 'opacity' | 'width' = multiTrack.properties[0]!.property;
 // @ts-expect-error correlated property narrowing rejects label properties on panel
 const badPanelProp: 'color' = multiTrack.properties[0]!.property;
 // @ts-expect-error narrowed property cannot collapse to never
 const panelPropNever: never = multiTrack.properties[0]!.property;
}

defineMotionRecipe({
 targets: {
  // @ts-expect-error undeclared custom property without numericProperties must fail
  icon: { properties: ['--undeclared'] }
 },
 // @ts-expect-error undeclared custom property cannot appear in a stable state
 states: { on: { icon: { '--undeclared': 1 } } },
 // @ts-expect-error undeclared custom property cannot appear in a track
 graph: { kind: 'track', target: 'icon', properties: ['--undeclared'] },
 interruption: 'replace'
});

defineMotionRecipe({
 numericProperties: { '--declared': { unit: 'number', interpolation: 'number' } },
 targets: {
  // @ts-expect-error undeclared custom property with numericProperties must fail
  icon: { properties: ['--other'] }
 },
 // @ts-expect-error custom property missing from numericProperties cannot appear in a stable state
 states: { on: { icon: { '--other': 1 } } },
 // @ts-expect-error custom property missing from numericProperties cannot appear in a track
 graph: { kind: 'track', target: 'icon', properties: ['--other'] },
 interruption: 'replace'
});

const customRecipe = defineMotionRecipe({
 numericProperties: { '--progress': { unit: 'number', interpolation: 'number' } },
 targets: { bar: { properties: ['--progress', 'opacity'] } },
 states: {
  off: { bar: { '--progress': 0, opacity: 0 } },
  on: { bar: { '--progress': 1, opacity: 1 } }
 },
 graph: { kind: 'track', target: 'bar', properties: ['--progress', 'opacity'] },
 interruption: 'replace'
});
const customCompiled = compileMotion(customRecipe, { from: 'off', to: 'on' });
const customTrack = customCompiled.tracks[0]!;
const customTarget: 'bar' = customTrack.target;
const customProp: '--progress' | 'opacity' = customTrack.properties[0]!.property;
// @ts-expect-error custom target cannot collapse to never
const customTargetNever: never = customTrack.target;
// @ts-expect-error custom property cannot collapse to never
const customPropNever: never = customTrack.properties[0]!.property;
// @ts-expect-error undeclared custom property assignment must fail
const badCustomProp: '--undeclared' = customTrack.properties[0]!.property;
