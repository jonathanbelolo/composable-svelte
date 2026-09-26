import { defineMotionRecipe } from '../src/lib/application/motion/compiler.js';
import {
  useMotionGroup,
  type MotionGroupHandle,
  type MotionGroupTargets,
  type MotionHandle,
} from '../src/lib/application/motion-public.js';

const recipe = defineMotionRecipe({
  targets: {
    surface: { properties: ['opacity'] },
    title: { properties: ['opacity', 'width'] },
  },
  states: {
    collapsed: {
      surface: { opacity: 0.5 },
      title: { opacity: 0, width: 0 },
    },
    expanded: {
      surface: { opacity: 1 },
      title: { opacity: 1, width: 120 },
    },
  },
  graph: {
    kind: 'parallel',
    steps: [
      { kind: 'track', target: 'surface', properties: ['opacity'] },
      { kind: 'track', target: 'title', properties: ['opacity', 'width'] },
    ],
  },
  interruption: 'replace',
});

type Targets = typeof recipe.targets;
type States = keyof typeof recipe.states & string;

const state: States = 'collapsed';
const group: MotionGroupHandle<Targets> = useMotionGroup(recipe, () => state);

// Exact readonly surface and title keys retained, each value is MotionHandle
const surfaceHandle: MotionHandle = group.targets.surface;
const titleHandle: MotionHandle = group.targets.title;
const surfaceStyle: string = group.targets.surface.style;
const titleStyle: string = group.targets.title.style;
void surfaceHandle;
void titleHandle;
void surfaceStyle;
void titleStyle;

// Exact target type identity
type ExpectedTargets = MotionGroupTargets<Targets>;
const exactTargets: ExpectedTargets = group.targets;
void exactTargets;

// @ts-expect-error unknown target keys fail
const unknownTarget = group.targets.unknown;
void unknownTarget;

// @ts-expect-error missing target key in mapped targets fails
const missingKey: ExpectedTargets = {
  surface: group.targets.surface,
};
void missingKey;

const extraKey: ExpectedTargets = {
  surface: group.targets.surface,
  title: group.targets.title,
  // @ts-expect-error extra target key in mapped targets fails
  extra: group.targets.surface,
};
void extraKey;

// Invalid state literals fail
// @ts-expect-error invalid state literal fails
useMotionGroup(recipe, () => 'missing');

// @ts-expect-error invalid state literal fails
useMotionGroup(recipe, () => 'invalid');

// Mapped target property cannot be replaced
// @ts-expect-error surface target property is readonly and cannot be replaced
group.targets.surface = surfaceHandle;

// @ts-expect-error title target property is readonly and cannot be replaced
group.targets.title = titleHandle;

// @ts-expect-error targets container is readonly and cannot be replaced
group.targets = group.targets;

// @ts-expect-error target handle style property is readonly and cannot be replaced
group.targets.surface.style = 'opacity: 1';

// @ts-expect-error target handle attach action is readonly and cannot be replaced
group.targets.surface.attach = () => ({ destroy() {} });
