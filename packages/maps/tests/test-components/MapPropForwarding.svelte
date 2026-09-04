<script lang="ts">
	import Map from '../../src/lib/components/Map.svelte';
	import Popup from '../../src/lib/components/Popup.svelte';
	import type { Store } from '@composable-svelte/core';
	import type { MapState, MapAction } from '../../src/lib/types/map.types.js';
	import type { Snippet } from 'svelte';

	/**
	 * A consumer forwarding its own `$props()` straight through.
	 *
	 * Nothing renders this — it exists to be **typechecked**. Under
	 * `exactOptionalPropertyTypes` an optional prop read from `$props()` is
	 * `T | undefined`, which cannot land on a bare `T?`, so every optional prop
	 * these components declare has to say `| undefined` or they cannot be
	 * wrapped.
	 *
	 * **This file's own props are deliberately bare.** That is the mechanism:
	 * they simulate the naïve consumer whose `$props()` yields `T | undefined`.
	 * A sweep that "fixed" them here would neutralise the fixture and nothing
	 * would go red — which is why every `tests` directory is out of its scope.
	 */
	let {
		store,
		width,
		height,
		onMapClick,
		children,
		isOpen,
		closeButton,
		popupId,
		position
	}: {
		store: Store<MapState, MapAction>;
		width?: string | number;
		height?: string | number;
		onMapClick?: (lngLat: [number, number]) => void;
		children?: Snippet;
		isOpen?: boolean;
		closeButton?: boolean;
		// Required by `<Popup>`, so passed rather than forwarded — this fixture
		// is about the *optional* props.
		popupId: string;
		position: [number, number];
	} = $props();
</script>

<Map {store} {width} {height} {onMapClick} {children} />
<Popup {store} id={popupId} {position} {isOpen} {closeButton} {children} />
