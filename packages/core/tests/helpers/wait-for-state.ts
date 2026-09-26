/** Wait without polling, including stores that notify during subscribe(). */
export function waitForState<State>(
  store: { subscribe(listener: (state: State) => void): () => void },
  condition: (state: State) => boolean,
  options: { timeout?: number | undefined; description?: string | undefined } = {}
): Promise<State> {
  const { timeout = 2000, description = 'state condition' } = options;
  return new Promise((resolve, reject) => {
    let unsubscribe: (() => void) | undefined;
    let ready = false;
    let outcome: { state: State } | { error: unknown } | undefined;
    const publish = () => {
      if (!ready || !outcome) return;
      const cleanup = unsubscribe;
      unsubscribe = undefined;
      try { cleanup?.(); }
      catch (error) { reject(error); return; }
      if ('error' in outcome) reject(outcome.error);
      else resolve(outcome.state);
    };
    const finish = (result: NonNullable<typeof outcome>) => {
      if (outcome) return;
      outcome = result;
      clearTimeout(timer);
      publish();
    };
    const timer = setTimeout(() => finish({
      error: new Error(`Timeout waiting for ${description} after ${timeout}ms`)
    }), timeout);
    try {
      unsubscribe = store.subscribe(state => {
        if (outcome) return;
        try { if (condition(state)) finish({ state }); }
        catch (error) { finish({ error }); }
      });
      ready = true;
      publish();
    } catch (error) {
      clearTimeout(timer);
      reject(error);
    }
  });
}
