/** Mount props where only `hostVisible` is reactive; dependencies stay unproxied. */
export function reactiveProps<T extends { hostVisible: boolean }>(value: T): T {
  let visible = $state(value.hostVisible);
  return { ...value, get hostVisible() { return visible; }, set hostVisible(next: boolean) { visible = next; } };
}
