import type { BoundaryPath } from '../geo/boundaries';

/** Land and administrative outlines, drawn beneath the tracks. */
export function MapBackdrop({ paths }: { paths: BoundaryPath[] }) {
  return (
    <g className="map-backdrop" aria-hidden="true">
      {paths.map((p) => (
        <path key={p.id} d={p.d} />
      ))}
    </g>
  );
}
