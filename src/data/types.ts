export type LineCode = 'KJ' | 'AG' | 'SP' | 'SA' | 'MR' | 'KG' | 'PY';

export const LINE_CODES: LineCode[] = ['KJ', 'AG', 'SP', 'SA', 'MR', 'KG', 'PY'];

/** The eight octolinear directions a schematic segment may run in. */
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

/** One straight run of the schematic diagram: a direction and a number of station gaps. */
export type Segment = [Compass, number];

export interface Point {
  x: number;
  y: number;
}

/** An SVG viewBox: origin plus size, in user units. */
export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Line {
  code: LineCode;
  name: string;
  /** Hex colour taken from the official network map. Never invented. */
  colour: string;
  termini: [string, string];
  /** Ordered station ids, first terminus to second. */
  stations: string[];
  /** Schematic layout: where the line starts and how it runs. */
  schematic: {
    start: Point;
    segments: Segment[];
  };
}

export interface Station {
  /** Slug, e.g. "masjid-jamek". Stable across lines. */
  id: string;
  name: string;
  /** Official per-line code, e.g. { KJ: "KJ13", AG: "AG7" }. Keys are the lines served. */
  codes: Partial<Record<LineCode, string>>;
  /** Passenger spawn weight for Rush Hour. 1 = ordinary stop. */
  demand: number;
  geo: LatLng;
}

/** Two differently-named stations joined by a walkway. */
export interface WalkLink {
  a: string;
  b: string;
}

export interface NetworkData {
  lines: Line[];
  stations: Station[];
  links: WalkLink[];
}
