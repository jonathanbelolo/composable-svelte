import { describe, it, expect } from 'vitest';
import {
  matchPresentationAction,
  isActionAtPath,
  matchPaths,
  extractDestinationOnAction
} from '../src/lib/navigation/matchers.js';

describe('matchPresentationAction and pure matcher contracts', () => {
  it('preserves presentation entry while matching explicit ordinary case segments', () => {
    expect(matchPresentationAction({type:'destination',action:{type:'dismiss'}}, 'destination.dismiss')).toBeNull();
    expect(matchPresentationAction({type:'destination',action:{type:'editor',action:{type:'save'}}}, 'destination.editor.save')).toBeNull();
    const action={type:'destination',action:{type:'presented',action:{type:'editor',action:{type:'dismiss',reason:'domain'}}}};
    expect(matchPresentationAction(action,'destination.editor.dismiss')).toEqual({type:'dismiss',reason:'domain'});
    expect(matchPresentationAction(action,'destination.dismiss')).toBeNull();
  });
  it('matches single-level presented actions', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'saveButtonTapped' }
      }
    };

    const matched = matchPresentationAction<{ type: string }>(action, 'destination.saveButtonTapped');
    expect(matched).toEqual({ type: 'saveButtonTapped' });
  });

  it('matches nested destination case actions with outer presentation and inner ordinary action (B008-8)', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editor',
          action: { type: 'save', documentId: 'doc-42' }
        }
      }
    };

    const matched = matchPresentationAction<{ type: string; documentId: string }>(
      action,
      'destination.editor.save'
    );
    expect(matched).toEqual({ type: 'save', documentId: 'doc-42' });
  });

  it('matches intermediate destination case level as prefix target', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editor',
          action: { type: 'save' }
        }
      }
    };

    const matched = matchPresentationAction<{ type: string; action: unknown }>(
      action,
      'destination.editor'
    );
    expect(matched).toEqual({ type: 'editor', action: { type: 'save' } });
  });

  it('returns null on path mismatch or dismissal', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editor',
          action: { type: 'save' }
        }
      }
    };

    expect(matchPresentationAction(action, 'destination.editor.cancel')).toBeNull();
    expect(matchPresentationAction(action, 'destination.settings.save')).toBeNull();

    const dismissAction = {
      type: 'destination',
      action: { type: 'dismiss' }
    };
    expect(matchPresentationAction(dismissAction, 'destination.editor.save')).toBeNull();
  });

  it('safely handles unknown and malformed actions without throwing in operator on null/primitives', () => {
    const malformedControls: unknown[] = [
      null,
      undefined,
      0,
      42,
      '',
      'destination.editor.save',
      true,
      false,
      {},
      { type: null },
      { type: 'destination', action: null },
      { type: 'destination', action: undefined },
      { type: 'destination', action: { type: 'presented', action: null } },
      { type: 'destination', action: { type: 'presented', action: undefined } },
      { type: 'destination', action: { type: 'presented' } },
      { type: 'destination', action: { type: 'presented', action: 123 } },
      { type: 'destination', action: { type: 'editor', action: null } },
      { type: 'destination', action: { type: 'editor', action: 'malformed' } },
      Object.create(null)
    ];

    for (const malformed of malformedControls) {
      expect(() => matchPresentationAction(malformed, 'destination.editor.save')).not.toThrow();
      expect(matchPresentationAction(malformed, 'destination.editor.save')).toBeNull();
      expect(isActionAtPath(malformed, 'destination.editor.save')).toBe(false);
      expect(matchPaths(malformed, { 'destination.editor.save': () => 'handled' })).toBeNull();
    }
  });

  it('isActionAtPath evaluates predicate on matched action', () => {
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: {
          type: 'editor',
          action: { type: 'save', status: 'ready' }
        }
      }
    };

    expect(
      isActionAtPath<{ type: string; status: string }>(
        action,
        'destination.editor.save',
        (a) => a.status === 'ready'
      )
    ).toBe(true);

    expect(
      isActionAtPath<{ type: string; status: string }>(
        action,
        'destination.editor.save',
        (a) => a.status === 'draft'
      )
    ).toBe(false);
  });

  it('extractDestinationOnAction extracts state when path matches', () => {
    const state = { destination: { type: 'editor', state: { doc: 'text' } } };
    const action = {
      type: 'destination',
      action: {
        type: 'presented',
        action: { type: 'editor', action: { type: 'save' } }
      }
    };

    const extracted = extractDestinationOnAction(
      action,
      state,
      'destination.editor.save',
      (s) => s.destination
    );
    expect(extracted).toEqual({ type: 'editor', state: { doc: 'text' } });
  });
});
