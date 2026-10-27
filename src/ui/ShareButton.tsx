import { useEffect, useMemo, useRef, useState } from 'react';
import type { ShareCard } from '../share/shareCard';
import {
  canCopyImage,
  canShareFile,
  cardFile,
  copyImage,
  downloadImage,
  renderCardPng,
  shareFile,
} from '../share/shareResult';
import './share.css';

type Image = { status: 'drawing' } | { status: 'ready'; blob: Blob; file: File } | { status: 'none' };

/**
 * Share this result as an image.
 *
 * The PNG is drawn as soon as the summary appears, not on click: Safari only
 * opens the share sheet straight from a tap, and waiting for a canvas to
 * encode first can cost the tap its permission.
 */
export function ShareButton({ card }: { card: ShareCard }) {
  // Callers rebuild the card on every render; only a changed card is redrawn.
  const key = useMemo(() => JSON.stringify(card), [card]);
  const latest = useRef(card);
  latest.current = card;

  const [image, setImage] = useState<Image>({ status: 'drawing' });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const drawn = latest.current;
    setImage({ status: 'drawing' });
    renderCardPng(drawn)
      .then((blob) => {
        if (!live) return;
        setImage(blob ? { status: 'ready', blob, file: cardFile(drawn, blob) } : { status: 'none' });
      })
      .catch(() => live && setImage({ status: 'none' }));
    return () => {
      live = false;
    };
  }, [key]);

  if (image.status === 'none') return null;

  if (image.status === 'drawing') {
    return (
      <div className="share-result">
        <button type="button" disabled>Preparing image…</button>
      </div>
    );
  }

  const { blob, file } = image;
  const sheet = canShareFile(file);
  const copy = !sheet && canCopyImage();

  return (
    <div className="share-result">
      {sheet && (
        <button
          type="button"
          onClick={() => {
            setMessage(null);
            shareFile(latest.current, file).catch(() => {
              setMessage("Couldn't open sharing. Try Save image.");
            });
          }}
        >
          Share result
        </button>
      )}
      {copy && (
        <button
          type="button"
          onClick={() => {
            copyImage(blob).then(
              () => setMessage('Image copied.'),
              () => setMessage("Couldn't copy. Try Save image."),
            );
          }}
        >
          Copy image
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          downloadImage(latest.current, blob);
          setMessage('Image saved.');
        }}
      >
        Save image
      </button>
      <p className="share-result-status" role="status">{message}</p>
    </div>
  );
}
