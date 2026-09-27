import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { ChannelTrack } from '../../src/lib/application/renderer/choreography/channel-types.js';
import { channelTracks } from '../../src/lib/application/renderer/choreography/channels.js';

// Reachability witness for I7 bounded retarget memory. `segmentCount` only reports the logical
// shape; this measures the heap actually retained by a chained track after full collections.
setFlagsFromString('--expose-gc');
const gc = runInNewContext('gc') as () => void;

function retainedBytes(build: () => unknown): { bytes: number; keep: unknown } {
  gc();
  gc();
  const before = process.memoryUsage().heapUsed;
  const keep = build();
  gc();
  gc();
  return { bytes: process.memoryUsage().heapUsed - before, keep };
}

function chain(retargets: number, onEach?: (track: ChannelTrack) => void): ChannelTrack {
  let track = channelTracks.tween('x', { from: 0, to: 10, startMs: 0, durationMs: 1000, easing: 'linear' });
  for (let i = 1; i <= retargets; i++) {
    track = track.retarget(i * 10, 10 + (i % 7), 50);
    onEach?.(track);
  }
  return track;
}

const RETARGETS = 20_000;
// The unbounded closure chain retained ~430 B per retarget (about 8.6 MB here); bounded is ~0.
const BOUND_BYTES = RETARGETS * 32;

describe('channel track retarget retention (heap reachability)', () => {
  it('detects deliberately retained history, so the witness is not vacuous', () => {
    const all: ChannelTrack[] = [];
    const { bytes, keep } = retainedBytes(() => chain(RETARGETS, (track) => all.push(track)));
    expect(bytes).toBeGreaterThan(BOUND_BYTES);
    expect(keep).toBeDefined();
  });

  it('retains bounded memory across 20,000 chained retargets', () => {
    const { bytes, keep } = retainedBytes(() => chain(RETARGETS));
    expect(bytes).toBeLessThan(BOUND_BYTES);
    const latest = keep as ChannelTrack;
    expect(latest.sample(RETARGETS * 10 + 50)).toEqual({ value: 10 + (RETARGETS % 7), velocity: 0 });
  });
});
