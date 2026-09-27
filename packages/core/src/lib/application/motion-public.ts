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

// Prospective fluid route choreography (candidate public, not finalized).
export { defineChoreography, type ChoreographyPlan, type ChoreographyTrack } from './renderer/choreography/plan.js';
export { useParticipant, useLayoutChoreography, type ParticipantOptions, type LayoutChoreography } from './renderer/choreography/participant.js';
export { defineVisualDriver, type VisualDriver, type VisualDriverInput, type VisualDriverOutput } from './renderer/choreography/drivers.js';
export { default as MotionPlane } from './MotionPlane.svelte';
export { QUALIFIED_PAINT_POLICIES, type PaintPolicy, type Pose, type Waypoint, type Corners, type Inset, type ContentPolicy } from './renderer/choreography/plan.js';
// Representation providers and per-application visual configuration (candidate public).
export { fluidMotion } from './renderer/choreography/engine.js';
// S2/S3 core seams (docs/development/fluid-motion/core-media-seam-interface.md).
export { useRepresentationProvider } from './renderer/choreography/participant.js';
export { default as Presence } from './Presence.svelte';
export type { RepresentationProvider, ProvidedRepresentation, RetainedRenderer, RepresentationContext, RepresentationContinuity, RepresentationDecline, VisualConfiguration, VisualDiagnostic, FluidMotionOptions } from './renderer/representation/types.js';
