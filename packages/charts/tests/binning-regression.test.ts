import { describe, it, expect } from 'vitest';
import { bin as d3Bin, extent } from 'd3-array';
import { binData } from '../src/lib/utils/data-transforms.js';

describe('binData regression tests (B046-2)', () => {
  it('retains the maximum endpoint value in the last bin', () => {
    const data = [{ v: 0 }, { v: 10 }];
    const binned = binData<{ v: number }>('v', 2)(data);

    expect(binned.length).toBe(2);
    expect(binned[0]!.v).toBe(0);
    expect(binned[0]!.binIndex).toBe(0);
    expect(binned[1]!.v).toBe(10);
    expect(binned[1]!.binIndex).toBe(d3Bin().domain([0,10]).thresholds(2)([0,10]).length - 1);
    expect(binned[1]!.binEnd).toBe(10);
  });

  it('retains the maximum value across multi-threshold datasets', () => {
    const data = [{ v: 0 }, { v: 25 }, { v: 50 }, { v: 75 }, { v: 100 }];
    const binned = binData<{ v: number }>('v', 4)(data);

    expect(binned.length).toBe(5);
    const lastItem = binned.find(d => d.v === 100);
    expect(lastItem).toBeDefined();
    expect(lastItem?.binEnd).toBe(100);
  });

  it('handles single-value datasets where min === max', () => {
    const data = [{ v: 42 }];
    const binned = binData<{ v: number }>('v', 2)(data);

    expect(binned.length).toBe(1);
    expect(binned[0]).toMatchObject({
      v: 42,
      binIndex: 0,
      binStart: 42,
      binEnd: 42
    });
  });

  it('handles multiple constant values without dropping any records', () => {
    const data = [{ v: 5 }, { v: 5 }, { v: 5 }];
    const binned = binData<{ v: number }>('v', 3)(data);

    expect(binned.length).toBe(3);
    for (const item of binned) {
      expect(item.v).toBe(5);
      expect(item.binIndex).toBe(0);
      expect(item.binStart).toBe(5);
      expect(item.binEnd).toBe(5);
    }
  });

  it('handles empty datasets by returning an empty array', () => {
    const binned = binData<{ v: number }>('v', 2)([]);
    expect(binned).toEqual([]);
  });

  it('omits invalid and NaN values without dropping valid maximum values', () => {
    const data = [{ v: 0 }, { v: NaN }, { v: 10 }];
    const binned = binData<{ v: number }>('v', 2)(data);

    expect(binned.length).toBe(2);
    expect(binned.map(d => d.v)).toEqual([0, 10]);
  });

  it('returns an empty array when dataset contains only invalid values', () => {
    const data = [{ v: NaN }, { v: Number.NaN }];
    const binned = binData<{ v: number }>('v', 2)(data);

    expect(binned).toEqual([]);
  });

  it('handles explicit threshold arrays and includes the upper boundary', () => {
    const data = [{ v: 0 }, { v: 50 }, { v: 100 }];
    const binned = binData<{ v: number }>('v', [0, 50, 100])(data);

    expect(binned.length).toBe(3);
    expect(binned.map(d => d.v)).toEqual([0, 50, 100]);
    expect(binned[2]?.binEnd).toBe(100);
  });

  it('supports accessor functions for field extraction', () => {
    const data = [{ score: 10 }, { score: 50 }, { score: 100 }];
    const binned = binData<{ score: number }>(d => d.score, 2)(data);

    expect(binned.length).toBe(3);
    expect(binned.find(d => d.score === 100)).toBeDefined();
  });
});


describe('review followups: finite numeric domain and deterministic D3 parity',()=>{
  it.each([{values:[0,Infinity,10]},{values:[-Infinity,0,10]},{values:[-Infinity,0,Infinity,10]}, {values:[Infinity,-Infinity,NaN]}])('omits non-finite values from domain and output: $values',({values})=>{
    const actual=binData<{v:number}>('v',2)(values.map(v=>({v})));
    expect(actual.map(d=>d.v)).toEqual(values.filter(Number.isFinite));
    expect(actual.every(d=>Number.isFinite(d.binStart)&&Number.isFinite(d.binEnd))).toBe(true);
  });
  it('matches D3 bin counts and bounds across fixed fractional boundary fixtures',()=>{
    const seeds=[-1,-0.5,-0.3,-0.2,-0.1,-Number.EPSILON,0,Number.EPSILON,0.1,0.2,0.3,0.5,1];
    for(const scale of [0.001,0.1,1,10,1000])for(const offset of [-0.35,0,0.35])for(const threshold of [2,3,7,10]){
      const values=seeds.map(value=>value*scale+offset);const [min,max]=extent(values);if(min===undefined||max===undefined)throw new Error('fixture empty');
      const bins=d3Bin().domain([min,max]).thresholds(threshold)(values);
      const actual=binData<{v:number}>('v',threshold)(values.map(v=>({v})));
      expect(actual.map(d=>d.v)).toEqual(values);
      expect(bins.map((_,i)=>actual.filter(d=>d.binIndex===i).length), `scale=${scale}, offset=${offset}, thresholds=${threshold}`).toEqual(bins.map(bin=>bin.length));
      for(const row of actual){expect(row.binStart).toBe(bins[row.binIndex]?.x0);expect(row.binEnd).toBe(bins[row.binIndex]?.x1);}
    }
  });
});


it('pins the D3 3.2.4 fractional quantization regression independently of the runtime oracle', () => {
  const values = [-1, -0.5, -0.3, -0.2, -0.1, -Number.EPSILON, 0, Number.EPSILON, 0.1, 0.2, 0.3, 0.5, 1].map(value => value * 0.1);
  const rows = binData<{v:number}>('v', 7)(values.map(v => ({ v })));
  expect(Array.from({ length: 10 }, (_, index) => rows.filter(row => row.binIndex === index).length)).toEqual([1, 0, 1, 1, 3, 3, 2, 1, 0, 1]);
  expect(rows.find(row => row.v === -0.2 * 0.1)?.binIndex).toBe(4);
});
