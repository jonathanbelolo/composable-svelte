import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import {
  planPlayback,
  planMotionPlayback,
  type PlaybackDecision,
  type PlayDecision,
  type PublishableStable,
  type StableOnlyDecision,
} from '../src/lib/application/motion/playback-plan.js';

const recipe = defineMotionRecipe({
  targets: {
    icon: { properties: ['opacity'] },
    panel: { properties: ['width'], optional: true }
  },
  states: {
    off: { icon: { opacity: 0 }, panel: { width: 0 } },
    on: { icon: { opacity: 1 }, panel: { width: 100 } }
  },
  graph: { kind: 'track', target: 'icon', properties: ['opacity'] },
  interruption: 'replace'
});

const decision: PlaybackDecision<typeof recipe['targets']> = planPlayback(recipe, { from: 'off', to: 'on' });

const iconOpacity: string = decision.stable.icon.opacity;
// @ts-expect-error undeclared target on stable projection
decision.stable.missing;
// @ts-expect-error undeclared property on stable target
decision.stable.icon.transform;

// Publishable type witness: absent keys are possibly undefined, known defined, unknown rejected
const publishable: PublishableStable<typeof recipe['targets']> = decision.publishable;
const panelPublishable: { readonly width: string } | undefined = decision.publishable.panel;
// @ts-expect-error publishable entries can be undefined
const panelDefinite: { readonly width: string } = decision.publishable.panel;
// stable entries are never undefined
const panelStable: { readonly width: string } = decision.stable.panel;

const iconPublishable: { readonly opacity: string } | undefined = decision.publishable.icon;
// @ts-expect-error publishable icon entry can be undefined
const iconDefinite: { readonly opacity: string } = decision.publishable.icon;

// @ts-expect-error unknown target on publishable
decision.publishable.ghost;

// @ts-expect-error unknown state must not be accepted as to
planPlayback(recipe, { from: 'off', to: 'unknown' });

// @ts-expect-error unknown state must not be accepted as from
planPlayback(recipe, { from: 'unknown', to: 'on' });

// @ts-expect-error unknown target must not be accepted in availableTargets
planPlayback(recipe, { from: 'off', to: 'on', availableTargets: ['missing'] });

if (decision.kind === 'play') {
  const playDecision: PlayDecision<typeof recipe['targets']> = decision;
  const trackTarget: 'icon' | 'panel' = decision.compiled.tracks[0]!.target;
  // @ts-expect-error track target cannot collapse to never
  const trackTargetNever: never = decision.compiled.tracks[0]!.target;
} else {
  const stableOnlyDecision: StableOnlyDecision<typeof recipe['targets']> = decision;
  if (decision.reason === 'compile-rejected') {
    const diagName: string = decision.diagnostic.name;
    const diagMsg: string = decision.diagnostic.message;
    // @ts-expect-error compile-rejected has no usable compiled motion
    decision.compiled.durationMs;
  } else {
    const compiledDuration: number = decision.compiled.durationMs;
  }
}

planMotionPlayback(recipe, {from: 'off', to: 'on'});
// @ts-expect-error alias preserves exact state keys
planMotionPlayback(recipe, {from: 'off', to: 'missing'});
