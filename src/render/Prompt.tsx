import type { TypingState } from '../engine/typing';

export function Prompt({ state, errorTick = 0 }: { state: TypingState; errorTick?: number }) {
  return (
    <div className="prompt" aria-label={`Type ${state.target}`}>
      {[...state.target].map((ch, i) => (
        <span
          // Keyed on the error count, NOT the index: advancing normally keeps
          // the same element (no flash), while a mistake remounts it and
          // replays the animation. Keying on the index would flash on every
          // correct keystroke.
          key={i === state.cursor ? `cur-${errorTick}` : i}
          data-char
          data-space={ch === ' ' ? 'true' : undefined}
          data-state={i < state.cursor ? 'done' : i === state.cursor ? 'current' : 'pending'}
          data-miskey={i === state.cursor && errorTick > 0 ? 'true' : undefined}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
