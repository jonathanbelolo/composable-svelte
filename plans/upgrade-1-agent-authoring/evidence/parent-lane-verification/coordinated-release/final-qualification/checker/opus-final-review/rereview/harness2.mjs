import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
const which = process.env.PKG === 'pre' ? './pre/src' : '../../packages/architecture/src';
const {buildGraph} = await import(`${which}/graph.mjs`);
const {analyzeSemantics} = await import(`${which}/semantics.mjs`);
const PACKAGES = {
  '@composable-svelte/core': {version: '0.13.0-next.1', exports: {'.': './index.js', './application': './application.js'}},
  svelte: {version: '5.57.0', exports: {'.': './index.js'}},
  ext: {version: '1.0.0', exports: {'.': './index.js'}}
};
export function analyze(files) {
  const root = mkdtempSync(join(tmpdir(), 'opus-probe-'));
  try {
    const all = {
      'package.json': JSON.stringify({name: 'fixture', dependencies: Object.fromEntries(Object.entries(PACKAGES).map(([n, {version}]) => [n, version]))}),
      'tsconfig.json': '{}',
      ...Object.fromEntries(Object.entries(PACKAGES).map(([name, {version, exports}]) => [`node_modules/${name}/package.json`, JSON.stringify({name, version, exports})])),
      ...files
    };
    for (const [name, text] of Object.entries(all)) { mkdirSync(dirname(join(root, name)), {recursive: true}); writeFileSync(join(root, name), text); }
    const graph = buildGraph({projectRoot: root, roots: [Object.keys(files)[0]], tsconfig: 'tsconfig.json',
      opaquePackages: Object.entries(PACKAGES).map(([name, {version}]) => ({name, version, provenance: 'registry'}))});
    if (graph.errors.length) return {graphErrors: graph.errors.map(e => e.code)};
    const r = analyzeSemantics({projectRoot: root, graph});
    return {complete: r.complete, errors: r.errors.map(e => `${e.construct ?? e.code}@${e.span?.start?.line}`), findings: r.findings.map(f => `${f.detector}@${f.span?.start?.line ?? ''}`).sort()};
  } finally { rmSync(root, {recursive: true, force: true}); }
}
export const core = `import {createStore, Effect} from '@composable-svelte/core';\n`;
export const inReducer = (pre, body) => ({'entry.ts': `${core}${pre}\nexport const store = createStore({initialState: {}, reducer: (state: any, action: any) => {\n${body}\nreturn [state, Effect.none()]; }});\n`});
export const module = (s) => ({'entry.ts': s});
export function run(cases) {
  for (const [name, files] of cases) console.log(name.padEnd(34), JSON.stringify(analyze(files)));
}
