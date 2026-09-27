import type { TypingState } from '../engine/typing';

export function Prompt({
  state,
  errorTick = 0,
  onActivate,
}: {
  state: TypingState;
  errorTick?: number;
  onActivate?: () => void;
}) {
  const content = [...state.target].map((ch, i) => {
    const character = (
      <span
        // Keyed on the error count, NOT the index: advancing normally keeps
        // the same element (no flash), while a mistake remounts it and
        // replays the animation. Keying on the index would flash on every
        // correct keystroke.
        key={i === state.cursor ? `cur-${errorTick}` : i}
        data-char
        data-space={ch === ' ' ? 'true' : undefined}
        data-state={i < state.cursor ? 'done' : i === state.cursor ? 'current' : 'pending'}
        data-miskey={i === state.cursor && state.mistyped ? 'true' : undefined}
      >
        {ch}
      </span>
    );

    if (!onActivate && i === state.cursor && state.mistyped) {
      return (
        <span key={`miskey-${errorTick}`} className="prompt-miskey-anchor">
          {character}
          <span className="prompt-feedback" role="status">Wrong key</span>
        </span>
      );
    }

    return character;
  });
  if (onActivate) {
    return (
      <>
        <button
          type="button"
          className="prompt prompt-recovery"
          aria-label={`Type ${state.target}`}
          onClick={onActivate}
        >
          {content}
        </button>
        {state.mistyped && <span className="prompt-feedback" role="status">Wrong key</span>}
      </>
    );
  }

  return (
    <div className="prompt" aria-label={`Type ${state.target}`}>
      {content}
    </div>
  );
}
