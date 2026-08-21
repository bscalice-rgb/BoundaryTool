import { useCallback, useMemo, useReducer } from 'react';
import type { Workspace } from '../types';
import { emptyWorkspace } from '../types';

/**
 * Undo/redo for the whole workspace.
 *
 * Every action is a pure `Workspace -> Workspace` function and each result is kept
 * as a snapshot, which is what makes auto-fixes safely reversible: an auto-fix that
 * guesses wrong is one Ctrl+Z away from the state before it, no matter how much
 * geometry it rewrote.
 */

/** Snapshots kept before the oldest ones are dropped. */
const HISTORY_LIMIT = 100;

export interface HistoryState {
  past: Workspace[];
  present: Workspace;
  future: Workspace[];
  /** Label of the action that produced `present`, shown on the undo control. */
  lastAction: string | null;
  /** Label of the action that undoing would replay, shown on the redo control. */
  nextAction: string | null;
  pastLabels: string[];
  futureLabels: string[];
}

type Action =
  | { type: 'apply'; label: string; fn: (workspace: Workspace) => Workspace }
  | { type: 'undo' }
  | { type: 'redo' }
  /** Repeats undo or redo `Math.abs(delta)` times, for jumping in the history list. */
  | { type: 'jump'; delta: number }
  | { type: 'clear' };

const initialState = (): HistoryState => ({
  past: [],
  present: emptyWorkspace(),
  future: [],
  lastAction: null,
  nextAction: null,
  pastLabels: [],
  futureLabels: [],
});

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'apply': {
      const next = action.fn(state.present);
      // A no-op action must not consume a history slot, or undo starts feeling broken.
      if (next === state.present) return state;
      const past = [...state.past, state.present].slice(-HISTORY_LIMIT);
      const pastLabels = [...state.pastLabels, action.label].slice(-HISTORY_LIMIT);
      return {
        past,
        present: next,
        future: [],
        lastAction: action.label,
        nextAction: null,
        pastLabels,
        futureLabels: [],
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      const label = state.pastLabels[state.pastLabels.length - 1];
      const pastLabels = state.pastLabels.slice(0, -1);
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
        lastAction: pastLabels[pastLabels.length - 1] ?? null,
        nextAction: label,
        pastLabels,
        futureLabels: [label, ...state.futureLabels],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      const label = state.futureLabels[0];
      const futureLabels = state.futureLabels.slice(1);
      return {
        past: [...state.past, state.present],
        present: next,
        future: rest,
        lastAction: label,
        nextAction: futureLabels[0] ?? null,
        pastLabels: [...state.pastLabels, label],
        futureLabels,
      };
    }
    case 'jump': {
      // Folding the single steps keeps one definition of what undo and redo mean,
      // rather than a second, subtly different, bulk implementation.
      const step: Action = { type: action.delta < 0 ? 'undo' : 'redo' };
      let next = state;
      for (let n = 0; n < Math.abs(action.delta); n++) {
        const moved = reducer(next, step);
        if (moved === next) break;
        next = moved;
      }
      return next;
    }
    case 'clear':
      return initialState();
    default:
      return state;
  }
}

export interface WorkspaceHistory {
  workspace: Workspace;
  /** Runs an action and pushes the result onto the undo stack. */
  apply: (label: string, fn: (workspace: Workspace) => Workspace) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  /** Jumps `n` entries back (negative) or forward (positive) in one go. */
  jump: (delta: number) => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
  /** Labels of everything already done, oldest first. */
  pastLabels: readonly string[];
  /** Labels of everything undone and still redoable, next first. */
  futureLabels: readonly string[];
}

export function useWorkspaceHistory(): WorkspaceHistory {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  const apply = useCallback(
    (label: string, fn: (workspace: Workspace) => Workspace) =>
      dispatch({ type: 'apply', label, fn }),
    [],
  );
  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);
  const jump = useCallback((delta: number) => dispatch({ type: 'jump', delta }), []);
  const clear = useCallback(() => dispatch({ type: 'clear' }), []);

  return useMemo(
    () => ({
      workspace: state.present,
      apply,
      undo,
      redo,
      jump,
      clear,
      canUndo: state.past.length > 0,
      canRedo: state.future.length > 0,
      undoLabel: state.lastAction,
      redoLabel: state.nextAction,
      pastLabels: state.pastLabels,
      futureLabels: state.futureLabels,
    }),
    [state, apply, undo, redo, jump, clear],
  );
}

/** The reducer is exported so history behaviour can be tested without React. */
export const __historyReducer = reducer;
export const __initialHistory = initialState;
