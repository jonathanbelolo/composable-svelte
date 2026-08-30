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
import { readFileSync, existsSync, statSync } from 'node:fs';
import { walkFiles, listDirs } from './walk.js';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';

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
 * There is no `children` exemption, and there was one.
 *
 * `svelte/elements` declares `children?: import('svelte').Snippet` — bare — and
 * a derived interface may not widen an inherited member, so twelve components
 * declaring `interface XProps extends Omit<HTMLAttributes<…>, 'class'>` could
 * not have `| undefined` added to their local `children`. That was recorded as
 * a by-rule exemption, on the claim they "could not be widened at all".
 *
 * They could: adding `'children'` to the `Omit` those declarations already
 * apply to `'class'` removes the inheritance, and the member widens normally.
 * All twelve are fixed, the rule now covers nothing, and an exemption covering
 * nothing is a permanent invisible licence — so it is gone rather than kept
 * "just in case", exactly as `animation-policy.test.ts` deleted its backlog on
 * reaching empty.
 *
 * Restore it only alongside a case it actually excuses.
 */

// `worktrees` holds agents' throwaway repo copies; scanning them
// double-counts every file and breaks on any left behind.
const SKIP_DIRS = new Set([
	'node_modules',
	'dist',
	'.svelte-kit',
	'__screenshots__',
	'build',
	'worktrees'
]);

/** Every `.svelte` under a package's `src`. Tests are deliberately not here — see below. */
function componentFiles(): string[] {
	const packages = join(repoRoot, 'packages');

	// `walkFiles`: this ran a throwing `statSync` at module scope, so one
	// dangling `.svelte` symlink would have made the file fail to collect and
	// taken every test in it with it.
	return listDirs(packages)
		.flatMap(
			(pkg) =>
				walkFiles(join(packages, pkg, 'src'), {
					skip: SKIP_DIRS,
					keep: (n) => n.endsWith('.svelte')
				}).files
		)
		.sort();
}

/**
 * Walk one character, returning the new bracket depth.
 *
 * The `>` of an arrow is not a closing bracket. Counting it as one sends the
 * depth negative inside any type carrying a callback — `select: () => void`,
 * `Record<string, () => void>` — after which every depth-sensitive decision
 * downstream is wrong.
 *
 * This lived in three hand-rolled copies. The first was fixed for the arrow;
 * the second, written 140 lines later in the same commit, was not — and that
 * copy is the one deciding whether a function type was parenthesised, so the
 * guard stayed blind to the single mistake it exists for. One function now.
 */
function step(ch: string, prev: string, depth: number): number {
	if ('{(['.includes(ch)) return depth + 1;
	if ('})]'.includes(ch)) return depth - 1;
	if (ch === '<') return depth + 1;
	if (ch === '>' && prev !== '=') return depth - 1;
	return depth;
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
 * Split a type body into its members, at depth-zero `;` outside any string.
 *
 * Replaces a line-anchored regex, which could not see a member sharing a line
 * with another (`CodeEditor.svelte` declares its whole props type on one line)
 * and truncated any type containing a `;` inside a string literal.
 */
function splitMembers(body: string): string[] {
	const members: string[] = [];
	let depth = 0;
	let quote = '';
	let current = '';

	for (let i = 0; i < body.length; i += 1) {
		const ch = body[i]!;

		if (quote) {
			current += ch;
			if (ch === quote && body[i - 1] !== '\\') quote = '';
			continue;
		}

		// Comments are dropped, not kept. Almost every member here carries a
		// JSDoc block, and a pattern anchored at the start of the member matches
		// none of them — the first version of this splitter detected zero props
		// and the whole guard passed vacuously. The anti-rot arm caught it,
		// which is the only reason it is not still passing.
		if (ch === '/' && body[i + 1] === '*') {
			const close = body.indexOf('*/', i + 2);
			i = close === -1 ? body.length : close + 1;
			continue;
		}
		if (ch === '/' && body[i + 1] === '/') {
			const nl = body.indexOf('\n', i);
			i = nl === -1 ? body.length : nl - 1;
			continue;
		}

		if (ch === "'" || ch === '"' || ch === '`') {
			quote = ch;
			current += ch;
			continue;
		}

		if (ch === ';' && depth === 0) {
			members.push(current);
			current = '';
			continue;
		}
		depth = step(ch, body[i - 1] ?? '', depth);
		current += ch;
	}
	members.push(current);
	return members;
}

/** Whether an `=>` appears outside every bracket. */
function hasTopLevelArrow(type: string): boolean {
	let depth = 0;
	for (let i = 0; i < type.length; i += 1) {
		const ch = type[i]!;
		if (ch === '>' && type[i - 1] === '=' && depth === 0) return true;
		depth = step(ch, type[i - 1] ?? '', depth);
	}
	return false;
}

/**
 * Whether `undefined` is a **top-level** alternative of this type.
 *
 * Not `type.includes('undefined')`. `Calendar`'s `day` payload carries
 * `store: … | null` and callbacks of its own — the word can appear nested while
 * the prop itself refuses `undefined` and cannot be forwarded.
 */
function acceptsUndefined(type: string): boolean {
	// A top-level `=>` means this is a function type, and a trailing
	// `| undefined` binds to its RETURN — `() => void | undefined` is a function
	// returning `void | undefined`, which accepts no `undefined` itself. Only
	// parenthesising first gives `(() => void) | undefined`.
	if (hasTopLevelArrow(type)) return false;

	let depth = 0;
	let alternative = '';
	const alternatives: string[] = [];

	for (let i = 0; i < type.length; i += 1) {
		const ch = type[i]!;
		if (ch === '|' && depth === 0) {
			alternatives.push(alternative);
			alternative = '';
			continue;
		}
		depth = step(ch, type[i - 1] ?? '', depth);
		alternative += ch;
	}
	alternatives.push(alternative);

	return alternatives.some((a) => a.trim() === 'undefined');
}

/**
 * The props type block(s) annotated on this file's `$props()` call.
 *
 * Six declaration styles are in use: `}: XProps = $props()` with an `interface`
 * or `type` above, `const props: X = $props()`, a multi-line inline object
 * literal, a single-line one, `type Props = A | B` resolving to two interfaces,
 * and **a props type imported from a `.ts` file**.
 *
 * That last one resolved to nothing in this guard's first version, so
 * `Carousel`, `Form`, `FormField` and `DestinationRouter` went entirely
 * unscanned — including the twelve props in `carousel.types.ts` that had just
 * been swept. A one-time sweep is exactly what this guard replaces, and the
 * per-package non-vacuity arm cannot catch it: `core` has a hundred other
 * resolvable files. Imports are followed now.
 */
/**
 * Blank out comments, preserving offsets and newlines.
 *
 * `propsTypeBlocks` finds the props declaration by searching for the *first*
 * `$props()`, so a doc comment that merely mentions one hijacks the search —
 * and then `lastIndexOf('=')` lands inside that same comment, and the whole
 * file resolves to nothing. Silently: the per-package non-vacuity arm stays
 * satisfied by the package's other components.
 *
 * `graphics/src/components/Light.svelte` did exactly this. Its doc block
 * explains, at length, how to avoid blinding this guard — while blinding it,
 * because the explanation quotes `$props()`. Replacing spans with spaces rather
 * than deleting them keeps every offset the caller computes valid.
 */
function blankComments(source: string): string {
	const blank = (match: string) => match.replace(/[^\n]/g, ' ');
	return source
		.replace(/\/\*[\s\S]*?\*\//g, blank)
		.replace(/\/\/[^\n]*/g, blank);
}

function propsTypeBlocks(path: string): string[] {
	const source = blankComments(readFileSync(path, 'utf8'));
	const call = source.indexOf('$props()');
	if (call === -1) return [];

	const before = source.slice(0, call);
	const eq = before.lastIndexOf('=');
	if (eq === -1) return [];

	// Walk back from the `=` rather than looking for the last `:` before it: an
	// inline annotation is full of colons, so `lastIndexOf(':')` lands inside
	// the literal and reads one of its members as the annotation.
	let i = eq - 1;
	while (i >= 0 && /\s/.test(source[i]!)) i -= 1;

	if (source[i] === '}') {
		let depth = 0;
		for (let j = i; j >= 0; j -= 1) {
			if (source[j] === '}') depth += 1;
			else if (source[j] === '{') {
				depth -= 1;
				if (depth === 0) {
					return [source.slice(j + 1, i)];
				}
			}
		}
		return [];
	}

	const colon = source.lastIndexOf(':', i);
	if (colon === -1) return [];

	const seen = new Set<string>();
	const blocks: string[] = [];

	const resolveIn = (text: string, name: string, origin: string) => {
		// Strip a leading `(` or trailing `)` left by splitting a parenthesised
		// union, and any generic arguments.
		const bare = name
			.replace(/<.*/, '')
			.replace(/^[\s(]+|[\s)]+$/g, '')
			.trim();
		if (!bare || seen.has(bare)) return;

		// An inline member — `{ url: string; video?: undefined }` in a union arm —
		// is a block already, not a name to look up.
		if (bare.startsWith('{')) {
			const close = bare.lastIndexOf('}');
			if (close > 0) blocks.push(bare.slice(1, close));
			return;
		}

		// Anything that is not a plain identifier cannot be resolved by name, and
		// must not reach the regexes below.
		//
		// It used to. A component whose props were an intersection — `type Props =
		// BaseProps & ( … )` — produced fragments like `BaseProps & (` here, and
		// interpolating that into `new RegExp` threw `Unterminated group`, which
		// took the whole scan down: not one component skipped, but every optional
		// prop in the package left unchecked. The vacuity arm is what reported it.
		if (!/^[A-Za-z_$][\w$]*$/.test(bare)) return;

		seen.add(bare);

		const iface = new RegExp(`interface\\s+${bare}\\b[^{]*\\{`).exec(text);
		if (iface) {
			blocks.push(blockBody(text, iface.index + iface[0].length - 1));
			return;
		}

		const alias = new RegExp(`type\\s+${bare}\\b[^=]*=\\s*([^;]+);`).exec(text);
		if (alias) {
			if (alias[1]!.trim().startsWith('{')) {
				blocks.push(blockBody(text, text.indexOf('{', alias.index)));
			} else {
				// Both separators: an intersection contributes every one of its
				// members, and a union every one of its arms. Splitting on `|`
				// alone silently dropped everything an intersection carried.
				alias[1]!.split(/[|&]/).forEach((part) => resolveIn(text, part, origin));
			}
			return;
		}

		// Not declared here — follow the import that brought it in.
		const imported = new RegExp(
			`import\\s+type\\s*\\{[^}]*\\b${bare}\\b[^}]*\\}\\s*from\\s*['"]([^'"]+)['"]`
		).exec(text);
		if (!imported) return;

		// `./foo.js` in source refers to `./foo.ts` on disk.
		const target = resolve(dirname(origin), imported[1]!.replace(/\.js$/, '.ts'));
		if (!existsSync(target)) return;

		seen.delete(bare);
		resolveIn(readFileSync(target, 'utf8'), bare, target);
	};

	resolveIn(source, source.slice(colon + 1, eq).trim(), path);
	return blocks;
}

interface Offender {
	file: string;
	prop: string;
	type: string;
}

/** Optional members of this file's props type(s) that do not accept `undefined`. */
function scan(path: string, applyRegister = true): Offender[] {
	const file = relative(repoRoot, path);
	const registered = applyRegister ? REGISTER[file]?.props ?? [] : [];
	const out: Offender[] = [];

	for (const body of propsTypeBlocks(path)) {
		for (const raw of splitMembers(body)) {
			// `readonly` and the optional-method form `foo?(): void` are both
			// legal here and neither can accept `undefined`. A name-then-`?:`
			// pattern misses both.
			const m = /^\s*(?:readonly\s+)?([a-zA-Z_$][\w$]*)\s*\?\s*(:|\()/.exec(raw);
			if (!m) continue;

			const name = m[1]!;
			const type = raw.slice(m.index + m[0].length).trim();

			// An optional *method* has no way to say `| undefined` at all.
			if (m[2] === '(') {
				if (registered.includes(name)) continue;
				out.push({ file, prop: name, type: 'method — declare it as a property' });
				continue;
			}

			if (acceptsUndefined(type)) continue;
			if (registered.includes(name)) continue;
			// Member-level, not file-level: only a member of an interface that
			// actually extends an `HTMLAttributes` base inherits the bare
			// declaration. A file-wide regex granted the excuse to every
			// interface in 34 files, and matched the phrase in a comment.

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
				.filter((f) => propsTypeBlocks(f).length > 0);
			expect(withProps.length, `${pkg}: no props types resolved`).toBeGreaterThan(0);
		}
	);

	it('resolves a realistic number of props, so a broken parser cannot pass', () => {
		// File counts are not enough. A member pattern anchored at the start of
		// the member matched none of them — every prop here carries a JSDoc
		// block — so the guard resolved 152 files, found zero props, and every
		// arm passed. Only the anti-rot arm noticed. Counting what is actually
		// parsed is what makes that failure loud.
		const total = files.reduce(
			(n, f) => n + propsTypeBlocks(f).reduce((m, b) => m + splitMembers(b).length, 0),
			0
		);

		expect(total, 'the member splitter is resolving almost nothing').toBeGreaterThan(500);
	});

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

	it('every registered prop is still $bindable, so the stated reason stays true', () => {
		// The entries all say "$bindable". Nothing checked that. Remove the
		// `$bindable(` from a registered prop and the exemption survives with a
		// reason that is now false — an unexplained hole wearing a justification.
		const stale: string[] = [];
		for (const [file, entry] of Object.entries(REGISTER)) {
			const full = join(repoRoot, file);
			if (!existsSync(full)) continue;
			const source = readFileSync(full, 'utf8');
			for (const prop of entry.props) {
				if (!new RegExp(`\\b${prop}\\s*=\\s*\\$bindable\\(`).test(source)) {
					stale.push(`${file}  ${prop}`);
				}
			}
		}

		expect(
			stale,
			'REGISTER excuses these as $bindable, and they are no longer bindable. ' +
				'Either restore the binding or append `| undefined` and delete the entry.'
		).toEqual([]);
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

/**
 * Every exported `*Props` type must be used where drift would break something.
 *
 * A props type nobody annotates is a second, unread copy of a contract, and it
 * drifts silently from the one the component actually enforces. `FileUpload`
 * is the case that motivated this: `1eeec5a` widened
 * `FileUploadProps.onUpload` and the reducer to take a progress callback, but
 * `FileUpload.svelte` carried its own hand-written `interface Props` and kept
 * the one-parameter form. A consumer typing a handler against the component's
 * prop had no `onProgress` to receive, while the exported type said they did —
 * and every runtime test passed, because the reducer was always passing both
 * arguments.
 *
 * The duplicate was also the camouflage: the local copy was correct about
 * `| undefined`, so the arms above were satisfied by the copy while the real
 * exported type went unread and unchecked.
 *
 * The predicate is **used in a type position**, not merely mentioned. A barrel
 * re-export is not a use: it publishes the name without constraining it, which
 * is exactly the state `FileUploadProps` was in. Nor does the use have to be a
 * `$props()` annotation — `FieldRenderProps` is only ever the payload of
 * `FormFieldProps.children` (`form.types.ts:430`), and that is enough, because
 * it puts the type in the graph `FormField.svelte` typechecks against. Change
 * it and the component's snippet callers break. That is the property being
 * checked: something must fail if the type drifts.
 */
function exportedPropsTypes(): { name: string; file: string }[] {
	const packages = join(repoRoot, 'packages');
	const out: { name: string; file: string }[] = [];

	for (const pkg of listDirs(packages)) {
		for (const file of walkFiles(join(packages, pkg, 'src'), {
			skip: SKIP_DIRS,
			keep: (n) => n.endsWith('.ts')
		}).files) {
			const source = blankComments(readFileSync(file, 'utf8'));
			for (const m of source.matchAll(/export\s+(?:interface|type)\s+(\w*Props)\b/g)) {
				out.push({ name: m[1]!, file: relative(repoRoot, file) });
			}
		}
	}

	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Every source file that could use a type, with re-exports and declarations blanked. */
function usageSites(): string[] {
	const packages = join(repoRoot, 'packages');

	return listDirs(packages)
		.flatMap(
			(pkg) =>
				walkFiles(join(packages, pkg, 'src'), {
					skip: SKIP_DIRS,
					keep: (n) => n.endsWith('.ts') || n.endsWith('.svelte')
				}).files
		)
		.map((file) =>
			blankComments(readFileSync(file, 'utf8'))
				// `export type { A, B }` and `export { A }` publish a name without
				// constraining it. Counting those as uses is what would let a type
				// like `FileUploadProps` look consumed while nothing checks it.
				.replace(/export\s+(?:type\s+)?\{[^}]*\}/g, '')
				// An import is the same kind of mention, and this arm shipped
				// without it. Reintroducing the exact defect — a local `interface
				// Props` in `FileUpload.svelte` — while leaving the now-unused
				// `import type { FileUploadProps }` behind passed this arm, which
				// is the likeliest way the drift would actually come back.
				.replace(/import\s+(?:type\s+)?[^;]*?from\s*['"][^'"]*['"]/g, '')
				// Its own declaration is not a use of it either.
				.replace(/export\s+(?:interface|type)\s+\w*Props\b/g, '')
		);
}

describe('an exported props type is anchored by a use', () => {
	const exported = exportedPropsTypes();
	const sources = usageSites();

	it('finds some, so the arm below is about something', () => {
		expect(exported.length, 'no exported *Props types found at all').toBeGreaterThan(3);
	});

	it('every one is used somewhere that would break if it drifted', () => {
		const orphaned = exported
			.filter(({ name }) => !sources.some((source) => new RegExp(`\\b${name}\\b`).test(source)))
			.map(({ name, file }) => `${name}  (${file})`);

		expect(
			orphaned,
			'these props types are exported and then used nowhere, so nothing keeps them in ' +
				'step with the props their component really takes — annotate the component ' +
				'with the type, or stop exporting it:\n' +
				orphaned.join('\n')
		).toEqual([]);
	});
});

/**
 * The same hazard, one layer down: optional properties in plain `.ts`.
 *
 * `exactOptionalPropertyTypes` does not care whether a type is a component's
 * props or a reducer's state — a bare `T?` cannot receive a computed value that
 * may be absent. The arms above only ever see `.svelte` files, because
 * `propsTypeBlocks` is anchored on `$props()`.
 *
 * **This exists because the number kept being wrong.** It has been recorded as
 * 472, then 436, then 427, by three separate greps — and a grep cannot tell
 * `() => void | undefined` (a function *returning* it) from
 * `(() => void) | undefined` (a property accepting it). `acceptsUndefined`
 * already knows the difference, so the honest count is the one it produces.
 *
 * Reported, not swept. Most of these are state and config shapes rather than
 * props, so the wrapper defect T8 fixed does not apply to them; whether the whole
 * set is worth changing is a decision that needs the real size first, and a bad
 * `| undefined` sweep across 383 declarations would be worse than the hazard.
 * What this arm does is stop the number growing while that is decided.
 *
 * **What the number does not cover**, stated because a count is only useful with
 * its scope attached: this reads `export interface X { … }` and
 * `export type X = { … }`. A discriminated union written as
 * `export type Action =\n  | { type: 'send'; attachments?: Attachment[] }` opens
 * with `|`, not `{`, so its members are not scanned — and in a library of
 * reducers that is a large family of types. Extending to union members is the
 * obvious next step if this backlog is ever acted on; it would raise the figure,
 * not lower it.
 */
function typeDeclarationBodies(source: string): string[] {
	const out: string[] = [];
	const decl = /\bexport\s+(?:interface\s+\w+[^{]*|type\s+\w+\s*(?:<[^=]*>)?\s*=\s*)\{/g;

	for (let m = decl.exec(source); m; m = decl.exec(source)) {
		let depth = 1;
		let i = m.index + m[0].length;
		for (; i < source.length && depth > 0; i += 1) {
			if (source[i] === '{') depth += 1;
			else if (source[i] === '}') depth -= 1;
		}
		out.push(source.slice(m.index + m[0].length, i - 1));
	}

	return out;
}

function bareOptionalsInTypes(): string[] {
	const packages = join(repoRoot, 'packages');
	const out: string[] = [];

	for (const pkg of listDirs(packages)) {
		for (const file of walkFiles(join(packages, pkg, 'src'), {
			skip: SKIP_DIRS,
			keep: (n) => n.endsWith('.ts')
		}).files) {
			const source = blankComments(readFileSync(file, 'utf8'));

			for (const body of typeDeclarationBodies(source)) {
				for (const raw of splitMembers(body)) {
					const m = /^\s*(?:readonly\s+)?([a-zA-Z_$][\w$]*)\s*\?\s*(:|\()/.exec(raw);
					if (!m) continue;

					const type = raw.slice(m.index + m[0].length).trim();
					if (m[2] === ':' && acceptsUndefined(type)) continue;

					out.push(`${relative(repoRoot, file)}  ${m[1]}?`);
				}
			}
		}
	}

	return out.sort();
}

/** Measured, and meant to come down. See the docstring above for why it is not swept. */
const ALLOWED_BARE_OPTIONALS = 311;

describe('optional properties in .ts carry the same hazard', () => {
	const bare = bareOptionalsInTypes();

	it('is measured by the splitter, not by a grep', () => {
		expect(
			bare.length,
			bare.length > ALLOWED_BARE_OPTIONALS
				? `bare optional properties: ${bare.length}\n${bare.slice(0, 40).join('\n')}`
				: `${ALLOWED_BARE_OPTIONALS - bare.length} have been fixed — lower ALLOWED_BARE_OPTIONALS to ${bare.length}`
		).toBe(ALLOWED_BARE_OPTIONALS);
	});
});
