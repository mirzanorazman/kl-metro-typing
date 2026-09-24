import { useEffect, useState } from 'react';

/** Landscape alone must not exclude tablet or desktop presentation. */
export function usePhoneLandscape(phone: boolean): boolean {
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.innerWidth > window.innerHeight,
  );

  useEffect(() => {
    const update = () => setLandscape(window.innerWidth > window.innerHeight);
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return phone && landscape;
}
