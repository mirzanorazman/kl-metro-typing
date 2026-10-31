import { useEffect, useRef, useState } from 'react';
import { cardFile, type Shareable } from '../share/shareResult';

export type PngState = { status: 'drawing' } | { status: 'ready'; blob: Blob; file: File } | { status: 'none' };

/**
 * Draws `item`'s image as soon as it is shown, not on click: Safari only opens
 * the share sheet straight from a tap, and waiting for a canvas to encode
 * first can cost the tap its permission. Redraws only when `key` changes, as
 * callers rebuild their cards on every render.
 */
export function usePng(item: Shareable, key: string, draw: () => Promise<Blob | null>): PngState {
  const latest = useRef({ item, draw });
  latest.current = { item, draw };
  const [image, setImage] = useState<PngState>({ status: 'drawing' });

  useEffect(() => {
    let live = true;
    const { item: drawn, draw: paint } = latest.current;
    setImage({ status: 'drawing' });
    paint()
      .then((blob) => {
        if (!live) return;
        setImage(blob ? { status: 'ready', blob, file: cardFile(drawn, blob) } : { status: 'none' });
      })
      .catch(() => live && setImage({ status: 'none' }));
    return () => {
      live = false;
    };
  }, [key]);

  return image;
}

/** An object URL for `blob` while it is shown, revoked when it changes or goes. */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return undefined;
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [blob]);
  return url;
}
