/**
 * Representation provider interface (candidate public). A representation is a framework-owned, inert
 * visual of one participant (or of one element inside a participant) for one visual run. Providers receive
 * visual capabilities only: no store, dispatch, history, focus or effect authority.
 * Design: docs/development/fluid-motion/representation-design.md, representation-interface.md.
 */

/**
 * How a representation continues over time.
 * - `static`: a faithful snapshot of layout and paint (declarative animations may still be replayed).
 * - `live`: tracks its source every frame while the source exists.
 * - `retained`: keeps rendering after the source's business owner retires, under the visual run's lifetime.
 */
export type RepresentationContinuity = 'static' | 'live' | 'retained';

/** Scoped capabilities for one representation. Everything here belongs to the visual run. */
export interface RepresentationContext {
  /** The document of the Host (representations are created in it; never in the source subtree). */
  readonly document: Document;
  /** This provided representation's lifetime: aborted exactly once when it is disposed (its own failure, or settle, supersession without adoption, Host teardown). Other providers of the same participant are unaffected. */
  readonly signal: AbortSignal;
  /** Current reduced-motion preference (a live provider may choose a static representation). */
  readonly reducedMotion: boolean;
  /** Report a provider diagnostic (surfaced through `VisualConfiguration.onDiagnostic` and Host diagnostics). */
  diagnose(reason: string): void;
}

/** What a provider returns for one source element. The framework owns placement, sizing, clipping and opacity. */
export interface ProvidedRepresentation {
  /**
   * The visual node the framework places where the source is painted (at the source's border box inside
   * the representation). It must be inert decoration: no listeners, focusable content, IDs outside its own
   * scope, business resources or audible media. The framework adds `inert`/`aria-hidden` on its container.
   */
  readonly node: HTMLElement;
  readonly continuity: RepresentationContinuity;
  /**
   * Optional readiness (first frame decoded, media seeked). Observed, never awaited: it does not hold t0 or the
   * cue; the representation shows what it has (e.g. an underlay) until ready. A rejection is reported (`readyFailed`).
   */
  readonly ready?: Promise<void> | undefined;
  /** Write phase of each Host frame while the run is active (e.g. copy a frame, correct media drift). */
  frame?(time: number): void;
  /**
   * `beforeRemoval`: the source's business owner is retiring now (same frame as DOM removal). Return a
   * `RetainedRenderer` to keep rendering under the visual run until disposal; return nothing to keep the
   * last painted frame (reported as `liveEndedAtRetirement` for `live` continuity; never claimed live).
   */
  retire?(): RetainedRenderer | void;
  /** Idempotent. Called exactly once at settle, non-adopting supersession, Host teardown or failure. */
  dispose(): void;
}

/** Render authority transferred from a retiring owner to the visual run (bounded; no business authority). */
export interface RetainedRenderer {
  /** Write phase of each Host frame until disposal. */
  frame?(time: number): void;
  /** Idempotent; the provider releases every retained resource (render loop, contexts, players). */
  dispose(): void;
}

/** A provider declining one element: the next provider (finally the structural projection) is consulted. */
export interface RepresentationDecline {
  readonly declined: string;
  /**
   * S4 faithful settlement (optional, additive): `true` means the containing participant is not represented at all
   * (no placeholder, no blank choreography); its live source stays usable until the commit. Deterministic, also from
   * inside a same-origin iframe; unrelated participants are unaffected. Absent/false: an ordinary decline.
   */
  readonly settle?: boolean | undefined;
}

export interface RepresentationProvider {
  /** Lowercase identifier, unique within one configuration (diagnostics and adoption identity). */
  readonly name: string;
  /**
   * Called in the Host's batched read phase for the participant root and for each element inside it,
   * before the structural projection handles it. Synchronous; must not mutate the source or its
   * animations. Return a representation, a decline, or undefined (not handled).
   */
  represent(source: Element, context: RepresentationContext): ProvidedRepresentation | RepresentationDecline | undefined;
}

/** Public visual diagnostics (subset of the Host's internal record, stable shape). */
export type VisualDiagnostic =
  | { readonly type: 'representation'; readonly participant: string; readonly provider: string; readonly continuity: RepresentationContinuity | 'unrepresented'; readonly reason?: string | undefined }
  | { readonly type: 'unsupported'; readonly participant: string; readonly reason: string }
  | { readonly type: 'preparation'; readonly transaction: number; readonly workMs: number; readonly slices: number; readonly cached: number; readonly projected: number; readonly elements: number; readonly outcome: 'ready' | 'overBudget'; readonly readinessPending?: number | undefined }
  | { readonly type: 'settled'; readonly transaction: number; readonly reason: string };

/** Per-application visual configuration; created by `fluidMotion()` from `@composable-svelte/core/application/motion`. */
export interface VisualConfiguration {
  /** Opaque engine capability (motion subpath). Applications never construct it directly. */
  readonly engine: VisualEngineCapability;
  /** Consulted in order before the built-in providers (canvas/WebGL/video/image/iframe, then structural projection). */
  readonly providers: readonly RepresentationProvider[];
  /** Default preparation budget in ms for plans that do not declare one (finite, 16–5000; default 600). */
  readonly preparationBudgetMs: number;
  /** Optional native View Transition provider for content projection cannot reach. Default `off`. */
  readonly nativeSnapshot: 'off' | 'namedParticipants';
  readonly onDiagnostic?: ((event: VisualDiagnostic) => void) | undefined;
}

/** Branded engine capability (implementation detail of the motion subpath). */
export interface VisualEngineCapability { readonly kind: 'composable-visual-engine'; readonly version: 1 }

/** Options accepted by `fluidMotion()`. */
export interface FluidMotionOptions {
  readonly providers?: readonly RepresentationProvider[] | undefined;
  readonly preparationBudgetMs?: number | undefined;
  readonly nativeSnapshot?: 'off' | 'namedParticipants' | undefined;
  readonly onDiagnostic?: ((event: VisualDiagnostic) => void) | undefined;
}
