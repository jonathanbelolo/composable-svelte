/**
 * How this package's config values map onto Babylon's own ranges and modes.
 *
 * Separated from the adapter because the adapter needs a WebGL context and this
 * package runs its tests under jsdom — so this is the part that can actually be
 * asserted. What Babylon then does with the number is not covered by anything
 * here.
 */

/**
 * Babylon's default `specularPower`, and the value a material keeps when no
 * roughness is supplied (`standardMaterial.js:252`).
 */
export const DEFAULT_SPECULAR_POWER = 64;

/**
 * The usable ends of the range. Below ~2 the highlight washes over the whole
 * surface; past ~126 it is a pinpoint and further increases stop reading.
 *
 * Chosen so the midpoint is exactly `DEFAULT_SPECULAR_POWER`: a material that
 * sets `roughness: 0.5` looks like one that sets no roughness at all. An
 * even 2–128 span misses that by one, which is invisible on screen but makes
 * the contract approximate for no reason.
 */
const ROUGHEST_SPECULAR_POWER = 2;
const SMOOTHEST_SPECULAR_POWER = 126;

/**
 * Translate a 0–1 roughness into a `specularPower`.
 *
 * `roughness` was declared on `MaterialConfig`, documented across an entire
 * "PBR Workflow" section with ~20 material examples, passed on five meshes by
 * the styleguide — and read by nothing. `applyMaterial` handled `color`,
 * `metallic`, `emissive`, `alpha` and `wireframe`, under a comment that said
 * "Set metallic/roughness".
 *
 * `specularPower` is the lever `StandardMaterial` has, and its own Babylon doc
 * describes the relationship exactly: *"The bigger the value the sharper giving
 * a more glossy feeling to the result. Reversely, the smaller the value the
 * blurrier giving a more rough feeling."* So this is inverted and linear, with
 * 0.5 landing near Babylon's own default — a material that sets roughness to
 * the middle looks like one that sets nothing.
 *
 * This is a highlight-tightness knob, not physically based shading.
 * `PBRMaterial` is where `metallic` and `roughness` are real channels, and
 * moving to it would change the lighting model for every existing mesh. The
 * documentation is corrected to describe what this is rather than the other
 * way round.
 */
export function specularPowerFromRoughness(roughness: number): number {
  const clamped = Math.min(1, Math.max(0, roughness));
  return (
    SMOOTHEST_SPECULAR_POWER -
    clamped * (SMOOTHEST_SPECULAR_POWER - ROUGHEST_SPECULAR_POWER)
  );
}

/**
 * The default orthographic half-height, in world units.
 *
 * `orthoSize` had no default because nothing read it — the camera has been
 * "orthographic-capable" in name only. 5 puts a 10-unit-tall view in frame,
 * which matches the perspective camera's default radius of 10 closely enough
 * that switching `type` reframes rather than jumps.
 */
export const DEFAULT_ORTHO_SIZE = 5;

/**
 * The orthographic bounds for a given half-height and viewport aspect ratio.
 *
 * `orthoSize` is the half-height in world units; the half-width follows from
 * the aspect so the view is not stretched. Babylon wants all four edges set
 * explicitly (`orthoLeft`/`orthoRight`/`orthoTop`/`orthoBottom`); leaving any
 * of them null falls back to the engine viewport, which is pixels rather than
 * world units.
 */
export function orthographicBounds(
  orthoSize: number,
  aspectRatio: number
): { left: number; right: number; top: number; bottom: number } {
  const halfHeight = orthoSize;
  // Guard the degenerate case: a zero-height canvas gives an aspect of 0 or
  // Infinity, and either would collapse or explode the frustum.
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const halfWidth = halfHeight * safeAspect;

  return { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight };
}
