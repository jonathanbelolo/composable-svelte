import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {buildGraph} from './graph.mjs';
import {analyzeSemantics} from './semantics.mjs';

function fixture(t, files, options = {}) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'detector-coverage-controls-'));
  t.after(() => rmSync(projectRoot, {recursive: true, force: true}));
  const all = {
    'package.json': JSON.stringify({
      name: 'fixture',
      dependencies: {
        '@composable-svelte/core': '0.13.0-next.1',
        svelte: '5.57.0'
      }
    }),
    'tsconfig.json': '{}',
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: '0.13.0-next.1',
      exports: {
        '.': './index.js',
        './application': './application.js'
      }
    }),
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte',
      version: '5.57.0',
      exports: {
        '.': './index.js',
        './transition': './transition.js'
      }
    }),
    ...files
  };
  for (const [path, source] of Object.entries(all)) {
    mkdirSync(dirname(join(projectRoot, path)), {recursive: true});
    writeFileSync(join(projectRoot, path), source);
  }
  const roots = options.roots ?? Object.keys(files);
  const graph = buildGraph({
    projectRoot,
    roots,
    tsconfig: 'tsconfig.json',
    opaquePackages: [
      {name: '@composable-svelte/core', version: '0.13.0-next.1', provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ]
  });
  assert.deepEqual(graph.errors, []);
  return analyzeSemantics({projectRoot, graph, ...options.analysis});
}

const findingsFor = (result, rule) => result.findings.filter((finding) => finding.rule === rule);
const detectorsFor = (result, detector) => result.findings.filter((finding) => finding.detector === detector);

test('control group 1: lifecycle-mirror detects store copy in genuine lifecycle while local values and event callbacks remain clean', (t) => {
  const result = fixture(t, {
    'App.svelte': `<script>
      import {onMount} from 'svelte';
      import {useApplication} from '@composable-svelte/core/application';

      const app = useApplication({});
      let localState = $state(0);
      let localPlain = 0;
      let eventState = $state(0);

      function copyState() {
        localState = app.store.state.count;
      }

      onMount(() => {
        copyState();
        localPlain = app.store.state.count;
      });

      function onClick() {
        eventState = app.store.state.count;
      }
    </script>
    <button onclick={onClick}>click</button>`
  });
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  const mirrors = detectorsFor(result, 'lifecycle-mirror');
  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].rule, 'presentation/no-subscription-orchestration');
  assert.equal(mirrors[0].detector, 'lifecycle-mirror');
  assert.equal(detectorsFor(result, 'lifecycle-dispatch').length, 0);
  assert.equal(detectorsFor(result, 'state-mirror').length, 0);
});

test('control group 2: state-mirror detects $state initialized from store while $derived and local state remain clean', (t) => {
  const result = fixture(t, {
    'App.svelte': `<script>
      import {useApplication as useApp} from '@composable-svelte/core/application';

      const app = useApp({});
      const mirroredState = $state(app.store.state.count);
      const derivedProjection = $derived(app.store.state.count);
      const plainLocalState = $state(0);
    </script>
    <p>{mirroredState} {derivedProjection} {plainLocalState}</p>`
  });
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  const mirrors = detectorsFor(result, 'state-mirror');
  assert.equal(mirrors.length, 1);
  assert.equal(mirrors[0].rule, 'presentation/no-subscription-orchestration');
  assert.equal(mirrors[0].detector, 'state-mirror');
  assert.equal(detectorsFor(result, 'lifecycle-mirror').length, 0);
  assert.equal(detectorsFor(result, 'lifecycle-dispatch').length, 0);
});

test('control group 3: store-authority-in-reducer detects a barrel store and public-typed view while plain data stays clean', (t) => {
  const result = fixture(t, {
    'authority-source.ts': `
      import {useApplication} from '@composable-svelte/core/application';
      const app = useApplication({});
      export const liveStore = app.store;
    `,
    'authority-barrel.ts': `
      export {liveStore} from './authority-source';
    `,
    'authority-helper.ts': `
      import {liveStore} from './authority-barrel';
      export function readStoreAuthority() {
        return liveStore.state;
      }
    `,
    'entry.ts': `
      import {defineApplication, type PresentationView} from '@composable-svelte/core/application';
      import {readStoreAuthority} from './authority-helper';

      const ordinaryData = {title: 'plain', count: 10};
      const store = {state: {count: 0}};
      declare const liveView: PresentationView<{count: number}, {type: 'noop'}>;

      function storeReducer(state: any, action: any) {
        const live = readStoreAuthority();
        return [{...state, live}];
      }

      function viewReducer(state: any, action: any) {
        const projected = liveView.state.count;
        return [{...state, projected}];
      }

      function cleanReducer(state: any, action: any) {
        const localVal = store.state.count;
        return [{...state, count: ordinaryData.count + localVal}];
      }

      defineApplication(storeReducer, {});
      defineApplication(viewReducer, {});
      defineApplication(cleanReducer, {});
    `
  }, {roots: ['entry.ts']});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  const findings = detectorsFor(result, 'store-authority-in-reducer');
  assert.equal(findings.length, 2);
  for (const finding of findings) {
    assert.equal(finding.rule, 'reducers/pure-decisions');
    assert.equal(finding.detector, 'store-authority-in-reducer');
  }
  assert.deepEqual(new Set(findings.map((finding) => finding.path)), new Set(['authority-helper.ts', 'entry.ts']));
});

test('control group 4: routing re-export detects browser navigation through helper and barrel with entry attribution', (t) => {
  const result = fixture(t, {
    'routing-helper.ts': `
      export const navigate = history.pushState;
    `,
    'routing-barrel.ts': `
      export {navigate} from './routing-helper';
    `,
    'entry.ts': `
      import {navigate} from './routing-barrel';

      navigate({}, '', '/destination');

      const history = {
        pushState(_state: any, _title: string, _url: string) {
          return '/clean';
        }
      };

      function localPush() {
        return history.pushState({}, '', '/clean');
      }

      localPush();
    `
  }, {roots: ['entry.ts']});
  assert.equal(result.complete, true, JSON.stringify(result.errors));
  const writes = detectorsFor(result, 'history-write');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].rule, 'routing/no-manual-browser-authority');
  assert.equal(writes[0].detector, 'history-write');
  assert.equal(writes[0].path, 'entry.ts');
  assert.equal(writes[0].entryPath, 'entry.ts');
  assert.equal(detectorsFor(result, 'authority-escape').length, 0);
  assert.equal(detectorsFor(result, 'location-write').length, 0);
});

test('control group 5: resource re-export detects module-load-io and view-io with distinct attribution while uninvoked helper is clean', (t) => {
  const result = fixture(t, {
    'io-helper.ts': `
      export function performFetch(url: string) {
        return fetch(url);
      }
      export function inertFetch(url: string) {
        return fetch(url);
      }
    `,
    'io-barrel.ts': `
      export {performFetch, inertFetch} from './io-helper';
    `,
    'module-consumer.ts': `
      import {performFetch, inertFetch} from './io-barrel';
      performFetch('/api/module-load');
    `,
    'ViewConsumer.svelte': `
      <script>
        import {performFetch, inertFetch} from './io-barrel';
        function onClick() {
          performFetch('/api/view-click');
        }
      </script>
      <button onclick={onClick}>load</button>
    `
  }, {roots: ['module-consumer.ts', 'ViewConsumer.svelte']});
  assert.equal(result.complete, true, JSON.stringify(result.errors));

  const moduleFindings = detectorsFor(result, 'module-load-io');
  assert.equal(moduleFindings.length, 1);
  assert.equal(moduleFindings[0].rule, 'resources/no-unowned-infrastructure');
  assert.equal(moduleFindings[0].path, 'io-helper.ts');
  assert.equal(moduleFindings[0].entryPath, 'module-consumer.ts');

  const viewFindings = detectorsFor(result, 'view-io');
  assert.equal(viewFindings.length, 1);
  assert.equal(viewFindings[0].rule, 'resources/no-unowned-infrastructure');
  assert.equal(viewFindings[0].path, 'io-helper.ts');
  assert.equal(viewFindings[0].entryPath, 'ViewConsumer.svelte');
});

test('control group 6: motion helper re-export detects frame-scheduler and web-animations while local lookalikes remain clean', (t) => {
  const result = fixture(t, {
    'motion-helper.ts': `
      export function schedulePlayback(callback: () => void) {
        return requestAnimationFrame(callback);
      }
      export function playElement(element: HTMLElement = document.body) {
        return element.animate([], {});
      }
    `,
    'motion-barrel.ts': `
      export {schedulePlayback, playElement} from './motion-helper';
    `,
    'entry.ts': `
      import {schedulePlayback, playElement} from './motion-barrel';

      schedulePlayback(() => {});
      playElement(document.body);

      function requestAnimationFrame(_callback: () => void) {
        return 0;
      }

      const domainPlayer = {
        animate(_keyframes: any[], _options: any) {
          return 'domain-animation';
        }
      };

      requestAnimationFrame(() => {});
      domainPlayer.animate([], {});
    `
  }, {roots: ['entry.ts']});
  assert.equal(result.complete, true, JSON.stringify(result.errors));

  const frameFindings = detectorsFor(result, 'frame-scheduler');
  assert.equal(frameFindings.length, 1);
  assert.equal(frameFindings[0].rule, 'motion/no-competing-playback');
  assert.equal(frameFindings[0].path, 'motion-helper.ts');

  const animFindings = detectorsFor(result, 'web-animations');
  assert.equal(animFindings.length, 1);
  assert.equal(animFindings[0].rule, 'motion/no-competing-playback');
  assert.equal(animFindings[0].path, 'motion-helper.ts');
});
