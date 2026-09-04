/**
 * A reactive props object a plain `.ts` test can mutate.
 *
 * `mount(Component, { props })` reads `props` reactively, but a runes file is
 * the only place `$state` can be declared — hence the `.svelte.ts` extension.
 * Needed to test what a component does when a prop *changes*, which several
 * defects in this package only appear on.
 */
export function propsBox<T extends Record<string, unknown>>(initial: T): T {
	const box = $state({ ...initial });
	return box;
}
