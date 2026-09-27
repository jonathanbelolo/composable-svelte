/**
 * Mount props whose keys are individually reactive, without proxying their values
 * (`$state.raw`): identity-bearing props such as `mediaScope` stay the same object.
 */
export function reactiveProps<T extends Record<string, unknown>>(value: T): T {
	const props = {} as T;
	for (const key of Object.keys(value) as (keyof T)[]) {
		let current = $state.raw(value[key]);
		Object.defineProperty(props, key, {
			enumerable: true,
			get: () => current,
			set: (next: T[keyof T]) => {
				current = next;
			}
		});
	}
	return props;
}
