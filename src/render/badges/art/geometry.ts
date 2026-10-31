/**
 * Small geometry helpers the badge drawings share. Angles are in degrees,
 * anticlockwise from east, as on a maths diagram (so 90 is straight up).
 */

/** A point on a circle, by angle. */
export function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
}

/** An arc drawn clockwise on screen from angle `from` down to angle `to`. */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const [x1, y1] = polar(cx, cy, r, from);
  const [x2, y2] = polar(cx, cy, r, to);
  const large = from - to > 180 ? 1 : 0;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** A radial tick at angle `deg`, from radius `r1` out to radius `r2`. */
export function spokePath(cx: number, cy: number, r1: number, r2: number, deg: number): string {
  const [x1, y1] = polar(cx, cy, r1, deg);
  const [x2, y2] = polar(cx, cy, r2, deg);
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/**
 * A triangular arrowhead whose base is centred on (x, y), pointing along
 * angle `deg`: `len` long, `half` wide either side of the line.
 */
export function arrowHeadPath(x: number, y: number, deg: number, len: number, half: number): string {
  const a = (deg * Math.PI) / 180;
  const [dx, dy] = [Math.cos(a), -Math.sin(a)];
  const pts = [
    [x + dx * len, y + dy * len],
    [x - dy * half, y + dx * half],
    [x + dy * half, y - dx * half],
  ];
  return `M${pts.map(([px, py]) => `${px!.toFixed(1)} ${py!.toFixed(1)}`).join(' L')} Z`;
}

/** A four-pointed sparkle centred on (cx, cy) with arms of length s. */
export function sparklePath(cx: number, cy: number, s: number): string {
  const k = s * 0.2;
  return `M${cx} ${cy - s} Q${cx + k} ${cy - k} ${cx + s} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + s} ` +
    `Q${cx - k} ${cy + k} ${cx - s} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - s} Z`;
}

/** A five-pointed star centred on (cx, cy). */
export function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join(' L')} Z`;
}
