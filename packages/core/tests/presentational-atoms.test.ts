/**
 * The presentational atoms, none of which any test had ever rendered.
 *
 * Twenty of core's thirty-nine unexecuted components are pure presentation:
 * a wrapper element, some Tailwind, an optional `children`. They are also the
 * library's most-used surface — `Card` and `Badge` and `Text` appear in nearly
 * every example — and until now nothing had constructed a single one.
 *
 * A table rather than twenty files, because the interesting assertions are the
 * *same* assertions, and they are drawn from what this library has actually got
 * wrong before rather than from a generic checklist:
 *
 * - **It renders a real element.** `Combobox`'s external `value` sync was a
 *   no-op (S4.1) and four components threw `effect_update_depth_exceeded` on
 *   mount (S1.1). "Does it produce anything at all" is not a trivial question
 *   here.
 * - **It forwards `class`.** Every one of these composes `cn(base, className)`,
 *   and every consumer relies on it to lay them out. A component that drops the
 *   caller's class looks fine in isolation and breaks every page using it.
 * - **It accepts `undefined` for its optional props.** A wrapper spreading its
 *   own props passes `undefined`, not nothing — the property behind T8's 476
 *   unforwardable optional props and T12's 427.
 * - **It renders `children` where it takes them.** `{@render children()}` on a
 *   missing snippet throws `invalid_snippet`, so a component that declares the
 *   prop and forgets the call is silently empty.
 */

import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Snippet, Component } from 'svelte';
import { createRawSnippet } from 'svelte';

import AspectRatio from '../src/lib/components/ui/aspect-ratio/AspectRatio.svelte';
import Avatar from '../src/lib/components/ui/avatar/Avatar.svelte';
import Badge from '../src/lib/components/ui/badge/Badge.svelte';
import Banner from '../src/lib/components/ui/banner/Banner.svelte';
import BannerDescription from '../src/lib/components/ui/banner/BannerDescription.svelte';
import BannerTitle from '../src/lib/components/ui/banner/BannerTitle.svelte';
import Box from '../src/lib/components/ui/box/Box.svelte';
import Card from '../src/lib/components/ui/card/Card.svelte';
import CardContent from '../src/lib/components/ui/card/CardContent.svelte';
import CardDescription from '../src/lib/components/ui/card/CardDescription.svelte';
import CardFooter from '../src/lib/components/ui/card/CardFooter.svelte';
import CardHeader from '../src/lib/components/ui/card/CardHeader.svelte';
import CardTitle from '../src/lib/components/ui/card/CardTitle.svelte';
import Empty from '../src/lib/components/ui/empty/Empty.svelte';
import Heading from '../src/lib/components/ui/heading/Heading.svelte';
import Kbd from '../src/lib/components/ui/kbd/Kbd.svelte';
import Panel from '../src/lib/components/ui/panel/Panel.svelte';
import Separator from '../src/lib/components/ui/separator/Separator.svelte';
import Skeleton from '../src/lib/components/ui/skeleton/Skeleton.svelte';
import Text from '../src/lib/components/ui/text/Text.svelte';

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

/** A snippet that renders identifiable markup, so "did children run" is answerable. */
const marker = createRawSnippet(() => ({
	render: () => '<span data-child="yes">child</span>'
}));

/** A snippet that renders nothing, for components whose own markup is under test. */
const emptyChildren = (() => {}) as unknown as Snippet;

interface Atom {
	name: string;
	component: Component<never>;
	/** Whether `children` is required, and therefore whether it must be supplied. */
	takesChildren: boolean;
	/** Optional props to prove accept `undefined`, beyond `class` and `children`. */
	optional?: string[];
}

const ATOMS: Atom[] = [
	{ name: 'AspectRatio', component: AspectRatio as never, takesChildren: true, optional: ['ratio'] },
	{ name: 'Avatar', component: Avatar as never, takesChildren: false, optional: ['src', 'alt'] },
	{ name: 'Badge', component: Badge as never, takesChildren: true, optional: ['variant'] },
	{ name: 'Banner', component: Banner as never, takesChildren: true, optional: ['variant'] },
	{ name: 'BannerDescription', component: BannerDescription as never, takesChildren: true },
	{ name: 'BannerTitle', component: BannerTitle as never, takesChildren: true },
	{ name: 'Box', component: Box as never, takesChildren: true },
	{ name: 'Card', component: Card as never, takesChildren: true },
	{ name: 'CardContent', component: CardContent as never, takesChildren: true },
	{ name: 'CardDescription', component: CardDescription as never, takesChildren: true },
	{ name: 'CardFooter', component: CardFooter as never, takesChildren: true },
	{ name: 'CardHeader', component: CardHeader as never, takesChildren: true },
	{ name: 'CardTitle', component: CardTitle as never, takesChildren: true },
	{ name: 'Empty', component: Empty as never, takesChildren: true },
	{ name: 'Heading', component: Heading as never, takesChildren: true, optional: ['level'] },
	{ name: 'Kbd', component: Kbd as never, takesChildren: true },
	{ name: 'Panel', component: Panel as never, takesChildren: true },
	{ name: 'Separator', component: Separator as never, takesChildren: false, optional: ['orientation'] },
	{ name: 'Skeleton', component: Skeleton as never, takesChildren: false, optional: ['variant'] },
	{ name: 'Text', component: Text as never, takesChildren: true, optional: ['size', 'weight'] }
];

async function renderAtom(atom: Atom, props: Record<string, unknown> = {}) {
	const base = atom.takesChildren ? { children: emptyChildren } : {};
	const { container } = render(atom.component, { ...base, ...props } as never);
	await settle();
	return container;
}

/** The outermost element the component produced, ignoring whitespace text nodes. */
const rootOf = (container: Element) => container.querySelector('*');

describe('the table describes the package', () => {
	it('covers twenty atoms, so a silently emptied list is visible', () => {
		expect(ATOMS.length).toBe(20);
	});

	it('has no duplicate entries', () => {
		expect(new Set(ATOMS.map((a) => a.name)).size).toBe(ATOMS.length);
	});
});

describe.each(ATOMS.map((a) => [a.name, a] as const))('%s', (name, atom) => {
	it('renders a real element', async () => {
		const container = await renderAtom(atom);
		const root = rootOf(container);
		expect(root, `${name} rendered nothing`).not.toBeNull();
		expect(root!.tagName).toBeTruthy();
	});

	it('forwards the caller’s class alongside its own', async () => {
		const container = await renderAtom(atom, { class: 'caller-supplied' });
		const root = rootOf(container)!;

		expect(root.className, `${name} dropped the caller's class`).toContain('caller-supplied');
		// And kept its own: a component that *replaced* its classes with the
		// caller's would satisfy the line above and be broken.
		const plain = rootOf(await renderAtom(atom))!;
		if (plain.className.trim().length > 0) {
			const own = plain.className.split(/\s+/)[0]!;
			expect(root.className, `${name} replaced its own classes`).toContain(own);
		}
	});

	it('accepts undefined for every optional prop', async () => {
		// What a wrapper forwarding its own props actually passes.
		const undefinedProps: Record<string, unknown> = { class: undefined };
		for (const prop of atom.optional ?? []) undefinedProps[prop] = undefined;

		const root = rootOf(await renderAtom(atom, undefinedProps));
		expect(root, `${name} rendered nothing when optional props were undefined`).not.toBeNull();
	});

	if (atom.takesChildren) {
		it('renders its children', async () => {
			const container = await renderAtom(atom, { children: marker });
			expect(
				container.querySelector('[data-child="yes"]'),
				`${name} declares children and never rendered them`
			).not.toBeNull();
		});
	}
});
