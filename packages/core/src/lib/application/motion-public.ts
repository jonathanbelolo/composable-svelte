export {
  defineMotionRecipe,
  serializeStableStyle,
  stableProjection,
  type MotionRecipe,
  type MotionDefinition,
  type TargetSchema,
  type TargetDefinition,
  type StableState,
  type MotionGraph,
  type StableProjection,
} from './motion/compiler.js';

export {
  type NumericDescriptors,
  type NumericDescriptor,
  type MotionProperty,
  type BuiltinMotionProperty,
  type MotionValue,
  type LengthValue,
  type ColorValue,
  type LengthUnit,
  type NumericUnit,
} from './motion/properties.js';

export {
  type TokenOverrides,
  type MotionTokens,
  type Easing,
  defaultMotionTokens,
} from './motion/tokens.js';

export {
  useMotion,
  type MotionHandle,
  type MotionElementProps,
  type SoleTargetOf,
  type SoleTargetGuard,
} from './use-motion.svelte.js';

export { 
  useMotionGroup,
  type MotionGroupHandle,
  type MotionGroupTargets,
} from './use-motion-group.svelte.js';

export { default as MotionElement } from './MotionElement.svelte';
