import test from 'node:test';
import assert from 'node:assert/strict';
import { propagateZones } from './zone-graph.mjs';

test('handles directed cycles without infinite loops or duplicate attribution', () => {
  const result = propagateZones({
    nodes: ['a', 'b', 'c'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' }
    ],
    seeds: [{ node: 'a', zone: 'decision', entryPath: 'entry.js' }]
  });

  assert.deepEqual(result.get('a').get('decision'), [{ entryPath: 'entry.js', chain: ['a'] }]);
  assert.deepEqual(result.get('b').get('decision'), [{ entryPath: 'entry.js', chain: ['a', 'b'] }]);
  assert.deepEqual(result.get('c').get('decision'), [{ entryPath: 'entry.js', chain: ['a', 'b', 'c'] }]);
});

test('supports multi-zone and multi-entry attributions on common nodes', () => {
  const result = propagateZones({
    nodes: ['a', 'b', 'target'],
    edges: [
      { from: 'a', to: 'target' },
      { from: 'b', to: 'target' }
    ],
    seeds: [
      { node: 'a', zone: 'decision', entryPath: 'entry1.js' },
      { node: 'b', zone: 'view', entryPath: 'entry2.js' },
      { node: 'b', zone: 'decision', entryPath: 'entry3.js' }
    ]
  });

  const targetZones = result.get('target');
  assert.ok(targetZones);
  assert.deepEqual(targetZones.get('decision'), [
    { entryPath: 'entry1.js', chain: ['a', 'target'] },
    { entryPath: 'entry3.js', chain: ['b', 'target'] }
  ]);
  assert.deepEqual(targetZones.get('view'), [
    { entryPath: 'entry2.js', chain: ['b', 'target'] }
  ]);
});

test('enforces blocked propagation with empty edge zones and non-matching zones', () => {
  const result = propagateZones({
    nodes: ['root', 'blockedAll', 'allowedViewOnly', 'unreached'],
    edges: [
      { from: 'root', to: 'blockedAll', zones: [] },
      { from: 'root', to: 'allowedViewOnly', zones: ['view'] },
      { from: 'blockedAll', to: 'unreached' }
    ],
    seeds: [{ node: 'root', zone: 'decision', entryPath: 'app.js' }]
  });

  assert.strictEqual(result.has('blockedAll'), false);
  assert.strictEqual(result.has('allowedViewOnly'), false);
  assert.strictEqual(result.has('unreached'), false);
  assert.deepEqual(result.get('root').get('decision'), [{ entryPath: 'app.js', chain: ['root'] }]);
});

test('resolves shortest chain and deterministic lexicographic tie-breaks', () => {
  const result = propagateZones({
    nodes: ['start', 'short', 'long1', 'long2', 'endShort', 'candX', 'candY', 'endTie', 'seedA', 'seedB', 'endSeeds'],
    edges: [
      { from: 'start', to: 'short' },
      { from: 'short', to: 'endShort' },
      { from: 'start', to: 'long1' },
      { from: 'long1', to: 'long2' },
      { from: 'long2', to: 'endShort' },
      { from: 'start', to: 'candY' },
      { from: 'start', to: 'candX' },
      { from: 'candY', to: 'endTie' },
      { from: 'candX', to: 'endTie' },
      { from: 'seedB', to: 'endSeeds' },
      { from: 'seedA', to: 'endSeeds' }
    ],
    seeds: [
      { node: 'start', zone: 'effect', entryPath: 'entry.js' },
      { node: 'seedB', zone: 'effect', entryPath: 'shared.js' },
      { node: 'seedA', zone: 'effect', entryPath: 'shared.js' }
    ]
  });

  assert.deepEqual(result.get('endShort').get('effect'), [
    { entryPath: 'entry.js', chain: ['start', 'short', 'endShort'] }
  ]);
  assert.deepEqual(result.get('endTie').get('effect'), [
    { entryPath: 'entry.js', chain: ['start', 'candX', 'endTie'] }
  ]);
  assert.deepEqual(result.get('endSeeds').get('effect'), [
    { entryPath: 'shared.js', chain: ['seedA', 'endSeeds'] }
  ]);
});

test('produces identical output Maps and iteration orders regardless of input shuffle', () => {
  const nodes = ['n1', 'n2', 'n3', 'n4'];
  const edges = [
    { from: 'n1', to: 'n2' },
    { from: 'n1', to: 'n3' },
    { from: 'n2', to: 'n4' },
    { from: 'n3', to: 'n4' }
  ];
  const seeds = [
    { node: 'n1', zone: 'module', entryPath: 'entryA.js' },
    { node: 'n1', zone: 'wiring', entryPath: 'entryB.js' }
  ];

  const res1 = propagateZones({ nodes, edges, seeds });
  const res2 = propagateZones({
    nodes: ['n3', 'n1', 'n4', 'n2'],
    edges: [
      { from: 'n3', to: 'n4' },
      { from: 'n1', to: 'n3' },
      { from: 'n2', to: 'n4' },
      { from: 'n1', to: 'n2' }
    ],
    seeds: [
      { node: 'n1', zone: 'wiring', entryPath: 'entryB.js' },
      { node: 'n1', zone: 'module', entryPath: 'entryA.js' }
    ]
  });

  assert.deepEqual(Array.from(res1.keys()), Array.from(res2.keys()));
  assert.deepEqual(Array.from(res1.keys()), ['n1', 'n2', 'n3', 'n4']);
  for (const k of res1.keys()) {
    assert.deepEqual(Array.from(res1.get(k).keys()), Array.from(res2.get(k).keys()));
    for (const z of res1.get(k).keys()) {
      assert.deepEqual(res1.get(k).get(z), res2.get(k).get(z));
    }
  }
});

test('validates input and throws TypeError on unknown nodes, duplicates, and invalid zones', () => {
  assert.throws(() => propagateZones(null), TypeError);
  assert.throws(() => propagateZones({ nodes: 'not-array', edges: [], seeds: [] }), TypeError);
  assert.throws(() => propagateZones({ nodes: ['a', 'a'], edges: [], seeds: [] }), TypeError);
  assert.throws(() => propagateZones({ nodes: [''], edges: [], seeds: [] }), TypeError);
  assert.throws(() => propagateZones({ nodes: [123], edges: [], seeds: [] }), TypeError);
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [{ from: 'a', to: 'unknown' }],
        seeds: []
      }),
    TypeError
  );
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [{ from: 'unknown', to: 'a' }],
        seeds: []
      }),
    TypeError
  );
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [{ from: 'a', to: 'a', zones: ['invalid-zone'] }],
        seeds: []
      }),
    TypeError
  );
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [],
        seeds: [{ node: 'unknown', zone: 'service', entryPath: 'e.js' }]
      }),
    TypeError
  );
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [],
        seeds: [{ node: 'a', zone: 'not-allowed', entryPath: 'e.js' }]
      }),
    TypeError
  );
  assert.throws(
    () =>
      propagateZones({
        nodes: ['a'],
        edges: [],
        seeds: [{ node: 'a', zone: 'service', entryPath: '' }]
      }),
    TypeError
  );
});

test('operates immutably with deep frozen inputs', () => {
  const frozenInput = Object.freeze({
    nodes: Object.freeze(['a', 'b', 'c']),
    edges: Object.freeze([
      Object.freeze({ from: 'a', to: 'b', zones: Object.freeze(['service']) }),
      Object.freeze({ from: 'b', to: 'c' })
    ]),
    seeds: Object.freeze([
      Object.freeze({ node: 'a', zone: 'service', entryPath: 'app.js' })
    ])
  });

  const result = propagateZones(frozenInput);
  assert.deepEqual(result.get('c').get('service'), [
    { entryPath: 'app.js', chain: ['a', 'b', 'c'] }
  ]);
});

test('accepts exactly the six fixed zone names', () => {
  const zones = ['decision', 'effect', 'module', 'service', 'view', 'wiring'];
  const result = propagateZones({
    nodes: ['entry'],
    edges: [],
    seeds: zones.map((zone) => ({ node: 'entry', zone, entryPath: `${zone}.js` }))
  });
  assert.deepEqual(Array.from(result.get('entry').keys()), zones);
  assert.throws(() => propagateZones({
    nodes: ['entry'], edges: [], seeds: [{ node: 'entry', zone: 'custom', entryPath: 'custom.js' }]
  }), TypeError);
});
