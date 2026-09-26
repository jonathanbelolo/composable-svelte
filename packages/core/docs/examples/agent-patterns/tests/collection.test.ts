import { expect, it } from 'vitest';
import { emptyCollection, beginSearch, acceptSearch, merge, displayed, move, type Item } from '../src/collection';
const item = (id: string, revision = 1, flagged = false): Item => ({ id, revision, text: `${id}/${revision}`, flagged });
it('preserves stable order across filtering, reordering and refreshed membership', () => {
  let state = beginSearch(emptyCollection(), '');
  state = acceptSearch(state, state.request, '', [item('a', 1, true), item('b'), item('c', 1, true)]);
  state = move(state, 'c', -1, true);
  expect(displayed(state).map(x => x.id)).toEqual(['c', 'b', 'a']);
  state = beginSearch(state, 'b');
  state = acceptSearch(state, state.request, 'b', [item('b')]);
  state = beginSearch(state, '');
  state = acceptSearch(state, state.request, '', [item('a'), item('b'), item('c')]);
  expect(displayed(state).map(x => x.id)).toEqual(['c', 'b', 'a']);
});
it.each([true, false])('revision authority converges for search/detail completion order, detailFirst=%s', detailFirst => {
  let state = beginSearch(emptyCollection(), '');
  const search = () => { state = acceptSearch(state, state.request, '', [item('a', 1)]); };
  const detail = () => { state = merge(state, [item('a', 2)]); };
  if (detailFirst) { detail(); search(); } else { search(); detail(); }
  expect(displayed(state)[0]!.revision).toBe(2);
});
it('save wins over older refresh data, but a later server revision may replace it', () => {
  let state = beginSearch(emptyCollection(), '');
  state = merge(state, [item('a', 3)]); // successful save response
  state = acceptSearch(state, state.request, '', [item('a', 2)]);
  expect(displayed(state)[0]!.revision).toBe(3);
  state = beginSearch(state, ''); state = acceptSearch(state, state.request, '', [item('a', 4)]);
  expect(displayed(state)[0]!.revision).toBe(4);
});
it('distinguishes an accepted empty result from no result and rejects stale searches', () => {
  let state = beginSearch(emptyCollection(), 'old'); const old = state.request;
  state = beginSearch(state, 'new');
  expect(acceptSearch(state, old, 'old', [item('a')])).toBe(state);
  state = acceptSearch(state, state.request, 'new', []);
  expect(state.acceptedQuery).toBe('new'); expect(state.membership).toEqual([]);
});
it('deletion tombstones block resurrection by old responses', () => {
  let state = beginSearch(emptyCollection(), '');
  state = merge(state, [{ ...item('a', 3), deleted: true }]);
  state = acceptSearch(state, state.request, '', [item('a', 2)]);
  expect(displayed(state)).toEqual([]); expect(state.entities.a!.deleted).toBe(true);
});
it('handles duplicate and prototype-like IDs without duplicating order', () => {
  let state = beginSearch(emptyCollection(), '');
  state = acceptSearch(state, state.request, '', [item('__proto__'), item('constructor'), item('__proto__')]);
  expect(displayed(state).map(x => x.id)).toEqual(['__proto__', 'constructor']);
});
it('omitting an ID from search changes membership, not entity existence', () => {
  let state = beginSearch(emptyCollection(), '');
  state = acceptSearch(state, state.request, '', [item('a')]);
  state = beginSearch(state, 'other'); state = acceptSearch(state, state.request, 'other', []);
  expect(displayed(state)).toEqual([]); expect(state.entities.a).toEqual(item('a'));
});
