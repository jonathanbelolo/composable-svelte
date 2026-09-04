/**
 * @file layer-spec.ts
 * @description Translating this package's `Layer`/`LayerStyle` into the
 * source, layer and paint specs a GL map understands — as pure data, with no
 * SDK involved.
 *
 * MapLibre GL and Mapbox GL descend from the same codebase and take the same
 * style spec, so the *translation* is identical for both and only the object it
 * is handed to differs. Keeping it here means `MaplibreAdapter` and
 * `MapboxAdapter` share one definition of what a heatmap gradient or a stroke
 * layer looks like, rather than two that drift.
 *
 * Everything in this file is a pure function of its arguments. That is what
 * makes it testable without a canvas, and it is where the interesting logic
 * lives — the adapters that call it are little more than method dispatch.
 */

import type { Layer, LayerStyle } from '../types/map.types.js';

/** The default heatmap ramp, used when a layer supplies no `colorGradient`. */
export const DEFAULT_HEATMAP_GRADIENT: [number, string][] = [
	[0, 'rgba(0, 0, 255, 0)'],
	[0.5, 'rgba(0, 255, 0, 1)'],
	[1, 'rgba(255, 0, 0, 1)']
];

/** The id of the companion line layer drawn for a polygon's stroke. */
export const strokeLayerId = (layerId: string): string => `${layerId}-stroke`;

/**
 * A GL `interpolate` expression over heatmap density.
 *
 * Flattened from `[[stop, color], …]` to `['interpolate', ['linear'],
 * ['heatmap-density'], stop, color, …]`, which is the shape the style spec
 * wants and is easy to get subtly wrong by hand — the pairs have to be spread,
 * not pushed as tuples.
 */
export function heatmapColorExpression(gradient?: [number, string][]): unknown[] {
	const stops = gradient ?? DEFAULT_HEATMAP_GRADIENT;
	const expression: unknown[] = ['interpolate', ['linear'], ['heatmap-density']];
	for (const [stop, color] of stops) expression.push(stop, color);
	return expression;
}

/** `visibility`, which every layer carries and neither SDK infers. */
export const visibilityLayout = (visible: boolean): { visibility: 'visible' | 'none' } => ({
	visibility: visible ? 'visible' : 'none'
});

/** The GeoJSON source spec for a layer, whether its data is inline or a URL. */
export const geojsonSource = (layer: Layer): { type: 'geojson'; data: unknown } => ({
	type: 'geojson',
	data: layer.data
});

/**
 * The layer specs to add for one `Layer`, in draw order.
 *
 * A polygon with a stroke becomes *two* GL layers — a fill and a line — and the
 * caller needs both, in this order. Returning a list rather than having each
 * adapter re-derive that is the point: the stroke layer's id, and the fact that
 * it is conditional on `strokeColor`, were previously written out twice.
 */
export function layerSpecs(layer: Layer): Array<Record<string, unknown>> {
	const layout = visibilityLayout(layer.visible);

	if (layer.type === 'heatmap') {
		return [
			{
				id: layer.id,
				type: 'heatmap',
				source: layer.id,
				paint: {
					'heatmap-intensity': layer.style.intensity ?? 1,
					'heatmap-radius': layer.style.radius ?? 20,
					'heatmap-color': heatmapColorExpression(layer.style.colorGradient)
				},
				layout
			}
		];
	}

	const specs: Array<Record<string, unknown>> = [
		{
			id: layer.id,
			type: 'fill',
			source: layer.id,
			paint: {
				'fill-color': layer.style.fillColor ?? '#0080ff',
				'fill-opacity': layer.style.fillOpacity ?? 0.5
			},
			layout
		}
	];

	if (layer.style.strokeColor) {
		specs.push({
			id: strokeLayerId(layer.id),
			type: 'line',
			source: layer.id,
			paint: {
				'line-color': layer.style.strokeColor,
				'line-width': layer.style.strokeWidth ?? 1,
				'line-opacity': layer.style.strokeOpacity ?? 1
			},
			layout
		});
	}

	return specs;
}

/** One `setPaintProperty` call: which GL layer, which property, what value. */
export interface PaintUpdate {
	layerId: string;
	property: string;
	value: unknown;
}

/**
 * The paint updates a partial style change implies.
 *
 * Only for keys actually present in the patch — `undefined` means "unchanged",
 * not "reset to default", so a patch of `{ fillOpacity: 0 }` must update and a
 * patch of `{}` must do nothing. Both adapters previously spelled this out as a
 * ladder of `if (style.x !== undefined)`, twice over.
 */
export function paintUpdates(layer: Layer, style: Partial<LayerStyle>): PaintUpdate[] {
	const updates: PaintUpdate[] = [];
	const has = (key: keyof LayerStyle) => style[key] !== undefined;

	if (layer.type === 'heatmap') {
		if (has('intensity'))
			updates.push({ layerId: layer.id, property: 'heatmap-intensity', value: style.intensity });
		if (has('radius'))
			updates.push({ layerId: layer.id, property: 'heatmap-radius', value: style.radius });
		if (has('colorGradient'))
			updates.push({
				layerId: layer.id,
				property: 'heatmap-color',
				value: heatmapColorExpression(style.colorGradient)
			});
		return updates;
	}

	if (has('fillColor'))
		updates.push({ layerId: layer.id, property: 'fill-color', value: style.fillColor });
	if (has('fillOpacity'))
		updates.push({ layerId: layer.id, property: 'fill-opacity', value: style.fillOpacity });

	const stroke = strokeLayerId(layer.id);
	if (has('strokeColor'))
		updates.push({ layerId: stroke, property: 'line-color', value: style.strokeColor });
	if (has('strokeWidth'))
		updates.push({ layerId: stroke, property: 'line-width', value: style.strokeWidth });
	if (has('strokeOpacity'))
		updates.push({ layerId: stroke, property: 'line-opacity', value: style.strokeOpacity });

	return updates;
}
