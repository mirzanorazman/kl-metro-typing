import { useCallback, useEffect, useRef, useState } from 'react';
import { sound } from '../audio/sound';
import {
  LESSON_SEEN, advanceLesson, lessonBackspace, lessonKey, startLesson, type Lesson, type LessonStep,
} from '../engine/dispatchLesson';
import type { NetworkIndex } from '../engine/network';
import { loadProfile, markDispatchTipSeen, saveProfile } from '../engine/progress';
import { clearedSignals } from '../render/useSignalMarks';
import { runTick } from './useRunRecorder';

/** What the typing panel says at each step of the lesson; once done, nothing. */
const CAPTIONS: Record<LessonStep, string | null> = {
  first: 'This train is waiting at a red signal. Type Jelatek to send it on.',
  moving: 'There it goes.',
  second: 'It stopped at Jelatek and is waiting again. Every Station needs you. Type Setiawangsa.',
  done: null,
};

/** How long a finished lesson stays up, so the last clear's green flip and pull-away are seen. */
export const LESSON_FINISH_HOLD_MS = 1_200;

export function lessonCaption(step: LessonStep): string | null {
  return CAPTIONS[step];
}

export interface DispatchLessonControls {
  lesson: Lesson | null;
  start(): void;
  /** Ends the lesson, marks it seen and calls `onTaught`; finishing it does the same. */
  skip(): void;
  /** Ends the lesson without marking it seen, so it shows again next time. */
  leave(): void;
  onKey(key: string): void;
}

/**
 * The guided first Shift: its own throwaway state, driven by real time while
 * it shows, apart from the Career. Nothing here touches the Career, its
 * Keylog or its action log.
 */
export function useDispatchLesson(
  net: NetworkIndex, autoStart: boolean, onTaught: () => void = () => {},
): DispatchLessonControls {
  const [lesson, setLesson] = useState<Lesson | null>(() => (autoStart ? startLesson(net, runTick()) : null));
  const current = useRef(lesson);
  const commit = useCallback((next: Lesson | null) => {
    if (next === current.current) return;
    current.current = next;
    setLesson(next);
  }, []);

  // When the lesson was finished, by the real clock; it ends once the hold has passed.
  const doneAt = useRef<number | null>(null);
  const start = useCallback(() => {
    doneAt.current = null;
    commit(startLesson(net, runTick()));
  }, [commit, net]);
  const leave = useCallback(() => commit(null), [commit]);
  const taught = useRef(onTaught);
  taught.current = onTaught;
  const skip = useCallback(() => {
    if (!current.current) return;
    saveProfile(markDispatchTipSeen(loadProfile(), LESSON_SEEN));
    taught.current();
    commit(null);
  }, [commit]);

  const advance = useCallback((now: number) => {
    const cur = current.current;
    if (!cur) return;
    if (doneAt.current !== null && now - doneAt.current >= LESSON_FINISH_HOLD_MS) return skip();
    commit(advanceLesson(net, cur, now));
  }, [commit, net, skip]);

  const onKey = useCallback((key: string) => {
    const cur = current.current;
    if (!cur) return;
    const now = runTick();
    if (key === 'Escape') return skip();
    // Finished: keys are ignored while the last clear plays out.
    if (cur.step === 'done') return advance(now);
    if (key === 'Backspace') return commit(lessonBackspace(net, cur, now));
    if (key === 'Enter' || key.length === 1) {
      const next = lessonKey(net, cur, key, now);
      if (next.step === 'done') doneAt.current = now;
      return commit(next);
    }
    advance(now);
  }, [advance, commit, net, skip]);

  // The lesson's train moves once per frame; `commit` ignores frames with no new tick.
  const up = lesson !== null;
  useEffect(() => {
    if (!up) return;
    let frame = 0;
    const loop = () => {
      advance(runTick());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [advance, up]);

  // Sounds run from effects, as the Career's do.
  const heard = useRef(lesson);
  useEffect(() => {
    const prev = heard.current;
    heard.current = lesson;
    if (lesson && prev && prev !== lesson) {
      if (lesson.career.errors > prev.career.errors) sound.error();
      else if (lesson.career.correctChars > prev.career.correctChars) sound.key();
      if (clearedSignals(net, prev.career.sim, lesson.career.sim).length > 0) sound.arrive();
    }
  }, [lesson, net]);

  return { lesson, start, skip, leave, onKey };
}
