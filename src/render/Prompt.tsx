import type { TypingState } from '../engine/typing';

export function Prompt({ state }: { state: TypingState }) {
  return (
    <div className="prompt" aria-label={`Type ${state.target}`}>
      {[...state.target].map((ch, i) => (
        <span
          key={i}
          data-char
          data-space={ch === ' ' ? 'true' : undefined}
          data-state={i < state.cursor ? 'done' : i === state.cursor ? 'current' : 'pending'}
        >
          {ch}
        </span>
      ))}
    </div>
  );
}
