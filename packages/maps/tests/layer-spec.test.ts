/**
 * The `Layer` → GL style-spec translation.
 *
 * This is where the interesting logic of an adapter actually lives — a heatmap
 * gradient flattened into an `interpolate` expression, a polygon that becomes
 * two GL layers when it has a stroke, a partial style patch that must touch
 * only the properties it names. The adapters around it are method dispatch.
 *
 * It was inlined in `MaplibreAdapter` and therefore untestable without a WebGL
 * context, which is why none of it had a test. Extracting it is what lets
 * `MapboxAdapter` share one definition of these shapes rather than a second
 * copy that drifts — and it is the only part where a mistake is silent, because
 * a wrong expression renders as a map that merely looks odd.
 */

import { describe, it, expect } from 'vitest';
import {
	DEFAULT_HEATMAP_GRADIENT,
	geojsonSource,
	heatmapColorExpression,
	layerSpecs,
	paintUpdates,
	strokeLayerId,
	visibilityLayout
} from '../src/lib/utils/layer-spec';
import type { Layer } from '../src/lib/types/map.types';

const geojsonLayer = (style: Layer['style'] = {}, visible = true): Layer => ({
	id: 'shapes',
	type: 'geojson',
	data: { type: 'FeatureCollection', features: [] } as any,
	style,
	visible,
	interactive: true
});

const heatmapLayer = (style: Layer['style'] = {}, visible = true): Layer => ({
	id: 'heat',
	type: 'heatmap',
	data: { type: 'FeatureCollection', features: [] } as any,
	style,
	visible,
	interactive: false
});

describe('heatmap gradients', () => {
	it('flattens pairs into an interpolate expression', () => {
		// The shape is easy to get wrong by hand: the pairs are *spread*, not
		// pushed as tuples, and a nested array here renders as a silently wrong
		// ramp rather than an error.
		expect(
			heatmapColorExpression([
				[0, 'blue'],
				[1, 'red']
			])
		).toEqual(['interpolate', ['linear'], ['heatmap-density'], 0, 'blue', 1, 'red']);
	});

	it('falls back to the default ramp', () => {
		expect(heatmapColorExpression()).toEqual([
			'interpolate',
			['linear'],
			['heatmap-density'],
			...DEFAULT_HEATMAP_GRADIENT.flat()
		]);
	});

	it('keeps stop order', () => {
		const out = heatmapColorExpression([
			[1, 'red'],
			[0, 'blue']
		]);
		expect(out.slice(3)).toEqual([1, 'red', 0, 'blue']);
	});
});

describe('layer specs', () => {
	it('gives a plain polygon one fill layer', () => {
		const specs = layerSpecs(geojsonLayer({ fillColor: '#123456', fillOpacity: 0.25 }));
		expect(specs.length).toBe(1);
		expect(specs[0]!.type).toBe('fill');
		expect(specs[0]!.paint).toEqual({ 'fill-color': '#123456', 'fill-opacity': 0.25 });
	});

	it('adds a line layer when the polygon has a stroke', () => {
		const specs = layerSpecs(geojsonLayer({ strokeColor: '#000', strokeWidth: 3 }));
		expect(specs.length).toBe(2);
		expect(specs[1]!.id).toBe(strokeLayerId('shapes'));
		expect(specs[1]!.type).toBe('line');
		expect((specs[1]!.paint as Record<string, unknown>)['line-width']).toBe(3);
	});

	it('draws the stroke after the fill', () => {
		// Order is the whole reason this returns a list. A stroke under its fill
		// is invisible, and nothing else in the system would report it.
		const specs = layerSpecs(geojsonLayer({ strokeColor: '#000' }));
		expect(specs.map((s) => s.type)).toEqual(['fill', 'line']);
	});

	it('omits the stroke layer when there is no stroke colour', () => {
		expect(layerSpecs(geojsonLayer({ strokeWidth: 5 })).length).toBe(1);
	});

	it('defaults a polygon that specifies nothing', () => {
		const paint = layerSpecs(geojsonLayer())[0]!.paint as Record<string, unknown>;
		expect(paint['fill-color']).toBe('#0080ff');
		expect(paint['fill-opacity']).toBe(0.5);
	});

	it('gives a heatmap one layer with its ramp', () => {
		const specs = layerSpecs(heatmapLayer({ intensity: 2, radius: 30 }));
		expect(specs.length).toBe(1);
		const paint = specs[0]!.paint as Record<string, unknown>;
		expect(paint['heatmap-intensity']).toBe(2);
		expect(paint['heatmap-radius']).toBe(30);
		expect(Array.isArray(paint['heatmap-color'])).toBe(true);
	});

	it('carries visibility onto every layer it produces', () => {
		const specs = layerSpecs(geojsonLayer({ strokeColor: '#000' }, false));
		expect(specs.map((s) => s.layout)).toEqual([
			{ visibility: 'none' },
			{ visibility: 'none' }
		]);
	});

	it('names the source after the layer', () => {
		expect(layerSpecs(geojsonLayer({ strokeColor: '#000' })).map((s) => s.source)).toEqual([
			'shapes',
			'shapes'
		]);
	});
});

describe('sources', () => {
	it('wraps inline GeoJSON', () => {
		const layer = geojsonLayer();
		expect(geojsonSource(layer)).toEqual({ type: 'geojson', data: layer.data });
	});

	it('passes a URL through unchanged', () => {
		const layer = { ...geojsonLayer(), data: 'https://example.test/data.geojson' };
		expect(geojsonSource(layer).data).toBe('https://example.test/data.geojson');
	});
});

describe('visibility', () => {
	it('maps both states', () => {
		expect(visibilityLayout(true)).toEqual({ visibility: 'visible' });
		expect(visibilityLayout(false)).toEqual({ visibility: 'none' });
	});
});

describe('paint updates from a partial style', () => {
	it('touches nothing for an empty patch', () => {
		expect(paintUpdates(geojsonLayer({ fillColor: '#fff' }), {})).toEqual([]);
	});

	it('updates only the property named', () => {
		const updates = paintUpdates(geojsonLayer({ fillColor: '#fff', strokeColor: '#000' }), {
			fillColor: '#abc'
		});
		expect(updates).toEqual([{ layerId: 'shapes', property: 'fill-color', value: '#abc' }]);
	});

	it('sends stroke properties to the stroke layer', () => {
		const updates = paintUpdates(geojsonLayer({ strokeColor: '#000' }), { strokeWidth: 4 });
		expect(updates).toEqual([
			{ layerId: strokeLayerId('shapes'), property: 'line-width', value: 4 }
		]);
	});

	it('treats zero as a value rather than as absent', () => {
		// The trap in a ladder of `if (style.x)`: an opacity of 0 is a legitimate
		// instruction to make something invisible, and a truthiness check drops
		// it. `undefined` means unchanged; `0` does not.
		expect(paintUpdates(geojsonLayer(), { fillOpacity: 0 })).toEqual([
			{ layerId: 'shapes', property: 'fill-opacity', value: 0 }
		]);
	});

	it('rebuilds the ramp when a heatmap gradient changes', () => {
		const updates = paintUpdates(heatmapLayer(), { colorGradient: [[0, 'black']] });
		expect(updates.length).toBe(1);
		expect(updates[0]!.property).toBe('heatmap-color');
		expect(updates[0]!.value).toEqual(['interpolate', ['linear'], ['heatmap-density'], 0, 'black']);
	});

	it('does not send fill properties to a heatmap', () => {
		expect(paintUpdates(heatmapLayer(), { fillColor: '#fff' })).toEqual([]);
	});

	it('does not send heatmap properties to a polygon', () => {
		expect(paintUpdates(geojsonLayer(), { intensity: 3 })).toEqual([]);
	});
});
