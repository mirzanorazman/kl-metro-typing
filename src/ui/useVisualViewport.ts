import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';

export interface VisualViewportState {
  height: number;
  keyboardLikelyOpen: boolean;
}

const VisualViewportContext = createContext<VisualViewportState | null>(null);

function readViewport(): VisualViewportState {
  const visualViewport = window.visualViewport;
  const height = visualViewport?.height ?? window.innerHeight;

  return {
    height,
    keyboardLikelyOpen: Boolean(visualViewport && window.innerHeight - height > 80),
  };
}

export function useVisualViewport(): VisualViewportState {
  const shared = useContext(VisualViewportContext);
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    if (shared) return;

    const visualViewport = window.visualViewport;
    const update = () => setViewport(readViewport());

    update();
    window.addEventListener('resize', update);
    visualViewport?.addEventListener('resize', update);
    visualViewport?.addEventListener('scroll', update);

    return () => {
      window.removeEventListener('resize', update);
      visualViewport?.removeEventListener('resize', update);
      visualViewport?.removeEventListener('scroll', update);
    };
  }, [shared]);

  return shared ?? viewport;
}

export function VisualViewportProvider({ children }: PropsWithChildren) {
  const viewport = useVisualViewport();
  return createElement(VisualViewportContext.Provider, { value: viewport }, children);
}
