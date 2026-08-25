/**
 * Negative typecheck for `<Light>`'s discriminated props.
 *
 * Not a test — nothing runs this. It is compiled by
 * `svelte-check --tsconfig ./tsconfig.test.json`, and every `@ts-expect-error`
 * below *fails the build if the error stops happening*. That is the only way to
 * pin a type that exists to reject things: a positive fixture proves an arm
 * accepts what it should, and can never prove it refuses what it should not.
 *
 * Before this, `<Light type="ambient" position={[0,5,0]} radius={10} />`
 * compiled clean and both props were silently dropped.
 */

import type { ComponentProps } from 'svelte';
import type Light from '../src/components/Light.svelte';
import type { Store } from '@composable-svelte/core';
import type { GraphicsState, GraphicsAction } from '../src/core/types.js';

type LightProps = ComponentProps<typeof Light>;

declare const store: Store<GraphicsState, GraphicsAction>;

/**
 * Assignability, checked at a call rather than a declaration.
 *
 * An excess property sometimes attaches its error to the offending property and
 * sometimes to the whole object literal, depending on which arm TypeScript
 * decides the literal was trying to be — so a `@ts-expect-error` above the
 * property is "unused" half the time. On a call the error always attaches to
 * the argument, which puts the directive in one predictable place.
 */
const accept = (props: LightProps): LightProps => props;

// The four arms accept what belongs to them.
accept({ store, type: 'ambient', intensity: 0.5 });
accept({ store, type: 'directional', direction: [1, 1, 1], intensity: 1 });
accept({ store, type: 'point', position: [0, 1, 0], intensity: 1, radius: 10 });
accept({
	store,
	type: 'spot',
	position: [0, 1, 0],
	direction: [0, -1, 0],
	angle: Math.PI / 3,
	intensity: 1
});

// An optional prop read from a wrapper's own `$props()` is `T | undefined`, and
// must still land — this is what `?: undefined` markers buy over `?: never`.
declare const maybeId: string | undefined;
declare const maybeColor: string | undefined;
accept({ store, id: maybeId, type: 'point', position: [0, 1, 0], intensity: 1, color: maybeColor });

// And they refuse what does not.

// @ts-expect-error an ambient light has no position
accept({ store, type: 'ambient', intensity: 0.5, position: [0, 5, 0] });

// @ts-expect-error an ambient light has no falloff radius
accept({ store, type: 'ambient', intensity: 0.5, radius: 10 });

// @ts-expect-error a directional light has no position — it has a direction
accept({ store, type: 'directional', direction: [1, 1, 1], intensity: 1, position: [0, 5, 0] });

// @ts-expect-error only a spot light has a cone angle
accept({ store, type: 'directional', direction: [1, 1, 1], intensity: 1, angle: Math.PI / 4 });

// @ts-expect-error only a spot light has a cone angle
accept({ store, type: 'point', position: [0, 1, 0], intensity: 1, angle: Math.PI / 4 });

// @ts-expect-error a spot light's falloff is its cone, not a radius
accept({
	store,
	type: 'spot',
	position: [0, 1, 0],
	direction: [0, -1, 0],
	angle: Math.PI / 4,
	intensity: 1,
	radius: 10
});
