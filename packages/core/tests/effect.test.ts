import { describe, it, expect, vi } from 'vitest';
import { Effect } from '../src/effect';
import type { Effect as EffectType } from '../src/types';

describe('Effect', () => {
  describe('none()', () => {
    it('creates a None effect', () => {
      const effect = Effect.none<string>();
      expect(effect._tag).toBe('None');
    });
  });

  describe('run()', () => {
    it('creates a Run effect', () => {
      const execute = vi.fn();
      const effect = Effect.run(execute);
      expect(effect._tag).toBe('Run');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('fireAndForget()', () => {
    it('creates a FireAndForget effect', () => {
      const execute = vi.fn();
      const effect = Effect.fireAndForget(execute);
      expect(effect._tag).toBe('FireAndForget');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('batch()', () => {
    it('creates a Batch effect with multiple effects', () => {
      const effect1 = Effect.run(async () => {});
      const effect2 = Effect.run(async () => {});
      const batchEffect = Effect.batch(effect1, effect2);

      expect(batchEffect._tag).toBe('Batch');
      expect(batchEffect.effects).toHaveLength(2);
      expect(batchEffect.effects[0]).toBe(effect1);
      expect(batchEffect.effects[1]).toBe(effect2);
    });

    it('optimizes empty batch to None', () => {
      const batchEffect = Effect.batch();
      expect(batchEffect._tag).toBe('None');
    });

    it('optimizes single effect batch to the effect itself', () => {
      const effect = Effect.run(async () => {});
      const batchEffect = Effect.batch(effect);
      expect(batchEffect).toBe(effect);
    });

    it('filters out None effects from batch', () => {
      const effect1 = Effect.none();
      const effect2 = Effect.run(async () => {});
      const batchEffect = Effect.batch(effect1, effect2);
      // With None filtered out, only one effect remains, so returns that effect directly
      expect(batchEffect).toBe(effect2);
    });
  });

  describe('cancellable()', () => {
    it('creates a Cancellable effect with ID', () => {
      const execute = vi.fn();
      const effect = Effect.cancellable('test-id', execute);

      expect(effect._tag).toBe('Cancellable');
      expect(effect.id).toBe('test-id');
      expect(effect.execute).toBe(execute);
    });
  });

  describe('debounced()', () => {
    it('creates a Debounced effect with ID and delay', () => {
      const execute = vi.fn();
      const effect = Effect.debounced('test-id', 300, execute);

      expect(effect._tag).toBe('Debounced');
      expect(effect.id).toBe('test-id');
      expect(effect.ms).toBe(300);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('throttled()', () => {
    it('creates a Throttled effect with ID and interval', () => {
      const execute = vi.fn();
      const effect = Effect.throttled('test-id', 100, execute);

      expect(effect._tag).toBe('Throttled');
      expect(effect.id).toBe('test-id');
      expect(effect.ms).toBe(100);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('afterDelay()', () => {
    it('creates an AfterDelay effect with delay', () => {
      const execute = vi.fn();
      const effect = Effect.afterDelay(500, execute);

      expect(effect._tag).toBe('AfterDelay');
      expect(effect.ms).toBe(500);
      expect(effect.execute).toBe(execute);
    });
  });

  describe('map()', () => {
    it('maps None effect', () => {
      const effect = Effect.none<number>();
      const mapped = Effect.map(effect, (n) => String(n));

      expect(mapped._tag).toBe('None');
    });

    it('maps Run effect actions', async () => {
      const actions: string[] = [];
      const effect = Effect.run<number>((dispatch) => {
        dispatch(42);
      });
      const mapped = Effect.map(effect, (n) => `num:${n}`);

      expect(mapped._tag).toBe('Run');

      // Execute and verify transformation
      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps FireAndForget effect without transformation', () => {
      const execute = vi.fn();
      const effect = Effect.fireAndForget(execute);
      const mapped = Effect.map(effect, (n: number) => String(n));

      expect(mapped._tag).toBe('FireAndForget');
      expect(mapped.execute).toBe(execute);
    });

    it('maps Batch effect recursively', () => {
      const effect1 = Effect.run<number>((d) => d(1));
      const effect2 = Effect.run<number>((d) => d(2));
      const batch = Effect.batch(effect1, effect2);
      const mapped = Effect.map(batch, (n) => String(n));

      expect(mapped._tag).toBe('Batch');
      expect(mapped.effects).toHaveLength(2);
      expect(mapped.effects[0]._tag).toBe('Run');
      expect(mapped.effects[1]._tag).toBe('Run');
    });

    it('maps Cancellable effect preserving ID', async () => {
      const actions: string[] = [];
      const effect = Effect.cancellable<number>('my-id', (d) => d(42));
      const mapped = Effect.map(effect, (n) => `num:${n}`);

      expect(mapped._tag).toBe('Cancellable');
      expect(mapped.id).toBe('my-id');

      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps Debounced effect preserving ID and delay', async () => {
      const actions: string[] = [];
      const effect = Effect.debounced<number>('my-id', 300, (d) => d(42));
      const mapped = Effect.map(effect, (n) => `num:${n}`);

      expect(mapped._tag).toBe('Debounced');
      expect(mapped.id).toBe('my-id');
      expect(mapped.ms).toBe(300);

      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps Throttled effect preserving ID and interval', async () => {
      const actions: string[] = [];
      const effect = Effect.throttled<number>('my-id', 100, (d) => d(42));
      const mapped = Effect.map(effect, (n) => `num:${n}`);

      expect(mapped._tag).toBe('Throttled');
      expect(mapped.id).toBe('my-id');
      expect(mapped.ms).toBe(100);

      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });

    it('maps AfterDelay effect preserving delay', async () => {
      const actions: string[] = [];
      const effect = Effect.afterDelay<number>(500, (d) => d(42));
      const mapped = Effect.map(effect, (n) => `num:${n}`);

      expect(mapped._tag).toBe('AfterDelay');
      expect(mapped.ms).toBe(500);

      await mapped.execute((s) => actions.push(s));
      expect(actions).toEqual(['num:42']);
    });
  });
});
