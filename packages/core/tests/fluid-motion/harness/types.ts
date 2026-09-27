/**
 * Types for browser motion evidence capture.
 * Contract: specs/frontend/fluid-layout-motion-design.md ("Proof required before public API finalization").
 *
 * "Paint eligible" throughout means DOM/style eligibility: connected, rendered, not hidden by
 * itself or an ancestor, non-zero opacity and a two-dimensional box. It is not compositor proof.
 */
import type { SamplePhase } from './checkpoint.js';

export interface ElementObservation {
  readonly connected: boolean;
  readonly rect: DOMRect | undefined;
  readonly opacity: number | undefined;
  readonly transform: string | undefined;
  /** document.activeElement is the element itself */
  readonly isFocused: boolean;
  readonly pointerEvents: string | undefined;
  readonly visibility: string | undefined;
  readonly display: string | undefined;
  /** Whether document.elementFromPoint at the element center directly targets the element or a descendant */
  readonly isHitTarget: boolean;
  /** Tag name of the element returned by document.elementFromPoint at the element center */
  readonly hitElementTag: string | null;
  /** False when the center lies outside the viewport, so no hit test ran (added in harness correction) */
  readonly hitTested?: boolean;
  /** Product of the element's and its ancestors' computed opacity (added in harness correction) */
  readonly effectiveOpacity?: number;
  /** Some ancestor has display:none, visibility:hidden or zero opacity (added in harness correction) */
  readonly hasHiddenAncestor?: boolean;
  /** DOM/style paint eligibility; see module note (added in harness correction) */
  readonly paintEligible?: boolean;
  /** The element matches :focus-visible (added in harness correction) */
  readonly focusVisible?: boolean;
  /** The element or a descendant is document.activeElement (added in harness correction) */
  readonly containsFocus?: boolean;
}

export interface FrameSample {
  /** Frame time: the rAF timestamp of the frame the sample belongs to (performance.now() for manual samples) */
  readonly time: number;
  readonly frameIndex: number;
  readonly elements: Readonly<Record<string, ElementObservation>>;
  /** Sampling phase; absent in hand-built samples (added in harness correction) */
  readonly phase?: SamplePhase;
}

export interface FrameRecordResult {
  readonly frames: readonly FrameSample[];
  readonly truncated: boolean;
  readonly maxFrames: number;
  readonly recordedCount: number;
  /** Sampling phase of every recorded frame (added in harness correction) */
  readonly phase?: SamplePhase;
  /** Rendering checkpoints whose frame ran but which were not delivered (added in harness correction) */
  readonly missedCheckpoints?: number;
  /** Sampling error that stopped the recorder, if any (added in harness correction) */
  readonly error?: string;
}

export interface VelocityEstimate {
  readonly time: number;
  readonly dt: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly dOpacity: number;
}

export interface DiscontinuityViolation {
  readonly frameIndex: number;
  readonly time: number;
  readonly dt: number;
  readonly reason: string;
  readonly deltaPosition?: number;
  readonly deltaOpacity?: number;
}

export interface DecorationSafetyReport {
  readonly isSafe: boolean;
  readonly inert: boolean;
  readonly ariaHidden: boolean;
  readonly bannedIds: readonly string[];
  readonly bannedControls: readonly string[];
  readonly bannedResources: readonly string[];
  readonly violations: readonly string[];
}

export interface RepresentationObservation {
  readonly present: boolean;
  readonly connected: boolean;
  readonly styleOpacity: string | undefined;
  readonly computedOpacity: number | undefined;
  readonly display: string | undefined;
  readonly visibility: string | undefined;
  readonly rect: DOMRect | undefined;
  readonly hasHiddenAncestor: boolean;
  readonly isPaintEligible: boolean;
}

/** Rendering-checkpoint observation made while the source was still connected. */
export interface RemovalCheckpoint {
  readonly time: number;
  readonly representation: RepresentationObservation;
  readonly sourceOpacity: number;
  readonly sourceRect: DOMRect;
  readonly sourcePaintEligible: boolean;
}

export interface RemovalWitnessEvent {
  /** performance.now() in the MutationObserver delivery that first saw the source disconnected */
  readonly time: number;
  /** Representation state at that delivery: after removal, before the next rendering update */
  readonly contemporaneousRepresentation: RepresentationObservation;
  /**
   * Deprecated alias of `revealedWithinRemovalInterval` (earlier it only meant
   * "eligible at removal", which is also true for an early reveal).
   */
  readonly sameFlushReveal: boolean;
  /** Last rendering checkpoint with the source connected (added in harness correction) */
  readonly lastCheckpointBeforeRemoval?: RemovalCheckpoint | undefined;
  /** Checkpoint preceding `lastCheckpointBeforeRemoval`, for slope estimates (added in harness correction) */
  readonly previousCheckpointBeforeRemoval?: RemovalCheckpoint | undefined;
  /**
   * Not eligible at the last rendering checkpoint before removal and eligible at removal: no
   * rendering update saw both, or neither (added in harness correction).
   */
  readonly revealedWithinRemovalInterval: boolean;
}

/** Representation at the first rendering checkpoint after removal (added in harness correction). */
export interface RemovalFollowUp {
  readonly time: number;
  readonly representation: RepresentationObservation;
}
