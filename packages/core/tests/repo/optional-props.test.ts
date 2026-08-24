/**
 * Every optional prop must say `| undefined`, or its component cannot be wrapped.
 *
 * `exactOptionalPropertyTypes` is on repo-wide. Under it, an optional prop read
 * from `$props()` has type `T | undefined`, and that cannot be assigned to a
 * bare `T?`. So a component forwarding its own props to a library component
 * does not typecheck — and the library component cannot be wrapped at all.
 *
 * This was found via `Command`, fixed there, and pinned by
 * `tests/test-components/CommandPropForwarding.svelte`. That commit's own
 * changelog then said: *"`Command` is not special: 266 optional props across
 * `src/lib` are still bare."* It was 446 across 122 files in eight packages,
 * four of which had none correct. The sweep that followed needs something to
 * stop it regrowing, and the `*PropForwarding.svelte` fixtures cannot do it —
 * each covers a handful of props on one or two components.
 *
 * ## Why this reads the props type rather than every optional property
 *
 * Seven optional properties in `.svelte` files under `src` are not props at
 * all: `interface User` in three `chat` presence components, `ColumnDef` in
 * `DataTableHeader`, and a function-parameter type in `WebGLOverlay`. Two
 * further context interfaces have no optional members today and would become
 * false positives the moment one is added. Requiring `| undefined` on those
 * would be stating a props-forwarding rule about a data row.
 *
 * ## Two lessons the sweep taught this scanner
 *
 * A member's type may contain `;` — `onViewportChange?: ((v: { zoom: number;
 * x: number }) => void)`. A `[^;]+;` pattern truncates it and misreports.
 * `memberEnd` finds the terminator at brace depth zero instead.
 *
 * A member may carry a trailing comment — `enableLightbox?: boolean; //
 * Default: true`. Anchoring the `;` at end-of-line makes five props invisible,
 * and three of those sat in a package already swept and reported green, because
 * its fixture happened not to forward them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Props that may stay bare, with the reason.
 *
 * Keyed by repo-relative path, listing prop names. Mirrors no prose anywhere —
 * this data is the statement of the rule.
 */
const REGISTER: Record<string, { props: string[]; why: string }> = {
	'packages/core/src/lib/components/command/Command.svelte': {
		props: ['open'],
		why: '$bindable. `bind:open={x}` requires the parent\'s variable to match the prop type, so `| undefined` makes binding stricter for every consumer — the opposite of what this rule is for.'
	},
	'packages/core/src/lib/components/ui/calendar/Calendar.svelte': {
		props: ['mode', 'selectedDate', 'selectedRange'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/checkbox/Checkbox.svelte': {
		props: ['checked'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/combobox/Combobox.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/input/Input.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/pagination/Pagination.svelte': {
		props: ['currentPage'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/radio/RadioGroup.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/select/Select.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/slider/Slider.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/switch/Switch.svelte': {
		props: ['checked'],
		why: '$bindable, as above.'
	},
	'packages/core/src/lib/components/ui/textarea/Textarea.svelte': {
		props: ['value'],
		why: '$bindable, as above.'
	}
};

/**
 * `children` on an interface extending an `HTMLAttributes` base cannot be
 * widened at all.
 *
 * `svelte/elements` declares `children?: import('svelte').Snippet` — bare — and
 * a derived interface may not widen an inherited member. Adding `| undefined`
 * to these made twelve components stop compiling outright. The member's type is
 * svelte's to set, not this repo's, so it is excused by rule rather than by
 * twelve register entries that would all say the same thing.
 */
function inheritsChildren(source: string, member: string): boolean {
	return member === 'children' && /interface\s+\w+\s+extends\s+[^{]*HTML\w*Attributes/.test(source);
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.svelte-kit', '__screenshots__', 'build']);

/** Every `.svelte` under a package's `src`. Tests are deliberately not here — see below. */
function componentFiles(): string[] {
	const out: string[] = [];
	const packages = join(repoRoot, 'packages');

	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!SKIP_DIRS.has(entry.name)) walk(full);
				continue;
			}
			if (entry.name.endsWith('.svelte') && statSync(full).isFile()) out.push(full);
		}
	};

	for (const pkg of readdirSync(packages, { withFileTypes: true })) {
		if (!pkg.isDirectory()) continue;
		const src = join(packages, pkg.name, 'src');
		if (existsSync(src)) walk(src);
	}
	return out.sort();
}

/**
 * Index of the `;` that ends a member, ignoring any inside `{}`, `()`, `<>`, `[]`.
 *
 * The `>` of an arrow is not a closing bracket. Counting it as one sends the
 * depth negative inside any snippet payload carrying a callback —
 * `select: () => void;` — after which the real terminator is never found and
 * the member's type is read as the rest of the block. Found by this guard
 * misreporting `Calendar`'s `day` prop.
 */
function memberEnd(source: string, from: number): number {
	let depth = 0;
	for (let i = from; i < source.length; i += 1) {
		const ch = source[i]!;
		if ('{(['.includes(ch)) depth += 1;
		else if ('})]'.includes(ch)) depth -= 1;
		else if (ch === '<') depth += 1;
		else if (ch === '>' && source[i - 1] !== '=') depth -= 1;
		else if (ch === ';' && depth === 0) return i;
	}
	return -1;
}

/** The body of the brace-delimited block starting at `open`. */
function blockBody(source: string, open: number): string {
	let depth = 0;
	for (let i = open; i < source.length; i += 1) {
		if (source[i] === '{') depth += 1;
		else if (source[i] === '}') {
			depth -= 1;
			if (depth === 0) return source.slice(open + 1, i);
		}
	}
	return '';
}

/**
 * The type bodies annotated on this file's `$props()` call.
 *
 * Six declaration styles are in use across the repo and all of them appear
 * here: `}: XProps = $props()` with an `interface` or `type` above,
 * `const props: X = $props()`, a multi-line inline object literal, a
 * single-line one, a props type imported from a `.ts` file, and
 * `type Props = A | B` resolving to two interfaces.
 */
function propsTypeBodies(source: string): string[] {
	const call = source.indexOf('$props()');
	if (call === -1) return [];

	const before = source.slice(0, call);
	const eq = before.lastIndexOf('=');
	if (eq === -1) return [];

	// Walk back from the `=`, rather than looking for the last `:` before it.
	// An inline annotation is full of colons — `}: { store: Store<…>; … } =` —
	// so `lastIndexOf(':')` lands inside the literal and reads a member as the
	// annotation. The character before the `=` says which form this is.
	let i = eq - 1;
	while (i >= 0 && /\s/.test(source[i]!)) i -= 1;

	if (source[i] === '}') {
		// An inline object literal type: find its opening brace and use it.
		let depth = 0;
		for (let j = i; j >= 0; j -= 1) {
			if (source[j] === '}') depth += 1;
			else if (source[j] === '{') {
				depth -= 1;
				if (depth === 0) return [source.slice(j + 1, i)];
			}
		}
		return [];
	}

	// A named type: read the identifier back to its `:`.
	const colon = source.lastIndexOf(':', i);
	if (colon === -1) return [];
	const annotation = source.slice(colon + 1, eq).trim();

	// A named type: resolve it, and any union members it names. Generic
	// parameters are dropped — `CarouselProps<T>` declares as `CarouselProps<T…>`.
	const seen = new Set<string>();
	const bodies: string[] = [];
	const resolve = (name: string) => {
		const bare = name.replace(/<.*/, '').trim();
		if (!bare || seen.has(bare)) return;
		seen.add(bare);

		const iface = new RegExp(`interface\\s+${bare}\\b[^{]*\\{`).exec(source);
		if (iface) {
			bodies.push(blockBody(source, iface.index + iface[0].length - 1));
			return;
		}
		const alias = new RegExp(`type\\s+${bare}\\b[^=]*=\\s*([^;]+);`).exec(source);
		if (alias) {
			// A union of named types, or an inline literal.
			if (alias[1]!.trim().startsWith('{')) {
				bodies.push(blockBody(source, source.indexOf('{', alias.index)));
			} else {
				alias[1]!.split('|').forEach((part) => resolve(part));
			}
		}
		// Unresolvable here means the type is imported from a `.ts` file. Those
		// are swept directly; this guard covers what a `.svelte` file declares.
	};

	resolve(annotation);
	return bodies;
}

/**
 * Whether `undefined` is a **top-level** alternative of this type.
 *
 * Not `type.includes('undefined')`. `Calendar`'s `day` prop is
 * `Snippet<[{ date: Date | undefined; … }]>` — the word appears, nested, while
 * the prop itself refuses `undefined` and cannot be forwarded. Testing for the
 * substring passes it silently, which is the failure mode this whole guard
 * exists to prevent, one level down.
 */
function acceptsUndefined(type: string): boolean {
	let depth = 0;
	let alternative = '';
	const alternatives: string[] = [];

	for (let i = 0; i < type.length; i += 1) {
		const ch = type[i]!;
		if ('{(['.includes(ch)) depth += 1;
		else if ('})]'.includes(ch)) depth -= 1;
		else if (ch === '<') depth += 1;
		else if (ch === '>' && type[i - 1] !== '=') depth -= 1;

		if (ch === '|' && depth === 0) {
			alternatives.push(alternative);
			alternative = '';
			continue;
		}
		alternative += ch;
	}
	alternatives.push(alternative);

	// A top-level `=>` means this is a function type, and a trailing
	// `| undefined` binds to its RETURN — `() => void | undefined` is a function
	// returning `void | undefined`, which accepts no `undefined` itself. It
	// splits into two depth-zero alternatives and would otherwise pass here,
	// which is precisely the trap this guard exists to catch: the naive append
	// typechecks, looks done, and forwards nothing. Only parenthesising first
	// gives `(() => void) | undefined`, where the arrow is no longer top-level.
	if (alternatives.length > 1 && hasTopLevelArrow(type)) return false;

	return alternatives.some((a) => a.trim() === 'undefined');
}

/** Whether an `=>` appears outside every bracket. */
function hasTopLevelArrow(type: string): boolean {
	let depth = 0;
	for (let i = 0; i < type.length; i += 1) {
		const ch = type[i]!;
		if ('{(['.includes(ch)) depth += 1;
		else if ('})]'.includes(ch)) depth -= 1;
		else if (ch === '<') depth += 1;
		else if (ch === '>' && type[i - 1] === '=' && depth === 0) return true;
		else if (ch === '>') depth -= 1;
	}
	return false;
}

interface Offender {
	file: string;
	prop: string;
	type: string;
}

/** Optional members of this file's props type(s) that do not accept `undefined`. */
function scan(path: string, applyRegister = true): Offender[] {
	const source = readFileSync(path, 'utf8');
	const file = relative(repoRoot, path);
	const registered = applyRegister ? REGISTER[file]?.props ?? [] : [];
	const out: Offender[] = [];

	for (const body of propsTypeBodies(source)) {
		const member = /(?:^|\n)\s*([a-zA-Z_$][\w$]*)\?\s*:/g;
		let m: RegExpExecArray | null;
		while ((m = member.exec(body)) !== null) {
			const name = m[1]!;
			const start = m.index + m[0].length;
			const end = memberEnd(body, start);
			const type = body.slice(start, end === -1 ? undefined : end).trim();

			if (acceptsUndefined(type)) continue;
			if (registered.includes(name)) continue;
			if (inheritsChildren(source, name)) continue;

			out.push({ file, prop: name, type: type.replace(/\s+/g, ' ').slice(0, 60) });
		}
	}
	return out;
}

const files = componentFiles();
const byPackage = new Map<string, string[]>();
for (const f of files) {
	const pkg = relative(repoRoot, f).split('/')[1]!;
	byPackage.set(pkg, [...(byPackage.get(pkg) ?? []), f]);
}

describe('optional props accept undefined', () => {
	it('finds components to scan, so the arms below are not vacuous', () => {
		expect(files.length, 'no .svelte files found under any package src').toBeGreaterThan(120);
	});

	it.each([...byPackage.keys()].sort())(
		'%s has components with props, so it is really being scanned',
		(pkg) => {
			// Per package, not just in total. `animation-policy.test.ts` records
			// that `packages/` alone cleared any threshold `examples/` would have
			// helped reach, so `examples/` went unscanned for that guard's whole
			// life while the suite stayed green.
			const withProps = byPackage
				.get(pkg)!
				.filter((f) => propsTypeBodies(readFileSync(f, 'utf8')).length > 0);
			expect(withProps.length, `${pkg}: no props types resolved`).toBeGreaterThan(0);
		}
	);

	it('every optional prop accepts undefined', () => {
		const offenders = files
			.flatMap((f) => scan(f))
			.map((o) => `${o.file}  ${o.prop}?: ${o.type}`);

		expect(
			offenders,
			'An optional prop read from `$props()` is `T | undefined` under ' +
				'`exactOptionalPropertyTypes`, so a bare `T?` cannot receive it and this ' +
				'component cannot be wrapped.\n\n' +
				'Append `| undefined`. If the type is a function, PARENTHESISE it first: ' +
				'`(() => void) | undefined`, never `() => void | undefined` — the latter ' +
				'is a function *returning* `void | undefined`, which typechecks and ' +
				'forwards nothing.\n\n' +
				'A `$bindable` prop belongs in REGISTER instead.'
		).toEqual([]);
	});

	it('every registered file still exists and still declares its props', () => {
		const missing = Object.keys(REGISTER).filter((f) => !existsSync(join(repoRoot, f)));

		expect(missing, 'registered a file that has been renamed or deleted').toEqual([]);
	});

	it('every registered prop would still offend without its exemption', () => {
		// A grant that covers nothing is a permanent invisible licence on a file:
		// fix the prop it was written for and the entry keeps excusing whatever
		// lands there next.
		const dead: string[] = [];
		for (const [file, entry] of Object.entries(REGISTER)) {
			if (!existsSync(join(repoRoot, file))) continue;
			const bare = new Set(scan(join(repoRoot, file), false).map((o) => o.prop));
			for (const prop of entry.props) {
				if (!bare.has(prop)) dead.push(`${file}  ${prop}`);
			}
		}

		expect(dead, 'These props no longer need their exemption — delete them from REGISTER').toEqual(
			[]
		);
	});
});
