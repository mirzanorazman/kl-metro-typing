import { useEffect, useState } from 'react';

export const PHONE_QUERY = '(max-width: 700px), (pointer: coarse) and (max-height: 700px)';

export function usePhoneLayout(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(PHONE_QUERY).matches),
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const query = window.matchMedia(PHONE_QUERY);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener('change', update);

    return () => query.removeEventListener('change', update);
  }, []);

  return phone;
}
