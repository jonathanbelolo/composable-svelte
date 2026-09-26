import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildGraph} from './graph.mjs';

function createProject({
  declaredSpec,
  installedVersion = '1.0.0-alpha.1',
  installedName = 'test-pkg',
  packageName = 'test-pkg',
  exportsMap = {'.': './index.js'}
}) {
  const tempDir = mkdtempSync(join(tmpdir(), 'agy-graph-prerelease-'));
  const projectRoot = realpathSync(tempDir);

  const manifest = {
    name: 'consumer-app',
    version: '0.0.0',
    private: true,
    dependencies: {
      [packageName]: declaredSpec
    }
  };
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify(manifest, null, 2));

  const tsconfig = {
    compilerOptions: {
      target: 'ESNext',
      module: 'NodeNext'
    }
  };
  writeFileSync(join(projectRoot, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

  mkdirSync(join(projectRoot, 'src'), {recursive: true});
  writeFileSync(
    join(projectRoot, 'src', 'main.ts'),
    `import { noop } from '${packageName}';\nexport function main() {\n  noop();\n}\n`
  );

  const pkgDir = join(projectRoot, 'node_modules', packageName);
  mkdirSync(pkgDir, {recursive: true});
  const pkgManifest = {
    name: installedName,
    version: installedVersion,
    exports: exportsMap
  };
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify(pkgManifest, null, 2));
  writeFileSync(join(pkgDir, 'index.js'), 'export function noop() {}\n');

  return {
    projectRoot,
    cleanup() {
      rmSync(projectRoot, {recursive: true, force: true});
    }
  };
}

test('accepts exact prerelease declaration with matching approval', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '1.2.3-alpha.1',
    installedVersion: '1.2.3-alpha.1'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-alpha.1', provenance: 'registry'}]
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.packageSpecifiers, ['test-pkg']);
  } finally {
    cleanup();
  }
});

test('accepts caret prerelease declaration with matching approval', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '^1.2.3-beta.2',
    installedVersion: '1.2.3-beta.2'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-beta.2', provenance: 'registry'}]
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.packageSpecifiers, ['test-pkg']);
  } finally {
    cleanup();
  }
});

test('accepts tilde prerelease declaration with matching approval', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '~1.2.3-rc.0',
    installedVersion: '1.2.3-rc.0'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-rc.0', provenance: 'registry'}]
    });
    assert.equal(result.complete, true);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.packageSpecifiers, ['test-pkg']);
  } finally {
    cleanup();
  }
});

test('rejects invalid leading-zero prerelease declaration', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '1.2.3-01',
    installedVersion: '1.2.3-01'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-01', provenance: 'registry'}]
    });
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'unresolved-package-import');
    assert.equal(result.errors[0].message, 'package dependency specification is not registry-shaped: test-pkg (1.2.3-01)');
  } finally {
    cleanup();
  }
});

test('rejects double caret prerelease declaration', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '^^1.2.3-alpha.1',
    installedVersion: '1.2.3-alpha.1'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-alpha.1', provenance: 'registry'}]
    });
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'unresolved-package-import');
    assert.equal(result.errors[0].message, 'package dependency specification is not registry-shaped: test-pkg (^^1.2.3-alpha.1)');
  } finally {
    cleanup();
  }
});

test('rejects tag prerelease declaration', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: 'next',
    installedVersion: '1.2.3-next.1'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-next.1', provenance: 'registry'}]
    });
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'unresolved-package-import');
    assert.equal(result.errors[0].message, 'package dependency specification is not registry-shaped: test-pkg (next)');
  } finally {
    cleanup();
  }
});

test('rejects protocol aliases declaration', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: 'npm:other-pkg@1.2.3-alpha.1',
    installedVersion: '1.2.3-alpha.1'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-alpha.1', provenance: 'registry'}]
    });
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'unresolved-package-import');
    assert.equal(result.errors[0].message, 'package dependency specification is not registry-shaped: test-pkg (npm:other-pkg@1.2.3-alpha.1)');
  } finally {
    cleanup();
  }
});

test('rejects mismatching installed prerelease identity', () => {
  const {projectRoot, cleanup} = createProject({
    declaredSpec: '^1.2.3-alpha.1',
    installedVersion: '1.2.3-alpha.2'
  });
  try {
    const result = buildGraph({
      projectRoot,
      roots: ['src/main.ts'],
      tsconfig: 'tsconfig.json',
      opaquePackages: [{name: 'test-pkg', version: '1.2.3-alpha.1', provenance: 'registry'}]
    });
    assert.equal(result.complete, false);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].code, 'unresolved-package-import');
    assert.equal(result.errors[0].message, 'installed package name or version does not match external approval: test-pkg (test-pkg@1.2.3-alpha.2 !== test-pkg@1.2.3-alpha.1)');
  } finally {
    cleanup();
  }
});
