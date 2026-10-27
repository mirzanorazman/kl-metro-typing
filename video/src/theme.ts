/** The game's midnight atmosphere, from src/styles/tokens.css. */
export const C = {
  paper: '#0b0f17',
  paperSub: '#101725',
  paperEdge: '#1a273c',
  panel: 'rgba(17, 24, 39, 0.9)',
  panelEdge: '#1f293d',
  ink: '#f8fafc',
  inkMuted: '#94a3b8',
  inkFaint: '#475569',
  error: '#ef4444',
  warn: '#f59e0b',
  signalRed: '#ef4444',
  signalGreen: '#22c55e',
  signalHead: '#14181f',
  badgeInk: '#14181f',
} as const;

export const SANS = "'Plus Jakarta Sans Variable', sans-serif";
export const MONO = "'JetBrains Mono Variable', monospace";

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/** Badge text that reads on the Line colour, as the game's contrastText() picks it. */
export function contrastText(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / (luminance(C.badgeInk) + 0.05);
  return onInk > onWhite ? C.badgeInk : '#ffffff';
}
