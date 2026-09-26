import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {buildGraph} from '../graph.mjs';
import {evaluateRoutingTemplate} from './routing-template.mjs';

function fixture(source, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'routing-test-'));
  try {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({name: 'test-fixture'}));
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({compilerOptions: {}}));
    writeFileSync(join(dir, 'App.svelte'), source);
    const graph = buildGraph({projectRoot: dir, roots: ['App.svelte'], tsconfig: 'tsconfig.json'});
    return fn(dir, graph);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

test('table-driven routing template authority detection', () => {
  const cases = [
    {
      name: 'modern and legacy window navigation handlers',
      source: '<svelte:window onpopstate={fn} on:hashchange={fn} />',
      expectedFindings: 2,
      expectedNames: ['onpopstate', 'hashchange']
    },
    {
      name: 'alias callback name does not evade authority',
      source: '<svelte:window onpopstate={customRouterDispatch} />',
      expectedFindings: 1,
      expectedNames: ['onpopstate']
    },
    {
      name: 'ordinary window events are permitted',
      source: '<svelte:window onresize={onResize} onkeydown={onKey} onclick={onClick} />',
      expectedFindings: 0
    },
    {
      name: 'comments and template text avoid false positives',
      source: '<!-- <svelte:window onpopstate={fn} /> --> <p>onpopstate popstate hashchange</p>',
      expectedFindings: 0
    }
  ];
  for (const {name, source, expectedFindings, expectedNames} of cases) {
    fixture(source, (projectRoot, graph) => {
      const res = evaluateRoutingTemplate({projectRoot, graph});
      assert.equal(res.errors.length, 0, `analysis error: ${name}`);
      assert.equal(res.findings.length, expectedFindings, `failed: ${name}`);
      if (expectedNames) {
        for (let i = 0; i < expectedNames.length; i++) {
          assert.equal(res.findings[i].rule, 'routing/no-manual-browser-authority');
          assert.equal(res.findings[i].detector, 'traversal-listener');
          assert.match(res.findings[i].message, new RegExp(expectedNames[i]));
          assert.equal(res.findings[i].replacement, 'defineApplication routing decisions + dispatch intent');
          assert.equal(res.findings[i].docs, 'application-routing.md#decisions-and-ordering');
        }
      }
    });
  }
});

test('precise spans with preceding Unicode', () => {
  const source = '<p>✨ rocket 🚀</p>\n<svelte:window onpopstate={fn} />';
  fixture(source, (projectRoot, graph) => {
    const res = evaluateRoutingTemplate({projectRoot, graph});
    assert.equal(res.errors.length, 0);
    assert.equal(res.findings.length, 1);
    const expectedStart = source.indexOf('onpopstate');
    const expectedEnd = source.indexOf(' />', expectedStart);
    assert.equal(res.findings[0].span.start.offset, expectedStart);
    assert.equal(res.findings[0].span.end.offset, expectedEnd);
    assert.equal(res.findings[0].span.start.line, 2);
    assert.equal(res.findings[0].span.start.column, 16);
    assert.equal(source.slice(expectedStart, expectedEnd), 'onpopstate={fn}');
  });
});
test('deterministic repeat evaluation', () => {
  const source = '<svelte:window onhashchange={fn} />';
  fixture(source, (projectRoot, graph) => {
    const first = evaluateRoutingTemplate({projectRoot, graph});
    const second = evaluateRoutingTemplate({projectRoot, graph});
    assert.deepEqual(first, second);
  });
});
test('missing analysis controls fail closed', () => {
  assert.equal(evaluateRoutingTemplate({projectRoot: '.', graph: null}).errors[0].code, 'incomplete-graph');
  assert.equal(evaluateRoutingTemplate({projectRoot: '.', graph: {complete: false, modules: []}}).errors[0].code, 'incomplete-graph');
});
test('malformed svelte syntax reports parse error without crash', () => {
  fixture('<svelte:window onpopstate={', (projectRoot, graph) => {
    const res = evaluateRoutingTemplate({projectRoot, graph});
    assert.ok(res.errors.some((err) => err.code === 'parse-error'));
  });
});
