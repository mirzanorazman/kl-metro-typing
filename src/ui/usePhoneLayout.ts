import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 700px), (pointer: coarse) and (max-height: 700px)';

export function usePhoneLayout(): boolean {
  const [isPhone, setIsPhone] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(PHONE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mediaQueryList = window.matchMedia(PHONE_QUERY);
    const update = () => setIsPhone(mediaQueryList.matches);
    update();
    mediaQueryList.addEventListener('change', update);

    return () => mediaQueryList.removeEventListener('change', update);
  }, []);

  return isPhone;
}
