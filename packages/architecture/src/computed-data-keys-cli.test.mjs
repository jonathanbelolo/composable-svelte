import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {EXIT, LIMITS, QUALIFICATION_SCOPE, SUPPORTED_PARSERS, isQualificationPass} from './check.mjs';
import {DETECTOR_CATALOG, KNOWN_LIMITATION_CODES} from './detector-catalog.mjs';
import {CATALOG_VERSION, CHECKER_KNOWN_CORE, RULE_CATALOG} from './policy.mjs';

const CHECKER = fileURLToPath(new URL('./check.mjs', import.meta.url));
const EXPECTED_CORE = '0.13.0-next.1';
const EXPECTED_CHECKER = '0.13.1';

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function createFixture(t, files, {policyOverrides = {}, exceptions = [], capabilityGrants = []} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'arch-qualification-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const projectDir = join(root, 'project');
  const policyFile = join(root, 'policy.json');

  const defaultFiles = {
    'package.json': JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: {'@composable-svelte/core': EXPECTED_CORE, svelte: '5.57.0'}
    }),
    'tsconfig.json': JSON.stringify({compilerOptions: {target: 'es2022', module: 'esnext'}}),
    'node_modules/@composable-svelte/core/package.json': JSON.stringify({
      name: '@composable-svelte/core',
      version: EXPECTED_CORE,
      exports: {'.': './index.js', './application': './application.js'}
    }),
    'node_modules/@composable-svelte/core/index.js': 'export const Effect = {none: () => ({type: "none"})};',
    'node_modules/@composable-svelte/core/application.js': 'export const ApplicationRoot = {}; export const ApplicationHost = {}; export const useApplication = () => ({});',
    'node_modules/svelte/package.json': JSON.stringify({
      name: 'svelte',
      version: '5.57.0',
      exports: {'.': './index.js', './transition': './transition.js'}
    }),
    'node_modules/svelte/index.js': 'export {};',
    'node_modules/svelte/transition.js': 'export function fade() {}',
    ...files
  };

  for (const [relPath, content] of Object.entries(defaultFiles)) {
    const fullPath = join(projectDir, relPath);
    mkdirSync(dirname(fullPath), {recursive: true});
    writeFileSync(fullPath, content);
  }

  const roots = Object.keys(files).length > 0 ? Object.keys(files) : ['src/main.ts'];

  const policyData = {
    schema: 'composable-svelte/consumer-architecture-policy',
    schemaVersion: 2,
    catalogVersion: 2,
    policyId: 'qualification-policy',
    policyVersion: '1.0.0',
    supportedCore: {min: EXPECTED_CORE, maxExclusive: '0.14.0-0'},
    project: {tsconfig: 'tsconfig.json', roots},
    rules: {
      active: [
        {id: 'routing/no-manual-browser-authority', severity: 'error'},
        {id: 'presentation/no-subscription-orchestration', severity: 'error'},
        {id: 'reducers/pure-decisions', severity: 'error'},
        {id: 'resources/no-unowned-infrastructure', severity: 'error'},
        {id: 'motion/no-competing-playback', severity: 'error'}
      ],
      inactive: [
        {id: 'presentation/no-fabricated-view', reason: 'supported-replacement-pending', detail: 'staged'},
        {id: 'adapters/least-authority', reason: 'supported-replacement-pending', detail: 'staged'}
      ]
    },
    capabilityGrants,
    qualificationRecords: [],
    exceptions,
    opaquePackages: [
      {name: '@composable-svelte/core', version: EXPECTED_CORE, provenance: 'registry'},
      {name: 'svelte', version: '5.57.0', provenance: 'registry'}
    ],
    ...policyOverrides
  };

  const policyText = JSON.stringify(policyData, null, 2);
  writeFileSync(policyFile, policyText);
  const policySha = sha256Hex(Buffer.from(policyText, 'utf8'));

  const invoke = (mode = 'qualification', extraArgs = [], command = CHECKER) => {
    const argv = [
      '--mode', mode,
      '--project', projectDir,
      '--policy', policyFile,
      '--policy-sha256', policySha,
      '--expected-core-version', EXPECTED_CORE,
      '--today', '2026-09-22'
    ];
    for (let i = 0; i < extraArgs.length; i += 2) {
      const index = argv.indexOf(extraArgs[i]);
      if (index >= 0) argv[index + 1] = extraArgs[i + 1];
      else argv.push(extraArgs[i], extraArgs[i + 1]);
    }
    return spawnSync(process.execPath, [command, ...argv], {encoding: 'utf8'});
  };

  return {root, projectDir, policyFile, policySha, policyData, invoke};
}

test('dynamic property review obligations survive the public bounded qualification envelope',t=>{
 const fixture=createFixture(t,{'src/main.ts':`declare const key:string; export const data={[key]:123};`});
 const child=fixture.invoke('qualification');assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout);assert.equal(result.qualification,'passed');
 assert.equal(result.manualReviewRequired,true);assert.equal(result.qualificationScope,QUALIFICATION_SCOPE);
 assert.equal(result.limitations.length,1);assert.equal(result.limitations[0].code,'opaque-property-key-coercion');
 assert.equal(result.limitations[0].path,'src/main.ts');assert.ok(result.limitations[0].span);assert.match(result.limitations[0].message,/does not prove key purity/);
 const expected={policySha256:fixture.policySha,expectedCoreVersion:EXPECTED_CORE,expectedCheckerVersion:EXPECTED_CHECKER};
 assert.equal(isQualificationPass(result,expected),true);
 for(const field of ['span','message']) {const copy=structuredClone(result);delete copy.limitations[0][field];assert.equal(isQualificationPass(copy,expected),false);}
 const copy=structuredClone(result);copy.manualReviewRequired=false;assert.equal(isQualificationPass(copy,expected),false);
});
