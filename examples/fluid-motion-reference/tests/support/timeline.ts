/**
 * Ordered track endings on a shared frame timeline. Each frame maps a track key to whether that track's
 * geometry changed since its previous frame. Track A ends before track B when A actually moved, and B still
 * moves on frames strictly after A's last moving frame. Frames before A started never count, and tracks
 * whose last movement falls on the same frame do not count as ordered. No time tolerance is involved.
 */
export type MotionTimeline = ReadonlyArray<readonly [time: number, moved: Readonly<Record<string, boolean>>]>;

export function lastMovingIndex(timeline: MotionTimeline, key: string): number {
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i]![1][key] === true) return i;
  return -1;
}

/** Times of frames after A's final movement at which B is still moving (empty: not ordered). */
export function movesAfterEnd(timeline: MotionTimeline, a: string, b: string): number[] {
  const end = lastMovingIndex(timeline, a);
  if (end < 0) return [];
  return timeline.slice(end + 1).filter(([, moved]) => moved[b] === true && moved[a] !== true).map(([time]) => time);
}
