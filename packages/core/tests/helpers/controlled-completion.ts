/** A deliberately noncooperative service boundary: abort cannot resolve it. */
export function controlledCompletion<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}
