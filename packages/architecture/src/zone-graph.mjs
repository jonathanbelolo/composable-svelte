const ALLOWED_ZONES = new Set([
  'decision',
  'effect',
  'view',
  'module',
  'service',
  'wiring'
]);

function compareChains(a, b) {
  if (a.length !== b.length) {
    return a.length - b.length;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function propagateZones(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Input must be a non-null object');
  }

  const { nodes, edges, seeds } = input;

  if (!Array.isArray(nodes)) {
    throw new TypeError('nodes must be an array');
  }
  if (!Array.isArray(edges)) {
    throw new TypeError('edges must be an array');
  }
  if (!Array.isArray(seeds)) {
    throw new TypeError('seeds must be an array');
  }

  const nodeSet = new Set();
  for (const node of nodes) {
    if (typeof node !== 'string' || node.length === 0) {
      throw new TypeError('Node must be a non-empty string');
    }
    if (nodeSet.has(node)) {
      throw new TypeError(`Duplicate node rejected: ${node}`);
    }
    nodeSet.add(node);
  }

  for (const edge of edges) {
    if (!edge || typeof edge !== 'object' || Array.isArray(edge)) {
      throw new TypeError('Edge must be an object');
    }
    if (typeof edge.from !== 'string' || edge.from.length === 0 || !nodeSet.has(edge.from)) {
      throw new TypeError(`Edge from must be an existing node: ${edge.from}`);
    }
    if (typeof edge.to !== 'string' || edge.to.length === 0 || !nodeSet.has(edge.to)) {
      throw new TypeError(`Edge to must be an existing node: ${edge.to}`);
    }
    if (edge.zones !== undefined) {
      if (!Array.isArray(edge.zones)) {
        throw new TypeError('Edge zones must be an array if provided');
      }
      for (const zone of edge.zones) {
        if (typeof zone !== 'string' || !ALLOWED_ZONES.has(zone)) {
          throw new TypeError(`Invalid edge zone: ${zone}`);
        }
      }
    }
  }

  for (const seed of seeds) {
    if (!seed || typeof seed !== 'object' || Array.isArray(seed)) {
      throw new TypeError('Seed must be an object');
    }
    if (typeof seed.node !== 'string' || seed.node.length === 0 || !nodeSet.has(seed.node)) {
      throw new TypeError(`Seed node must be an existing node: ${seed.node}`);
    }
    if (typeof seed.zone !== 'string' || !ALLOWED_ZONES.has(seed.zone)) {
      throw new TypeError(`Invalid seed zone: ${seed.zone}`);
    }
    if (typeof seed.entryPath !== 'string' || seed.entryPath.length === 0) {
      throw new TypeError('Seed entryPath must be a non-empty string');
    }
  }

  const seedGroups = new Map();
  for (const seed of seeds) {
    const key = `${seed.zone}\0${seed.entryPath}`;
    let group = seedGroups.get(key);
    if (!group) {
      group = { zone: seed.zone, entryPath: seed.entryPath, seeds: [] };
      seedGroups.set(key, group);
    }
    group.seeds.push(seed);
  }

  const rawResults = new Map();

  for (const { zone, entryPath, seeds: groupSeeds } of seedGroups.values()) {
    const adj = new Map();
    for (const node of nodeSet) {
      adj.set(node, new Set());
    }
    for (const edge of edges) {
      if (edge.zones === undefined || edge.zones.includes(zone)) {
        adj.get(edge.from).add(edge.to);
      }
    }

    const bestPath = new Map();
    const distance = new Map();

    for (const seed of groupSeeds) {
      const node = seed.node;
      const chain = [node];
      if (!bestPath.has(node) || compareChains(chain, bestPath.get(node)) < 0) {
        bestPath.set(node, chain);
        distance.set(node, 1);
      }
    }

    let currentLayer = Array.from(bestPath.keys());
    let currentDist = 1;

    while (currentLayer.length > 0) {
      const nextCandidates = new Map();

      for (const u of currentLayer) {
        const uChain = bestPath.get(u);
        const neighbors = adj.get(u) || [];
        for (const v of neighbors) {
          if (distance.has(v)) {
            continue;
          }
          const candChain = [...uChain, v];
          if (!nextCandidates.has(v)) {
            nextCandidates.set(v, candChain);
          } else if (compareChains(candChain, nextCandidates.get(v)) < 0) {
            nextCandidates.set(v, candChain);
          }
        }
      }

      const nextLayer = [];
      for (const [v, chain] of nextCandidates) {
        distance.set(v, currentDist + 1);
        bestPath.set(v, chain);
        nextLayer.push(v);
      }

      currentLayer = nextLayer;
      currentDist++;
    }

    for (const [nodeId, chain] of bestPath) {
      let nodeZones = rawResults.get(nodeId);
      if (!nodeZones) {
        nodeZones = new Map();
        rawResults.set(nodeId, nodeZones);
      }
      let attributions = nodeZones.get(zone);
      if (!attributions) {
        attributions = [];
        nodeZones.set(zone, attributions);
      }
      attributions.push({ entryPath, chain });
    }
  }

  const sortedNodeIds = Array.from(rawResults.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const output = new Map();

  for (const nodeId of sortedNodeIds) {
    const rawZones = rawResults.get(nodeId);
    const sortedZones = Array.from(rawZones.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const zoneMap = new Map();

    for (const zone of sortedZones) {
      const attributions = rawZones.get(zone);
      attributions.sort((a, b) => {
        if (a.entryPath !== b.entryPath) {
          return a.entryPath < b.entryPath ? -1 : 1;
        }
        return compareChains(a.chain, b.chain);
      });
      zoneMap.set(zone, attributions);
    }

    output.set(nodeId, zoneMap);
  }

  return output;
}
