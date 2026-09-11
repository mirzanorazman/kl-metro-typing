import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CompositionEvent,
  type FormEvent,
  type PropsWithChildren,
} from 'react';
import type { KeySource } from '../engine/keylog';
import { useKeyboard } from './useKeyboard';

type InputHandler = (key: string, source: KeySource) => void;

interface TypingInputContextValue {
  enabled: boolean;
  register: (handler: InputHandler) => () => void;
  focusInput: () => void;
  blurInput: () => void;
  inputFocused: boolean;
}

const TypingInputContext = createContext<TypingInputContextValue | null>(null);

export function TypingInputProvider({
  children,
  enabled,
}: PropsWithChildren<{ enabled: boolean }>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const handlerRef = useRef<InputHandler | null>(null);
  const composingRef = useRef(false);
  const [inputFocused, setInputFocused] = useState(false);

  const register = useCallback((handler: InputHandler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);

  const focusInput = useCallback(() => {
    if (enabled) inputRef.current?.focus({ preventScroll: true });
  }, [enabled]);

  const blurInput = useCallback(() => {
    if (enabled) inputRef.current?.blur();
  }, [enabled]);

  // The whole value is drained and each character emitted, which is how a
  // paste of a full Station name gets in. It is not blocked: an Android
  // predictive keyboard also delivers several characters at once, and
  // telling them apart here is guesswork. The batch size is reported
  // instead, and the Verdict decides.
  //
  // One input event, however many characters it delivers, is one burst. Only
  // the first character's Source carries the real count; the rest carry 1.
  // The integrity check counts log events with b > 1 to bound how many
  // multi-character bursts a Run contains — if every character of a burst
  // carried the count, an N-character burst would inflate that count by N,
  // not 1, making the threshold far tighter than it is specified against.
  const emitInputValue = useCallback((input: HTMLInputElement, trusted: boolean) => {
    const value = input.value;
    input.value = '';
    const characters = [...value];
    characters.forEach((character, index) => {
      const source: KeySource = { trusted, batch: index === 0 ? characters.length : 1 };
      handlerRef.current?.(character, source);
    });
  }, []);

  const handleInput = useCallback((event: FormEvent<HTMLInputElement>) => {
    if (!composingRef.current) emitInputValue(event.currentTarget, event.isTrusted);
  }, [emitInputValue]);

  const handleCompositionEnd = useCallback((event: CompositionEvent<HTMLInputElement>) => {
    composingRef.current = false;
    emitInputValue(event.currentTarget, event.isTrusted);
  }, [emitInputValue]);

  const context = useMemo<TypingInputContextValue>(() => ({
    enabled,
    register,
    focusInput,
    blurInput,
    inputFocused,
  }), [enabled, register, focusInput, blurInput, inputFocused]);

  return (
    <TypingInputContext.Provider value={context}>
      {children}
      {enabled && (
        <input
          ref={inputRef}
          className="mobile-typing-input"
          aria-label="Typing input for Station name"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          onInput={handleInput}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={handleCompositionEnd}
        />
      )}
    </TypingInputContext.Provider>
  );
}

export function useGameInput(onKey: InputHandler, active = true): void {
  const context = useContext(TypingInputContext);
  useKeyboard(onKey, active && context?.enabled !== true);

  useEffect(() => {
    if (!active || !context?.enabled) return;
    return context.register(onKey);
  }, [active, context, onKey]);
}

export function useTypingInputControls(): Pick<
  TypingInputContextValue,
  'focusInput' | 'blurInput' | 'inputFocused'
> {
  const context = useContext(TypingInputContext);
  if (!context) throw new Error('TypingInputProvider is missing');
  return {
    focusInput: context.focusInput,
    blurInput: context.blurInput,
    inputFocused: context.inputFocused,
  };
}
