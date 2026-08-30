/**
 * Public members that are deliberately kept despite having no caller.
 *
 * `graphics` exposes several classes through its barrel whose public methods
 * nothing in this repository calls. They are API for a consumer, not dead code,
 * and the register that said so lived in `plans/hardening/README.md` as prose —
 * with the stated purpose of stopping a later pass deleting them on a count.
 *
 * It was wrong at that job twice. Written as **eight**, corrected to **ten**
 * when `ShaderCompiler` turned out to have been missed entirely, and it is
 * **eleven**: `BabylonAdapter.resize` is barrel-exported at `index.ts` and has
 * no caller either. A list that is short is worse than no list, because the
 * members it omits are the ones it licenses deleting. So it stops being prose.
 *
 * **The arm asserts the exact set of call sites, not "there are none".** A bare
 * `.name(` count is wrong in both directions and that is very likely why the
 * hand-maintained version drifted:
 *
 * - `ShaderCompiler.validateProgram` looks called. The only occurrence is
 *   `gl.validateProgram(program)` — the WebGL context's method, not this one.
 * - `RenderPipeline.clear` has a caller, `renderBatch`, which is itself in this
 *   register. Reachable, but only through something that is not.
 * - `.clear(` matches thirteen times across the package, nearly all of them
 *   `Map.clear()`.
 *
 * Recording the receiver and the site turns "no callers" into something exact:
 * if a real caller appears the set changes, this fails, and the entry gets
 * removed rather than the member.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

import { walkFiles } from './walk.js';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const graphicsSrc = join(repoRoot, 'packages', 'graphics', 'src');

interface Entry {
	/** The declaring class, for the reader — the scan is by member name. */
	cls: string;
	member: string;
	/** Path under `packages/graphics/src`, where the declaration must still be. */
	file: string;
	/** Every `.member(` occurrence in the package, as `path:line receiver`. */
	callSites: string[];
	why: string;
}

const REGISTER: Entry[] = [
	{
		cls: 'ShaderProgramManager',
		member: 'enableAttributes',
		file: 'lib/shaders/shader-program-manager.ts',
		callSites: [],
		why: 'attribute setup a consumer driving the pipeline by hand needs'
	},
	{
		cls: 'ShaderProgramManager',
		member: 'getStatistics',
		file: 'lib/shaders/shader-program-manager.ts',
		callSites: [],
		why: 'cache introspection for a consumer profiling shader reuse'
	},
	{
		cls: 'ShaderProgramManager',
		member: 'getProgramInfo',
		file: 'lib/shaders/shader-program-manager.ts',
		callSites: [],
		why: 'per-program introspection, same audience'
	},
	{
		cls: 'RenderPipeline',
		member: 'setViewport',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: [],
		why: 'viewport control for a consumer rendering into their own target'
	},
	{
		cls: 'RenderPipeline',
		member: 'setBlendMode',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: [],
		why: 'blend configuration the built-in passes never change'
	},
	{
		cls: 'RenderPipeline',
		member: 'setBlending',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: [],
		why: 'as setBlendMode'
	},
	{
		cls: 'RenderPipeline',
		member: 'renderBatch',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: [],
		why: 'batch entry point; the library renders one draw at a time internally'
	},
	{
		cls: 'RenderPipeline',
		member: 'getStatistics',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: [],
		why: 'draw-call counters for a consumer profiling'
	},
	{
		cls: 'ShaderCompiler',
		member: 'validateProgram',
		file: 'lib/shaders/shader-compiler.ts',
		callSites: [],
		why:
			'link validation for a consumer debugging a shader. Note the lookalike: ' +
			'`gl.validateProgram(program)` appears inside this very method, and it is the ' +
			'WebGL context\'s call, not a caller of this one.'
	},
	{
		cls: 'ShaderCompiler',
		member: 'getProgramInfo',
		file: 'lib/shaders/shader-compiler.ts',
		callSites: [],
		why: 'link/validate log access for a consumer debugging a shader'
	},
	{
		cls: 'BabylonAdapter',
		member: 'resize',
		file: 'adapters/babylon-adapter.ts',
		callSites: [],
		why:
			'the eleventh, missing from every prose version of this list. Both `.resize(` ' +
			'occurrences are `this.engine?.resize()` — Babylon\'s engine, not this adapter: ' +
			'one is the internal resize listener, the other is this method\'s own body.'
	},
	{
		cls: 'RenderPipeline',
		member: 'clear',
		file: 'lib/shaders/render-pipeline.ts',
		callSites: ['lib/shaders/render-pipeline.ts:382 this'],
		why:
			'a different category, and recorded rather than merged: it *is* called, from ' +
			'`renderBatch` — which is itself in this register. Reachable only through ' +
			'something that is not, so deleting `renderBatch` on a count would silently ' +
			'strand this too.'
	}
];

/** Every `.ts` under `packages/graphics/src`, with its repo-relative path. */
const sources = walkFiles(graphicsSrc, { keep: (name) => name.endsWith('.ts') }).files.map(
	(file) => ({
		path: relative(graphicsSrc, file).split('\\').join('/'),
		text: readFileSync(file, 'utf8')
	})
);

/**
 * Whether a receiver could be an instance of this class.
 *
 * This is the whole difficulty, and two weaker versions failed first. Scanning
 * the package for `.clear(` found thirteen sites, nearly all `Map.clear()`.
 * Narrowing to files that name `RenderPipeline` still found seven, because
 * `webgl-overlay.ts` imports the class *and* calls `gl.clear()` and
 * `this.elementPrograms.clear()`.
 *
 * So the receiver decides:
 *
 * - `this`, in the declaring file — the class calling its own method.
 * - a name whose last segment reads like the class (`pipeline`,
 *   `this.renderPipeline`) — the way an instance is actually held here.
 *
 * Everything else is something that merely shares a method name: `gl`,
 * `this.cache`, `this.engine`. That last one matters — `this.engine?.resize()`
 * is Babylon's engine, and reading it as a call to `BabylonAdapter.resize` is
 * exactly the mistake the prose register kept making.
 *
 * **Limit, stated rather than papered over:** a call through a variable named
 * nothing like its type (`const p = new RenderPipeline(); p.clear()`) is not
 * recognised. That costs little, because the arm this register exists for — the
 * member is still declared — does not depend on it.
 */
function couldBe(receiver: string, entry: Entry, path: string): boolean {
	if (receiver === 'this') return path === entry.file;

	const last = receiver.replace(/\?$/, '').split('.').pop() ?? '';
	return last.toLowerCase().includes(entry.cls.toLowerCase());
}

/** Calls to this member that we would recognise, as `path:line receiver`. */
function occurrences(entry: Entry): string[] {
	const pattern = new RegExp(`([\\w$.?]*)\\.${entry.member}\\s*\\(`, 'g');
	const found: string[] = [];

	for (const { path, text } of sources) {
		for (const match of text.matchAll(pattern)) {
			const receiver = match[1] || '(none)';
			if (!couldBe(receiver, entry, path)) continue;
			found.push(`${path}:${text.slice(0, match.index).split('\n').length} ${receiver}`);
		}
	}

	return found.sort();
}

describe('the intentionally-unused register', () => {
	it('has entries, so the arms below are about something', () => {
		expect(REGISTER.length).toBeGreaterThanOrEqual(11);
	});

	it('found the package, so an empty scan cannot pass as a clean one', () => {
		// Without this, a moved `src` directory makes every `occurrences()` call
		// return `[]` — which is what most entries expect, so the whole file
		// would pass while checking nothing at all.
		expect(sources.length, 'no .ts files under packages/graphics/src').toBeGreaterThan(20);
	});

	it('names only files that exist', () => {
		const gone = REGISTER.filter((e) => !existsSync(join(graphicsSrc, e.file))).map(
			(e) => `${e.cls}.${e.member} → ${e.file}`
		);

		expect(gone, 'these registered files are gone:\n' + gone.join('\n')).toEqual([]);
	});

	it('every registered member is still declared', () => {
		// The point of the register: if one of these disappears, it was deleted
		// on a count, and this says so rather than the deletion passing silently.
		const missing = REGISTER.filter((entry) => {
			const text = readFileSync(join(graphicsSrc, entry.file), 'utf8');
			return !new RegExp(`^\\s*(?:public\\s+|readonly\\s+)*${entry.member}\\s*\\(`, 'm').test(text);
		}).map((e) => `${e.cls}.${e.member}  (${e.file})`);

		expect(
			missing,
			'these were kept deliberately and are now gone — if the removal is intended, ' +
				'drop the entry in the same commit:\n' + missing.join('\n')
		).toEqual([]);
	});

	it('every registered member still has exactly the call sites recorded for it', () => {
		// Both directions. A new caller means the member has stopped being
		// unused and the entry should go; a vanished one means the register is
		// describing code that moved.
		const changed = REGISTER.filter(
			(entry) => JSON.stringify(occurrences(entry)) !== JSON.stringify([...entry.callSites].sort())
		).map(
			(entry) =>
				`${entry.cls}.${entry.member}\n` +
				`    registered: ${entry.callSites.join(', ') || '(none)'}\n` +
				`    found:      ${occurrences(entry).join(', ') || '(none)'}`
		);

		expect(
			changed,
			'call sites moved. If a real caller appeared, the member is no longer unused — ' +
				'remove its entry. If a line moved, update it:\n' + changed.join('\n\n')
		).toEqual([]);
	});
});
