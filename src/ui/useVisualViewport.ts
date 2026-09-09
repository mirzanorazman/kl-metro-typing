import { useEffect, useState } from 'react';

export interface VisualViewportState {
  height: number;
  keyboardLikelyOpen: boolean;
}

function readViewport(): VisualViewportState {
  const visualViewport = window.visualViewport;
  const height = visualViewport?.height ?? window.innerHeight;

  return {
    height,
    keyboardLikelyOpen: visualViewport !== undefined && window.innerHeight - height > 80,
  };
}

export function useVisualViewport(): VisualViewportState {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
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
  }, []);

  return viewport;
}
