import {afterEach, expect, it, vi} from 'vitest';
import {enrollLayer} from '../src/lib/actions/dismissalCoordinator.js';
import {createRemovedContentDismissal} from '../src/lib/navigation-components/primitives/presentationCompletion.js';

const releases: Array<() => void> = [];
afterEach(() => { for (const release of releases.splice(0).reverse()) release(); });
const settlePointer = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
const microtask = () => Promise.resolve();

function node() {
	const value = document.createElement('div');
	document.body.append(value);
	releases.push(() => value.remove());
	return value;
}

function pointer() {
	document.body.dispatchEvent(new PointerEvent('pointerdown', {button: 0, bubbles: true, cancelable: true}));
}

it('reactivating one focus entry preserves an unrelated layer armed pointer timer', async () => {
	const pointerOutside = vi.fn();
	const pointerLayer = enrollLayer({node: node(), onPointerOutside: pointerOutside});
	const focusLayer = enrollLayer({node: node(), focus: {node: node(), modal: false}, focusActive: false});
	releases.push(() => pointerLayer.release(false), () => focusLayer.release(false));

	pointer();
	focusLayer.setFocusActive(true);
	await settlePointer();
	expect(pointerOutside).toHaveBeenCalledTimes(1);
});

it('a true-to-true focus refresh preserves the entry fresh armed gesture', async () => {
	const pointerOutside = vi.fn();
	const identity = {};
	const region = node();
	const layer = enrollLayer({node: region, identity: () => identity, onPointerOutside: pointerOutside, focus: {node: region, modal: false}});
	releases.push(() => layer.release(false));

	pointer();
	layer.setFocusActive(true);
	layer.refresh();
	await settlePointer();
	expect(pointerOutside).toHaveBeenCalledTimes(1);
});

it.each(['presenting', 'presented'] as const)(
	'canceled %s-to-dismissing transfer suppresses its microtask and a later valid attempt settles once',
	async (sourceStatus) => {
		const content = {id: sourceStatus};
		const source = {status: sourceStatus, content};
		const dismissing = {status: 'dismissing', content};
		const seam = createRemovedContentDismissal();
		const complete = vi.fn();
		seam.contentBound(source);

		const cancel = seam.contentLost(dismissing, null, complete);
		expect(cancel).toBeTypeOf('function');
		cancel?.();
		await microtask();
		expect(complete).not.toHaveBeenCalled();

		seam.contentLost(dismissing, null, complete);
		await microtask();
		expect(complete).toHaveBeenCalledTimes(1);
		expect(complete).toHaveBeenCalledWith(dismissing);
	}
);
