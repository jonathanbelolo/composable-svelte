/**
 * Managed custom visual drivers (candidate public). A driver is a pure visual sampler run under the
 * choreography lifecycle: it receives numbers only (no store, dispatch, history, focus or DOM) and
 * returns channel values for its shared representation. It declares its continuation capability:
 * `pose` = the framework may continue from its displayed pose (Hermite, finite-difference velocity) when
 * the destination is measured or the run is superseded; `none` = the track settles to the measured
 * destination without continuity (reported). A throwing sampler fails only its own track (reported);
 * `dispose` runs once when the run settles.
 */
export interface VisualDriverInput {
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly progress: number;
  /** Source rect [x, y, width, height] measured at preparation. */
  readonly from: readonly [number, number, number, number];
}
export interface VisualDriverOutput { readonly x?: number; readonly y?: number; readonly width?: number; readonly height?: number; readonly opacity?: number }
export interface VisualDriver {
  readonly name: string;
  readonly continuation: 'pose' | 'none';
  sample(input: VisualDriverInput): VisualDriverOutput;
  dispose?(): void;
}
const drivers = new Map<string, VisualDriver>();
export function defineVisualDriver(driver: VisualDriver): string {
  if (!driver || typeof driver.name !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(driver.name)) throw new TypeError('A visual driver has a lowercase name');
  if (driver.continuation !== 'pose' && driver.continuation !== 'none') throw new TypeError('A visual driver declares continuation pose or none');
  if (typeof driver.sample !== 'function') throw new TypeError('A visual driver samples');
  if (drivers.has(driver.name) && drivers.get(driver.name) !== driver) throw new Error(`Visual driver ${driver.name} is already defined`);
  drivers.set(driver.name, Object.freeze({ ...driver }));
  return driver.name;
}
export function visualDriver(name: string): VisualDriver | undefined { return drivers.get(name); }
