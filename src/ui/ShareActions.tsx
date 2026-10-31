import { useState, type ReactNode } from 'react';
import {
  canCopyImage,
  canShareFile,
  copyImage,
  downloadImage,
  shareFile,
  type Shareable,
} from '../share/shareResult';
import { useObjectUrl, type PngState } from './usePng';
import './share.css';

/**
 * The drawn image, holding its square while it draws so the page does not
 * jump when it lands; `fallback` where it cannot be drawn.
 */
export function SharePreview({ image, alt, fallback = null }: { image: PngState; alt: string; fallback?: ReactNode }) {
  const url = useObjectUrl(image.status === 'ready' ? image.blob : null);
  if (image.status === 'none') return <>{fallback}</>;
  if (image.status === 'drawing' || !url) return <div className="share-preview" aria-hidden="true" />;
  return <img className="share-preview" src={url} alt={alt} />;
}

/**
 * Share, Copy or Save one drawn image. Phones get the share sheet, desktops
 * Copy image, everyone Save image. Nothing where the image cannot be drawn.
 */
export function ShareActions({ item, image, shareLabel }: { item: Shareable; image: PngState; shareLabel: string }) {
  const [message, setMessage] = useState<string | null>(null);

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
            shareFile(item, file).catch(() => {
              setMessage("Couldn't open sharing. Try Save image.");
            });
          }}
        >
          {shareLabel}
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
          downloadImage(item, blob);
          setMessage('Image saved.');
        }}
      >
        Save image
      </button>
      <p className="share-result-status" role="status">{message}</p>
    </div>
  );
}
