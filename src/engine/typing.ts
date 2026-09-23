export interface TypingState {
  target: string;
  /** Characters correctly typed so far. Always a correct prefix of target. */
  cursor: number;
  keystrokes: number;
  errors: number;
  mistyped: boolean;
  done: boolean;
}

/** True for keys that represent a character, false for named keys like "Shift". */
export function isPrintable(key: string): boolean {
  return [...key].length === 1;
}

export function beginTyping(target: string): TypingState {
  return { target, cursor: 0, keystrokes: 0, errors: 0, mistyped: false, done: target.length === 0 };
}

/**
 * Applies one keystroke. A wrong key counts against accuracy but never moves
 * the cursor, so the state can never desync from the target.
 */
export function applyKey(state: TypingState, key: string): TypingState {
  if (state.done || !isPrintable(key)) return state;

  const expected = state.target[state.cursor];
  if (expected === undefined) return state;

  const correct = key.toLowerCase() === expected.toLowerCase();
  if (!correct) {
    return { ...state, keystrokes: state.keystrokes + 1, errors: state.errors + 1, mistyped: true };
  }

  const cursor = state.cursor + 1;
  return {
    ...state,
    cursor,
    keystrokes: state.keystrokes + 1,
    mistyped: false,
    done: cursor === state.target.length,
  };
}
