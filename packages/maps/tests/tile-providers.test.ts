/**
 * Every tile provider on offer must be one MapLibre can actually load.
 *
 * `'mapbox'` was not. Its style URL was `mapbox://styles/mapbox/streets-v12`,
 * and MapLibre has no knowledge of that scheme — no reference to `mapbox://`
 * anywhere in its bundle, and a request path that takes `http(s):`/`file:` or a
 * handler registered through `addProtocol`, of which none is. The request was
 * never made, so this was not an unstyled map, it was a broken one. And it was
 * not hidden: `getAvailableTileProviders` returned it, `TileProviderControl`
 * rendered it in a dropdown, and the styleguide's MapDemo renders that control.
 *
 * The general rule is asserted rather than the single removal, because the next
 * provider someone adds is the one this needs to catch.
 */

import { describe, it, expect } from 'vitest';
import {
	TILE_PROVIDERS,
	getAvailableTileProviders,
	getStyleURL,
	requiresAPIKey,
	type TileProvider
} from '../src/lib/utils/tile-providers';

/** What MapLibre will actually attempt: an absolute http(s) URL. */
const LOADABLE = /^https?:\/\//;

describe('every offered provider resolves to something MapLibre can fetch', () => {
	it('offers some, so the arms below are not vacuous', () => {
		expect(getAvailableTileProviders().length).toBeGreaterThan(3);
	});

	it.each(getAvailableTileProviders().map((p) => [p.id, p] as const))(
		'%s resolves to an http(s) style URL',
		(id, config) => {
			const url = getStyleURL(id, 'test-key');
			expect(url, `${config.name} resolves to "${url}"`).toMatch(LOADABLE);
		}
	);

	it('offers no provider using a scheme MapLibre cannot resolve', () => {
		// The rule, stated directly. `mapbox://` is the instance that was here;
		// any custom scheme needs a `maplibregl.addProtocol` handler, and this
		// package registers none.
		const custom = getAvailableTileProviders()
			.map((p) => getStyleURL(p.id, 'test-key'))
			.filter((url) => /^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !LOADABLE.test(url));

		expect(custom, 'a provider uses a URL scheme nothing can resolve').toEqual([]);
	});
});

describe('mapbox is gone', () => {
	it('is not in the registry', () => {
		expect(Object.keys(TILE_PROVIDERS)).not.toContain('mapbox');
	});

	it('is not offered in the picker', () => {
		expect(getAvailableTileProviders().map((p) => p.id)).not.toContain('mapbox');
	});
});

describe('a provider that says it needs a key is given one', () => {
	it.each(
		getAvailableTileProviders()
			.filter((p) => p.requiresAPIKey)
			.map((p) => [p.id] as const)
	)('%s puts the key in the URL', (id) => {
		// The hollow half of the mapbox entry: it declared requiresAPIKey while
		// its styleURL was a string, so `getStyleURL` had nowhere to put the key
		// and silently dropped it. A provider that asks for a key must use it.
		expect(requiresAPIKey(id)).toBe(true);
		const withKey = getStyleURL(id, 'SENTINEL-KEY');
		const without = getStyleURL(id);
		expect(withKey).toContain('SENTINEL-KEY');
		expect(withKey).not.toBe(without);
	});
});

describe('custom URLs still work', () => {
	it('passes a caller-supplied URL through', () => {
		expect(getStyleURL('custom' as TileProvider, undefined, 'https://example.test/style.json')).toBe(
			'https://example.test/style.json'
		);
	});
});
