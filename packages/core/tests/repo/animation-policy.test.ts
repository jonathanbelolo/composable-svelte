/**
 * `guides/ANIMATION-GUIDELINES.md`, enforced.
 *
 * The policy existed only as prose, in two files, and that is exactly why it
 * drifted: an audit found 135 CSS animation sites in shipped source that the
 * guide could not adjudicate — including ten one-shot `@keyframes` acting as
 * mount animations, a chevron rotating on a CSS transition beside a dropdown
 * springing in on Motion One, and a Switch thumb driven by three mechanisms at
 * once.
 *
 * The rule this encodes is the guide's: classify by what *drives* the change.
 *
 *   - a CSS pseudo-class (`:hover`, `:focus`, `:active`)  -> no transition
 *   - component or reducer state                          -> Motion One
 *   - repeats forever with no state input                 -> `@keyframes`, and
 *                                                            it must say
 *                                                            `infinite`
 *   - a continuous external numeric source                -> Register entry
 *
 * The `infinite` keyword is the test, not the `@keyframes` syntax. A one-shot
 * keyframe animation is a lifecycle animation wearing a costume.
 *
 * This is a static scan, not a runtime check, for the same reason
 * `tests/styles/theme-tokens.test.ts` is: there is no Tailwind pipeline under
 * test, so "is this element animating" is not observable here. What *is*
 * checkable is the source that produces it.
 *
 * Runs under `vitest.node.config.ts` — it reads from disk, which browser mode
 * cannot do.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { walkFiles, listDirs } from './walk.js';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

/**
 * Both trees, and violations keyed relative to the repo so both can be named.
 *
 * `examples/` was never scanned. It is what a consumer copies, and the library's
 * own components carry no hover transitions — so an example that does was
 * teaching the opposite of what the library practises, ungated, for the whole
 * life of this guard.
 */
const SOURCE_ROOTS = ['packages', 'examples'];

/**
 * The Exception Register, mirroring the table in
 * `guides/ANIMATION-GUIDELINES.md`. A site is legal only if it is here.
 *
 * Keyed by repo-relative path. The value lists the CSS properties that file is
 * permitted to transition — deliberately narrow, so widening an exception is a
 * visible edit rather than a silent one.
 *
 * `Carousel` is deliberately NOT here, though the previous version of the
 * guideline granted it. It is driven by reducer state (`currentIndex`), which is
 * the state-driven row of the rule, not the continuous-external-source row, and
 * it is now fully converted to Motion One — `animateCarouselTrack`, dispatching
 * `transitionCompleted`.
 *
 * `Progress` **is** here, granted `width`. It was refused for the same reason as
 * `Carousel` while it was `transition-all`; narrowed to `transition-[width]` and
 * driven by an external count rather than by the user's own input, it meets the
 * criteria. That distinction is the whole point of granting properties rather
 * than files: the old guide granted `Progress` "CSS for bar fills" as a blanket,
 * and it had quietly become `transition-all`.
 *
 * (Both were previously described here as sitting in the BACKLOG. Neither did —
 * one was converted and the other was granted twenty lines below the comment
 * denying it. The data in this file outranks any prose about it, including
 * this.)
 */
const REGISTER: Record<string, { properties: string[]; why: string }> = {
	'packages/media/src/lib/voice-input/components/AudioVisualizer.svelte': {
		// `transform`, `height` — exactly what the guide grants. `opacity` was
		// listed here and nowhere in the guide, so the mechanically-enforced list
		// silently outranked the document it claims to mirror.
		properties: ['transform', 'height'],
		why: 'Live microphone level, sampled faster than a spring could settle.'
	},
	'packages/media/src/lib/audio-player/FullAudioPlayer.svelte': {
		properties: ['width'],
		why: 'Playback position and buffer fill from media events.'
	},
	'packages/media/src/lib/audio-player/MinimalAudioPlayer.svelte': {
		properties: ['width'],
		why: 'Playback position from timeupdate.'
	},
	'packages/core/src/lib/components/ui/progress/Progress.svelte': {
		properties: ['width'],
		why: 'Determinate progress from an external count — bytes transferred, steps done. Not the user\'s own input, so the feedback-is-instant rule does not reach it.'
	},
	'packages/media/src/lib/voice-input/components/ConversationModePanel.svelte': {
		properties: ['width'],
		why: 'VAD silence countdown; a linear tween is the countdown semantics.'
	}
};

/**
 * `.css` as well as `.svelte`.
 *
 * Keeping only `.svelte` meant no stylesheet anywhere in the repo was ever
 * scanned — `core/src/lib/styles/*.css` included. They are clean today, so this
 * was latent rather than live, but a `@keyframes` added to `globals.css` would
 * have been invisible to a guard whose whole job is to see them.
 */
function walk(dir: string): string[] {
	// `worktrees` are agents' throwaway repo copies — full duplicates that
	// double-count every violation and outlive the agent that made them.
	return walkFiles(dir, {
		skip: ['node_modules', 'worktrees'],
		keep: (name) => name.endsWith('.svelte') || name.endsWith('.css')
	}).files;
}

// The `.filter(statSync(...).isFile())` that used to follow this is gone: it is
// what `walkFiles` decides by, and in the throwing form it would have taken
// every test in this file with it on one dangling symlink.
const sourceFiles = SOURCE_ROOTS.flatMap((root) =>
	listDirs(join(repoRoot, root)).flatMap((name) => walk(join(repoRoot, root, name, 'src')))
);

/**
 * Strip `<!-- -->`, block comments and `//` line comments, so commentary never
 * counts as a violation.
 *
 * The `//` handling is quote-aware, which it needs to be: the previous version
 * discarded everything after the first `//` not preceded by a colon, so
 * `<a href="//cdn.example.com" class="transition-colors">` lost its class and the
 * line scanned clean. Counting quotes before the marker is enough to tell a
 * comment from a protocol-relative URL, and it keeps trailing comments strippable.
 */
/**
 * @param isCss - a plain stylesheet, where `//` is never a comment. Passing
 * `.css` through the `//` pass discards everything after a protocol-relative
 * `url(//cdn…)`, including any declaration that follows it on the line. Both
 * existing guards miss that shape: `url()` is unquoted, so quote parity sees
 * nothing, and the character before the slashes is `(`, not `:`. Latent until
 * `.css` came under the walk; free to close now.
 */
function stripComments(source: string, isCss = false): string {
	// Newlines are preserved rather than deleted: a multi-line comment collapsed
	// to nothing shifts every later line number, and reported numbers were running
	// 4-17 lines low. A guard that points at the wrong line gets distrusted, then
	// disabled.
	const blank = (match: string) => match.replace(/[^\n]/g, '');
	const withoutHtml = source.replace(/<!--[\s\S]*?-->/g, blank);

	// Block comments, quote-aware — a `/*` inside a string is data, not a comment.
	//
	// This was a plain `.replace(/\/\*[\s\S]*?\*\//g, blank)` while the `//` pass
	// below it was already quote-aware, and the asymmetry cost two files: the
	// literal `image/*` in an `accept="…"` attribute opened a phantom comment that
	// ran to the next genuine `*/` hundreds of lines later, blanking every
	// declaration between. Both files scanned clean while violating, and neither
	// was in the backlog, so nothing anywhere reported it.
	//
	// Quote state is tracked per line, matching the `//` pass. A string spanning a
	// newline is not a shape this repo produces, and resetting each line stops one
	// stray apostrophe in prose from swallowing the rest of a file.
	const stripped: string[] = [];
	let inBlock = false;
	for (const line of withoutHtml.split('\n')) {
		let out = '';
		let quote: string | null = null;
		for (let i = 0; i < line.length; i += 1) {
			const c = line[i]!;
			if (inBlock) {
				if (c === '*' && line[i + 1] === '/') {
					inBlock = false;
					out += '  ';
					i += 1;
				} else out += ' ';
				continue;
			}
			if (quote) {
				out += c;
				if (c === '\\' && i + 1 < line.length) {
					out += line[i + 1];
					i += 1;
				} else if (c === quote) quote = null;
				continue;
			}
			// An apostrophe straight after a letter is `don't` or `the store's`, not
			// a string opener. Without this, prose before a real comment on the same
			// line leaves that comment unstripped, and the scanner reports a
			// violation on a line that is entirely commented out. Closing quotes are
			// matched in the `if (quote)` branch above, so `'Apple Color Emoji'`
			// still closes correctly.
			if (c === '"' || c === '`' || (c === "'" && !/[A-Za-z]/.test(line[i - 1] ?? ''))) {
				quote = c;
				out += c;
				continue;
			}
			if (c === '/' && line[i + 1] === '*') {
				inBlock = true;
				out += '  ';
				i += 1;
				continue;
			}
			out += c;
		}
		stripped.push(out);
	}

	if (isCss) return stripped.join('\n');

	return stripped.join('\n')
		.split('\n')
		.map((line) => {
			for (let i = 0; i < line.length - 1; i += 1) {
				if (line[i] !== '/' || line[i + 1] !== '/') continue;
				// `https://`, `file://` — a protocol, not a comment. Quote parity
				// cannot see this one: `url()` is unquoted, so there are no quotes to
				// count. An earlier version of this function keyed on the colon and
				// was *replaced* by quote counting; the two cover disjoint cases
				// (`href="//cdn"` has no colon, `url(https://…)` has no quote), so it
				// needed adding back rather than swapping in.
				if (line[i - 1] === ':') continue;
				const before = line.slice(0, i);
				// Inside a string? Then this is data, not a comment.
				const quotes = (before.match(/(?<!\\)["'`]/g) ?? []).length;
				if (quotes % 2 === 1) continue;
				return before;
			}
			return line;
		})
		.join('\n');
}

/**
 * The CSS properties a `transition` declaration actually animates.
 *
 * Handles the shorthand's comma-separated list and both spellings —
 * `transition: height 0.1s, opacity 0.2s` and `transition-property: height`.
 * Returns [] for `transition: all` and for a bare Tailwind `transition`, which
 * the caller treats as "everything" rather than "nothing".
 */
export function extractProperties(declaration: string): string[] {
	// `transition-[width]` — the idiomatic Tailwind way to name one property, and
	// therefore exactly what a narrowed Register grant is written as. Without this
	// the extractor returned [] for it, so a correctly-narrowed grant scanned as a
	// violation and the Register could not be satisfied through Tailwind at all.
	const arbitrary = [...declaration.matchAll(/transition-\[([^\]]+)\]/g)].flatMap((m) =>
		m[1]!.split(',').map((p) => p.trim())
	);
	if (arbitrary.length > 0) return arbitrary.filter((p) => p !== 'all');

	const tailwind = [...declaration.matchAll(/transition-(?!property\b)([a-z]+)(?![-\w])/g)].map(
		(m) => m[1]!
	);
	if (tailwind.length > 0) return tailwind.filter((p) => p !== 'all');

	const colon = declaration.match(/transition(?:-property)?\s*:\s*([\s\S]*)$/);
	if (!colon) return [];

	return colon[1]!
		.split(',')
		.map((part) => part.trim().split(/\s+/)[0] ?? '')
		.filter((p) => p.length > 0 && p !== 'all' && !/^[\d.]/.test(p));
}

interface Violation {
	file: string;
	line: number;
	text: string;
	why: string;
}

/**
 * Tailwind `transition-*`, including arbitrary values.
 *
 * The `-\[` alternative is not decoration: `transition-[width]` is the idiomatic
 * way to transition one named property, so without it the scanner was blind to
 * exactly the spelling a Register grant invites. It also made the Register
 * unreachable through Tailwind — a granted file written that way scans clean,
 * which then trips the stale-backlog check and removes it from enforcement
 * entirely.
 */
const TAILWIND_TRANSITION =
	/(?:^|[\s'"`:])(transition(?:-(?:all|colors|opacity|transform|shadow))?(?![-\w])|transition-\[[^\]]*\])/;
/** A raw CSS `transition:` / `transition-property:` declaration, or a Svelte `style:` directive. */
const RAW_TRANSITION = /(^|[\s;{:])transition(-property|-duration|-timing-function)?\s*[:=]/;
/**
 * A CSS `animation` declaration — shorthand *or* the longhands that start one.
 *
 * `animation-name` and `animation-duration` were deliberately excluded before,
 * which left `animation-name: slideIn; animation-duration: .2s;` fully compliant
 * with the guard and a flat violation of the policy.
 */
const RAW_ANIMATION =
	/(^|[\s;{'"`])animation(-name|-duration)?\s*:|(^|\s)style:animation(-name|-duration)?\s*=/;
/**
 * `tailwindcss-animate`'s enter/exit utilities.
 *
 * `animate-in`, `animate-out` and the `fade-in-*` / `zoom-in-*` / `slide-in-*`
 * modifiers that configure them are one-shot lifecycle animations wearing
 * Tailwind's clothes — exactly what the rule above prohibits, and exactly what
 * shadcn-svelte ships by default. Nothing in this file matched `animate-*`, so
 * the single most likely way for a prohibited animation to arrive in a package
 * built on 77 shadcn components was invisible.
 *
 * `animate-spin`, `animate-pulse`, `animate-bounce` and `animate-ping` are the
 * infinite ones and are legal, so only the enter/exit pair is matched.
 *
 * The `fade-in-0` / `zoom-in-95` / `slide-in-from-top-2` modifiers are
 * deliberately **not** matched. They configure `animate-in` and do nothing on
 * their own, so catching the trigger is sufficient — and matching them cost a
 * false positive immediately: `cursor: zoom-in` is a CSS value, not a class.
 */
const TAILWIND_ANIMATION = /(?:^|[\s'"`:])animate-(?:in|out)(?![-\w])/;
/**
 * Svelte's own transitions. Prohibited for the same reason as CSS ones — the
 * store cannot see them — and previously invisible: `in:`, `out:` and `animate:`
 * matched none of the three patterns above, so a contributor could write a
 * completely store-invisible lifecycle animation and the ratchet would approve.
 */
const SVELTE_TRANSITION = /(?:^|\s)(transition|in|out|animate):[a-zA-Z_$][\w$]*/;
/**
 * Turning an animation *off* is not an animation.
 *
 * `transition: none` / `animation: none` is what a `prefers-reduced-motion`
 * block contains, i.e. the correct thing to write. Flagging it would force the
 * author to delete accessibility code or widen the pattern, and the guideline
 * forbids widening the pattern.
 */
const DISABLES_ANIMATION = /:\s*none\b/;
/**
 * `scroll-behavior: smooth` — an animation the browser runs on your behalf.
 *
 * The guide names it prohibited for the same reason as a CSS transition: the
 * store cannot see it, cannot sequence on it and cannot cancel it. It matched
 * none of the four patterns above, so the four sites the guide explicitly cites
 * could never have failed a build. `auto` is the instant default and is fine —
 * only `smooth` animates.
 */
const SCROLL_ANIMATION = /(^|[\s;{])scroll-behavior\s*:\s*smooth\b/;

/**
 * The quoted strings on a line, without their quotes.
 *
 * The Tailwind detectors are matched against these rather than against the raw
 * line, because a utility class only ever lives inside a quoted string — a
 * `class` attribute, or a bare string handed to `cn()`. Prose does not:
 *
 *     <li>Instant tab switching with CSS transition effects</li>
 *
 * matched `TAILWIND_TRANSITION` and would have failed the build the moment
 * `examples/` came under the walk. The scan worked in `packages/` only because
 * no package source happened to use the word in a sentence.
 *
 * A `class`-attribute gate was the obvious alternative and is wrong: it would
 * drop `Progress.svelte`'s `cn('h-full bg-primary transition-[width] …')`,
 * which spans lines and carries no `class` token on the line that holds the
 * class. Losing a real hit is worse than the false positive being fixed.
 *
 * An unterminated quote still yields a span. That is deliberate — a class
 * attribute wrapped onto the next line is the common case:
 *
 *     class="flex items-center transition-all {isStepCurrent(step.step)
 *
 * Only the Tailwind detectors are gated. The raw-CSS ones are not, because a
 * `transition:` declaration is *never* quoted.
 */
export function quotedSpans(line: string, carried: string | null = null): {
	spans: string[];
	open: string | null;
} {
	const spans: string[] = [];
	let quote: string | null = carried;
	let buffer = '';

	for (let i = 0; i < line.length; i += 1) {
		const character = line[i]!;
		if (quote !== null) {
			if (character === quote) {
				spans.push(buffer);
				buffer = '';
				quote = null;
			} else {
				buffer += character;
			}
			continue;
		}
		if (character === '"' || character === '`') {
			quote = character;
			continue;
		}
		// An apostrophe inside a word is not a string opener. Without this,
		// `<p>Don't use CSS transition effects</p>` opens a span that swallows the
		// rest of the line and the prose is read as a class list after all — the
		// exact failure this gate exists to prevent, arriving by another door.
		// `stripComments` has carried the same guard for the same reason.
		if (character === "'" && !/[A-Za-z]/.test(line[i - 1] ?? '')) {
			quote = character;
		}
	}

	if (quote !== null) spans.push(buffer);
	return { spans, open: quote };
}

/**
 * Every place on a line where a Tailwind utility can actually appear.
 *
 * Quoted spans are the common case, but three others are real and were each
 * caught before this gate existed:
 *
 * - **`@apply`**, which is unquoted and is how a stylesheet uses a utility.
 *   `.css` files came under the walk in the same commit that added this gate,
 *   so the newly-scanned file type arrived with the Tailwind detectors disabled
 *   on it — `globals.css` and `theme.css` both use `@apply` today.
 * - **`class:` directives** — `class:transition-all={active}`. Unquoted, and a
 *   live idiom here (`NavigationStackDemo.svelte`, `Avatar.svelte`).
 * - **a class attribute wrapped onto the next line**, where the utility sits on
 *   a continuation line that contains no quote of its own. `carried` is what
 *   picks that up, which is why `scan` threads the quote state through.
 */
function tailwindContexts(
	line: string,
	carried: string | null
): { texts: string[]; open: string | null } {
	const { spans, open } = quotedSpans(line, carried);
	const texts = [...spans];

	// `@apply border-border transition-colors;` — the whole declaration is a
	// class list.
	if (/@apply\b/.test(line)) texts.push(line);

	// `class:transition-all={…}` — the utility is the directive's name.
	for (const match of line.matchAll(/(?:^|\s)class:([\w-]+)/g)) texts.push(match[1]!);

	return { texts, open };
}

/**
 * The leading space matters: both detectors anchor on `(?:^|[\s'"`:])`, and a
 * span begins at the character after the opening quote, so a class list that
 * *starts* with the utility would otherwise not match.
 */
function hasTailwindAnimation(texts: string[]): boolean {
	return texts.some(
		(text) => TAILWIND_TRANSITION.test(` ${text}`) || TAILWIND_ANIMATION.test(` ${text}`)
	);
}

/**
 * @param applyRegister - false to scan as though the file were not registered,
 * which is how a grant is checked for still covering anything.
 */
function scan(file: string, applyRegister = true): Violation[] {
	const rel = relative(repoRoot, file);
	const registered = applyRegister ? REGISTER[rel] : undefined;
	const source = stripComments(readFileSync(file, 'utf8'), file.endsWith('.css'));
	const lines = source.split('\n');
	const out: Violation[] = [];

	// Threaded through the loop so a class attribute wrapped across lines is
	// still read as one string.
	let openQuote: string | null = null;

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;
		const { texts, open } = tailwindContexts(line, openQuote);
		openQuote = open;

		if (DISABLES_ANIMATION.test(line)) continue;

		if (SCROLL_ANIMATION.test(line)) {
			out.push({
				file: rel,
				line: i + 1,
				text: line.trim(),
				why: 'scroll-behavior: smooth — a browser-run animation the store cannot see; use a scroll helper'
			});
			continue;
		}

		const isSvelte = SVELTE_TRANSITION.test(line);
		const isTailwind = hasTailwindAnimation(texts);
		const isRaw = RAW_TRANSITION.test(line);
		const isAnimation = RAW_ANIMATION.test(line);
		if (!isSvelte && !isTailwind && !isRaw && !isAnimation) continue;

		if (isSvelte) {
			out.push({
				file: rel,
				line: i + 1,
				text: line.trim(),
				why: "Svelte transition directive — the store cannot see it; use Motion One"
			});
			continue;
		}

		// An animation that repeats forever is allowed outright. Check the
		// declaration and, for a multi-line shorthand, the couple of lines after
		// it — `animation:\n  name 1s ...\n  infinite;` is common.
		if (isAnimation) {
			const window = lines.slice(i, i + 4).join(' ');
			if (/\binfinite\b/.test(window)) continue;
			out.push({
				file: rel,
				line: i + 1,
				text: line.trim(),
				why: 'one-shot @keyframes — a lifecycle animation; use Motion One'
			});
			continue;
		}

		if (registered) {
			// Registered files may transition only the properties they were granted.
			//
			// Read the whole *declaration*, not the line. `AudioVisualizer` writes
			// `transition:` alone with its property list on the two following lines,
			// and a line-at-a-time check finds no property name there — reporting a
			// false positive on the very file the guideline holds up as the model
			// entry.
			const declaration = lines
				.slice(i, i + 6)
				.join(' ')
				.split(';')[0]!;

			// Anything that promises every property is never grantable.
			const grantsAll =
				/transition-all(?![-\w])/.test(declaration) ||
				/transition(-property)?\s*:\s*all\b/.test(declaration) ||
				/(^|[\s'"`:])transition(?![-\w:])/.test(declaration);

			// Every property it transitions must be granted — not merely one of
			// them. `transition: width 0.3s, background-color 0.3s` used to pass on
			// the strength of `width` alone, which is how a grant silently widens.
			const transitioned = extractProperties(declaration);
			const allGranted =
				transitioned.length > 0 &&
				transitioned.every((p) => registered.properties.includes(p));

			if (allGranted && !grantsAll) continue;
			out.push({
				file: rel,
				line: i + 1,
				text: line.trim(),
				why: grantsAll
					? `registered for [${registered.properties.join(', ')}] but transitions everything`
					: `registered for [${registered.properties.join(', ')}], but this transitions ` +
						`[${extractProperties(lines.slice(i, i + 6).join(' ').split(';')[0]!).join(', ') || '?'}]`
			});
			continue;
		}

		out.push({
			file: rel,
			line: i + 1,
			text: line.trim(),
			why: 'CSS transition — see guides/ANIMATION-GUIDELINES.md'
		});
	}

	return out;
}

/**
 * There is no backlog.
 *
 * There was one, and it is gone because it reached empty — which was always the
 * instruction attached to it. It held five files across `code`, `maps` and
 * `media`; the last two were listed as *blocked* rather than merely unconverted,
 * because converting them would have deleted the only `prefers-reduced-motion`
 * guard they had. `animateFadeIn` reading the preference itself is what removed
 * that trade.
 *
 * Its two ratchet arms went with it. An arm iterating an empty set passes
 * trivially, and a guard that cannot fail is not a guard.
 *
 * If a file ever needs time again, restore the set *and* both arms together —
 * the "no stale entries" one is what stops an excuse outliving its defect, and a
 * backlog without it is just a permanent exemption list.
 */

describe('animation policy', () => {
	it('finds source to scan in every root, so this guard is not vacuous', () => {
		expect(sourceFiles.length).toBeGreaterThan(200);

		// Per root, not just in total. A count alone cannot tell you a root has
		// silently stopped being walked: `packages/` on its own clears any
		// threshold `examples/` would have helped it reach, which is how
		// `examples/` went unscanned for the whole life of this guard while the
		// suite stayed green.
		for (const root of SOURCE_ROOTS) {
			expect(
				sourceFiles.filter((f) => relative(repoRoot, f).startsWith(`${root}/`)).length,
				`nothing scanned under ${root}/`
			).toBeGreaterThan(20);
		}

		// Stylesheets too. There are no `.css` violations today, so dropping the
		// extension from `walk()` would change no result and no other assertion
		// here would notice — the walk kept only `.svelte` for the whole life of
		// this guard, and `core/src/lib/styles/*.css` was never scanned.
		expect(
			sourceFiles.filter((f) => f.endsWith('.css')).length,
			'no stylesheet is being scanned'
		).toBeGreaterThan(0);
	});

	it('the scanner recognises what it claims to', () => {
		// A guard whose matcher is wrong reports zero violations and looks green.
		// Every entry below is a spelling that was, or could have been, missed.
		expect(TAILWIND_TRANSITION.test("'transition-colors',")).toBe(true);
		expect(TAILWIND_TRANSITION.test("'shrink-0 transition-transform duration-200',")).toBe(true);
		expect(TAILWIND_TRANSITION.test('class="flex transition-transform"')).toBe(true);
		// Arbitrary values — the spelling a Register grant invites, and the one the
		// first version of this scanner could not see at all.
		expect(TAILWIND_TRANSITION.test('class="transition-[width] duration-200"')).toBe(true);
		expect(TAILWIND_TRANSITION.test("'transition-[color,background-color]',")).toBe(true);
		expect(RAW_TRANSITION.test('\ttransition: background 0.2s ease;')).toBe(true);
		// Svelte style directives set the same property from markup.
		expect(RAW_TRANSITION.test('\t\tstyle:transition-duration={`${ms}ms`}')).toBe(true);
		expect(RAW_ANIMATION.test('\tanimation: spin 1s linear infinite;')).toBe(true);
		// Longhands start a one-shot animation just as well as the shorthand.
		expect(RAW_ANIMATION.test('\tanimation-name: slideIn;')).toBe(true);
		expect(RAW_ANIMATION.test('\tanimation-duration: 0.3s;')).toBe(true);
		// Svelte's own transitions are store-invisible and were matched by nothing.
		expect(SVELTE_TRANSITION.test('\t<div transition:fade>')).toBe(true);
		expect(SVELTE_TRANSITION.test('\t<div in:fly={{ y: 8 }}>')).toBe(true);
		expect(SVELTE_TRANSITION.test('\t<div out:fade>')).toBe(true);
		expect(SVELTE_TRANSITION.test('\t<li animate:flip>')).toBe(true);

		// And what it must NOT flag:
		expect(TAILWIND_TRANSITION.test('duration-200 ease-out')).toBe(false);
		expect(RAW_ANIMATION.test('\tanimation-delay: var(--delay);')).toBe(false);
		// Turning animation off is the correct content of a reduced-motion block.
		expect(DISABLES_ANIMATION.test('\t\tanimation: none;')).toBe(true);
		expect(DISABLES_ANIMATION.test('\t\ttransition: none;')).toBe(true);
		expect(DISABLES_ANIMATION.test('\ttransition: opacity 0.2s;')).toBe(false);
		// A CSS pseudo-selector is not a Svelte directive.
		expect(SVELTE_TRANSITION.test('\t.a:hover { color: red; }')).toBe(false);
	});

	it('reads what a transition declaration actually animates', () => {
		// `extractProperties` is what makes a Register grant mean something, and it
		// had never run against an assertion: every Register file was also in the
		// backlog, so every verdict the branch produced was filtered out before it
		// could fail anything. These fixtures exercise it directly.
		expect(extractProperties('transition: width 0.3s;')).toEqual(['width']);

		// Multi-line, the shape that produced a false positive on the very file the
		// guideline holds up as its model Register entry.
		expect(
			extractProperties('transition: height 0.1s ease-out, opacity 0.2s ease')
		).toEqual(['height', 'opacity']);

		// The list matters in full — a grant covering only `width` must not be
		// satisfied by a declaration that also moves a colour.
		expect(extractProperties('transition: width 0.3s, background-color 0.3s')).toEqual([
			'width',
			'background-color'
		]);

		expect(extractProperties('transition-property: transform')).toEqual(['transform']);

		// The arbitrary-value form, which a narrowed grant is written as.
		expect(extractProperties("'h-full bg-primary transition-[width] duration-300',")).toEqual([
			'width'
		]);
		expect(extractProperties('transition-[width,opacity]')).toEqual(['width', 'opacity']);
		expect(extractProperties("'transition-opacity',")).toEqual(['opacity']);

		// "Everything" reads as no named property; the caller treats that as
		// ungrantable rather than as a vacuous pass.
		expect(extractProperties('transition: all 0.2s ease')).toEqual([]);
		expect(extractProperties("'transition-all',")).toEqual([]);
	});

	it('a Register grant covers only the properties it names', () => {
		// The end-to-end shape, via the same helper the branch uses.
		const granted = ['width'];
		const covers = (declaration: string) => {
			const props = extractProperties(declaration);
			return props.length > 0 && props.every((p) => granted.includes(p));
		};

		expect(covers('transition: width 0.1s;')).toBe(true);
		expect(covers('transition: opacity 0.2s;')).toBe(false);
		expect(covers('transition: width 0.3s, background-color 0.3s'), 'a grant widened').toBe(
			false
		);
		expect(covers('transition: all 0.2s'), 'all is never grantable').toBe(false);
	});

	it('sees an animation hidden in an attribute or a Tailwind class', () => {
		// Six spellings a hostile review found the scanner blind to. None was live
		// — which is the only reason this is a test rather than a backlog entry —
		// but `animate-in` is what shadcn-svelte ships by default, in a repo with
		// 77 shadcn components, so it was the most likely way for a prohibited
		// animation to arrive unseen.
		const hidden = [
			'<div style="animation: slideIn 0.3s ease-out"></div>',
			'<svelte:element this={tag} style="animation: pop 0.2s" />',
			'<div style:animation="pop 0.2s forwards"></div>',
			'<div class="animate-in fade-in-0 zoom-in-95"></div>',
			'<div class="data-[state=open]:animate-in"></div>'
		];

		for (const line of hidden) {
			expect(
				RAW_ANIMATION.test(line) || TAILWIND_ANIMATION.test(line),
				`not detected: ${line}`
			).toBe(true);
		}
	});

	it('reads a Tailwind class everywhere one can live, and nowhere else', () => {
		const reads = (line: string, carried: string | null = null) =>
			hasTailwindAnimation(tailwindContexts(line, carried).texts);

		// Why this gate exists: `<li>… CSS transition effects</li>` matched
		// `TAILWIND_TRANSITION` and would have failed the build the day
		// `examples/` came under the walk. It is prose, not a class list.
		expect(reads('<li>Instant tab switching with CSS transition effects</li>')).toBe(false);
		expect(reads('<p>Animations use a transition between states</p>')).toBe(false);
		// …including when an apostrophe is in the way. Without the word-boundary
		// guard in `quotedSpans`, the `'` opens a span that swallows the rest of
		// the sentence and the prose is read as a class list after all.
		expect(reads("<p>Don't use CSS transition effects</p>")).toBe(false);

		// The paired half, and the more important one. A `class`-attribute gate
		// would have fixed the prose case and silently dropped `Progress.svelte`'s
		// `cn('…')` line, which carries a real utility and no `class` token — a
		// detector that stops seeing a live violation is worse than one that reads
		// a sentence.
		const live = [
			'<button class="p-2 rounded hover:bg-accent transition-colors">',
			"\t'h-full bg-primary transition-[width] duration-300 ease-in-out',",
			'<div class="animate-in fade-in-0"></div>',
			// The utility first in the list, so there is no separator before it.
			'<div class="transition-opacity opacity-50"></div>',
			// Unquoted, and how a stylesheet uses a utility. `.css` files came
			// under the walk in the same commit as this gate, so without it the
			// Tailwind detectors were blind to every stylesheet they had just been
			// pointed at.
			'\t\t@apply border-border transition-colors;',
			// Unquoted, and a live idiom in this repo.
			'<div class:transition-all={active}></div>',
			'<span class:animate-in={entering}></span>'
		];

		for (const line of live) {
			expect(reads(line), `not detected: ${line}`).toBe(true);
		}

		// A class attribute wrapped across lines, with the utility on the
		// continuation line — which carries no quote of its own. The first-line
		// variant and this one are mirror images, and only one of them used to be
		// covered.
		const first = '\t\tclass="flex items-center';
		const { open } = quotedSpans(first);
		expect(open, 'the attribute should still be open at end of line').toBe('"');
		expect(reads(first)).toBe(false);
		expect(reads('\t\t\ttransition-colors duration-200"', open)).toBe(true);
	});

	it('leaves the infinite Tailwind animations and lookalike CSS values alone', () => {
		// The paired half. A detector that flags `animate-spin` would be turned
		// off, and one that flags `cursor: zoom-in` was — that exact false
		// positive appeared the first time this was widened.
		const legal = [
			'<div class="animate-spin"></div>',
			'<div class="animate-pulse rounded"></div>',
			'<div class="animate-bounce"></div>',
			'\t\tcursor: zoom-in;',
			'\t\tcursor: zoom-out;'
		];

		for (const line of legal) {
			expect(TAILWIND_ANIMATION.test(line), `false positive: ${line}`).toBe(false);
		}

		// `=` is matched only after `style:animation`, never after a bare
		// `animation`, so a component prop cannot trip it.
		expect(RAW_ANIMATION.test('<Chart animation={false} />')).toBe(false);
		expect(RAW_ANIMATION.test('<Chart animation-duration={200} />')).toBe(false);
		expect(RAW_ANIMATION.test('<div style:animation="pop 0.2s"></div>')).toBe(true);
	});

	it('strips comments without eating code', () => {
		// `stripComments` is the guard's single point of blindness. Both of its
		// passes are quote-aware; neither always was, and the asymmetry between
		// them is what this function is shaped around. Every case below was live
		// in the repo or one line away from being so.
		// A `//` inside a URL used to discard the rest of the line, taking any
		// class on it with it.
		expect(stripComments('<a href="//cdn.example.com" class="transition-colors">')).toContain(
			'transition-colors'
		);
		expect(stripComments('\t// transition: all 0.2s;')).not.toContain('transition:');
		expect(stripComments('<!-- transition: all -->')).not.toContain('transition:');

		// The symmetric case, which the version above did not cover and which cost
		// this guard two whole files.
		//
		// `image/*` inside an `accept` string opened a phantom block comment that
		// ran to the next real `*/` — in `StreamingChat.svelte` that blanked lines
		// 277-544 and hid every declaration in them. Both files scanned clean while
		// carrying violations, and neither was in the backlog.
		//
		// The lesson is in the shape, not the instance: the previous test was
		// written right after a `//`-in-a-URL bug and checked exactly that string,
		// so the identical hazard one line down in the same function survived.
		// The trailing real comment matters: without a closing `*/` the greedy
		// regex never matched at all and this assertion passed while proving
		// nothing. That is the shape of the live bug — `image/*` opens it and the
		// next genuine comment, hundreds of lines later, closes it.
		const accept =
			'<input accept="image/*,video/*" />\n\ttransition: opacity 0.2s;\n\t/* Dark mode */';
		expect(stripComments(accept)).toContain('transition:');
		expect(
			stripComments("{ok ? 'image/*' : 'x'}\n\ttransition: opacity 0.2s;\n\t/* Dark mode */")
		).toContain('transition:');

		// …while a real block comment is still stripped, on one line and across many.
		expect(stripComments('/* transition: all 0.2s; */')).not.toContain('transition:');
		expect(stripComments('/*\ntransition: all 0.2s;\n*/')).not.toContain('transition:');

		// Line numbers are load-bearing: a blanked comment must keep its lines.
		expect(stripComments('a\n/*\nx\n*/\nb').split('\n')).toHaveLength(5);

		// A protocol is not a comment, and quote parity cannot see this one —
		// `url()` is unquoted, so there are zero quotes before the `//`. This is the
		// same *class* of bug as the block-comment one above (a stripper eating a
		// real declaration), left in the same function by the fix that removed its
		// sibling. That is the failure this file keeps repeating.
		expect(stripComments('\tbackground: url(https://x/y.png); transition: opacity 0.2s;')).toContain(
			'transition:'
		);

		// An apostrophe in prose is not a string opener. The mirror image: quote
		// awareness bought block-comment correctness and would otherwise pay for it
		// by treating a real comment as code, reporting a violation on a line that
		// is entirely commented out.
		expect(stripComments("<p>don't</p> /* transition: all 0.2s; */")).not.toContain(
			'transition:'
		);
		// …but a genuine quoted string still closes correctly.
		expect(stripComments("\tfont-family: 'Apple Color Emoji'; /* x */ transition: opacity 1s;"))
			.toContain('transition:');
	});

	it('does not treat `//` as a comment in a stylesheet', () => {
		// `//` is never a comment in plain CSS. Stripping it discards the rest of
		// the line, and a protocol-relative `url(//cdn…)` defeats both existing
		// guards at once — `url()` is unquoted, so quote parity counts zero, and
		// the preceding character is `(`, not `:`.
		const css = '.x { background: url(//cdn.example.com/a.png); transition: opacity .2s; }';

		expect(stripComments(css, true)).toContain('transition:');
		// The `.svelte` path keeps its `//` handling, since there `//` really can
		// open a comment.
		expect(stripComments('\tconst x = 1; // transition: all 0.2s;')).not.toContain(
			'transition:'
		);
	});

	it('sees scroll-behavior, which is an animation the browser runs for you', () => {
		// Named as prohibited by the guide, which cites four sites in chat/ — and
		// matched by none of the four regexes above, so it could never fail a build.
		expect(SCROLL_ANIMATION.test('\tscroll-behavior: smooth;')).toBe(true);
		// `auto` is the instant default; only `smooth` animates.
		expect(SCROLL_ANIMATION.test('\tscroll-behavior: auto;')).toBe(false);
		// `overscroll-behavior` *contains* `scroll-behavior`. The `(^|[\s;{])` anchor
		// is the only thing stopping a match, and without this assertion dropping
		// that anchor in a refactor would be invisible.
		expect(SCROLL_ANIMATION.test('\toverscroll-behavior: contain;')).toBe(false);
		expect(SCROLL_ANIMATION.test('{scroll-behavior:smooth}')).toBe(true);
		// A recorded gap, measured rather than assumed: the JS spellings —
		// `scrollIntoView({behavior:'smooth'})`, `scrollTo({behavior:'smooth'})` —
		// and Tailwind's `scroll-smooth` are equally prohibited and matched by
		// nothing here. Zero sites in the repo today.
	});

	it('committed build artifacts carry no prohibited animation', () => {
		// `examples/ssr-server/static/` is SSG output that is *committed* — 34
		// pages plus a bundled stylesheet — and `src/server/index.ts` serves it.
		// The walk covers `<pkg>/src`, so it never saw this, and it went stale:
		// six `transition:` declarations deleted from the components in 33f1276
		// were still being served from the checked-in bundle, which is what a
		// consumer who clones the repo and runs `npm start` actually gets.
		//
		// Scanned as content rather than by line: the bundle is minified onto one
		// line, so a line number would say nothing. The remedy is to rebuild, not
		// to edit — this file is generated.
		const artifacts = ['examples/ssr-server/static/assets/index.css'];

		for (const artifact of artifacts) {
			const path = join(repoRoot, artifact);
			expect(existsSync(path), `${artifact} is missing`).toBe(true);

			const css = readFileSync(path, 'utf8');
			const offenders = [
				...css.matchAll(/transition\s*:[^;}]*/g),
				...css.matchAll(/animation\s*:[^;}]*/g)
			]
				.map((m) => m[0].trim())
				.filter((declaration) => !/:\s*none\b/.test(declaration))
				.filter((declaration) => !/\binfinite\b/.test(declaration));

			expect(
				offenders,
				`${artifact} is a committed, served build artifact and has drifted ` +
					`from its sources. Rebuild it — \`pnpm --filter ssr-server build:ssg\` ` +
					`— rather than editing it.`
			).toEqual([]);
		}
	});

	it('the register has no stale entries', () => {
		// The other direction of the ratchet, and the half that went missing when
		// the BACKLOG was deleted: its "no stale entries" arm went with it, and
		// the REGISTER never had an equivalent. A grant that covers nothing is a
		// permanent, invisible licence on a file — delete the transition it was
		// written for and the entry keeps excusing whatever lands there next.
		//
		// `guides/ANIMATION-GUIDELINES.md` states the principle for the backlog in
		// as many words: an excuse cannot outlive its defect. It applies here too.
		const known = new Set(sourceFiles.map((f) => relative(repoRoot, f)));

		const missing = Object.keys(REGISTER).filter((key) => !known.has(key));
		expect(
			missing,
			`registered files that are not scanned — renamed, moved, or deleted:\n${missing
				.map((f) => `  ${f}`)
				.join('\n')}`
		).toEqual([]);

		// Scanned as though unregistered: if that finds nothing, the grant is
		// covering nothing.
		const dead = Object.keys(REGISTER)
			.filter((key) => known.has(key))
			.filter((key) => scan(join(repoRoot, key), false).length === 0);

		expect(
			dead,
			`These files no longer transition anything — delete them from REGISTER:\n${dead
				.map((f) => `  ${f}`)
				.join('\n')}`
		).toEqual([]);
	});

	it('no file violates the guideline', () => {
		// Not `flatMap(scan)`: `flatMap` passes (value, index, array), so the index
		// would land in `applyRegister` and the first file — index 0, falsy — would
		// silently be scanned as though it had no Register grant.
		const violations = sourceFiles.flatMap((file) => scan(file));

		const report = violations
			.map((v) => `  ${v.file}:${v.line}  ${v.why}\n      ${v.text}`)
			.join('\n');

		expect(
			violations,
			`${violations.length} CSS animation site(s) violate ` +
				`guides/ANIMATION-GUIDELINES.md.\n\n${report}\n\n` +
				`Classify by what DRIVES the change:\n` +
				`  pseudo-class (:hover/:focus/:active) -> delete the transition, keep the style\n` +
				`  component or reducer state           -> Motion One in a guarded $effect\n` +
				`  repeats forever                      -> @keyframes, and it must say 'infinite'\n` +
				`  continuous external numeric source   -> add a Register entry, with a reason`
		).toEqual([]);
	});

});
