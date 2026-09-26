export function createValueDomain() {
  let revision = 0;
  const knownAtoms = new Map();
  const heaps = new Map();
  const heapById = new Map();

  function empty() {
    return new Set();
  }

  function atom(kind, id) {
    if (typeof kind !== 'string' || kind === 'heap' || typeof id !== 'string') {
      throw new TypeError('atom kind and id must be strings; heap is reserved');
    }
    const atomKey = JSON.stringify(['atom', kind, id]);
    if (!knownAtoms.has(atomKey)) {
      knownAtoms.set(atomKey, { kind, id });
    }
    return new Set([atomKey]);
  }

  function join(...values) {
    const result = new Set();
    for (const val of values) {
      if (!(val instanceof Set)) {
        throw new TypeError('Values to join must be Sets');
      }
      for (const a of val) {
        if (!knownAtoms.has(a)) {
          throw new TypeError(`Unknown atom: ${a}`);
        }
        result.add(a);
      }
    }
    return result;
  }

  function equal(a, b) {
    if (!(a instanceof Set) || !(b instanceof Set)) {
      throw new TypeError('Arguments to equal must be Sets');
    }
    // Validate even when cardinalities differ; malformed values cannot look clean.
    join(a, b);
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }

  function allocate(id, { array = false } = {}) {
    if (typeof id !== 'string') {
      throw new TypeError('Heap id must be a string');
    }
    if (typeof array !== 'boolean') throw new TypeError('array classification must be boolean');
    const isArr = array;
    const existing = heapById.get(id);
    if (existing) {
      if (existing.isArray !== isArr) {
        throw new TypeError(`Incompatible array classification for heap id: ${id}`);
      }
      return new Set([existing.atomKey]);
    }
    const atomKey = JSON.stringify(['heap', id]);
    const heap = {
      id,
      atomKey,
      isArray: isArr,
      props: new Map(),
      spreadSet: new Set(),
      spreads: []
    };
    heapById.set(id, heap);
    heaps.set(atomKey, heap);
    knownAtoms.set(atomKey, { kind: 'heap', id });
    return new Set([atomKey]);
  }

  function write(receiver, key, value) {
    if (!(receiver instanceof Set)) {
      throw new TypeError('Receiver must be a Set');
    }
    if (typeof key !== 'string') {
      throw new TypeError('Key must be a string');
    }
    if (!(value instanceof Set)) {
      throw new TypeError('Value must be a Set');
    }
    if (receiver.size === 0) {
      throw new TypeError('Receiver must not be empty');
    }
    for (const r of receiver) {
      const info = knownAtoms.get(r);
      if (!info || info.kind !== 'heap') {
        throw new TypeError(`Receiver atom is not a heap reference: ${r}`);
      }
    }
    for (const v of value) {
      if (!knownAtoms.has(v)) {
        throw new TypeError(`Unknown atom in value: ${v}`);
      }
    }

    let changed = false;
    for (const r of receiver) {
      const heap = heaps.get(r);
      let propSet = heap.props.get(key);
      if (!propSet) {
        propSet = new Set();
        heap.props.set(key, propSet);
      }
      for (const v of value) {
        if (!propSet.has(v)) {
          propSet.add(v);
          changed = true;
        }
      }
    }
    if (changed) {
      revision++;
    }
    return changed;
  }

  function spread(receiver, source, { array = false, shadowed = [] } = {}) {
    if (!Array.isArray(shadowed) || shadowed.some(key => typeof key !== 'string')) throw new TypeError('Spread shadow keys must be strings');
    const excluded = [...new Set(shadowed)].sort();
    if (!(receiver instanceof Set)) {
      throw new TypeError('Receiver must be a Set');
    }
    if (!(source instanceof Set)) {
      throw new TypeError('Source must be a Set');
    }
    if (receiver.size === 0) {
      throw new TypeError('Receiver must not be empty');
    }
    for (const r of receiver) {
      const info = knownAtoms.get(r);
      if (!info || info.kind !== 'heap') {
        throw new TypeError(`Receiver atom is not a heap reference: ${r}`);
      }
    }
    for (const s of source) {
      if (!knownAtoms.has(s)) {
        throw new TypeError(`Unknown atom in source: ${s}`);
      }
    }

    if (typeof array !== 'boolean') throw new TypeError('array classification must be boolean');
    const isArr = array;
    let changed = false;
    for (const r of receiver) {
      const heap = heaps.get(r);
      for (const s of source) {
        const edgeKey = JSON.stringify([s, isArr, excluded]);
        if (!heap.spreadSet.has(edgeKey)) {
          heap.spreadSet.add(edgeKey);
          heap.spreads.push({ sourceAtom: s, isArray: isArr, shadowed: new Set(excluded) });
          changed = true;
        }
      }
    }
    if (changed) {
      revision++;
    }
    return changed;
  }

  function read(receiver, key, project) {
    if (project !== undefined && typeof project !== 'function') throw new TypeError('Member projector must be a function');
    if (!(receiver instanceof Set)) {
      throw new TypeError('Receiver must be a Set');
    }
    if (typeof key !== 'string') {
      throw new TypeError('Key must be a string');
    }
    for (const r of receiver) {
      if (!knownAtoms.has(r)) {
        throw new TypeError(`Unknown atom in receiver: ${r}`);
      }
    }

    const result = new Set();
    const visited = new Set();
    const worklist = [];
    for (const r of receiver) {
      worklist.push([r, key, false]);
    }

    while (worklist.length > 0) {
      const [curAtom, curKey, throughSpread] = worklist.pop();
      const visitToken = JSON.stringify([curAtom, curKey, throughSpread]);
      if (visited.has(visitToken)) continue;
      visited.add(visitToken);

      const info = knownAtoms.get(curAtom);
      if (!info) {
        throw new TypeError(`Unknown atom: ${curAtom}`);
      }

      if (info.kind === 'state') {
        result.add(curAtom);
        continue;
      }

      if (info.kind !== 'heap') {
        if (project) for (const value of join(project(curAtom, curKey))) result.add(value);
        else if (throughSpread && !['literal'].includes(info.kind)) throw new TypeError('Opaque spread source requires member projection');
        continue;
      }

      const heap = heaps.get(curAtom);
      if (!heap) continue;

      if (curKey === '*') {
        for (const propSet of heap.props.values()) {
          for (const v of propSet) {
            result.add(v);
          }
        }
      } else {
        // '*' is the explicit unknown-key summary, not a literal-key namespace.
        for (const v of heap.props.get('*') ?? []) result.add(v);
        const direct = heap.props.get(curKey);
        if (direct) {
          for (const v of direct) {
            result.add(v);
          }
        }
      }

      const curIsNumeric = curKey === '*' || /^\d+$/.test(curKey);
      for (const sp of heap.spreads) {
        if (sp.isArray) {
          if (curIsNumeric) {
            worklist.push([sp.sourceAtom, '*', true]);
          }
        } else {
          if (!sp.shadowed.has(curKey) || curKey === '*') worklist.push([sp.sourceAtom, curKey, true]);
        }
      }
    }

    return result;
  }

  function describe(atom) {
    let a = atom;
    if (a instanceof Set) {
      if (a.size !== 1) {
        throw new TypeError('Expected single atom');
      }
      a = a.values().next().value;
    }
    if (typeof a !== 'string') {
      throw new TypeError('Atom must be a string or single atom Set');
    }
    const info = knownAtoms.get(a);
    if (!info) {
      throw new TypeError(`Unknown atom: ${a}`);
    }
    return { kind: info.kind, id: info.id };
  }

  function isArray(atom) {
    const info = describe(atom);
    return info.kind === 'heap' && heapById.get(info.id).isArray;
  }

  return {
    empty,
    atom,
    join,
    equal,
    allocate,
    write,
    spread,
    read,
    describe,
    isArray,
    get revision() {
      return revision;
    }
  };
}
