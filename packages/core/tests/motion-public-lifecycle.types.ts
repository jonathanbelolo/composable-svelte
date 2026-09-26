import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import type { MotionElementProps } from '../src/lib/application/motion-public.js';

const recipe = defineMotionRecipe({
  targets: { box: { properties: ['opacity'] } },
  states: { off: { box: { opacity: 0 } }, on: { box: { opacity: 1 } } },
  graph: { kind: 'track', target: 'box', properties: ['opacity'] },
  interruption: 'replace',
});

type Targets = typeof recipe.targets;
type States = keyof typeof recipe.states & string;

const anchor: MotionElementProps<Targets, States, Record<never, never>, 'a'> = {
  as: 'a',
  recipe,
  state: 'off',
  href: '/motion',
};
const exactState: 'off' | 'on' = anchor.state;
void exactState;

// @ts-expect-error state names remain the recipe's exact literals
const unknownState: MotionElementProps<Targets, States> = { recipe, state: 'missing' };
void unknownState;

// @ts-expect-error the lifecycle owns the stable style attribute
const replacedStyle: MotionElementProps<Targets, States> = { recipe, state: 'off', style: 'opacity:1' };
void replacedStyle;

const wrongTagAttribute: MotionElementProps<Targets, States, Record<never, never>, 'button'> = {
  as: 'button',
  recipe,
  state: 'off',
  // @ts-expect-error button props do not accept anchor-only href
  href: '/motion',
};
void wrongTagAttribute;

const multi = defineMotionRecipe({
  targets: {
    box: { properties: ['opacity'] },
    label: { properties: ['opacity'] },
  },
  states: {
    off: { box: { opacity: 0 }, label: { opacity: 0 } },
    on: { box: { opacity: 1 }, label: { opacity: 1 } },
  },
  graph: { kind: 'track', target: 'box', properties: ['opacity'] },
  interruption: 'replace',
});
type MultiTargets = typeof multi.targets;
type MultiStates = keyof typeof multi.states & string;
// @ts-expect-error the first public slice accepts exactly one declared target
const multiTarget: MotionElementProps<MultiTargets, MultiStates> = { recipe: multi, state: 'off' };
void multiTarget;
