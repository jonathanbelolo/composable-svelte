/** Reactive show/hide for the editors outlet: detaches the view without changing its owner. */
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
