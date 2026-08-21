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
 * permitted to transition — deliberately narrow, so that widening an exception
 * is a visible edit rather than a silent one. `Progress` is the illustration:
 * it was granted "CSS for bar fills" and had quietly become `transition-all`.
 */
const REGISTER: Record<string, { properties: string[]; why: string }> = {
	'core/src/lib/components/ui/carousel/Carousel.svelte': {
		properties: ['transform'],
		why: 'GPU translateX at 60fps; currentIndex is reducer-owned. Slide track only.'
	},
	'media/src/lib/voice-input/components/AudioVisualizer.svelte': {
		properties: ['transform', 'height', 'opacity'],
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
	'media/src/lib/voice-input/components/ConversationModePanel.svelte': {
		properties: ['width'],
		why: 'VAD silence countdown; a linear tween is the countdown semantics.'
	},
	'core/src/lib/components/ui/progress/Progress.svelte': {
		properties: ['width'],
		why: 'Determinate progress from a value prop.'
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

/** Strip `<!-- -->`, `/* *\/` and `//` so commentary never counts as a violation. */
function stripComments(source: string): string {
	return source
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface Violation {
	file: string;
	line: number;
	text: string;
	why: string;
}

/** Tailwind `transition-*`, but not `transition-duration`/`delay` alone. */
const TAILWIND_TRANSITION = /(?:^|[\s'"`:[])(transition(?:-(?:all|colors|opacity|transform|shadow))?)(?![-\w])/;
/** A raw CSS `transition:` / `transition-property:` declaration. */
const RAW_TRANSITION = /(^|[\s;{])transition(-property)?\s*:/;
/** A raw CSS `animation:` shorthand (not `animation-delay`, `animation-name`). */
const RAW_ANIMATION = /(^|[\s;{])animation\s*:/;

function scan(file: string): Violation[] {
	const rel = relative(packagesDir, file);
	const registered = REGISTER[rel];
	const source = stripComments(readFileSync(file, 'utf8'));
	const lines = source.split('\n');
	const out: Violation[] = [];

	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i]!;

		const isTailwind = TAILWIND_TRANSITION.test(line);
		const isRaw = RAW_TRANSITION.test(line);
		const isAnimation = RAW_ANIMATION.test(line);
		if (!isTailwind && !isRaw && !isAnimation) continue;

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
			// Registered files may transition only the properties they were
			// granted. `transition-all` and a bare `transition:` are never
			// grantable — they promise every property.
			const grantsAll = /transition-all|(^|[\s;{])transition\s*:\s*all\b/.test(line);
			const named = registered.properties.some((p) =>
				new RegExp(`transition(-${p}\\b|\\s*:\\s*[^;]*\\b${p}\\b)`).test(line)
			);
			if (named && !grantsAll) continue;
			out.push({
				file: rel,
				line: i + 1,
				text: line.trim(),
				why: grantsAll
					? `registered for [${registered.properties.join(', ')}] but transitions everything`
					: `registered for [${registered.properties.join(', ')}] only`
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
	'core/src/lib/components/command/CommandInput.svelte',
	'core/src/lib/components/command/CommandItem.svelte',
	'core/src/lib/components/data-table/DataTableHeader.svelte',
	'core/src/lib/components/image-gallery/ImageGallery.svelte',
	'core/src/lib/components/image-gallery/ImageLightbox.svelte',
	'core/src/lib/components/toast/Toast.svelte',
	'core/src/lib/components/toast/ToastAction.svelte',
	'core/src/lib/components/ui/accordion/AccordionTrigger.svelte',
	'core/src/lib/components/ui/badge/Badge.svelte',
	'core/src/lib/components/ui/breadcrumb/BreadcrumbLink.svelte',
	'core/src/lib/components/ui/button/Button.svelte',
	'core/src/lib/components/ui/carousel/Carousel.svelte',
	'core/src/lib/components/ui/collapsible/CollapsibleTrigger.svelte',
	'core/src/lib/components/ui/combobox/Combobox.svelte',
	'core/src/lib/components/ui/icon-button/IconButton.svelte',
	'core/src/lib/components/ui/pagination/Pagination.svelte',
	'core/src/lib/components/ui/progress/Progress.svelte',
	'core/src/lib/components/ui/select/Select.svelte',
	'core/src/lib/components/ui/slider/Slider.svelte',
	'core/src/lib/components/ui/switch/Switch.svelte',
	'core/src/lib/components/ui/tree-view/TreeView.svelte',
	'core/src/lib/navigation-components/AnimatedNavigationStack.svelte',
	'core/src/lib/navigation-components/NavigationStack.svelte',
	'core/src/lib/navigation-components/Tabs.svelte',
	'maps/src/lib/components/TileProviderControl.svelte',
	'media/src/lib/audio-player/FullAudioPlayer.svelte',
	'media/src/lib/audio-player/MinimalAudioPlayer.svelte',
	'media/src/lib/audio-player/PlaylistView.svelte',
	'media/src/lib/voice-input/components/AudioVisualizer.svelte',
	'media/src/lib/voice-input/components/ConversationModePanel.svelte',
	'media/src/lib/voice-input/components/PushToTalkPanel.svelte',
	'media/src/lib/voice-input/components/RecordingTimer.svelte',
	'media/src/lib/voice-input/components/VoiceInputButton.svelte',
]);

describe('animation policy', () => {
	it('finds source to scan, so this guard is not vacuous', () => {
		expect(sourceFiles.length).toBeGreaterThan(100);
	});

	it('the scanner recognises what it claims to', () => {
		// A guard whose matcher is wrong reports zero violations and looks green.
		expect(TAILWIND_TRANSITION.test("'transition-colors',")).toBe(true);
		expect(TAILWIND_TRANSITION.test("'shrink-0 transition-transform duration-200',")).toBe(true);
		expect(TAILWIND_TRANSITION.test('class="flex transition-transform"')).toBe(true);
		expect(RAW_TRANSITION.test('\ttransition: background 0.2s ease;')).toBe(true);
		expect(RAW_ANIMATION.test('\tanimation: spin 1s linear infinite;')).toBe(true);
		// And what it must not flag:
		expect(TAILWIND_TRANSITION.test("duration-200 ease-out")).toBe(false);
		expect(RAW_ANIMATION.test('\tanimation-delay: var(--delay);')).toBe(false);
		expect(RAW_TRANSITION.test('// a comment about transition: foo')).toBe(true); // stripped earlier
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
