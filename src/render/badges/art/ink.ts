/**
 * The poster inks every badge drawing uses. Badges are physical-colour
 * objects, so these don't change with the app theme.
 *
 * Where red and green both carry meaning, `signalRed` and `mint` differ by
 * brightness as well as hue (the user has deuteranomaly; muted reds read grey).
 */
export const INK = {
  brick: '#B23A2A',
  signalRed: '#D8452C',
  mint: '#7FDCC6',
  teal: '#2C8C86',
  orange: '#D2693A',
  cream: '#F7EEDB',
  paper: '#E3D3B3',
  charcoal: '#2A2A2E',
  grey: '#7C8B86',
  sun: '#E7A673',
  yellow: '#E8C547',
  blue: '#3D6FA8',
} as const;

/** Seven Line colours, one per Line, for drawings that show every Line at once. */
export const LINE_INKS = [INK.brick, INK.orange, INK.yellow, INK.mint, INK.teal, INK.blue, INK.charcoal] as const;
