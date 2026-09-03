export interface Metrics {
  /** Correct characters / 5 / minutes. The standard definition. */
  wpm: number;
  /** Correct keystrokes / total keystrokes. */
  accuracy: number;
  /** wpm * accuracy^2 — squaring prices sloppiness above raw speed. */
  score: number;
}

export function computeMetrics(
  correctChars: number,
  keystrokes: number,
  elapsedMs: number,
): Metrics {
  const minutes = elapsedMs / 60_000;
  const wpm = minutes > 0 ? correctChars / 5 / minutes : 0;
  const accuracy = keystrokes > 0 ? correctChars / keystrokes : 1;
  return { wpm, accuracy, score: wpm * accuracy * accuracy };
}
