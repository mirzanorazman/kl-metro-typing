import { paintCard } from './paintCard';
import { CARD_SIZE, SHARE_URL, type ShareCard } from './shareCard';

const FONTS = [
  "800 62px 'Plus Jakarta Sans Variable'",
  "500 28px 'Plus Jakarta Sans Variable'",
  "700 76px 'JetBrains Mono Variable'",
];

/**
 * Draws `card` and encodes it as a PNG. Null where it cannot be drawn
 * faithfully: no canvas, or no way to wait for the game's fonts, which would
 * otherwise fall back silently mid-card.
 */
export async function renderCardPng(card: ShareCard): Promise<Blob | null> {
  if (typeof document === 'undefined' || !('fonts' in document)) return null;
  try {
    await Promise.all(FONTS.map((f) => document.fonts.load(f)));
  } catch {
    // A missing font is cosmetic; the card still draws in the fallback.
  }
  const canvas = document.createElement('canvas');
  canvas.width = CARD_SIZE;
  canvas.height = CARD_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  paintCard(ctx, card);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export function shareText(card: ShareCard): string {
  return `${card.text} ${SHARE_URL}`;
}

export function cardFile(card: ShareCard, blob: Blob): File {
  return new File([blob], card.fileName, { type: 'image/png' });
}

/** True where the share sheet can take this image. */
export function canShareFile(file: File): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.canShare === 'function'
    && typeof navigator.share === 'function'
    && navigator.canShare({ files: [file] });
}

/** True where the clipboard can take an image. */
export function canCopyImage(): boolean {
  return typeof navigator !== 'undefined'
    && typeof ClipboardItem !== 'undefined'
    && typeof navigator.clipboard?.write === 'function';
}

/**
 * Opens the share sheet. Resolves false when the player dismissed it, which
 * is a choice, not a failure; rejects on a real failure.
 */
export async function shareFile(card: ShareCard, file: File): Promise<boolean> {
  try {
    await navigator.share({ files: [file], text: shareText(card), title: 'KL-Metro Typing' });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}

export async function copyImage(blob: Blob): Promise<void> {
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}

export function downloadImage(card: ShareCard, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = card.fileName;
  document.body.append(a);
  a.click();
  a.remove();
  // Safari starts the download after the click returns; revoking at once can cancel it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
