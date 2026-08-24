/**
 * How this package's config values map onto Babylon's own ranges and modes.
 *
 * Separated from the adapter so the arithmetic can be asserted on its own. The
 * adapter itself is covered too, against a real Babylon `Scene` — see
 * `tests/babylon-adapter.test.ts`. (This header used to claim the adapter was
 * untestable "because jsdom cannot give Babylon a WebGL context". `NullEngine`
 * needs no context at all, and every material defect in this file's sibling was
 * invisible only because of that assumption.)
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
  const clamped = clamp01(roughness);
  return (
    SMOOTHEST_SPECULAR_POWER -
    clamped * (SMOOTHEST_SPECULAR_POWER - ROUGHEST_SPECULAR_POWER)
  );
}

/** NaN included: `Math.min`/`Math.max` propagate it, an explicit test does not. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_ROUGHNESS;
  return Math.min(1, Math.max(0, value));
}

/**
 * What a material with no `metallic` / `roughness` behaves as.
 *
 * Omitting **both** leaves the material looking precisely as
 * `StandardMaterial` would on its own: `specularColor` white and
 * `specularPower` 64, Babylon's own values.
 *
 * Not "either": `roughness` drives brightness as well as tightness, so omitting
 * only `metallic` still gives Babylon's defaults, while omitting only
 * `roughness` does not — `specularFor(grey, 0, 0.9)` is a dimmed grey, which is
 * the point of the mapping. The skill file documented these two numbers as
 * defaults while the code had none; now they are real.
 */
export const DEFAULT_METALLIC = 0;
export const DEFAULT_ROUGHNESS = 0.5;

/**
 * How dimming starts only past the midpoint. At `roughness` 1 the highlight is
 * reduced to a tenth rather than to nothing: a surface with no specular at all
 * reads as unlit rather than as matte.
 */
const MATTE_FLOOR = 0.1;

/**
 * The dimmest a tinted highlight may get, roughly a dielectric's Fresnel
 * reflectance at normal incidence.
 *
 * Without it, tinting toward the diffuse colour merely *moves* the
 * black-specular problem rather than removing it: a near-black surface at
 * `metallic: 1` gets a near-black highlight, and Babylon's shader multiplies,
 * so `specularPower` again cannot change a pixel. Polished black metal is an
 * ordinary request — gunmetal, black chrome, dark car paint — and it rendered
 * as flat matte black, which is the very defect this mapping exists to fix.
 */
const MIN_SPECULAR = 0.05;

/**
 * The `specularColor` and `specularPower` for a material config.
 *
 * ## Why this is not just `specularPower`
 *
 * The first attempt at honouring `roughness` set `specularPower` and left
 * `metallic` mapped straight onto `specularColor` as a grey. That fixed
 * nothing for most materials, because Babylon's default fragment shader is
 *
 * ```glsl
 * float glossiness = vSpecularColor.a;      // ← specularPower
 * vec3  specularColor = vSpecularColor.rgb;
 * vec3  finalSpecular = specularBase * specularColor;
 * ```
 *
 * — a multiply. `metallic: 0` gave `specularColor` black, which zeroes
 * `finalSpecular` no matter what `glossiness` is. And `metallic: 0.0` is
 * exactly what the documentation teaches for plastic, rubber, wood, stone and
 * glass: 7 of the 13 material presets, including the mirror, were guaranteed to
 * have no highlight for `roughness` to sharpen.
 *
 * ## The mapping
 *
 * `metallic` **tints** the highlight and never extinguishes it. Dielectrics
 * reflect white, metals reflect their own colour — so this interpolates from
 * white to the diffuse colour, with a floor (`MIN_SPECULAR`) so that a very
 * dark metal still has a highlight to sharpen. That is the one real difference
 * between a metal and a non-metal that a specular/glossiness model can express.
 *
 * How visible `metallic` is therefore depends on the surface colour: on a white
 * or near-white surface it is a no-op, because white tinted toward white is
 * white. That is correct — a white metal and a white dielectric really do
 * reflect the same colour — but it means `metallic` alone does not distinguish
 * chrome from white plastic. `roughness` is what separates those.
 *
 * `roughness` sets how tight the highlight is (`specularPower`) and, past the
 * midpoint, how bright. Breadth alone is not enough: a fully rough surface at
 * full intensity reads as wet, not matte. Below the midpoint the highlight is
 * at full strength and only sharpens, so `roughness: 0.5` lands on Babylon's
 * untouched defaults in both channels.
 *
 * Still not physically based shading — `PBRMaterial` is where `metallic` and
 * `roughness` are real channels, and switching to it would change the lighting
 * model for every existing mesh.
 */
export function specularFor(
  diffuse: readonly [number, number, number],
  metallic: number | undefined,
  roughness: number | undefined
): { color: [number, number, number]; power: number } {
  const m = clamp01(metallic ?? DEFAULT_METALLIC);
  const r = clamp01(roughness ?? DEFAULT_ROUGHNESS);

  // Full strength up to the midpoint, falling to MATTE_FLOOR at fully rough.
  const intensity = r <= 0.5 ? 1 : 1 - ((r - 0.5) / 0.5) * (1 - MATTE_FLOOR);

  const tint = (channel: number): number => Math.max((1 - m) + m * channel, MIN_SPECULAR);

  return {
    color: [
      tint(diffuse[0]) * intensity,
      tint(diffuse[1]) * intensity,
      tint(diffuse[2]) * intensity
    ],
    power: specularPowerFromRoughness(r)
  };
}

/**
 * The default orthographic half-height, in world units.
 *
 * `orthoSize` had no default because nothing read it — the camera has been
 * "orthographic-capable" in name only. 5 puts a 10-unit-tall view in frame.
 *
 * This used to claim it "matches the perspective camera's default radius of 10
 * closely enough that switching `type` reframes rather than jumps". That
 * conflated the camera's *radius* with the height it *frames*, which are not
 * the same quantity: at the shipped defaults (position `[0, 5, 10]`, `fov` 45,
 * so a distance of 11.18) the perspective camera frames
 * `2 × 11.18 × tan(22.5°)` = 9.26 world units. There is no single right
 * default, because the perspective framing moves with the camera; 5 is a round
 * number, and `orthoSize` is there for when it is wrong.
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
