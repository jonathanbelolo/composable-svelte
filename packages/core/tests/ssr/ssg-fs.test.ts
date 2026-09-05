/**
 * @vitest-environment node
 *
 * The traversal corpus against a real directory. `ssg.test.ts` mocks
 * `fs/promises` and asserts on the paths handed to `writeFile`; this suite
 * lets the writes happen in a temporary directory and looks at what is on
 * disk afterwards — the property SS1 is about is the tree, not the call
 * (AUDIT-2026-09-03-FINDINGS SS1).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { expectConsole } from '../helpers/console.js';
import { mkdir, mkdtemp, readdir, rm, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { generateStaticSite } from '../../src/lib/ssr/ssg';
import { Effect } from '../../src/lib/effect';
import type { Reducer } from '../../src/lib/types';

vi.mock('svelte/server', () => ({
	render: vi.fn(() => ({ body: '<div>page</div>', head: '' }))
}));

interface State {
	title: string;
}
const reducer: Reducer<State, { type: 'noop' }> = (state) => [state, Effect.none()];

async function tree(dir: string): Promise<string[]> {
	const out: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
		if (entry.isFile()) out.push(relative(dir, join(entry.parentPath, entry.name)));
	}
	return out.sort();
}

let root: string;
beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'ssg-fs-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

describe('generateStaticSite on a real directory', () => {
	it('writes only inside outDir, whatever the paths say', async () => {
		const corpus = ['/../escaped', '/a/../../escaped2', '/%2e%2e/escaped3', '/..\\escaped4', '/a\u0000b'];
		expectConsole('error', corpus.length);
		const outDir = join(root, 'site', 'dist');

		const result = await generateStaticSite(
			{} as never,
			{ routes: [{ path: '/' }, { path: '/about/' }, ...corpus.map((path) => ({ path }))], outDir, generate404: true },
			{ reducer, dependencies: {}, getInitialState: async () => ({ title: 'x' }) }
		);

		expect(result.pagesGenerated).toBe(3);
		expect(result.errors.map((e) => e.path)).toEqual(corpus);
		// Everything under the temporary root, not only under outDir: an escape
		// would show up as a file beside `site`.
		expect(await tree(root)).toEqual([
			join('site', 'dist', '404.html'),
			join('site', 'dist', 'about', 'index.html'),
			join('site', 'dist', 'index.html')
		]);
	});

	it('a symlink inside outDir cannot route a write outside it', async () => {
		// resolve() is lexical: `dist/link/x` sat under outDir on paper while
		// `link` pointed elsewhere, and the file was written there.
		expectConsole('error');
		const outDir = join(root, 'dist');
		const elsewhere = join(root, 'elsewhere');
		await mkdir(outDir, { recursive: true });
		await mkdir(elsewhere, { recursive: true });
		await symlink(elsewhere, join(outDir, 'link'));

		const result = await generateStaticSite(
			{} as never,
			{ routes: [{ path: '/link/x' }], outDir, generate404: false },
			{ reducer, dependencies: {}, getInitialState: async () => ({ title: 'x' }) }
		);

		expect(result.errors.map((e) => e.error.message)).toEqual([
			expect.stringContaining('a directory on the way is a link to outside outDir')
		]);
		expect(await tree(elsewhere)).toEqual([]);
	});
});

