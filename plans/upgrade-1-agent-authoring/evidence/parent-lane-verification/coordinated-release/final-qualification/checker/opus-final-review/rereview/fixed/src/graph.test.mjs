// Graph substrate and CLI boundary tests. Small projects are generated in temporary directories;
// policies are written beside the generated project, never inside it.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {EXIT, isQualificationPass, runCheck} from './check.mjs';
import {buildGraph} from './graph.mjs';
import {RULE_CATALOG, sha256Hex} from './policy.mjs';

const NEWLINE = String.fromCharCode(10);
const CHECKER = fileURLToPath(new URL('./check.mjs', import.meta.url));
const ROUTING = 'routing/no-manual-browser-authority';
const CORE_STUB = JSON.stringify({name: '@composable-svelte/core', version: '0.12.2', exports: {'.': './dist/index.js', './application': './dist/application/index.js'}});
const lines = (...parts) => parts.join(NEWLINE) + NEWLINE;
const codes = (graph) => graph.errors.map((error) => error.code);
const PACKAGE_ERROR = 'unresolved-package-import';
const AUTH_STUB = JSON.stringify({name: '@composable-svelte/auth', version: '0.12.2', exports: {'.': './index.js'}});
const DELEGATED_LIMITS = [
  'opaque-package-contents-and-install-provenance-delegated-to-outer-materialization',
  'opaque-package-workspace-lockfile-and-install-configuration-not-inspected',
  'pinned-tarball-sha256-covers-the-policy-artifact-not-installed-package-contents'
];
// Every package failure shares one code, so red rows also pin the reason.
const REASON = Object.freeze({
  unsafeSubpath: /^package subpath contains an empty, dot, dot-dot or percent-encoded segment: /,
  approval: /^package lacks external opaque-package approval: /,
  undeclared: /^package is not declared in the project package[.]json: /,
  nonStringSpec: /^package dependency specification is not a string: /,
  conflict: /^package dependency declarations are not identical: /,
  override: /^package is targeted by an override, resolution or patch declaration: /,
  notInstalled: /^package is not installed under the project node_modules: /,
  identity: /^installed package name or version does not match external approval: /,
  relocatedRoot: /^project node_modules directory is not the real project node_modules: /,
  registrySpec: /^package dependency specification is not registry-shaped: /,
  tarballSpec: /^tarball package dependency specification must be a file: reference: /,
  artifactMissing: /^tarball artifact does not exist: /,
  artifactNotFile: /^tarball artifact is not a regular file: /,
  artifactHash: /^tarball artifact sha256 does not match approval: /,
  outsideNodeModules: /^package installation resolves outside node_modules: /,
  symlinkTarget: /^symlinked package target is not inside node_modules[/][.]pnpm: /,
  notExported: /^package does not export /
});

function assertRejected(graph, ...reasons) {
  assert.deepEqual(codes(graph), reasons.map(() => PACKAGE_ERROR));
  graph.errors.forEach((error, index) => assert.match(error.message, reasons[index]));
  assert.equal(graph.complete, false);
}

function materialize(t, files, dependencies = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'consumer-architecture-graph-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const project = join(directory, 'project');
  const all = {'package.json': JSON.stringify({name: 'fixture', private: true, dependencies}), 'tsconfig.json': JSON.stringify({compilerOptions: {}}), ...files};
  for (const [path, content] of Object.entries(all)) {
    mkdirSync(dirname(join(project, path)), {recursive: true});
    writeFileSync(join(project, path), content);
  }
  return {directory, project};
}

const DEFAULT_OPAQUE = Object.freeze([
  Object.freeze({name: 'opaque-widget', version: '1.0.0', provenance: 'registry'}),
  Object.freeze({name: '@composable-svelte/core', version: '0.12.2', provenance: 'registry'})
]);
const graphOf = (project, roots = ['src/main.ts'], opaquePackages = DEFAULT_OPAQUE) => buildGraph({projectRoot: project, roots, tsconfig: 'tsconfig.json', opaquePackages});

function expectedStart(text, needle) {
  const offset = text.indexOf(needle);
  const before = text.slice(0, offset);
  return {offset, line: before.split(NEWLINE).length, column: offset - before.lastIndexOf(NEWLINE)};
}

test('walks a clean TypeScript import and re-export graph with exact spans', (t) => {
  const main = lines(`import {navigate} from './helper';`, 'navigate();');
  const {project} = materialize(t, {
    'src/main.ts': main,
    'src/helper.ts': lines(`export {navigate} from './low-level.js';`, `export type {Options} from './options';`),
    'src/low-level.ts': lines('export function navigate(): number {', '  return 1;', '}'),
    'src/options.ts': lines('export interface Options {', '  replace: boolean;', '}')
  });
  const graph = graphOf(project);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.complete, true);
  assert.deepEqual(graph.modules.map((item) => item.path), ['src/helper.ts', 'src/low-level.ts', 'src/main.ts', 'src/options.ts']);
  const [edge] = graph.modules.find((item) => item.path === 'src/main.ts').edges;
  assert.deepEqual({kind: edge.kind, specifier: edge.specifier, target: edge.target}, {kind: 'import', specifier: './helper', target: {type: 'module', path: 'src/helper.ts'}});
  assert.deepEqual(edge.span.start, expectedStart(main, `'./helper'`));
  assert.equal(main.slice(edge.span.start.offset, edge.span.end.offset), `'./helper'`);
  const helper = graph.modules.find((item) => item.path === 'src/helper.ts');
  assert.deepEqual(helper.edges.map((item) => [item.kind, item.typeOnly, item.target.path]), [['re-export', false, 'src/low-level.ts'], ['re-export', true, 'src/options.ts']]);
  assert.deepEqual(graphOf(project), graph);
});

test('parses Svelte scripts and template expressions with original offsets', (t) => {
  const app = lines(
    `<script module lang='ts'>`,
    `  export const title: string = 'Demo';`,
    '</script>',
    `<script lang='ts'>`,
    `  import Child from './Child.svelte';`,
    '  let count = $state(0);',
    '</script>',
    '<h1>{title}</h1>',
    `<button onclick={() => import('./lazy')}>{count + 1}</button>`,
    '<Child />'
  );
  const {project} = materialize(t, {
    'src/App.svelte': app,
    'src/Child.svelte': lines('<p>child</p>'),
    'src/lazy.ts': lines('export const lazy = true;')
  });
  const graph = graphOf(project, ['src/App.svelte']);
  assert.deepEqual(graph.errors, []);
  assert.deepEqual(graph.modules.map((item) => [item.path, item.kind]), [['src/App.svelte', 'svelte'], ['src/Child.svelte', 'svelte'], ['src/lazy.ts', 'ts']]);
  const component = graph.modules[0];
  const slices = component.segments.map((segment) => [segment.kind, app.slice(segment.start.offset, segment.end.offset)]);
  assert.deepEqual(slices, [
    ['module-script', lines('', `  export const title: string = 'Demo';`)],
    ['instance-script', lines('', `  import Child from './Child.svelte';`, '  let count = $state(0);')],
    ['template-expression', 'title'],
    ['template-expression', `() => import('./lazy')`],
    ['template-expression', 'count + 1']
  ]);
  const [childEdge, lazyEdge] = component.edges;
  assert.deepEqual(childEdge.span.start, expectedStart(app, `'./Child.svelte'`));
  assert.equal(childEdge.span.start.line, 5);
  assert.equal(childEdge.span.start.column, 21);
  assert.deepEqual({kind: lazyEdge.kind, target: lazyEdge.target}, {kind: 'dynamic-import', target: {type: 'module', path: 'src/lazy.ts'}});
  assert.deepEqual(lazyEdge.span.start, expectedStart(app, `'./lazy'`));
  assert.equal(app.slice(lazyEdge.span.start.offset, lazyEdge.span.end.offset), `'./lazy'`);
});

test('resolves configured aliases and fails closed on a broken alias', (t) => {
  const tsconfig = JSON.stringify({compilerOptions: {baseUrl: '.', paths: {'$lib/*': ['src/lib/*']}}});
  const main = lines(`import {present} from '$lib/present';`, 'present();');
  const clean = materialize(t, {'tsconfig.json': tsconfig, 'src/main.ts': main, 'src/lib/present.ts': lines('export const present = () => 1;')});
  const graph = graphOf(clean.project);
  assert.deepEqual(graph.errors, []);
  assert.deepEqual(graph.modules.map((item) => item.path), ['src/lib/present.ts', 'src/main.ts']);
  const broken = materialize(t, {'tsconfig.json': tsconfig, 'src/main.ts': main});
  const [error, ...rest] = graphOf(broken.project).errors;
  assert.deepEqual(rest, []);
  assert.deepEqual({code: error.code, path: error.path, specifier: error.specifier}, {code: 'unresolved-local-import', path: 'src/main.ts', specifier: '$lib/present'});
  assert.deepEqual(error.span.start, expectedStart(main, `'$lib/present'`));
  assert.equal(graphOf(broken.project).complete, false);
});

test('follows literal dynamic imports and rejects nonliteral ones', (t) => {
  const literal = materialize(t, {'src/main.ts': lines(`export const load = () => import('./page');`), 'src/page.ts': lines('export const page = 1;')});
  const graph = graphOf(literal.project);
  assert.deepEqual(graph.errors, []);
  assert.deepEqual(graph.modules.map((item) => item.path), ['src/main.ts', 'src/page.ts']);
  assert.equal(graph.modules[0].edges[0].kind, 'dynamic-import');
  const main = lines('export const load = (name: string) => import(name);');
  const dynamic = materialize(t, {'src/main.ts': main});
  const errors = graphOf(dynamic.project).errors;
  assert.deepEqual(codes({errors}), ['nonliteral-dynamic-import']);
  assert.deepEqual(errors[0].span.start, expectedStart(main, 'name)'));
});

test('fails closed on missing, empty and unsupported roots', (t) => {
  const {project} = materialize(t, {'src/empty.ts': lines('// nothing here'), 'src/view.tsx': lines('export const view = 1;')});
  const cases = [
    [['src/missing.ts'], 'missing-root'],
    [['SRC/empty.ts'], 'missing-root'],
    [['src/empty.ts'], 'empty-root-module'],
    [['src/view.tsx'], 'unsupported-extension'],
    [[], 'empty-roots']
  ];
  for (const [roots, code] of cases) {
    const graph = graphOf(project, roots);
    assert.deepEqual(codes(graph), [code]);
    assert.equal(graph.complete, false);
  }
});

test('reports parse failures and unsupported reachable constructs as analysis errors', (t) => {
  const cases = [
    [{'src/main.ts': lines('export const = ;')}, 'parse-error'],
    [{'src/main.ts': lines(`import './Broken.svelte';`), 'src/Broken.svelte': lines('<script>', '  let = ;', '</script>')}, 'parse-error'],
    [{'src/main.ts': lines(`const legacy = require('./legacy');`)}, 'unsupported-syntax'],
    [{'src/main.ts': lines(`const pages = import.meta.glob('./pages/*.ts');`)}, 'unsupported-syntax'],
    [{'src/main.ts': lines(`import './view.tsx';`), 'src/view.tsx': lines('export const view = 1;')}, 'unsupported-extension'],
    [{'src/main.ts': lines(`import './styles.css?module';`), 'src/styles.css': lines('body {}')}, 'unsupported-specifier'],
    [{'src/main.ts': lines(`import './a';`), 'src/a.ts': lines('export {};'), 'src/a.js': lines('export {};')}, 'ambiguous-resolution'],
    [{'src/main.ts': lines('// composable-architecture-ignore next', 'export const value = 1;')}, 'reserved-directive']
  ];
  for (const [files, code] of cases) {
    const found = codes(graphOf(materialize(t, files).project));
    assert.ok(found.length > 0 && found.every((item) => item === code), `${code}: ${found.join(', ')}`);
  }
  const escape = materialize(t, {'src/main.ts': lines(`import '../../outside';`)});
  writeFileSync(join(escape.directory, 'outside.ts'), lines('export {};'));
  assert.deepEqual(codes(graphOf(escape.project)), ['resolution-escapes-project']);
});

test('accepts declared packages installed under the project node_modules without traversing them', (t) => {
  const main = lines(
    `import {widget} from 'opaque-widget';`,
    `import {feature} from 'opaque-widget/feature';`,
    `import type {Hidden} from 'types-only-package';`,
    `import {defineApplication} from '@composable-svelte/core/application';`,
    'export const used = [widget, feature, defineApplication];',
    'export type Kept = Hidden;'
  );
  const files = {
    'src/main.ts': main,
    'node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js', './feature': './feature.js'}}),
    'node_modules/opaque-widget/index.js': lines('export const widget = import(globalThis.name);', 'export const = ;'),
    'node_modules/@composable-svelte/core/package.json': CORE_STUB
  };
  const dependencies = {'@composable-svelte/core': '^0.12.2', 'opaque-widget': '1.0.0'};
  const graph = graphOf(materialize(t, files, dependencies).project);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.complete, true);
  assert.deepEqual(graph.modules.map((item) => item.path), ['src/main.ts']);
  assert.deepEqual(graph.packageSpecifiers, ['@composable-svelte/core/application', 'opaque-widget', 'opaque-widget/feature', 'types-only-package']);
  assert.ok(graph.modules[0].edges.every((edge) => edge.target.type === 'package'));
  const undeclared = materialize(t, files, {'@composable-svelte/core': '^0.12.2'});
  assertRejected(graphOf(undeclared.project), REASON.undeclared, REASON.undeclared);
  const missing = materialize(t, {'src/main.ts': lines(`import 'not-installed';`)}, {'not-installed': '1.0.0'});
  assertRejected(graphOf(missing.project, ['src/main.ts'], [{name: 'not-installed', version: '1.0.0', provenance: 'registry'}]), REASON.notInstalled);
  const hidden = materialize(t, {...files, 'src/main.ts': lines(`import 'opaque-widget/internal';`)}, dependencies);
  assertRejected(graphOf(hidden.project), REASON.notExported);
  const reachIn = materialize(t, {...files, 'src/main.ts': lines(`import '../node_modules/opaque-widget/index.js';`)}, dependencies);
  assert.deepEqual(codes(graphOf(reachIn.project)), ['resolution-escapes-project']);
});

test('red: local-history-helper declared via file: protocol cannot become opaque', (t) => {
  const files = {
    'src/main.ts': lines(`import {navigate} from 'local-history-helper';`, 'navigate();'),
    'local-history-helper/package.json': JSON.stringify({name: 'local-history-helper', version: '1.0.0', exports: {'.': './index.js'}}),
    'local-history-helper/index.js': lines('export function navigate() { window.history.pushState({}, ""); }'),
    'node_modules/local-history-helper/package.json': JSON.stringify({name: 'local-history-helper', version: '1.0.0', exports: {'.': './index.js'}}),
    'node_modules/local-history-helper/index.js': lines('export function navigate() { window.history.pushState({}, ""); }')
  };
  const {project} = materialize(t, files, {'local-history-helper': 'file:./local-history-helper'});
  assertRejected(graphOf(project, ['src/main.ts'], []), REASON.approval);
  assertRejected(graphOf(project, ['src/main.ts'], [{name: 'local-history-helper', version: '1.0.0', provenance: 'registry'}]), REASON.registrySpec);
  assertRejected(graphOf(project, ['src/main.ts'], [{name: 'local-history-helper', version: '1.0.0', provenance: 'pinned-tarball', sha256: '0'.repeat(64)}]), REASON.artifactNotFile);
});

test('red: workspace, link, portal or direct symlink to local source cannot become opaque', (t) => {
  for (const protocol of ['workspace:*', 'link:./local', 'portal:./local']) {
    const {project} = materialize(t, {
      'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'widget();'),
      'node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}}),
      'node_modules/opaque-widget/index.js': lines('export const widget = () => 1;')
    }, {'opaque-widget': protocol});
    assertRejected(graphOf(project, ['src/main.ts'], [{name: 'opaque-widget', version: '1.0.0', provenance: 'registry'}]), REASON.registrySpec);
  }
  const fixture = materialize(t, {
    'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'widget();'),
    'local/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}}),
    'local/index.js': lines('export const widget = () => 1;')
  }, {'opaque-widget': '1.0.0'});
  mkdirSync(join(fixture.project, 'node_modules'), {recursive: true});
  symlinkSync(join(fixture.project, 'local'), join(fixture.project, 'node_modules/opaque-widget'), 'dir');
  assertRejected(graphOf(fixture.project, ['src/main.ts'], [{name: 'opaque-widget', version: '1.0.0', provenance: 'registry'}]), REASON.outsideNodeModules);
});

test('red: registry install fails without approval or on mismatched version', (t) => {
  const {project} = materialize(t, {
    'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'export const w = widget;'),
    'node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}}),
    'node_modules/opaque-widget/index.js': lines('export const widget = 1;')
  }, {'opaque-widget': '^1.0.0'});
  assertRejected(graphOf(project, ['src/main.ts'], []), REASON.approval);
  assertRejected(graphOf(project, ['src/main.ts'], [{name: 'opaque-widget', version: '1.0.1', provenance: 'registry'}]), REASON.identity);
});

test('red: tarball approval fails on hash mismatch, directory artifact, wrong artifact, or version mismatch', (t) => {
  const tarContent = 'dummy-tarball-bytes-0.12.2';
  const tarSha = sha256Hex(tarContent);
  const baseFiles = {
    'src/main.ts': lines(`import {defineApplication} from '@composable-svelte/core/application';`, 'export const a = defineApplication;'),
    'packs/core.tgz': tarContent,
    'node_modules/@composable-svelte/core/package.json': CORE_STUB
  };
  const baseDeps = {'@composable-svelte/core': 'file:./packs/core.tgz'};
  const pinned = (sha256) => [{name: '@composable-svelte/core', version: '0.12.2', provenance: 'pinned-tarball', sha256}];
  assertRejected(graphOf(materialize(t, baseFiles, baseDeps).project, ['src/main.ts'], pinned('0'.repeat(64))), REASON.artifactHash);
  const dirFix = materialize(t, {...baseFiles, 'packs/core-dir/package.json': CORE_STUB}, {'@composable-svelte/core': 'file:./packs/core-dir'});
  assertRejected(graphOf(dirFix.project, ['src/main.ts'], pinned(tarSha)), REASON.artifactNotFile);
  const diffFix = materialize(t, {...baseFiles, 'packs/other.tgz': 'other'}, {'@composable-svelte/core': 'file:./packs/other.tgz'});
  assertRejected(graphOf(diffFix.project, ['src/main.ts'], pinned(tarSha)), REASON.artifactHash);
  const verFix = materialize(t, {...baseFiles, 'node_modules/@composable-svelte/core/package.json': JSON.stringify({name: '@composable-svelte/core', version: '0.12.1', exports: {'.': './index.js', './application': './index.js'}})}, baseDeps);
  assertRejected(graphOf(verFix.project, ['src/main.ts'], pinned(tarSha)), REASON.identity);
  const absent = materialize(t, baseFiles, {'@composable-svelte/core': 'file:./packs/absent.tgz'});
  assertRejected(graphOf(absent.project, ['src/main.ts'], pinned(tarSha)), REASON.artifactMissing);
  const registryShaped = materialize(t, baseFiles, {'@composable-svelte/core': '0.12.2'});
  assertRejected(graphOf(registryShaped.project, ['src/main.ts'], pinned(tarSha)), REASON.tarballSpec);
});

test('green: approved registry package in pnpm symlink resolves as opaque leaf', (t) => {
  const fixture = materialize(t, {
    'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'export const w = widget;'),
    'node_modules/.pnpm/opaque-widget@1.0.0/node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}}),
    'node_modules/.pnpm/opaque-widget@1.0.0/node_modules/opaque-widget/index.js': lines('export const widget = 1;')
  }, {'opaque-widget': '1.0.0'});
  symlinkSync(join(fixture.project, 'node_modules/.pnpm/opaque-widget@1.0.0/node_modules/opaque-widget'), join(fixture.project, 'node_modules/opaque-widget'), 'dir');
  const graph = graphOf(fixture.project, ['src/main.ts'], [{name: 'opaque-widget', version: '1.0.0', provenance: 'registry'}]);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.complete, true);
});

test('green: trusted framework and satellite tarballs installed through file: resolve as opaque leaves', (t) => {
  const coreSha = sha256Hex('core-tar');
  const authSha = sha256Hex('auth-tar');
  const files = {
    'src/main.ts': lines(`import {defineApplication} from '@composable-svelte/core/application';`, `import {guard} from '@composable-svelte/auth';`, 'export const u = [defineApplication, guard];'),
    'packs/core.tgz': 'core-tar',
    'packs/auth.tgz': 'auth-tar',
    'node_modules/@composable-svelte/core/package.json': CORE_STUB,
    'node_modules/@composable-svelte/auth/package.json': JSON.stringify({name: '@composable-svelte/auth', version: '0.12.2', exports: {'.': './index.js'}})
  };
  const deps = {'@composable-svelte/core': 'file:./packs/core.tgz', '@composable-svelte/auth': 'file:./packs/auth.tgz'};
  const graph = graphOf(materialize(t, files, deps).project, ['src/main.ts'], [
    {name: '@composable-svelte/core', version: '0.12.2', provenance: 'pinned-tarball', sha256: coreSha},
    {name: '@composable-svelte/auth', version: '0.12.2', provenance: 'pinned-tarball', sha256: authSha}
  ]);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.complete, true);
});

test('red: unsafe subpaths under an approved package never become opaque leaves', (t) => {
  const manifests = [{name: 'opaque-widget', version: '1.0.0'}, {name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js', './*': './*'}}];
  const unsafe = ['opaque-widget/../../src/history-helper.js', 'opaque-widget/./../../src/history-helper.js', 'opaque-widget/%2e%2e/%2e%2e/src/history-helper.js', 'opaque-widget/feature%2ejs', 'opaque-widget//feature.js', 'opaque-widget/'];
  const project = (manifest, imports) => materialize(t, {
    'src/main.ts': lines(...imports.map((specifier) => `import '${specifier}';`)),
    'src/history-helper.js': lines('export const navigate = () => window.history.back();'),
    'node_modules/opaque-widget/package.json': JSON.stringify(manifest)
  }, {'opaque-widget': '1.0.0'}).project;
  for (const manifest of manifests) {
    for (const specifier of unsafe) {
      const graph = graphOf(project(manifest, [specifier]));
      assertRejected(graph, REASON.unsafeSubpath);
      assert.deepEqual(graph.packageSpecifiers, []);
    }
    const control = graphOf(project(manifest, ['opaque-widget', 'opaque-widget/feature.js']));
    assert.deepEqual(control.errors, []);
    assert.deepEqual(control.packageSpecifiers, ['opaque-widget', 'opaque-widget/feature.js']);
  }
});

test('red: a symlinked node_modules root is rejected for both provenances', (t) => {
  const rows = [
    ['1.0.0', DEFAULT_OPAQUE],
    ['file:./packs/widget.tgz', [{name: 'opaque-widget', version: '1.0.0', provenance: 'pinned-tarball', sha256: sha256Hex('widget-tar')}]]
  ];
  for (const target of ['local-modules', '../outside-modules']) {
    for (const [spec, approvals] of rows) {
      const fixture = materialize(t, {
        'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'export const w = widget;'),
        'packs/widget.tgz': 'widget-tar',
        [`${target}/opaque-widget/package.json`]: JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}}),
        [`${target}/opaque-widget/index.js`]: lines('export const widget = () => window.history.back();')
      }, {'opaque-widget': spec});
      symlinkSync(join(fixture.project, target), join(fixture.project, 'node_modules'), 'dir');
      assertRejected(graphOf(fixture.project, ['src/main.ts'], approvals), REASON.relocatedRoot);
    }
  }
});

test('red: only an exact registry version with an optional ^ or ~ is registry-shaped', (t) => {
  const project = (spec) => materialize(t, {
    'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'export const w = widget;'),
    'node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}})
  }, {'opaque-widget': spec}).project;
  const notRegistry = [
    'owner/opaque-widget', 'github:owner/opaque-widget', 'git@github.com:owner/opaque-widget.git', 'git+ssh://git@github.com/owner/opaque-widget.git', 'https://registry.example/opaque-widget-1.0.0.tgz', '~/opaque-widget', 'opaque-widget.tgz', './opaque-widget',
    'patch:opaque-widget@1.0.0#./fix.patch', 'exec:./generate.js', 'npm:other-widget@1.0.0', 'latest', '*', '', '>=1.0.0', '1.x', '1.0.0 || 2.0.0', ' 1.0.0', 'v1.0.0', '01.0.0', '1.0.0-rc.01'
  ];
  for (const spec of notRegistry) assertRejected(graphOf(project(spec)), REASON.registrySpec);
  for (const spec of [1, null, true, ['1.0.0'], {version: '1.0.0'}]) assertRejected(graphOf(project(spec)), REASON.nonStringSpec);
  for (const spec of ['1.0.0', '^1.0.0', '~1.0.0']) assert.deepEqual(graphOf(project(spec)).errors, []);
});

test('red: conflicting declarations and override, resolution or patch declarations fail closed', (t) => {
  const project = (manifest) => materialize(t, {
    'package.json': JSON.stringify({name: 'fixture', private: true, ...manifest}),
    'src/main.ts': lines(`import {widget} from 'opaque-widget';`, 'export const w = widget;'),
    'node_modules/opaque-widget/package.json': JSON.stringify({name: 'opaque-widget', version: '1.0.0', exports: {'.': './index.js'}})
  }).project;
  const dependencies = {'opaque-widget': '1.0.0'};
  const rows = [
    [{dependencies, optionalDependencies: {'opaque-widget': 'file:./opaque-widget.tgz'}}, REASON.conflict],
    [{devDependencies: {'opaque-widget': '^1.0.0'}, dependencies}, REASON.conflict],
    [{dependencies, peerDependencies: {'opaque-widget': 1}}, REASON.nonStringSpec],
    [{dependencies, overrides: {'opaque-widget': 'file:./local'}}, REASON.override],
    [{dependencies, overrides: {'some-parent': {'opaque-widget@^1': '1.0.0'}}}, REASON.override],
    [{dependencies, overrides: 'opaque-widget'}, REASON.override],
    [{dependencies, resolutions: {'**/opaque-widget': 'file:./local'}}, REASON.override],
    [{dependencies, pnpm: {overrides: {'some-parent>opaque-widget': 'link:./local'}}}, REASON.override],
    [{dependencies, pnpm: {patchedDependencies: {'opaque-widget@1.0.0': 'patches/opaque-widget.patch'}}}, REASON.override],
    [{dependencies, patchedDependencies: {'opaque-widget@1.0.0': 'patches/opaque-widget.patch'}}, REASON.override],
    [{dependencies, resolutions: {'opaque-widget@npm:@scope/fork@1.0.0': '1.0.0'}}, REASON.override],
    [{dependencies, resolutions: {'opaque-widget@patch:opaque-widget@1.0.0#./f.patch': '1.0.0'}}, REASON.override],
    [{dependencies, resolutions: {'opaque-*': '1.0.0'}}, REASON.override],
    [{dependencies, resolutions: {'**/opaque-widg*': '1.0.0'}}, REASON.override],
    // Intentional ambiguity rejection rather than semantic matching:
    [{dependencies, resolutions: {'unrelated-*': '1.0.0'}}, REASON.override]
  ];
  for (const [manifest, reason] of rows) assertRejected(graphOf(project(manifest)), reason);
  const control = project({
    dependencies,
    peerDependencies: dependencies,
    overrides: {'other-widget': '2.0.0'},
    resolutions: {
      'opaque-widget-extras': '1.0.0',
      'other-widget': '1.0.0',
      'other-widget@npm:@scope/fork@1.0.0': '1.0.0',
      'other-widget@patch:other-widget@1.0.0#./f.patch': '1.0.0'
    },
    pnpm: {patchedDependencies: {'not-opaque-widget@1.0.0': 'patches/other.patch'}}
  });
  assert.deepEqual(graphOf(control).errors, []);
  assert.equal(graphOf(control).complete, true);
});

test('red: a pinned-tarball package leaf may only be symlinked into node_modules/.pnpm', (t) => {
  for (const [target, reason] of [['local/auth', REASON.outsideNodeModules], ['node_modules/.staging/auth', REASON.symlinkTarget]]) {
    const fixture = materialize(t, {
      'src/main.ts': lines(`import {guard} from '@composable-svelte/auth';`, 'export const g = guard;'),
      'packs/auth.tgz': 'auth-tar',
      [`${target}/package.json`]: AUTH_STUB
    }, {'@composable-svelte/auth': 'file:./packs/auth.tgz'});
    mkdirSync(join(fixture.project, 'node_modules/@composable-svelte'), {recursive: true});
    symlinkSync(join(fixture.project, target), join(fixture.project, 'node_modules/@composable-svelte/auth'), 'dir');
    assertRejected(graphOf(fixture.project, ['src/main.ts'], [{name: '@composable-svelte/auth', version: '0.12.2', provenance: 'pinned-tarball', sha256: sha256Hex('auth-tar')}]), reason);
  }
});

test('green: independently supplied pinned tarballs resolve from outside the project and in a pnpm layout', (t) => {
  const store = 'node_modules/.pnpm/@composable-svelte+auth@file+..+packs+auth.tgz/node_modules/@composable-svelte/auth';
  const fixture = materialize(t, {
    'src/main.ts': lines(`import {defineApplication} from '@composable-svelte/core/application';`, `import {guard} from '@composable-svelte/auth';`, 'export const u = [defineApplication, guard];'),
    '../packs/core.tgz': 'core-tar',
    '../packs/auth.tgz': 'auth-tar',
    'node_modules/@composable-svelte/core/package.json': CORE_STUB,
    [`${store}/package.json`]: AUTH_STUB
  });
  const dependencies = {'@composable-svelte/core': `file:${join(fixture.directory, 'packs/core.tgz')}`, '@composable-svelte/auth': 'file:../packs/auth.tgz'};
  writeFileSync(join(fixture.project, 'package.json'), JSON.stringify({name: 'fixture', private: true, dependencies}));
  symlinkSync(join(fixture.project, store), join(fixture.project, 'node_modules/@composable-svelte/auth'), 'dir');
  const graph = graphOf(fixture.project, ['src/main.ts'], [
    {name: '@composable-svelte/core', version: '0.12.2', provenance: 'pinned-tarball', sha256: sha256Hex('core-tar')},
    {name: '@composable-svelte/auth', version: '0.12.2', provenance: 'pinned-tarball', sha256: sha256Hex('auth-tar')}
  ]);
  assert.deepEqual(graph.errors, []);
  assert.equal(graph.complete, true);
});

function qualificationFixture(t) {
  const coreVersion = '0.13.0-next.1';
  const fixture = materialize(t, {
    'src/main.ts': lines(`import {defineApplication} from '@composable-svelte/core/application';`, 'export const application = defineApplication;'),
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({...JSON.parse(CORE_STUB), version: coreVersion})
  }, {'@composable-svelte/core': coreVersion});
  const policy = {
    schema: 'composable-svelte/consumer-architecture-policy',
    schemaVersion: 2,
    catalogVersion: 2,
    policyId: 'substrate-cli-fixture',
    policyVersion: '1.0.0',
    supportedCore: {min: coreVersion, maxExclusive: '0.14.0-0'},
    project: {tsconfig: 'tsconfig.json', roots: ['src/main.ts']},
    rules: {
      active: RULE_CATALOG.filter((rule) => rule.stage === 'active').map((rule) => ({id: rule.id, severity: 'error'})),
      inactive: RULE_CATALOG.filter((rule) => rule.stage === 'staged').map((rule) => ({id: rule.id, reason: 'supported-replacement-pending', detail: 'No supported replacement ships yet.'}))
    },
    capabilityGrants: [],
    qualificationRecords: [],
    exceptions: [],
    opaquePackages: [{name: '@composable-svelte/core', version: coreVersion, provenance: 'registry'}]
  };
  const text = JSON.stringify(policy, null, 2);
  const policyPath = join(fixture.directory, 'policy.json');
  writeFileSync(policyPath, text);
  const args = (mode) => ['--mode', mode, '--project', fixture.project, '--policy', policyPath, '--policy-sha256', sha256Hex(text), '--expected-core-version', coreVersion, '--today', '2026-09-19'];
  return {...fixture, args};
}

test('developer analysis stays not-evaluated while clean external qualification passes', (t) => {
  const {directory, args} = qualificationFixture(t);
  const analysis = runCheck(args('analysis-only'));
  assert.equal(analysis.exitCode, EXIT.success);
  assert.deepEqual(analysis.result.analysisErrors, []);
  assert.equal(analysis.result.graph.complete, true);
  assert.equal(analysis.result.mode, 'analysis-only');
  assert.equal(analysis.result.outcome, 'analysis-complete');
  assert.equal(analysis.result.qualification, 'not-evaluated');
  assert.equal(analysis.result.violationsComplete, true);
  assert.equal(isQualificationPass(analysis.result), false);
  const qualification = runCheck(args('qualification'));
  for (const result of [analysis.result, qualification.result]) for (const limit of DELEGATED_LIMITS) assert.ok(result.limits.includes(limit), limit);
  assert.equal(qualification.exitCode, EXIT.success);
  assert.equal(qualification.result.graph.complete, true);
  assert.deepEqual(qualification.result.analysisErrors, []);
  assert.equal(qualification.result.qualification, 'passed');
  assert.equal(isQualificationPass(qualification.result, {
    policySha256: qualification.result.policy.sha256,
    expectedCoreVersion: '0.13.0-next.1',
    expectedCheckerVersion: '0.13.1'
  }), true);
  assert.equal(isQualificationPass({...analysis.result, mode: 'qualification'}), false);
  for (const [mode, exitCode] of [['analysis-only', EXIT.success], ['qualification', EXIT.success]]) {
    const child = spawnSync(process.execPath, [CHECKER, ...args(mode)], {encoding: 'utf8'});
    assert.equal(child.status, exitCode);
    const result = JSON.parse(child.stdout);
    assert.equal(result.exitCode, exitCode);
    if (mode === 'qualification') {
      assert.equal(result.qualification, 'passed');
    } else {
      assert.equal(result.qualification, 'not-evaluated');
    }
    assert.equal(child.stdout.includes(directory), false);
    assert.equal(child.stdout, runCheck(args(mode)).stdout);
  }
  const usage = spawnSync(process.execPath, [CHECKER, ...args('analysis-only').slice(2)], {encoding: 'utf8'});
  assert.equal(usage.status, EXIT.usage);
  assert.equal(usage.stdout, '');
  assert.equal(runCheck(args('graph-only')).exitCode, EXIT.usage);
});

test('staged rules stay inert and a policy failure never yields a graph result', (t) => {
  const {args} = qualificationFixture(t);
  const {result} = runCheck(args('analysis-only'));
  const staged = RULE_CATALOG.filter((rule) => rule.stage === 'staged').map((rule) => rule.id);
  assert.deepEqual(result.rules.inactive.map((rule) => [rule.id, rule.status]), staged.map((id) => [id, 'not-active']));
  assert.equal(result.rules.enforcedCount, RULE_CATALOG.filter((rule) => rule.stage === 'active').length);
  assert.deepEqual(result.rules.unavailableEvaluators, []);
  assert.equal(result.violationsComplete, true);
  assert.deepEqual(result.violations, []);
  const mismatched = args('analysis-only');
  mismatched[7] = '0'.repeat(64);
  const rejected = runCheck(mismatched);
  assert.equal(rejected.exitCode, EXIT.analysisError);
  assert.deepEqual(rejected.result.analysisErrors.map((error) => error.code), ['policy-pin-mismatch']);
  assert.equal(rejected.result.graph, null);
});
