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
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const packagesDir = join(repoRoot, 'packages');

/**
 * The Exception Register, mirroring the table in
 * `guides/ANIMATION-GUIDELINES.md`. A site is legal only if it is here.
 *
 * Keyed by repo-relative path. The value lists the CSS properties that file is
 * permitted to transition — deliberately narrow, so widening an exception is a
 * visible edit rather than a silent one.
 *
 * `Carousel` and `Progress` are deliberately NOT here, though the previous
 * version of the guideline granted them. Both are driven by reducer state
 * (`currentIndex`, `value`), which is the state-driven row of the rule, not the
 * continuous-external-source row. They sit in the BACKLOG awaiting conversion,
 * because recording them as principled exceptions would be exactly the wishful
 * accounting this policy exists to remove — the old guide granted `Progress`
 * "CSS for bar fills" and it had quietly become `transition-all`.
 */
const REGISTER: Record<string, { properties: string[]; why: string }> = {
	'media/src/lib/voice-input/components/AudioVisualizer.svelte': {
		// `transform`, `height` — exactly what the guide grants. `opacity` was
		// listed here and nowhere in the guide, so the mechanically-enforced list
		// silently outranked the document it claims to mirror.
		properties: ['transform', 'height'],
		why: 'Live microphone level, sampled faster than a spring could settle.'
	},
	'media/src/lib/audio-player/FullAudioPlayer.svelte': {
		properties: ['width'],
		why: 'Playback position and buffer fill from media events.'
	},
	'media/src/lib/audio-player/MinimalAudioPlayer.svelte': {
		properties: ['width'],
		why: 'Playback position from timeupdate.'
	},
	'core/src/lib/components/ui/progress/Progress.svelte': {
		properties: ['width'],
		why: 'Determinate progress from an external count — bytes transferred, steps done. Not the user\'s own input, so the feedback-is-instant rule does not reach it.'
	},
	'media/src/lib/voice-input/components/ConversationModePanel.svelte': {
		properties: ['width'],
		why: 'VAD silence countdown; a linear tween is the countdown semantics.'
	}
};

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
		const full = join(dir, e.name);
		if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full);
		return e.name.endsWith('.svelte') ? [full] : [];
	});
}

const sourceFiles = readdirSync(packagesDir, { withFileTypes: true })
	.filter((e) => e.isDirectory())
	.flatMap((e) => walk(join(packagesDir, e.name, 'src')))
	.filter((f) => statSync(f).isFile());

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
function stripComments(source: string): string {
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
			if (c === '"' || c === "'" || c === '`') {
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

	return stripped.join('\n')
		.split('\n')
		.map((line) => {
			for (let i = 0; i < line.length - 1; i += 1) {
				if (line[i] !== '/' || line[i + 1] !== '/') continue;
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
const RAW_ANIMATION = /(^|[\s;{])animation(-name|-duration)?\s*:/;
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

function scan(file: string): Violation[] {
	const rel = relative(packagesDir, file);
	const registered = REGISTER[rel];
	const source = stripComments(readFileSync(file, 'utf8'));
	const lines = source.split('\n');
	const out: Violation[] = [];

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;

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
		const isTailwind = TAILWIND_TRANSITION.test(line);
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
 * Files not yet converted, shrinking to empty.
 *
 * A ratchet rather than a knowingly-red suite: CI stays green while the sweep
 * proceeds, and the list cannot rot in either direction. A violation in a file
 * that is **not** listed fails, so nothing new lands. A listed file that has
 * become clean **also** fails, so an entry cannot outlive the defect it excuses.
 *
 * Keyed by file, not by line, because line numbers move under unrelated edits
 * and a guard that reports false positives gets disabled.
 *
 * Delete entries as packages are converted. When this is empty, delete it.
 */
const BACKLOG = new Set([
	'chat/src/lib/streaming-chat/ChatMessage.svelte',
	// These two were never listed because the scanner could not see them: the
	// `image/*` in their `accept` attribute opened a phantom block comment that
	// blanked every declaration below it. Listed now that `stripComments` is
	// quote-aware, and cleared as the chat pass reaches them.
	'chat/src/lib/streaming-chat/StreamingChat.svelte',
	'chat/src/lib/streaming-chat/variants/FullStreamingChat.svelte',
	'chat/src/lib/streaming-chat/attachment-components/AttachmentPreviewModal.svelte',
	'chat/src/lib/streaming-chat/attachment-components/AudioPlayer.svelte',
	'chat/src/lib/streaming-chat/attachment-components/FileAttachment.svelte',
	'chat/src/lib/streaming-chat/attachment-components/ImagePreview.svelte',
	'chat/src/lib/streaming-chat/attachment-components/PDFViewer.svelte',
	'chat/src/lib/streaming-chat/attachment-components/PendingAttachmentPreview.svelte',
	'chat/src/lib/streaming-chat/attachment-components/VideoPlayer.svelte',
	'chat/src/lib/streaming-chat/collaborative-primitives/CursorMarker.svelte',
	'chat/src/lib/streaming-chat/collaborative-primitives/PresenceList.svelte',
	'chat/src/lib/streaming-chat/primitives/ActionButtons.svelte',
	'chat/src/lib/streaming-chat/primitives/ChatMessage.svelte',
	'chat/src/lib/streaming-chat/primitives/ChatMessageWithActions.svelte',
	'chat/src/lib/streaming-chat/primitives/ContextMenu.svelte',
	'chat/src/lib/streaming-chat/primitives/MessageReactions.svelte',
	'chat/src/lib/streaming-chat/primitives/ReactionPicker.svelte',
	'chat/src/lib/streaming-chat/primitives/SimpleChatMessage.svelte',
	'chat/src/lib/streaming-chat/variants/MinimalStreamingChat.svelte',
	'chat/src/lib/streaming-chat/variants/StandardStreamingChat.svelte',
	'code/src/lib/code-editor/CodeEditor.svelte',
	'code/src/lib/code-highlight/CodeHighlight.svelte',
	'maps/src/lib/components/TileProviderControl.svelte',
	// These two are blocked, not merely unconverted. Each carries a one-shot
	// `fadeIn` on mount — a lifecycle animation the policy prohibits — and each is
	// the *only* thing its own `@media (prefers-reduced-motion: reduce)` block
	// disables them. Cited by rule name rather than line number: the previous
	// form named two lines, and a later commit in the same batch deleted 28 lines
	// above one of them, leaving the sole recorded justification for an exemption
	// pointing past end-of-file.
	// Converting them to Motion One today would delete the sole accessibility
	// guard, because no helper in `animate.ts` consults the preference yet.
	//
	// They do not qualify for the Register either: its criteria require freedom
	// from any mount/unmount lifecycle, which is exactly what these are. The
	// Register grants properties; the backlog grants time, and time is what these
	// need — until the reduced-motion capability exists.
	'media/src/lib/voice-input/components/ConversationModePanel.svelte',
	'media/src/lib/voice-input/components/PushToTalkPanel.svelte',
]);

describe('animation policy', () => {
	it('finds source to scan, so this guard is not vacuous', () => {
		expect(sourceFiles.length).toBeGreaterThan(100);
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

	it('strips comments without eating code', () => {
		// `stripComments` is the guard's single point of blindness and had no test.
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
	});

	it('sees scroll-behavior, which is an animation the browser runs for you', () => {
		// Named as prohibited by the guide, which cites four sites in chat/ — and
		// matched by none of the four regexes above, so it could never fail a build.
		expect(SCROLL_ANIMATION.test('\tscroll-behavior: smooth;')).toBe(true);
		// `auto` is the instant default; only `smooth` animates.
		expect(SCROLL_ANIMATION.test('\tscroll-behavior: auto;')).toBe(false);
	});

	it('no file outside the backlog violates the guideline', () => {
		const violations = sourceFiles.flatMap(scan).filter((v) => !BACKLOG.has(v.file));

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

	it('the backlog has no stale entries', () => {
		// An entry that no longer names a violation is an excuse outliving its
		// defect. Removing it is what makes the ratchet tighten.
		const offending = new Set(sourceFiles.flatMap(scan).map((v) => v.file));
		const stale = [...BACKLOG].filter((f) => !offending.has(f));

		expect(
			stale,
			`These files are now clean — delete them from BACKLOG:\n${stale.map((f) => `  ${f}`).join('\n')}`
		).toEqual([]);
	});

	it('the backlog names files that exist', () => {
		// A rename would otherwise silently un-enforce a file.
		const known = new Set(sourceFiles.map((f) => relative(packagesDir, f)));
		expect([...BACKLOG].filter((f) => !known.has(f))).toEqual([]);
	});
});
