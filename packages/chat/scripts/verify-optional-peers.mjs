#!/usr/bin/env node
/**
 * Prove chat's four optional peers are optional: install the packed package in
 * a consumer outside the workspace, without them, and use every entry point.
 *
 * Build first (`pnpm run build` here). Nothing is published and no workspace
 * file is written: core and chat are packed with `npm pack --ignore-scripts`
 * from their current `dist`, into a scratch directory, and installed from
 * those tarballs by npm, which never installs an optional peer on its own.
 *
 * Phase A, no optional peer (`prismjs`, `@composable-svelte/code`,
 * `@composable-svelte/media`, `pdfjs-dist` all absent):
 *   1. Plain Node imports the markdown subpath; `optionalDependenciesReady`
 *      settles and rendering degrades to escaped, unhighlighted code.
 *   2. `tsc --noEmit` with `skipLibCheck: false` over all three entry points.
 *   3. Vite SSR renders the three variants from the root and the primitives
 *      from `./streaming-chat`, after the lazy peer load has settled: once
 *      through the dev server (`ssrLoadModule`) and once from a production
 *      `vite build --ssr`, with no console warning or error.
 *   4. `vite build` of a client that mounts them.
 *   5. Chromium loads that build: the chat renders, a PDF attachment reports
 *      its missing library in place, a message streams, and there is no page
 *      error and no console warning or error.
 *
 * Why the console matters: a production Vite build resolves an absent
 * optional peer to a stub `{}` instead of throwing. Taking that stub for Prism
 * warned "Failed to highlight" once per fenced block per render. Page errors
 * never saw it, and the dev-server SSR path throws instead, so neither did A3.
 * Deliberate mutation: the installed chat's `markdown.js` is put back to
 * accepting any module as Prism, and phases A3 (production SSR) and A5 must
 * then report the warning; the file is restored before phase B.
 * Phase B, a peer arriving: `npm install prismjs` into the same consumer, and
 *   the same Node and SSR renders now highlight. The peer is picked up lazily,
 *   by the dynamic import, with no change to the consumer's code.
 *
 * Positive control: the absent-peer assertions are checked to fail against
 * phase B, where `prismjs` is present.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const chatDir = fileURLToPath(new URL('..', import.meta.url));
const root = join(chatDir, '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'chat-optional-peers-'));
const packs = join(scratch, 'packs');
const app = join(scratch, 'app');
mkdirSync(packs);
mkdirSync(join(app, 'src'), { recursive: true });
console.log(`Optional-peer verification: ${scratch}`);

const run = (cmd, args, cwd = app) =>
	execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
const version = (name) =>
	JSON.parse(readFileSync(join(chatDir, 'node_modules', name, 'package.json'), 'utf8')).version;

assert.ok(existsSync(join(chatDir, 'dist', 'index.js')), 'build chat first: pnpm run build');

const tarballs = {};
for (const name of ['core', 'chat']) {
	const dir = join(root, 'packages', name);
	const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
	const destination = join(packs, `composable-svelte-${name}-${manifest.version}.tgz`);
	const supplied = process.env[`COMPOSABLE_${name.toUpperCase()}_TARBALL`];
	if (supplied) copyFileSync(supplied, destination);
	else run('npm', ['pack', '--ignore-scripts', '--pack-destination', packs, '--loglevel', 'error'], dir);
	tarballs[manifest.name] = `file:${destination}`;
}

// Tool versions match the workspace, so a failure is the package, not a drift.
writeFileSync(
	join(app, 'package.json'),
	JSON.stringify(
		{
			name: 'chat-optional-peers-consumer',
			private: true,
			type: 'module',
			dependencies: { ...tarballs, svelte: version('svelte') },
			devDependencies: {
				vite: version('vite'),
				'@sveltejs/vite-plugin-svelte': version('@sveltejs/vite-plugin-svelte'),
				typescript: version('typescript')
			}
		},
		null,
		2
	)
);

const files = {
	'vite.config.js': `import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
export default defineConfig({ plugins: [svelte()], build: { outDir: 'dist' } });
`,
	'tsconfig.json': JSON.stringify(
		{
			compilerOptions: {
				target: 'ES2022',
				module: 'ESNext',
				moduleResolution: 'bundler',
				strict: true,
				exactOptionalPropertyTypes: true,
				skipLibCheck: false,
				noEmit: true,
				types: []
			},
			include: ['src/types.ts']
		},
		null,
		2
	),
	'index.html': `<!doctype html><html><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>
`,
	// One conversation exercising every optional path: a fenced code block
	// (prismjs, code), a video link (media) and a PDF attachment (pdfjs-dist).
	'src/conversation.ts': `import { createStore } from '@composable-svelte/core';
import {
	streamingChatReducer,
	createInitialStreamingChatState,
	type Message,
	type StreamingChatDependencies
} from '@composable-svelte/chat';

export const messages: Message[] = [
	{ id: 'q', role: 'user', content: 'Show me code', timestamp: 0 },
	{
		id: 'a',
		role: 'assistant',
		content: 'Here:\\n\\n\`\`\`js\\nconst answer = 42;\\n\`\`\`\\n\\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ',
		timestamp: 0,
		attachments: [
			{ id: 'p', type: 'pdf', filename: 'spec.pdf', url: 'data:application/pdf;base64,JVBERi0=', size: 5, mimeType: 'application/pdf' }
		]
	}
];

export function createChat(dependencies: StreamingChatDependencies) {
	return createStore({
		initialState: { ...createInitialStreamingChatState(), messages },
		reducer: streamingChatReducer,
		dependencies
	});
}
`,
	'src/App.svelte': `<script lang="ts">
	import type { Store } from '@composable-svelte/core';
	import { MinimalStreamingChat, StandardStreamingChat, FullStreamingChat, type StreamingChatState, type StreamingChatAction } from '@composable-svelte/chat';
	import { ChatMessageWithActions } from '@composable-svelte/chat/streaming-chat';
	import { messages } from './conversation.js';
	let { store }: { store: Store<StreamingChatState, StreamingChatAction> } = $props();
</script>

<section id="full"><FullStreamingChat {store} /></section>
<section id="standard"><StandardStreamingChat {store} /></section>
<section id="minimal"><MinimalStreamingChat {store} /></section>
<section id="primitive"><ChatMessageWithActions message={messages[1]!} {store} /></section>
`,
	'src/entry-server.ts': `import { render } from 'svelte/server';
import { optionalDependenciesReady, getVideoEmbedComponent } from '@composable-svelte/chat/streaming-chat/markdown';
import App from './App.svelte';
import { createChat } from './conversation.js';

export async function renderApp() {
	await optionalDependenciesReady;
	const store = createChat({ streamMessage: () => { throw new Error('SSR must not stream'); } });
	return { body: render(App, { props: { store } }).body, video: getVideoEmbedComponent() };
}
`,
	'src/main.ts': `import { mount, flushSync } from 'svelte';
import { optionalDependenciesReady } from '@composable-svelte/chat/streaming-chat/markdown';
import App from './App.svelte';
import { createChat } from './conversation.js';

const store = createChat({
	streamMessage: (_message, onChunk, onComplete) => {
		// A fenced block arriving after the peer load settled: the path that
		// warned per block, per chunk, when a stub was taken for Prism.
		setTimeout(() => {
			onChunk('streamed without peers\\n\\n\`\`\`js\\nconst later = 1;\\n');
			onChunk('\`\`\`\\n');
			onComplete();
		}, 10);
	}
});
mount(App, { target: document.getElementById('app')!, props: { store } });
void optionalDependenciesReady.then(() => {
	flushSync();
	(window as unknown as { __ready: boolean }).__ready = true;
});
`,
	'src/types.ts': `import type { ChildView } from '@composable-svelte/core/application';
import {
	FullStreamingChat,
	streamingChatReducer,
	usePresenceTracking,
	type StreamingChatState,
	type StreamingChatAction,
	type CollaborativeStreamingChatState,
	type CollaborativeAction
} from '@composable-svelte/chat';
import { ActionButtons, createAttachmentFromFile } from '@composable-svelte/chat/streaming-chat';
import {
	renderMarkdown,
	extractVideosFromMarkdown,
	optionalDependenciesReady,
	getVideoEmbedComponent
} from '@composable-svelte/chat/streaming-chat/markdown';
import type { ComponentProps } from 'svelte';

declare const chat: ChildView<StreamingChatState, StreamingChatAction>;
declare const collab: ChildView<CollaborativeStreamingChatState, CollaborativeAction>;
const props: ComponentProps<typeof FullStreamingChat> = { store: chat };
const buttons: ComponentProps<typeof ActionButtons>['store'] = chat;
const stop: () => void = usePresenceTracking(collab);
const html: string = renderMarkdown('# x');
const ready: Promise<void> = optionalDependenciesReady;
export const surface = [props, buttons, stop, html, ready, streamingChatReducer, createAttachmentFromFile, extractVideosFromMarkdown, getVideoEmbedComponent];
`,
	'markdown-node.mjs': `import { renderMarkdown, optionalDependenciesReady, getVideoEmbedComponent, extractVideosFromMarkdown } from '@composable-svelte/chat/streaming-chat/markdown';
await optionalDependenciesReady;
console.log(JSON.stringify({
	html: renderMarkdown('\`\`\`js\\nconst answer = 42;\\n\`\`\`'),
	video: getVideoEmbedComponent() !== null,
	videos: extractVideosFromMarkdown('https://www.youtube.com/watch?v=dQw4w9WgXcQ').length
}));
`,
	// The production server bundle, rendered with console output captured.
	'ssr-build.mjs': `const issues = [];
for (const level of ['warn', 'error']) {
	console[level] = (...args) => { issues.push(level + ': ' + args.map(String).join(' ')); };
}
const { renderApp } = await import('./dist-ssr/entry-server.js');
const { body, video } = await renderApp();
process.stdout.write(JSON.stringify({ body, video: video !== null, issues }));
`,
	'ssr.mjs': `import { createServer } from 'vite';
const vite = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
	const { renderApp } = await vite.ssrLoadModule('/src/entry-server.ts');
	const { body, video } = await renderApp();
	console.log(JSON.stringify({ body, video: video !== null }));
} finally {
	await vite.close();
}
`
};
for (const [file, body] of Object.entries(files)) writeFileSync(join(app, file), body);

run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error']);

const optionalPeers = ['prismjs', '@composable-svelte/code', '@composable-svelte/media', 'pdfjs-dist'];
const installed = (name) => existsSync(join(app, 'node_modules', name, 'package.json'));
for (const peer of optionalPeers) assert.ok(!installed(peer), `${peer} must be absent for phase A`);
console.log('Phase A: installed without', optionalPeers.join(', '));

// Unhighlighted means escaped and free of Prism's token markup.
const expectPlain = (html, where) => {
	assert.match(html, /const answer = 42;/, `${where}: code text rendered`);
	assert.doesNotMatch(html, /class="token/, `${where}: highlighted without prismjs`);
};
const expectHighlighted = (html, where) => assert.match(html, /class="token/, `${where}: not highlighted`);

// 1. Plain Node, no bundler: the dynamic imports reject and are caught.
const nodeA = JSON.parse(run('node', ['markdown-node.mjs']));
expectPlain(nodeA.html, 'node');
assert.equal(nodeA.video, false, 'node: no VideoEmbed without media');
assert.equal(nodeA.videos, 0, 'node: no video extraction without media');
console.log('  1. node import of ./streaming-chat/markdown: plain code, no video');

// 2. Emitted declarations with library checking on.
run('npx', ['tsc', '-p', 'tsconfig.json']);
console.log('  2. tsc skipLibCheck:false over root, ./streaming-chat, ./streaming-chat/markdown');

// 3. Server render through Vite SSR.
const ssr = JSON.parse(run('node', ['ssr.mjs']));
for (const id of ['full-streaming-chat', 'standard-streaming-chat', 'minimal-streaming-chat']) {
	assert.ok(ssr.body.includes(`class="${id}`), `ssr: ${id} rendered`);
}
expectPlain(ssr.body, 'ssr');
assert.equal(ssr.video, false, 'ssr: no VideoEmbed without media');
assert.doesNotMatch(ssr.body, /<iframe/, 'ssr: no embed without media');
console.log('  3. SSR of the three variants and ChatMessageWithActions');

// 3b. The same render from a production SSR bundle, where Vite's resolver
// hands the absent peers over as stubs rather than failing the import.
function productionSsr() {
	run('npx', ['vite', 'build', '--ssr', 'src/entry-server.ts', '--outDir', 'dist-ssr', '--logLevel', 'error']);
	return JSON.parse(run('node', ['ssr-build.mjs']));
}
const expectQuietSsr = (result, where) => {
	for (const id of ['full-streaming-chat', 'standard-streaming-chat', 'minimal-streaming-chat']) {
		assert.ok(result.body.includes(`class="${id}`), `${where}: ${id} rendered`);
	}
	expectPlain(result.body, where);
	assert.equal(result.video, false, `${where}: no VideoEmbed without media`);
	assert.deepEqual(result.issues, [], `${where}: console warnings or errors`);
};
expectQuietSsr(productionSsr(), 'production ssr');
console.log('  3. production SSR bundle: same render, no console warning or error');

// 4. Production client build.
const buildClient = () => run('npx', ['vite', 'build', '--logLevel', 'error']);
buildClient();
console.log('  4. vite build');

// 5. The build in Chromium. Playwright is the harness, taken from the workspace.
const { chromium } = createRequire(join(chatDir, 'package.json'))('playwright');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((request, response) => {
	const path = join(app, 'dist', request.url === '/' ? 'index.html' : decodeURIComponent(request.url.split('?')[0]));
	if (!existsSync(path)) return void response.writeHead(404).end();
	response.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
	response.end(readFileSync(path));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch();

/** Load the client build; `interact` drives it. Returns what the page reported. */
async function inBrowser(interact) {
	const page = await browser.newPage();
	const pageErrors = [];
	const consoleIssues = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));
	page.on('console', (message) => {
		if (message.type() === 'warning' || message.type() === 'error') {
			consoleIssues.push(`${message.type()}: ${message.text()}`);
		}
	});
	try {
		await page.goto(`http://127.0.0.1:${server.address().port}/`);
		await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 });
		await interact(page);
		return { pageErrors, consoleIssues };
	} finally {
		await page.close();
	}
}
const expectQuietBrowser = (report, where) => {
	assert.deepEqual(report.pageErrors, [], `${where}: no uncaught page error`);
	assert.deepEqual(report.consoleIssues, [], `${where}: console warnings or errors`);
};

const installedMarkdown = join(app, 'node_modules', '@composable-svelte', 'chat', 'dist', 'streaming-chat', 'markdown.js');
const fixedMarkdown = readFileSync(installedMarkdown, 'utf8');
try {
	const exercise = async (page) => {
		assert.equal(await page.locator('.full-streaming-chat').count(), 1, 'browser: full chat mounted');
		const code = await page.locator('#full pre code').first().innerHTML();
		expectPlain(code, 'browser');
		assert.equal(await page.locator('iframe').count(), 0, 'browser: no embed without media');
		await page.locator('#full .pdf-viewer-error').first().waitFor({ timeout: 10000 });

		await page.locator('#full textarea').fill('hello');
		await page.locator('#full [aria-label="Send message"]').click();
		await page.locator('#full', { hasText: 'streamed without peers' }).waitFor({ timeout: 10000 });
	};
	expectQuietBrowser(await inBrowser(exercise), 'browser');
	console.log('  5. browser: renders, PDF reports its missing library in place, streams; no page error, no console warning or error');

	// Deliberate mutation: accept whatever the import resolved to, as before
	// the fix. Both console checks must now fail on the stub.
	const fixedLine = 'Prism = asPrism(module.default ?? module);';
	assert.ok(fixedMarkdown.includes(fixedLine), 'mutation target present in installed markdown.js');
	writeFileSync(installedMarkdown, fixedMarkdown.replace(fixedLine, 'Prism = module.default ?? module;'));
	const mutatedSsr = productionSsr();
	assert.throws(() => expectQuietSsr(mutatedSsr, 'mutated production ssr'), /mutated production ssr: console/);
	assert.ok(mutatedSsr.issues.some((issue) => issue.includes('Failed to highlight')), 'mutated ssr names the defect');
	buildClient();
	const mutated = await inBrowser(exercise);
	assert.throws(() => expectQuietBrowser(mutated, 'mutated browser'), /mutated browser: console/);
	assert.ok(mutated.consoleIssues.some((issue) => issue.includes('Failed to highlight')), 'mutated browser names the defect');
	console.log(`  mutation: the stub taken for Prism is caught by A3 (${mutatedSsr.issues.length} warning(s)) and A5 (${mutated.consoleIssues.length})`);
} finally {
	writeFileSync(installedMarkdown, fixedMarkdown);
	await browser.close();
	server.close();
}

// Phase B: a peer arrives. No consumer code changes; the dynamic import finds it.
run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel', 'error', `prismjs@${version('prismjs')}`]);
assert.ok(installed('prismjs'));
const nodeB = JSON.parse(run('node', ['markdown-node.mjs']));
expectHighlighted(nodeB.html, 'node with prismjs');
assert.throws(() => expectPlain(nodeB.html, 'control'), /: control: /);
const ssrB = JSON.parse(run('node', ['ssr.mjs']));
expectHighlighted(ssrB.body, 'ssr with prismjs');
console.log('Phase B: prismjs installed later is picked up lazily by Node and SSR; positive control rejected the plain-code check');

console.log(`Optional peers verified in ${scratch}`);
for (const entry of readdirSync(packs)) console.log(`  packed ${entry}`);
