/** Private typed lookup metadata; never another runtime or destruction authority. */
export const applicationContextKey = Symbol('ApplicationRoot');
export interface ApplicationContext {
  readonly definition: object;
  readonly app: unknown;
}
