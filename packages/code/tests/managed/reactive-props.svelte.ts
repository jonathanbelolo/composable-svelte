/** Reactive values a `.ts` test can hand to `mount` and change afterwards. */
export function createVisibility(initial = true): { show: boolean } {
	let show = $state(initial);
	return {
		get show() {
			return show;
		},
		set show(value: boolean) {
			show = value;
		}
	};
}

/** A props object whose `store` can be swapped after mount. */
export function createSwappableProps<S>(initial: S): { store: S } {
	let store = $state.raw(initial);
	return {
		get store() {
			return store;
		},
		set store(value: S) {
			store = value;
		}
	};
}
