import {
  fluidMotion,
  type ProvidedRepresentation,
  type RepresentationProvider,
  type RetainedRenderer,
  type VisualDiagnostic
} from '@composable-svelte/core/application/motion';

// A pure visual function of time: no store, no dispatch, no business state.
export type PulseArt = (paint: CanvasRenderingContext2D, time: number) => void;

export const pulseArt: PulseArt = (paint, time) => {
  const { width, height } = paint.canvas;
  paint.clearRect(0, 0, width, height);
  paint.fillStyle = '#38bdf8';
  paint.fillRect(0, 0, width * (0.5 + 0.5 * Math.sin(time / 300)), height);
};

// Keeps a pulse drawing on the motion plane after its page retires. It owns its registry: <Pulse> finds
// this provider with useRepresentationProvider('pulse') and registers its canvas while it is mounted.
export type PulseProvider = RepresentationProvider & {
  register(canvas: HTMLCanvasElement, art: PulseArt): () => void;
};

export function createPulseProvider(): PulseProvider {
  const pulses = new WeakMap<HTMLCanvasElement, PulseArt>();
  return {
    name: 'pulse',
    register(canvas, art) {
      pulses.set(canvas, art);
      return () => { pulses.delete(canvas); };
    },
    // Runs in the Host's read phase: synchronous, and it must not touch the source element or its animations.
    represent(source, context): ProvidedRepresentation | undefined {
      const art = source instanceof HTMLCanvasElement ? pulses.get(source) : undefined;
      if (!art || !(source instanceof HTMLCanvasElement)) return undefined; // Not ours: the next provider, then the built-ins.
      const node = context.document.createElement('canvas');
      node.width = source.width;
      node.height = source.height;
      node.dataset.pulse = '';
      const paint = node.getContext('2d');
      const draw = (time: number) => { if (paint) art(paint, time); };
      draw(performance.now());
      const release = () => { node.width = 0; };
      if (context.reducedMotion) return { node, continuity: 'static', dispose: release };
      // After retirement the run owns rendering: it calls frame() until it disposes this renderer.
      const retained: RetainedRenderer = { frame: draw, dispose: release };
      return { node, continuity: 'retained', frame: draw, retire: () => retained, dispose: release };
    }
  };
}

// Public diagnostics: bounded here; forward them to your own telemetry in production.
export const visualLog: VisualDiagnostic[] = [];
export function recordVisual(event: VisualDiagnostic): void {
  visualLog.push(event);
  if (visualLog.length > 200) visualLog.shift();
}

// The application's visual configuration (passed to defineApplication as `visual`).
export const visual = fluidMotion({
  providers: [createPulseProvider()], // consulted in order, before the built-in providers
  preparationBudgetMs: 250, // for plans that do not declare their own (16–5000; framework default 600), within the staging deadline
  onDiagnostic: recordVisual
});

// Pages whose participants contain cross-origin embeds can opt into native snapshots (route runs only).
export const embedVisual = fluidMotion({ nativeSnapshot: 'namedParticipants', onDiagnostic: recordVisual });
